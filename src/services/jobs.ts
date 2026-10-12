import "server-only";
import { and, desc, eq, gte, inArray, isNotNull, isNull, not, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { applications, companies, jobAssessments, jobs } from "@/db/schema";
import { parseExperience } from "@/ingest/exp-parse";
import { type NormalizedJob, inferRemoteType, normalizedJobSchema } from "@/ingest/normalize";
import { prefilterJob } from "@/ingest/prefilter";
import { decodeHtmlEntities, sanitizeExternalText, sanitizeLine } from "@/ingest/sanitize";
import { detectScamFlags } from "@/ingest/scam";
import { extractBoardRefs } from "@/ingest/snowball";
import { AppError } from "@/lib/errors";
import { urlHash } from "@/lib/hash";
import { type JobStage, isValidJobStageTransition } from "@/lib/state-machine";
import { recordAudit } from "./audit";
import { type CompanyMatch, findCompanyForJob, upsertSnowballCompanies } from "./companies";
import { type ServiceContext, requireUser } from "./context";
import { getPreferences } from "./preferences";

export type IngestItemResult =
  | { url: string; status: "new" | "duplicate"; jobId: string; prefilterPassed: boolean }
  | { url: string; status: "invalid"; error: string };

export type IngestResult = {
  received: number;
  inserted: number;
  duplicates: number;
  invalid: number;
  passedPrefilter: number;
  /** Previously rejected jobs that pass under the current preferences. */
  requalified: number;
  snowballedCompanies: number;
  items: IngestItemResult[];
};

/**
 * The shared ingestion pipeline (claude.md section 6): sanitize, hash, parse experience,
 * prefilter, scam flags, snowball, then insert. Idempotent: rows are keyed on url_hash. Known URLs
 * are looked up in bulk first, so a daily re-poll of a large board costs one query per 500 jobs.
 * Rejected jobs are stored without their description and do not snowball. When a rejected job is
 * seen again it is re-checked against the current preferences, and requalifies (getting its
 * description) if it now passes. Used by the daily ingestion and by import_jobs.
 */
export async function ingestNormalized(
  input: NormalizedJob[],
  ctx: ServiceContext,
): Promise<IngestResult> {
  const { preferences } = await getPreferences();
  const result: IngestResult = {
    received: input.length,
    inserted: 0,
    duplicates: 0,
    invalid: 0,
    passedPrefilter: 0,
    requalified: 0,
    snowballedCompanies: 0,
    items: [],
  };

  // Validate and hash everything before touching the database.
  const prepared: { job: NormalizedJob; hash: string }[] = [];
  const batchHashes = new Set<string>();
  for (const raw of input) {
    const parsed = normalizedJobSchema.safeParse(raw);
    if (!parsed.success) {
      result.invalid++;
      const url = typeof raw?.url === "string" ? raw.url : "";
      result.items.push({ url, status: "invalid", error: parsed.error.issues[0]?.message ?? "invalid" });
      continue;
    }
    let hash: string;
    try {
      hash = urlHash(parsed.data.url);
    } catch {
      result.invalid++;
      result.items.push({ url: parsed.data.url, status: "invalid", error: "Unparseable URL" });
      continue;
    }
    if (batchHashes.has(hash)) continue; // same posting twice in one batch
    batchHashes.add(hash);
    prepared.push({ job: parsed.data, hash });
  }

  return db.transaction(async (tx) => {
    const hashes = prepared.map((p) => p.hash);
    const existingColumns = {
      id: jobs.id,
      urlHash: jobs.urlHash,
      prefilterPassed: jobs.prefilterPassed,
      title: jobs.title,
      companyName: jobs.companyName,
      companyId: jobs.companyId,
      locationRaw: jobs.locationRaw,
      remoteType: jobs.remoteType,
      expMin: jobs.expMin,
    };
    const existing = new Map<string, { [K in keyof typeof existingColumns]: (typeof jobs.$inferSelect)[K] }>();
    for (let i = 0; i < hashes.length; i += 500) {
      const rows = await tx
        .select(existingColumns)
        .from(jobs)
        .where(inArray(jobs.urlHash, hashes.slice(i, i + 500)));
      for (const row of rows) existing.set(row.urlHash, row);
    }

    const companyById = new Map<string, CompanyMatch | null>();
    const companyWithId = async (id: string) => {
      if (!companyById.has(id)) {
        const [row] = await tx
          .select({ id: companies.id, isDream: companies.isDream })
          .from(companies)
          .where(eq(companies.id, id));
        companyById.set(id, row ?? null);
      }
      return companyById.get(id) ?? null;
    };
    const companyFor = (job: NormalizedJob, companyName: string) =>
      job.companyId ? companyWithId(job.companyId) : findCompanyForJob(tx, extractBoardRefs(job.url), companyName);

    // Board links hide in hrefs (often entity-escaped, "https:&#x2F;&#x2F;"), so snowball reads the
    // entity-decoded raw description, before sanitizing drops the attributes. Passing jobs only.
    const snowball = async (job: NormalizedJob) => {
      const refs = extractBoardRefs(job.url, job.description ? decodeHtmlEntities(job.description) : null);
      if (refs.length) result.snowballedCompanies += await upsertSnowballCompanies(tx, refs);
    };

    for (const { job, hash } of prepared) {
      const known = existing.get(hash);
      if (known) {
        let passed = known.prefilterPassed;
        if (!passed) {
          // Rejected before: re-check with today's preferences (they may have been loosened).
          const company = known.companyId ? await companyWithId(known.companyId) : null;
          const recheck = prefilterJob(
            { ...known, isDreamCompany: company?.isDream ?? false },
            preferences,
          );
          if (recheck.passed) {
            await tx
              .update(jobs)
              .set({
                prefilterPassed: true,
                prefilterReason: recheck.reason,
                descriptionText: sanitizeExternalText(job.description).text,
              })
              .where(eq(jobs.id, known.id));
            await snowball(job);
            result.requalified++;
            passed = true;
          }
        }
        result.duplicates++;
        result.items.push({ url: job.url, status: "duplicate", jobId: known.id, prefilterPassed: passed });
        continue;
      }

      const title = sanitizeLine(job.title);
      const companyName = sanitizeLine(job.companyName, 200);
      const locationRaw = job.locationRaw ? sanitizeLine(job.locationRaw) : null;
      const description = sanitizeExternalText(job.description).text;
      const remoteType = job.remoteType ?? inferRemoteType(locationRaw, description);
      const experience = parseExperience(title, description);
      const company = await companyFor(job, companyName);

      const prefilter = prefilterJob(
        {
          title,
          companyName,
          locationRaw,
          remoteType,
          expMin: experience?.min ?? null,
          isDreamCompany: company?.isDream ?? false,
        },
        preferences,
      );
      if (prefilter.passed) await snowball(job);

      const [inserted] = await tx
        .insert(jobs)
        .values({
          url: job.url,
          urlHash: hash,
          companyId: company?.id ?? null,
          companyName,
          title,
          locationRaw,
          remoteType,
          country: job.country ? sanitizeLine(job.country, 80) : null,
          expMin: experience?.min ?? null,
          expMax: experience?.max ?? null,
          // Rejected jobs keep only what stats and /jobs need (claude.md section 6.7).
          descriptionText: prefilter.passed ? description : "",
          source: job.source,
          sourceRef: job.sourceRef ?? null,
          postedAt: job.postedAt ?? null,
          prefilterPassed: prefilter.passed,
          prefilterReason: prefilter.reason,
          scamFlags: detectScamFlags({ companyName, title, description }),
        })
        .onConflictDoNothing({ target: jobs.urlHash })
        .returning({ id: jobs.id, prefilterPassed: jobs.prefilterPassed });

      if (inserted) {
        result.inserted++;
        if (inserted.prefilterPassed) result.passedPrefilter++;
        result.items.push({ url: job.url, status: "new", jobId: inserted.id, prefilterPassed: inserted.prefilterPassed });
      } else {
        // Inserted concurrently by another run between our lookup and insert.
        const [row] = await tx
          .select({ id: jobs.id, prefilterPassed: jobs.prefilterPassed })
          .from(jobs)
          .where(eq(jobs.urlHash, hash));
        result.duplicates++;
        if (row) result.items.push({ url: job.url, status: "duplicate", jobId: row.id, prefilterPassed: row.prefilterPassed });
      }
    }

    await recordAudit(tx, ctx, {
      action: "jobs.ingest",
      targetType: "job",
      diff: {
        received: result.received,
        inserted: result.inserted,
        duplicates: result.duplicates,
        invalid: result.invalid,
        passedPrefilter: result.passedPrefilter,
        requalified: result.requalified,
        snowballedCompanies: result.snowballedCompanies,
      },
    });
    return result;
  });
}

/** list_candidate_jobs: new, prefilter-passing jobs, newest first, descriptions cut to `descriptionChars`. */
export async function listCandidateJobs(options: {
  limit: number;
  since?: Date | null;
  descriptionChars: number;
}) {
  const rows = await db
    .select({
      id: jobs.id,
      url: jobs.url,
      title: jobs.title,
      companyName: jobs.companyName,
      companyId: jobs.companyId,
      isDreamCompany: sql<boolean>`coalesce(${companies.isDream}, false)`,
      locationRaw: jobs.locationRaw,
      remoteType: jobs.remoteType,
      expMin: jobs.expMin,
      expMax: jobs.expMax,
      source: jobs.source,
      postedAt: jobs.postedAt,
      firstSeenAt: jobs.firstSeenAt,
      prefilterReason: jobs.prefilterReason,
      scamFlags: jobs.scamFlags,
      description: sql<string>`left(${jobs.descriptionText}, ${options.descriptionChars})`,
      descriptionLength: sql<number>`char_length(${jobs.descriptionText})`,
    })
    .from(jobs)
    .leftJoin(companies, eq(companies.id, jobs.companyId))
    .where(
      and(
        eq(jobs.stage, "new"),
        eq(jobs.prefilterPassed, true),
        options.since ? gte(jobs.firstSeenAt, options.since) : undefined,
      ),
    )
    .orderBy(desc(jobs.firstSeenAt))
    .limit(options.limit);

  return rows.map(({ descriptionLength, ...row }) => ({
    ...row,
    descriptionTruncated: descriptionLength > options.descriptionChars,
  }));
}

/** get_job and the detail page: job, assessment and application (if any). */
export async function getJob(jobId: string) {
  const [row] = await db
    .select({
      job: jobs,
      isDreamCompany: sql<boolean>`coalesce(${companies.isDream}, false)`,
      assessment: jobAssessments,
      application: {
        id: applications.id,
        status: applications.status,
        appliedAt: applications.appliedAt,
        resumeVariantId: applications.resumeVariantId,
        nextAction: applications.nextAction,
        nextActionAt: applications.nextActionAt,
      },
    })
    .from(jobs)
    .leftJoin(companies, eq(companies.id, jobs.companyId))
    .leftJoin(jobAssessments, eq(jobAssessments.jobId, jobs.id))
    .leftJoin(applications, eq(applications.jobId, jobs.id))
    .where(eq(jobs.id, jobId));

  if (!row) throw new AppError("NOT_FOUND", "Job not found");
  return {
    ...row.job,
    isDreamCompany: row.isDreamCompany,
    assessment: row.assessment,
    application: row.application?.id ? row.application : null,
  };
}

async function setJobStage(
  jobIds: string[],
  to: JobStage,
  ctx: ServiceContext,
  action: string,
): Promise<{ updated: number }> {
  return db.transaction(async (tx) => {
    const rows = await tx
      .select({ id: jobs.id, stage: jobs.stage })
      .from(jobs)
      .where(inArray(jobs.id, jobIds));
    if (rows.length !== new Set(jobIds).size) throw new AppError("NOT_FOUND", "Job not found");

    const invalid = rows.find((r) => !isValidJobStageTransition(r.stage, to));
    if (invalid) {
      throw new AppError("INVALID_TRANSITION", `Job ${invalid.id} cannot move from ${invalid.stage} to ${to}`);
    }

    await tx.update(jobs).set({ stage: to }).where(inArray(jobs.id, jobIds));
    await recordAudit(tx, ctx, {
      action,
      targetType: "job",
      targetId: jobIds.length === 1 ? jobIds[0] : null,
      diff: { to, count: jobIds.length },
    });
    return { updated: rows.length };
  });
}

/** Dashboard only. */
export async function dismissJob(jobId: string, ctx: ServiceContext) {
  requireUser(ctx);
  return setJobStage([jobId], "dismissed", ctx, "jobs.dismiss");
}

/** Dashboard only. */
export async function archiveJobs(jobIds: string[], ctx: ServiceContext) {
  requireUser(ctx);
  return setJobStage(jobIds, "archived", ctx, "jobs.archive");
}

/**
 * After a full board poll: jobs of this company and source that are no longer listed get
 * closed_at, and are archived unless shortlisted (claude.md section 5.6). Jobs that reappear
 * are reopened (closed_at cleared) but keep their stage.
 */
export async function syncBoardClosures(
  companyId: string,
  source: "greenhouse" | "lever" | "ashby",
  seenJobIds: string[],
  ctx: ServiceContext,
): Promise<{ closed: number; archived: number; reopened: number }> {
  return db.transaction(async (tx) => {
    const now = new Date();
    const onBoard = seenJobIds.length ? inArray(jobs.id, seenJobIds) : sql`false`;

    const closed = await tx
      .update(jobs)
      .set({ closedAt: now })
      .where(and(eq(jobs.companyId, companyId), eq(jobs.source, source), isNull(jobs.closedAt), not(onBoard)))
      .returning({ id: jobs.id, stage: jobs.stage });

    const toArchive = closed.filter((j) => j.stage !== "shortlisted" && isValidJobStageTransition(j.stage, "archived"));
    if (toArchive.length) {
      await tx.update(jobs).set({ stage: "archived" }).where(inArray(jobs.id, toArchive.map((j) => j.id)));
    }

    const reopened = seenJobIds.length
      ? await tx
          .update(jobs)
          .set({ closedAt: null })
          .where(and(inArray(jobs.id, seenJobIds), isNotNull(jobs.closedAt)))
          .returning({ id: jobs.id })
      : [];

    if (closed.length || reopened.length) {
      await recordAudit(tx, ctx, {
        action: "jobs.syncBoardClosures",
        targetType: "company",
        targetId: companyId,
        diff: { closed: closed.length, archived: toArchive.length, reopened: reopened.length },
      });
    }
    return { closed: closed.length, archived: toArchive.length, reopened: reopened.length };
  });
}
