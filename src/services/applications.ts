import "server-only";
import { and, asc, count, desc, eq, gte, inArray, isNotNull, lte, not, sql } from "drizzle-orm";
import { type Tx, db } from "@/db/client";
import type { appChannelValues } from "@/db/enums";
import {
  applicationEvents,
  applications,
  jobAssessments,
  jobs,
  outreach,
  resumeVariants,
  screeningAnswers,
} from "@/db/schema";
import { AppError } from "@/lib/errors";
import {
  APP_TRANSITIONS,
  type AppStatus,
  MANUAL_OVERRIDE_NOTE,
  decideAppTransition,
  isValidJobStageTransition,
} from "@/lib/state-machine";
import { recordAudit } from "./audit";
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
    db.select().from(outreach).where(eq(outreach.jobId, row.application.jobId)).orderBy(desc(outreach.createdAt)),
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

/** /today shortlist: ready packs created today (IST), best fit first. */
export async function getTodayShortlist(sinceUtc: Date) {
  return db
    .select({
      application: applications,
      job: {
        id: jobs.id,
        url: jobs.url,
        title: jobs.title,
        locationRaw: jobs.locationRaw,
        remoteType: jobs.remoteType,
        companyName: jobs.companyName,
        scamFlags: jobs.scamFlags,
      },
      assessment: jobAssessments,
    })
    .from(applications)
    .innerJoin(jobs, eq(jobs.id, applications.jobId))
    .leftJoin(jobAssessments, eq(jobAssessments.jobId, applications.jobId))
    .where(
      and(
        eq(applications.status, "ready"),
        eq(applications.archived, false),
        gte(applications.createdAt, sinceUtc),
      ),
    )
    .orderBy(sql`${jobAssessments.fitScore} desc nulls last`);
}
