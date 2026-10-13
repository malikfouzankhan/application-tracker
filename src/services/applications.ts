import "server-only";
import { randomUUID } from "node:crypto";
import { type SQL, and, asc, count, desc, eq, gte, ilike, inArray, isNotNull, lt, lte, not, or, sql } from "drizzle-orm";
import { type Tx, db } from "@/db/client";
import type { appChannelValues, archetypeValues, jobSourceValues, remoteTypeValues, tierValues } from "@/db/enums";
import {
  applicationEvents,
  applications,
  companies,
  contacts,
  jobAssessments,
  jobs,
  outreach,
  resumeVariants,
  screeningAnswers,
} from "@/db/schema";
import { extractBoardRefs } from "@/ingest/snowball";
import { sanitizeExternalText, sanitizeLine } from "@/ingest/sanitize";
import { detectScamFlags } from "@/ingest/scam";
import { AppError } from "@/lib/errors";
import { sha256Hex, urlHash } from "@/lib/hash";
import { type ApplicationFilters, likePattern } from "@/lib/filters";
import {
  APP_TRANSITIONS,
  type AppStatus,
  MANUAL_OVERRIDE_NOTE,
  decideAppTransition,
  isValidJobStageTransition,
} from "@/lib/state-machine";
import { recordAudit } from "./audit";
import { findCompanyForJob } from "./companies";
import { type ServiceContext, requireUser } from "./context";

type AppChannel = (typeof appChannelValues)[number];

const TERMINAL_STATUSES = (Object.keys(APP_TRANSITIONS) as AppStatus[]).filter(
  (s) => APP_TRANSITIONS[s].length === 0,
);

// ---------------------------------------------------------------- Application packs

export type SavePackInput = {
  jobId: string;
  resumeVariantId: string;
  answers: { question: string; answer: string }[];
  coverNote?: string | null;
};

/**
 * save_application_pack: creates the application as "ready" (or refreshes it while it is
 * still "ready") and shortlists the job. Screening answers of a ready pack are draft content,
 * so a re-save replaces them; once applied, the pack is frozen.
 */
export async function saveApplicationPack(
  input: SavePackInput,
  ctx: ServiceContext,
): Promise<{ applicationId: string; created: boolean }> {
  return db.transaction(async (tx) => {
    const [job] = await tx
      .select({ id: jobs.id, stage: jobs.stage })
      .from(jobs)
      .where(eq(jobs.id, input.jobId));
    if (!job) throw new AppError("NOT_FOUND", "Job not found");
    if (job.stage !== "shortlisted" && !isValidJobStageTransition(job.stage, "shortlisted")) {
      throw new AppError("CONFLICT", `Job is ${job.stage}; it cannot be shortlisted`);
    }

    const [variant] = await tx
      .select({ jobId: resumeVariants.jobId })
      .from(resumeVariants)
      .where(eq(resumeVariants.id, input.resumeVariantId));
    if (!variant) throw new AppError("NOT_FOUND", "Resume variant not found");
    if (variant.jobId !== input.jobId) {
      throw new AppError("INVALID_INPUT", "Resume variant belongs to a different job");
    }

    const [existing] = await tx
      .select({ id: applications.id, status: applications.status })
      .from(applications)
      .where(eq(applications.jobId, input.jobId));

    let applicationId: string;
    if (existing) {
      if (existing.status !== "ready") {
        throw new AppError("CONFLICT", `Application is already ${existing.status}; the pack is frozen`);
      }
      applicationId = existing.id;
      await tx
        .update(applications)
        .set({ resumeVariantId: input.resumeVariantId, coverNote: input.coverNote ?? null })
        .where(eq(applications.id, applicationId));
      await tx.delete(screeningAnswers).where(eq(screeningAnswers.applicationId, applicationId));
    } else {
      const [created] = await tx
        .insert(applications)
        .values({
          jobId: input.jobId,
          resumeVariantId: input.resumeVariantId,
          coverNote: input.coverNote ?? null,
          status: "ready",
        })
        .returning({ id: applications.id });
      applicationId = created.id;
      await tx.insert(applicationEvents).values({
        applicationId,
        fromStatus: null,
        toStatus: "ready",
        actor: ctx.actor,
      });
    }

    if (input.answers.length > 0) {
      await tx.insert(screeningAnswers).values(
        input.answers.map((a, i) => ({
          applicationId,
          question: a.question,
          answer: a.answer,
          source: ctx.actor === "user" ? ("user" as const) : ("claude" as const),
          sortOrder: i,
        })),
      );
    }

    if (job.stage !== "shortlisted") {
      await tx.update(jobs).set({ stage: "shortlisted" }).where(eq(jobs.id, input.jobId));
    }

    await recordAudit(tx, ctx, {
      action: "applications.savePack",
      targetType: "application",
      targetId: applicationId,
      diff: { created: !existing, answers: input.answers.length, hasCoverNote: Boolean(input.coverNote) },
    });
    return { applicationId, created: !existing };
  });
}

