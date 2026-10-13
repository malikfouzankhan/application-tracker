import "server-only";
import { sql } from "drizzle-orm";
import { db } from "@/db/client";
import { ingestionRuns } from "@/db/schema";

export type IngestionError = { target: string; message: string };

export type IngestionRunSummary = {
  source: string;
  startedAt: Date;
  finishedAt: Date;
  fetched: number;
  newJobs: number;
  passedPrefilter: number;
  errors: IngestionError[];
};

/** One row per source per run (claude.md section 6.11). */
export async function recordIngestionRun(run: IngestionRunSummary): Promise<void> {
  await db.insert(ingestionRuns).values({
    source: run.source,
    startedAt: run.startedAt,
    finishedAt: run.finishedAt,
    fetched: run.fetched,
    newJobs: run.newJobs,
    passedPrefilter: run.passedPrefilter,
    errors: run.errors,
  });
}

/** For get_briefing: when ingestion last finished and how many new jobs the last day brought. */
export async function getIngestionFreshness(): Promise<{ lastRunFinishedAt: Date | null; newJobsLast24h: number }> {
  const [row] = await db
    .select({
      lastRunFinishedAt: sql<Date | null>`max(${ingestionRuns.finishedAt})`,
      newJobsLast24h: sql<number>`coalesce(sum(${ingestionRuns.newJobs}) filter (where ${ingestionRuns.startedAt} > now() - interval '24 hours'), 0)::int`,
    })
    .from(ingestionRuns);
  const last = row?.lastRunFinishedAt;
  return { lastRunFinishedAt: last ? new Date(last) : null, newJobsLast24h: row?.newJobsLast24h ?? 0 };
}
