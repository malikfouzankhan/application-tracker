import "server-only";
import { and, count, desc, eq, gte, isNotNull } from "drizzle-orm";
import { db } from "@/db/client";
import type { feedbackVerdictValues } from "@/db/enums";
import { feedback, jobs } from "@/db/schema";
import { AppError } from "@/lib/errors";
import { recordAudit } from "./audit";
import { type ServiceContext, requireUser } from "./context";

type Verdict = (typeof feedbackVerdictValues)[number];

const DAY_MS = 24 * 60 * 60 * 1000;

/** Dashboard 👍/👎 on a job, with an optional reason. */
export async function giveFeedback(
  input: { jobId: string; verdict: Verdict; reason?: string | null },
  ctx: ServiceContext,
) {
  requireUser(ctx);
  await db.transaction(async (tx) => {
    const [job] = await tx.select({ id: jobs.id }).from(jobs).where(eq(jobs.id, input.jobId));
    if (!job) throw new AppError("NOT_FOUND", "Job not found");
    const [row] = await tx
      .insert(feedback)
      .values({ jobId: input.jobId, verdict: input.verdict, reason: input.reason?.trim() || null })
      .returning({ id: feedback.id });
    await recordAudit(tx, ctx, {
      action: "feedback.give",
      targetType: "feedback",
      targetId: row.id,
      diff: { jobId: input.jobId, verdict: input.verdict },
    });
  });
}

/** For get_briefing: last N days of up/down counts and the most recent reasons. */
export async function getFeedbackSummary(days = 30, recentLimit = 10) {
  const since = new Date(Date.now() - days * DAY_MS);
  const [counts, recent] = await Promise.all([
    db
      .select({ verdict: feedback.verdict, n: count() })
      .from(feedback)
      .where(gte(feedback.createdAt, since))
      .groupBy(feedback.verdict),
    db
      .select({
        verdict: feedback.verdict,
        reason: feedback.reason,
        title: jobs.title,
        companyName: jobs.companyName,
        createdAt: feedback.createdAt,
      })
      .from(feedback)
      .innerJoin(jobs, eq(jobs.id, feedback.jobId))
      .where(and(gte(feedback.createdAt, since), isNotNull(feedback.reason)))
      .orderBy(desc(feedback.createdAt))
      .limit(recentLimit),
  ]);
  const byVerdict = Object.fromEntries(counts.map((c) => [c.verdict, c.n]));
  return { days, up: byVerdict.up ?? 0, down: byVerdict.down ?? 0, recent };
}