// ---------------------------------------------------------------- Status changes

export type StatusChangeInput = {
  applicationId: string;
  status: AppStatus;
  note?: string | null;
  nextAction?: string | null;
  nextActionAt?: Date | null;
  /** Set with "applied" from the dashboard's "Mark applied". */
  channel?: AppChannel | null;
};

async function changeStatus(tx: Tx, input: StatusChangeInput, ctx: ServiceContext) {
  const [app] = await tx
    .select({ id: applications.id, status: applications.status, appliedAt: applications.appliedAt })
    .from(applications)
    .where(eq(applications.id, input.applicationId))
    .for("update");
  if (!app) throw new AppError("NOT_FOUND", "Application not found");

  const decision = decideAppTransition(app.status, input.status, ctx.actor);
  if (!decision.allowed) throw new AppError("INVALID_TRANSITION", decision.reason);

  const note = decision.override
    ? input.note
      ? `${MANUAL_OVERRIDE_NOTE}: ${input.note}`
      : MANUAL_OVERRIDE_NOTE
    : (input.note ?? null);

  await tx
    .update(applications)
    .set({
      status: input.status,
      ...(input.status === "applied" && !app.appliedAt ? { appliedAt: new Date() } : {}),
      ...(input.channel !== undefined ? { channel: input.channel } : {}),
      ...(input.nextAction !== undefined ? { nextAction: input.nextAction } : {}),
      ...(input.nextActionAt !== undefined ? { nextActionAt: input.nextActionAt } : {}),
    })
    .where(eq(applications.id, app.id));

  await tx.insert(applicationEvents).values({
    applicationId: app.id,
    fromStatus: app.status,
    toStatus: input.status,
    actor: ctx.actor,
    note,
  });

  return { from: app.status, to: input.status, override: decision.override };
}

/** update_application_status (strict for Claude) and dashboard status changes (override allowed). */
export async function updateApplicationStatus(input: StatusChangeInput, ctx: ServiceContext) {
  return db.transaction(async (tx) => {
    const change = await changeStatus(tx, input, ctx);
    await recordAudit(tx, ctx, {
      action: "applications.updateStatus",
      targetType: "application",
      targetId: input.applicationId,
      diff: { ...change, nextActionSet: input.nextActionAt !== undefined },
    });
    return change;
  });
}

/** Dashboard "Mark applied": sets channel and applied_at. */
export async function markApplied(applicationId: string, channel: AppChannel, ctx: ServiceContext) {
  requireUser(ctx);
  return updateApplicationStatus({ applicationId, status: "applied", channel }, ctx);
}

/** Dashboard "Dismiss" on a ready pack: withdraws the application and dismisses the job. */
export async function dismissPack(applicationId: string, ctx: ServiceContext) {
  requireUser(ctx);
  return db.transaction(async (tx) => {
    const [app] = await tx
      .select({ jobId: applications.jobId })
      .from(applications)
      .where(eq(applications.id, applicationId));
    if (!app) throw new AppError("NOT_FOUND", "Application not found");

    const change = await changeStatus(tx, { applicationId, status: "withdrawn" }, ctx);
    await tx.update(jobs).set({ stage: "dismissed" }).where(eq(jobs.id, app.jobId));
    await recordAudit(tx, ctx, {
      action: "applications.dismissPack",
      targetType: "application",
      targetId: applicationId,
      diff: change,
    });
    return change;
  });
}

