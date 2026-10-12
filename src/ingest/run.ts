import "server-only";
import { ZodError } from "zod";
import { isAppError } from "@/lib/errors";
import { type PollableCompany, listCompaniesToPoll, markCompanyPolled, pauseCompany, pruneInactiveCompanies } from "@/services/companies";
import { systemContext } from "@/services/context";
import { type IngestionError, type IngestionRunSummary, recordIngestionRun } from "@/services/ingestion";
import { ingestNormalized, purgeIrrelevantJobs, syncBoardClosures } from "@/services/jobs";
import { FetchError, fetchJson } from "./http";
import { mapWithConcurrency } from "./pool";
import { ATS_SOURCES } from "./sources";
import { HN_SEARCH_URL, hnItemUrl, latestHiringThreadId, parseHnThread } from "./sources/hn";

// Daily ingestion (claude.md section 6). Called by scripts/ingest.ts from GitHub Actions.

const CONCURRENCY = 8;
const PRUNE_AFTER_DAYS = 60;
const HN_CHUNK = 100;

type SourceTally = Omit<IngestionRunSummary, "finishedAt"> & { snowballed: number };

function tally(source: string): SourceTally {
  return { source, startedAt: new Date(), fetched: 0, newJobs: 0, passedPrefilter: 0, errors: [], snowballed: 0 };
}

/** Safe, short error text: never a query (which embeds values) or a full response. */
function describeError(error: unknown): string {
  if (error instanceof FetchError) return error.message;
  if (error instanceof ZodError) {
    const issue = error.issues[0];
    return `Unexpected response shape at ${issue?.path.join(".") || "(root)"}: ${issue?.message ?? ""}`.slice(0, 200);
  }
  if (isAppError(error)) return `${error.code}: ${error.message}`;
  const code = (error as { cause?: { code?: unknown } })?.cause?.code;
  return `${error instanceof Error ? error.name : "Error"}${typeof code === "string" ? ` (pg ${code})` : ""}`;
}

function isSundayIst(now: Date): boolean {
  return new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Kolkata", weekday: "short" }).format(now) === "Sun";
}

async function pollCompany(company: PollableCompany, t: SourceTally, log: (line: string) => void) {
  const source = ATS_SOURCES[company.ats];
  const ctx = systemContext;
  try {
    const jobs = source.parse(await fetchJson(source.boardUrl(company.boardToken)), company);
    t.fetched += jobs.length;

    const result = await ingestNormalized(jobs, ctx);
    t.newJobs += result.inserted;
    t.passedPrefilter += result.passedPrefilter;
    t.snowballed += result.snowballedCompanies;

    const seen = result.items.flatMap((item) => (item.status === "new" || item.status === "duplicate" ? [item] : []));
    const closures = await syncBoardClosures(company.id, company.ats, seen.map((i) => i.jobId), ctx);
    await markCompanyPolled(company.id, seen.some((i) => i.prefilterPassed));

    log(
      `[${company.ats}] ${company.slug}: ${jobs.length} listed, ${result.inserted} new (${result.passedPrefilter} passed)` +
        `, ${result.dropped} discarded` +
        `${result.invalid ? `, ${result.invalid} invalid` : ""}${closures.closed ? `, ${closures.closed} closed` : ""}`,
    );
  } catch (error) {
    if (error instanceof FetchError && error.status === 404) {
      await pauseCompany(company.id, "board_not_found", ctx);
      t.errors.push({ target: company.slug, message: "Board not found (404); company paused" });
    } else {
      t.errors.push({ target: company.slug, message: describeError(error) });
    }
    log(`[${company.ats}] ${company.slug}: ERROR ${t.errors[t.errors.length - 1].message}`);
  }
}

async function pollHn(t: SourceTally, log: (line: string) => void) {
  try {
    const threadId = latestHiringThreadId(await fetchJson(HN_SEARCH_URL));
    if (!threadId) throw new FetchError("No 'Who is hiring?' thread found");
    const jobs = parseHnThread(await fetchJson(hnItemUrl(threadId)));
    t.fetched += jobs.length;
    for (let i = 0; i < jobs.length; i += HN_CHUNK) {
      const result = await ingestNormalized(jobs.slice(i, i + HN_CHUNK), systemContext);
      t.newJobs += result.inserted;
      t.passedPrefilter += result.passedPrefilter;
      t.snowballed += result.snowballedCompanies;
    }
    log(`[hn] thread ${threadId}: ${jobs.length} posts, ${t.newJobs} new (${t.passedPrefilter} passed)`);
  } catch (error) {
    t.errors.push({ target: "hn", message: describeError(error) });
    log(`[hn] ERROR ${t.errors[t.errors.length - 1].message}`);
  }
}

export type IngestionOptions = {
  now?: Date;
  /** Only poll these company slugs (manual runs). */
  onlySlugs?: string[];
  skipHn?: boolean;
  log?: (line: string) => void;
};

export type IngestionResult = {
  sources: (IngestionRunSummary & { snowballed: number })[];
  companiesPolled: number;
  purgedJobs: number;
  prunedToLowFreq: number;
  hadErrors: boolean;
};

export async function runIngestion(options: IngestionOptions = {}): Promise<IngestionResult> {
  const now = options.now ?? new Date();
  const log = options.log ?? (() => {});
  const includeLowFreq = isSundayIst(now);

  let companies = await listCompaniesToPoll(includeLowFreq);
  if (options.onlySlugs?.length) companies = companies.filter((c) => options.onlySlugs?.includes(c.slug));
  log(`Polling ${companies.length} companies${includeLowFreq ? " (Sunday: including low_freq)" : ""}`);

  const tallies = new Map<string, SourceTally>();
  for (const c of companies) if (!tallies.has(c.ats)) tallies.set(c.ats, tally(c.ats));

  await mapWithConcurrency(companies, CONCURRENCY, (c) => pollCompany(c, tallies.get(c.ats)!, log));

  if (!options.skipHn) {
    const hn = tally("hn");
    tallies.set("hn", hn);
    await pollHn(hn, log);
  }

  // Drop stored jobs that no longer pass the (possibly tightened) preferences.
  let purged = 0;
  try {
    purged = (await purgeIrrelevantJobs(systemContext)).deleted;
    if (purged) log(`Purged ${purged} stored jobs that no longer match preferences`);
  } catch (error) {
    tallies.set("purge", { ...tally("purge"), errors: [{ target: "purge", message: describeError(error) }] });
  }

  let prunedToLowFreq = 0;
  try {
    prunedToLowFreq = await pruneInactiveCompanies(PRUNE_AFTER_DAYS, systemContext);
  } catch (error) {
    const errors: IngestionError[] = [{ target: "prune", message: describeError(error) }];
    tallies.set("prune", { ...tally("prune"), errors });
  }

  const sources = [...tallies.values()].map((t) => ({ ...t, finishedAt: new Date() }));
  for (const summary of sources) {
    if (summary.source === "prune" || summary.source === "purge") continue;
    await recordIngestionRun(summary);
  }

  return {
    sources,
    companiesPolled: companies.length,
    purgedJobs: purged,
    prunedToLowFreq,
    hadErrors: sources.some((s) => s.errors.length > 0),
  };
}
