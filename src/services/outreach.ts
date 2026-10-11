import "server-only";
import { and, asc, desc, eq, inArray, isNull, lte } from "drizzle-orm";
import { db } from "@/db/client";
import type { outreachChannelValues, outreachStatusValues } from "@/db/enums";
import { contacts, jobs, outreach } from "@/db/schema";
import { AppError } from "@/lib/errors";
import { recordAudit } from "./audit";
import type { ServiceContext } from "./context";

type OutreachChannel = (typeof outreachChannelValues)[number];
type OutreachStatus = (typeof outreachStatusValues)[number];

const DAY_MS = 24 * 60 * 60 * 1000;

// drafted -> sent -> replied | no_reply. A late reply can still arrive after no_reply.
const OUTREACH_TRANSITIONS: Record<OutreachStatus, readonly OutreachStatus[]> = {
  drafted: ["sent"],
  sent: ["replied", "no_reply"],
  no_reply: ["replied"],
  replied: [],
};

function assertHttps(url: string | null | undefined, field: string) {
  if (!url) return;
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new AppError("INVALID_INPUT", `${field} is not a valid URL`);
  }
  if (parsed.protocol !== "https:") throw new AppError("INVALID_INPUT", `${field} must be https`);
}

export type CreateOutreachInput = {
  jobId: string;
  contact: { name: string; role?: string | null; publicProfileUrl?: string | null; sourceUrl?: string | null };
  channel: OutreachChannel;
  message: string;
  followUpDays: number;
};

/** create_outreach: drafts a message. Contacts are reused by (company, name). Nothing is sent. */
export async function createOutreach(input: CreateOutreachInput, ctx: ServiceContext) {
  assertHttps(input.contact.publicProfileUrl, "public_profile_url");
  assertHttps(input.contact.sourceUrl, "source_url");

  return db.transaction(async (tx) => {
    const [job] = await tx
      .select({ id: jobs.id, companyId: jobs.companyId })
      .from(jobs)
      .where(eq(jobs.id, input.jobId));
    if (!job) throw new AppError("NOT_FOUND", "Job not found");

    const name = input.contact.name.trim();
    const [existing] = await tx
      .select({ id: contacts.id })
      .from(contacts)
      .where(
        and(
          job.companyId ? eq(contacts.companyId, job.companyId) : isNull(contacts.companyId),
          eq(contacts.name, name),
        ),
      );

    let contactId: string;
    if (existing) {
      contactId = existing.id;
      // Fill in details we did not have, never overwrite with blanks.
      const patch = Object.fromEntries(
        Object.entries({
          role: input.contact.role,
          publicProfileUrl: input.contact.publicProfileUrl,
          sourceUrl: input.contact.sourceUrl,
        }).filter(([, v]) => v),
      );
      if (Object.keys(patch).length) await tx.update(contacts).set(patch).where(eq(contacts.id, contactId));
    } else {
      const [created] = await tx
        .insert(contacts)
        .values({
          companyId: job.companyId,
          name,
          role: input.contact.role ?? null,
          publicProfileUrl: input.contact.publicProfileUrl ?? null,
          sourceUrl: input.contact.sourceUrl ?? null,
        })
        .returning({ id: contacts.id });
      contactId = created.id;
    }

    const [row] = await tx
      .insert(outreach)
      .values({
        jobId: input.jobId,
        contactId,
        channel: input.channel,
        message: input.message,
        status: "drafted",
        followUpAt: new Date(Date.now() + input.followUpDays * DAY_MS),
      })
      .returning({ id: outreach.id });

    await recordAudit(tx, ctx, {
      action: "outreach.create",
      targetType: "outreach",
      targetId: row.id,
      diff: { jobId: input.jobId, channel: input.channel, contactReused: Boolean(existing) },
    });
    return { outreachId: row.id, contactId };
  });
}

/** update_outreach_status and the dashboard. Sending restarts the follow-up clock. */
export async function updateOutreachStatus(
  input: { outreachId: string; status: OutreachStatus; note?: string | null },
  ctx: ServiceContext,
) {
  return db.transaction(async (tx) => {
    const [row] = await tx
      .select({
        status: outreach.status,
        createdAt: outreach.createdAt,
        followUpAt: outreach.followUpAt,
      })
      .from(outreach)
      .where(eq(outreach.id, input.outreachId))
      .for("update");
    if (!row) throw new AppError("NOT_FOUND", "Outreach not found");
    if (!OUTREACH_TRANSITIONS[row.status].includes(input.status)) {
      throw new AppError("INVALID_TRANSITION", `Cannot move outreach from ${row.status} to ${input.status}`);
    }

    const now = new Date();
    const followUpGap = row.followUpAt ? row.followUpAt.getTime() - row.createdAt.getTime() : 7 * DAY_MS;
    await tx
      .update(outreach)
      .set({
        status: input.status,
        ...(input.status === "sent"
          ? { sentAt: now, followUpAt: new Date(now.getTime() + followUpGap) }
          : { followUpAt: null }),
        ...(input.note !== undefined ? { note: input.note } : {}),
      })
      .where(eq(outreach.id, input.outreachId));

    await recordAudit(tx, ctx, {
      action: "outreach.updateStatus",
      targetType: "outreach",
      targetId: input.outreachId,
      diff: { from: row.status, to: input.status },
    });
    return { from: row.status, to: input.status };
  });
}

export async function listOutreach(options: { status?: OutreachStatus[]; limit: number }) {
  return db
    .select({
      outreach,
      contact: { name: contacts.name, role: contacts.role, publicProfileUrl: contacts.publicProfileUrl },
      job: { title: jobs.title, companyName: jobs.companyName },
    })
    .from(outreach)
    .innerJoin(jobs, eq(jobs.id, outreach.jobId))
    .leftJoin(contacts, eq(contacts.id, outreach.contactId))
    .where(options.status?.length ? inArray(outreach.status, options.status) : undefined)
    .orderBy(desc(outreach.createdAt))
    .limit(options.limit);
}

/** Sent messages whose follow-up date has passed. */
export async function getOutreachFollowUpsDue(now: Date = new Date()) {
  return db
    .select({
      id: outreach.id,
      channel: outreach.channel,
      followUpAt: outreach.followUpAt,
      sentAt: outreach.sentAt,
      contactName: contacts.name,
      companyName: jobs.companyName,
      title: jobs.title,
    })
    .from(outreach)
    .innerJoin(jobs, eq(jobs.id, outreach.jobId))
    .leftJoin(contacts, eq(contacts.id, outreach.contactId))
    .where(and(eq(outreach.status, "sent"), lte(outreach.followUpAt, now)))
    .orderBy(asc(outreach.followUpAt));
}