/** Dashboard bulk action. Uses user override rules, so every change is logged. */
export async function bulkMarkGhosted(applicationIds: string[], ctx: ServiceContext) {
  requireUser(ctx);
  return db.transaction(async (tx) => {
    for (const applicationId of applicationIds) {
      await changeStatus(tx, { applicationId, status: "ghosted" }, ctx);
    }
    await recordAudit(tx, ctx, {
      action: "applications.bulkMarkGhosted",
      targetType: "application",
      diff: { count: applicationIds.length },
    });
    return { updated: applicationIds.length };
  });
}

/** Dashboard bulk action. Archiving hides, never deletes. */
export async function setApplicationsArchived(
  applicationIds: string[],
  archived: boolean,
  ctx: ServiceContext,
) {
  requireUser(ctx);
  return db.transaction(async (tx) => {
    const rows = await tx
      .update(applications)
      .set({ archived })
      .where(inArray(applications.id, applicationIds))
      .returning({ id: applications.id });
    await recordAudit(tx, ctx, {
      action: "applications.setArchived",
      targetType: "application",
      diff: { archived, count: rows.length },
    });
    return { updated: rows.length };
  });
}

export async function updateApplicationNotes(applicationId: string, notes: string | null, ctx: ServiceContext) {
  requireUser(ctx);
  await db.transaction(async (tx) => {
    const [row] = await tx
      .update(applications)
      .set({ notes })
      .where(eq(applications.id, applicationId))
      .returning({ id: applications.id });
    if (!row) throw new AppError("NOT_FOUND", "Application not found");
    await recordAudit(tx, ctx, {
      action: "applications.updateNotes",
      targetType: "application",
      targetId: applicationId,
      diff: { fields: ["notes"] },
    });
  });
}

export async function updateScreeningAnswer(answerId: string, answer: string, ctx: ServiceContext) {
  requireUser(ctx);
  await db.transaction(async (tx) => {
    const [row] = await tx
      .update(screeningAnswers)
      .set({ answer, source: "user" })
      .where(eq(screeningAnswers.id, answerId))
      .returning({ applicationId: screeningAnswers.applicationId });
    if (!row) throw new AppError("NOT_FOUND", "Screening answer not found");
    await recordAudit(tx, ctx, {
      action: "applications.updateScreeningAnswer",
      targetType: "screening_answer",
      targetId: answerId,
      diff: { applicationId: row.applicationId },
    });
  });
}

// ---------------------------------------------------------------- Reads

/** list_applications. */
export async function listApplications(options: {
  status?: AppStatus[];
  since?: Date | null;
  limit: number;
}) {
  return db
    .select({
      id: applications.id,
      jobId: applications.jobId,
      companyName: jobs.companyName,
      title: jobs.title,
      locationRaw: jobs.locationRaw,
      remoteType: jobs.remoteType,
      status: applications.status,
      channel: applications.channel,
      appliedAt: applications.appliedAt,
      createdAt: applications.createdAt,
      updatedAt: applications.updatedAt,
      nextAction: applications.nextAction,
      nextActionAt: applications.nextActionAt,
      tier: jobAssessments.tier,
      fitScore: jobAssessments.fitScore,
    })
    .from(applications)
    .innerJoin(jobs, eq(jobs.id, applications.jobId))
    .leftJoin(jobAssessments, eq(jobAssessments.jobId, applications.jobId))
    .where(
      and(
        eq(applications.archived, false),
        options.status?.length ? inArray(applications.status, options.status) : undefined,
        options.since ? gte(applications.updatedAt, options.since) : undefined,
      ),
    )
    .orderBy(desc(applications.updatedAt))
    .limit(options.limit);
}

/** Detail page: application with job, assessment, answers, outreach and full history. */
export async function getApplication(applicationId: string) {
  const [row] = await db
    .select({ application: applications, job: jobs, assessment: jobAssessments })
    .from(applications)
    .innerJoin(jobs, eq(jobs.id, applications.jobId))
    .leftJoin(jobAssessments, eq(jobAssessments.jobId, applications.jobId))
    .where(eq(applications.id, applicationId));
  if (!row) throw new AppError("NOT_FOUND", "Application not found");

  const [answers, events, outreachRows] = await Promise.all([
    db
      .select()
      .from(screeningAnswers)
      .where(eq(screeningAnswers.applicationId, applicationId))
      .orderBy(asc(screeningAnswers.sortOrder)),
    db
      .select()
      .from(applicationEvents)
      .where(eq(applicationEvents.applicationId, applicationId))
      .orderBy(asc(applicationEvents.createdAt)),
    db
      .select({ outreach, contactName: contacts.name, contactRole: contacts.role, contactUrl: contacts.publicProfileUrl })
      .from(outreach)
      .leftJoin(contacts, eq(contacts.id, outreach.contactId))
      .where(eq(outreach.jobId, row.application.jobId))
      .orderBy(desc(outreach.createdAt)),
  ]);

  return { ...row, answers, events, outreach: outreachRows };
}

