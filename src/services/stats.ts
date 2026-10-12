import "server-only";
import { and, count, desc, eq, gte, isNotNull, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { applicationEvents, applications, ingestionRuns, jobAssessments, jobs, outreach } from "@/db/schema";
import type { AppStatus } from "@/lib/state-machine";

export type StatsRange = "7d" | "30d" | "all";

const DAY_MS = 24 * 60 * 60 * 1000;
const RANGE_DAYS: Record<StatsRange, number | null> = { "7d": 7, "30d": 30, all: null };

// An application "responded" once the company did anything; "interviewed"/"offered" if it
// ever reached that stage, judged by history so a later rejection still counts.
const RESPONSE_STATUSES: AppStatus[] = ["oa", "interviewing", "offer", "accepted", "declined", "rejected"];
const INTERVIEW_STATUSES: AppStatus[] = ["interviewing", "offer", "accepted", "declined"];
const OFFER_STATUSES: AppStatus[] = ["offer", "accepted", "declined"];

type Rate = { applied: number; responded: number; rate: number | null };

function rate(applied: number, responded: number): Rate {
  return { applied, responded, rate: applied ? Math.round((responded / applied) * 1000) / 1000 : null };
}

function groupRates<T extends { responded: boolean }>(rows: T[], key: (row: T) => string | null) {
  const groups = new Map<string, { applied: number; responded: number }>();
  for (const row of rows) {
    const k = key(row) ?? "unknown";
    const g = groups.get(k) ?? { applied: 0, responded: 0 };
    g.applied++;
    if (row.responded) g.responded++;
    groups.set(k, g);
  }
  return Object.fromEntries([...groups].map(([k, g]) => [k, rate(g.applied, g.responded)]));
}

/** get_stats and /stats: funnel, response rates by tier/archetype/source/channel, outreach reply rate. */
export async function getStats(range: StatsRange) {
  const days = RANGE_DAYS[range];
  const since = days === null ? null : new Date(Date.now() - days * DAY_MS);

  const reached = (statuses: AppStatus[]) => sql<boolean>`(
    ${applications.status} in ${statuses} or exists (
      select 1 from ${applicationEvents}
      where ${applicationEvents.applicationId} = ${applications.id}
        and ${applicationEvents.toStatus} in ${statuses}
    )
  )`;

  const [assessedRow] = await db
    .select({ n: count() })
    .from(jobAssessments)
    .where(since ? gte(jobAssessments.createdAt, since) : undefined);

  const apps = await db
    .select({
      appliedAt: applications.appliedAt,
      channel: applications.channel,
      source: jobs.source,
      tier: jobAssessments.tier,
      archetype: jobAssessments.archetype,
      responded: reached(RESPONSE_STATUSES),
      interviewed: reached(INTERVIEW_STATUSES),
      offered: reached(OFFER_STATUSES),
    })
    .from(applications)
    .innerJoin(jobs, eq(jobs.id, applications.jobId))
    .leftJoin(jobAssessments, eq(jobAssessments.jobId, applications.jobId))
    .where(since ? gte(applications.createdAt, since) : undefined);

  const applied = apps.filter((a) => a.appliedAt !== null);

  const [outreachRow] = await db
    .select({
      sent: sql<number>`count(*) filter (where ${outreach.status} in ('sent', 'replied', 'no_reply'))::int`,
      replied: sql<number>`count(*) filter (where ${outreach.status} = 'replied')::int`,
    })
    .from(outreach)
    .where(since ? and(isNotNull(outreach.sentAt), gte(outreach.sentAt, since)) : undefined);

  return {
    range,
    funnel: {
      assessed: assessedRow?.n ?? 0,
      ready: apps.length,
      applied: applied.length,
      responded: applied.filter((a) => a.responded).length,
      interviewed: applied.filter((a) => a.interviewed).length,
      offers: applied.filter((a) => a.offered).length,
    },
    responseRate: {
      overall: rate(applied.length, applied.filter((a) => a.responded).length),
      byTier: groupRates(applied, (a) => a.tier),
      byArchetype: groupRates(applied, (a) => a.archetype),
      bySource: groupRates(applied, (a) => a.source),
      byChannel: groupRates(applied, (a) => a.channel),
    },
    outreach: {
      sent: outreachRow?.sent ?? 0,
      replied: outreachRow?.replied ?? 0,
      replyRate: outreachRow?.sent ? Math.round((outreachRow.replied / outreachRow.sent) * 1000) / 1000 : null,
    },
  };
}

/** /stats ingestion history. */
export async function getRecentIngestionRuns(limit = 30) {
  return db.select().from(ingestionRuns).orderBy(desc(ingestionRuns.startedAt)).limit(limit);
}
