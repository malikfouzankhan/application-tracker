import "server-only";
import { and, desc, eq, gte, inArray, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { applications, companies, jobAssessments, jobs } from "@/db/schema";
import { parseExperience } from "@/ingest/exp-parse";
import { type NormalizedJob, inferRemoteType, normalizedJobSchema } from "@/ingest/normalize";
import { prefilterJob } from "@/ingest/prefilter";
import { sanitizeExternalText, sanitizeLine } from "@/ingest/sanitize";
import { detectScamFlags } from "@/ingest/scam";
import { extractBoardRefs } from "@/ingest/snowball";
import { AppError } from "@/lib/errors";
import { urlHash } from "@/lib/hash";
import { type JobStage, isValidJobStageTransition } from "@/lib/state-machine";
import { recordAudit } from "./audit";
import { findCompanyForJob, upsertSnowballCompanies } from "./companies";
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
  snowballedCompanies: number;
  items: IngestItemResult[];
};

/**
 * The shared ingestion pipeline (claude.md section 6): sanitize, hash, parse experience,
 * prefilter, scam flags, snowball, then insert. Idempotent: rows are keyed on url_hash and
 * existing jobs are left untouched. Used by the daily ingestion and by import_jobs.
 */
export async function ingestNormalized(
  input: NormalizedJob[],
  ctx: ServiceContext,
): Promise<IngestResult> {
  const { preferences } = await getPreferences();

  return db.transaction(async (tx) => {
    const result: IngestResult = {
      received: input.length,
      inserted: 0,
      duplicates: 0,
      invalid: 0,
      passedPrefilter: 0,
      snowballedCompanies: 0,
      items: [],
    };
    const seenHashes = new Set<string>();

    for (const raw of input) {
      const parsed = normalizedJobSchema.safeParse(raw);
      const rawUrl = typeof raw?.url === "string" ? raw.url : "";
      if (!parsed.success) {
        result.invalid++;
        result.items.push({ url: rawUrl, status: "invalid", error: parsed.error.issues[0]?.message ?? "invalid" });
        continue;
      }
      const job = parsed.data;

      let hash: string;
      try {
        hash = urlHash(job.url);
      } catch {
        result.invalid++;
        result.items.push({ url: job.url, status: "invalid", error: "Unparseable URL" });
        continue;
      }
      if (seenHashes.has(hash)) continue; // same posting twice in one batch
      seenHashes.add(hash);

      // Board links hide in hrefs, so snowball reads the raw description before sanitizing.
      const refs = extractBoardRefs(job.url, job.description);
      result.snowballedCompanies += await upsertSnowballCompanies(tx, refs);

      const title = sanitizeLine(job.title);
      const companyName = sanitizeLine(job.companyName, 200);
      const locationRaw = job.locationRaw ? sanitizeLine(job.locationRaw) : null;
      const description = sanitizeExternalText(job.description).text;
      const remoteType = job.remoteType ?? inferRemoteType(locationRaw, description);
      const experience = parseExperience(title, description);

      const company = job.companyId
        ? await tx
            .select({ id: companies.id, isDream: companies.isDream })
            .from(companies)
            .where(eq(companies.id, job.companyId))
            .then((rows) => rows[0] ?? null)
        : await findCompanyForJob(tx, extractBoardRefs(job.url), companyName);

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
          descriptionText: description,
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
        const [existing] = await tx
          .select({ id: jobs.id, prefilterPassed: jobs.prefilterPassed })
          .from(jobs)
          .where(eq(jobs.urlHash, hash));
        result.duplicates++;
        if (existing) {
          result.items.push({ url: job.url, status: "duplicate", jobId: existing.id, prefilterPassed: existing.prefilterPassed });
        }
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