/** Pipeline counts by status (non-archived), for get_briefing. */
export async function getPipelineCounts(): Promise<Partial<Record<AppStatus, number>>> {
  const rows = await db
    .select({ status: applications.status, n: count() })
    .from(applications)
    .where(eq(applications.archived, false))
    .groupBy(applications.status);
  return Object.fromEntries(rows.map((r) => [r.status, r.n]));
}

/** Applications whose next action is due, for get_briefing and /today. */
export async function getApplicationFollowUpsDue(now: Date = new Date()) {
  return db
    .select({
      id: applications.id,
      companyName: jobs.companyName,
      title: jobs.title,
      locationRaw: jobs.locationRaw,
      status: applications.status,
      nextAction: applications.nextAction,
      nextActionAt: applications.nextActionAt,
    })
    .from(applications)
    .innerJoin(jobs, eq(jobs.id, applications.jobId))
    .where(
      and(
        eq(applications.archived, false),
        isNotNull(applications.nextActionAt),
        lte(applications.nextActionAt, now),
        not(inArray(applications.status, TERMINAL_STATUSES)),
      ),
    )
    .orderBy(asc(applications.nextActionAt));
}

// ---------------------------------------------------------------- Dashboard views

const PAGE_SIZE = 50;

/** Latest outreach status for the application's job, as a correlated subquery. */
const outreachStatusSql = sql<string | null>`(
  select o.status from ${outreach} o where o.job_id = ${applications.jobId} order by o.created_at desc limit 1
)`;

function applicationWhere(f: ApplicationFilters) {
  const istDay = (d: string, end = false) => sql`(${d}::date ${end ? sql`+ 1` : sql``})::timestamp at time zone 'Asia/Kolkata'`;
  return and(
    f.archived ? undefined : eq(applications.archived, false),
    f.status.length ? inArray(applications.status, f.status) : undefined,
    f.tier ? eq(jobAssessments.tier, f.tier) : undefined,
    f.archetype ? eq(jobAssessments.archetype, f.archetype) : undefined,
    f.source ? eq(jobs.source, f.source) : undefined,
    f.channel ? eq(applications.channel, f.channel) : undefined,
    f.company ? ilike(jobs.companyName, likePattern(f.company)) : undefined,
    f.q ? or(ilike(jobs.companyName, likePattern(f.q)), ilike(jobs.title, likePattern(f.q))) : undefined,
    f.createdFrom ? gte(applications.createdAt, istDay(f.createdFrom)) : undefined,
    f.createdTo ? lt(applications.createdAt, istDay(f.createdTo, true)) : undefined,
    f.appliedFrom ? gte(applications.appliedAt, istDay(f.appliedFrom)) : undefined,
    f.appliedTo ? lt(applications.appliedAt, istDay(f.appliedTo, true)) : undefined,
    f.hasOutreach === "yes" ? sql`exists (select 1 from ${outreach} o where o.job_id = ${applications.jobId})` : undefined,
    f.hasOutreach === "no" ? sql`not exists (select 1 from ${outreach} o where o.job_id = ${applications.jobId})` : undefined,
    f.outreachStatus ? sql`${outreachStatusSql} = ${f.outreachStatus}` : undefined,
    f.scam ? sql`cardinality(${jobs.scamFlags}) > 0` : undefined,
    f.dream ? eq(companies.isDream, true) : undefined,
  );
}

const ORDER: Record<ApplicationFilters["sort"], SQL[]> = {
  activity: [sql`coalesce(${applications.appliedAt}, ${applications.createdAt}) desc`],
  applied: [sql`${applications.appliedAt} desc nulls last`],
  created: [sql`${applications.createdAt} desc`],
  fit: [sql`${jobAssessments.fitScore} desc nulls last`],
  company: [sql`lower(${jobs.companyName}) asc`, sql`${applications.createdAt} desc`],
};

