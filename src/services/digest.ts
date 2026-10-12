import "server-only";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { digests } from "@/db/schema";
import { todayIst, yesterdayIst } from "@/lib/dates";
import { getApplicationFollowUpsDue, getPipelineCounts } from "./applications";
import { recordAudit } from "./audit";
import type { ServiceContext } from "./context";
import { getFeedbackSummary } from "./feedback";
import { getOutreachFollowUpsDue } from "./outreach";
import { getPreferences } from "./preferences";

/** save_digest: one digest per date, upserted. */
export async function saveDigest(input: { date: string; summaryMd: string }, ctx: ServiceContext) {
  return db.transaction(async (tx) => {
    const [row] = await tx
      .insert(digests)
      .values(input)
      .onConflictDoUpdate({
        target: digests.date,
        set: { summaryMd: input.summaryMd, updatedAt: new Date() },
      })
      .returning({ id: digests.id });
    await recordAudit(tx, ctx, {
      action: "digest.save",
      targetType: "digest",
      targetId: row.id,
      diff: { date: input.date, length: input.summaryMd.length },
    });
    return { digestId: row.id };
  });
}

export async function getDigest(date: string) {
  const [row] = await db.select().from(digests).where(eq(digests.date, date));
  return row ?? null;
}

/** get_briefing: everything the daily routine needs to start, in one call. */
export async function getBriefing(now: Date = new Date()) {
  const [{ preferences }, feedback, pipeline, applicationFollowUps, outreachFollowUps, yesterday] =
    await Promise.all([
      getPreferences(),
      getFeedbackSummary(30),
      getPipelineCounts(),
      getApplicationFollowUpsDue(now),
      getOutreachFollowUpsDue(now),
      getDigest(yesterdayIst(now)),
    ]);

  return {
    todayIst: todayIst(now),
    preferences,
    feedback,
    pipeline,
    followUpsDue: { applications: applicationFollowUps, outreach: outreachFollowUps },
    yesterdayDigest: yesterday ? { date: yesterday.date, summaryMd: yesterday.summaryMd } : null,
  };
}