/** /applications table, kanban and CSV export: one query, every filter server-side. */
export async function searchApplications(f: ApplicationFilters, options: { all?: boolean } = {}) {
  const where = applicationWhere(f);
  const base = () =>
    db
      .select({
        id: applications.id,
        jobId: applications.jobId,
        companyName: jobs.companyName,
        title: jobs.title,
        locationRaw: jobs.locationRaw,
        remoteType: jobs.remoteType,
        source: jobs.source,
        url: jobs.url,
        scamFlags: jobs.scamFlags,
        isDream: sql<boolean>`coalesce(${companies.isDream}, false)`,
        status: applications.status,
        channel: applications.channel,
        appliedAt: applications.appliedAt,
        createdAt: applications.createdAt,
        updatedAt: applications.updatedAt,
        nextAction: applications.nextAction,
        nextActionAt: applications.nextActionAt,
        archived: applications.archived,
        tier: jobAssessments.tier,
        archetype: jobAssessments.archetype,
        fitScore: jobAssessments.fitScore,
        outreachStatus: outreachStatusSql,
      })
      .from(applications)
      .innerJoin(jobs, eq(jobs.id, applications.jobId))
      .leftJoin(companies, eq(companies.id, jobs.companyId))
      .leftJoin(jobAssessments, eq(jobAssessments.jobId, applications.jobId))
      .where(where)
      .orderBy(...ORDER[f.sort]);

  const limit = options.all ? 5000 : PAGE_SIZE;
  const offset = options.all ? 0 : (f.page - 1) * PAGE_SIZE;
  const [rows, [{ n }]] = await Promise.all([
    base().limit(limit).offset(offset),
    db
      .select({ n: count() })
      .from(applications)
      .innerJoin(jobs, eq(jobs.id, applications.jobId))
      .leftJoin(companies, eq(companies.id, jobs.companyId))
      .leftJoin(jobAssessments, eq(jobAssessments.jobId, applications.jobId))
      .where(where),
  ]);
  return { rows, total: n, pageSize: PAGE_SIZE };
}

/** /today: every ready pack (not just today's), best fit first, with what is needed to apply. */
export async function getPackCards() {
  const apps = await db
    .select({
      application: applications,
      job: {
        id: jobs.id,
        url: jobs.url,
        title: jobs.title,
        companyName: jobs.companyName,
        locationRaw: jobs.locationRaw,
        remoteType: jobs.remoteType,
        scamFlags: jobs.scamFlags,
        expMin: jobs.expMin,
        expMax: jobs.expMax,
      },
      assessment: jobAssessments,
      variant: { id: resumeVariants.id, status: resumeVariants.status },
      isNew: sql<boolean>`${applications.createdAt} > now() - interval '1 day'`,
    })
    .from(applications)
    .innerJoin(jobs, eq(jobs.id, applications.jobId))
    .leftJoin(jobAssessments, eq(jobAssessments.jobId, applications.jobId))
    .leftJoin(resumeVariants, eq(resumeVariants.id, applications.resumeVariantId))
    .where(and(eq(applications.status, "ready"), eq(applications.archived, false)))
    .orderBy(sql`${jobAssessments.fitScore} desc nulls last`, desc(applications.createdAt));

  if (apps.length === 0) return [];
  const appIds = apps.map((a) => a.application.id);
  const jobIds = apps.map((a) => a.job.id);
  const [answers, drafts] = await Promise.all([
    db.select().from(screeningAnswers).where(inArray(screeningAnswers.applicationId, appIds)).orderBy(asc(screeningAnswers.sortOrder)),
    db
      .select({ outreach, contactName: contacts.name, contactRole: contacts.role, contactUrl: contacts.publicProfileUrl })
      .from(outreach)
      .leftJoin(contacts, eq(contacts.id, outreach.contactId))
      .where(and(inArray(outreach.jobId, jobIds), eq(outreach.status, "drafted")))
      .orderBy(desc(outreach.createdAt)),
  ]);

  return apps.map((a) => ({
    ...a,
    answers: answers.filter((x) => x.applicationId === a.application.id),
    outreach: drafts.filter((d) => d.outreach.jobId === a.job.id),
  }));
}

// ---------------------------------------------------------------- Manual applications

export type ManualApplicationInput = {
  companyName: string;
  title: string;
  /** Posting URL, if there is one (referrals often have none). */
  url: string | null;
  locationRaw: string | null;
  remoteType: (typeof remoteTypeValues)[number];
  source: (typeof jobSourceValues)[number];
  expMin: number | null;
  expMax: number | null;
  description: string | null;
  status: AppStatus;
  channel: AppChannel | null;
  appliedAt: Date | null;
  nextAction: string | null;
  nextActionAt: Date | null;
  notes: string | null;
  tier: (typeof tierValues)[number] | null;
  fitScore: number | null;
  archetype: (typeof archetypeValues)[number] | null;
};

const DEFAULT_FIT_SCORE = { fit: 80, justify: 65, stretch: 50, skip: 20 } as const;

/**
 * Dashboard "Add application": tracks an application MFK made outside the platform. The job is
 * stored even if it would fail the prefilter (MFK chose to apply). A posting already known by URL
 * is reused; a second application to the same job is refused.
 */
export async function createManualApplication(input: ManualApplicationInput, ctx: ServiceContext): Promise<{ applicationId: string }> {
  requireUser(ctx);
  let url: string;
  let hash: string;
  if (input.url) {
    try {
      hash = urlHash(input.url);
      url = input.url.trim();
    } catch {
      throw new AppError("INVALID_INPUT", "Job URL must be a full http(s) link");
    }
  } else {
    url = `manual:${randomUUID()}`;
    hash = sha256Hex(url);
  }

  return db.transaction(async (tx) => {
    const [existing] = await tx.select({ id: jobs.id }).from(jobs).where(eq(jobs.urlHash, hash));
    let jobId: string;
    if (existing) {
      const [app] = await tx.select({ id: applications.id }).from(applications).where(eq(applications.jobId, existing.id));
      if (app) throw new AppError("CONFLICT", "You already track an application for this job");
      jobId = existing.id;
      await tx.update(jobs).set({ stage: "shortlisted" }).where(eq(jobs.id, jobId));
    } else {
      const companyName = sanitizeLine(input.companyName, 200);
      const description = sanitizeExternalText(input.description).text;
      const company = await findCompanyForJob(tx, url.startsWith("http") ? extractBoardRefs(url) : [], companyName);
      const [job] = await tx
        .insert(jobs)
        .values({
          url,
          urlHash: hash,
          companyId: company?.id ?? null,
          companyName,
          title: sanitizeLine(input.title),
          locationRaw: input.locationRaw ? sanitizeLine(input.locationRaw) : null,
          remoteType: input.remoteType,
          expMin: input.expMin,
          expMax: input.expMax,
          descriptionText: description,
          source: input.source,
          prefilterPassed: true,
          prefilterReason: "added_manually",
          scamFlags: detectScamFlags({ companyName, title: input.title, description }),
          stage: "shortlisted",
        })
        .returning({ id: jobs.id });
      jobId = job.id;
    }

    if (input.tier) {
      await tx
        .insert(jobAssessments)
        .values({
          jobId,
          tier: input.tier,
          fitScore: input.fitScore ?? DEFAULT_FIT_SCORE[input.tier],
          archetype: input.archetype ?? "fullstack",
          reasons: "Added manually by MFK.",
          recommended: false,
        })
        .onConflictDoNothing({ target: jobAssessments.jobId });
    }

    const applied = input.status !== "ready";
    const [app] = await tx
      .insert(applications)
      .values({
        jobId,
        status: input.status,
        channel: input.channel,
        appliedAt: applied ? (input.appliedAt ?? new Date()) : null,
        nextAction: input.nextAction,
        nextActionAt: input.nextActionAt,
        notes: input.notes,
      })
      .returning({ id: applications.id });

    await tx.insert(applicationEvents).values({
      applicationId: app.id,
      fromStatus: null,
      toStatus: input.status,
      actor: ctx.actor,
      note: "Added manually",
    });
    await recordAudit(tx, ctx, {
      action: "applications.createManual",
      targetType: "application",
      targetId: app.id,
      diff: { status: input.status, source: input.source, hasUrl: Boolean(input.url), tier: input.tier },
    });
    return { applicationId: app.id };
  });
}
