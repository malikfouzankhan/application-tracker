"use server";

import { z } from "zod";
import { redirect } from "next/navigation";
import {
  appChannelValues,
  appStatusValues,
  archetypeValues,
  feedbackVerdictValues,
  jobSourceValues,
  remoteTypeValues,
  tierValues,
} from "@/db/enums";
import {
  bulkMarkGhosted,
  createManualApplication,
  dismissPack,
  markApplied,
  setApplicationsArchived,
  updateApplicationNotes,
  updateApplicationStatus,
  updateScreeningAnswer,
} from "@/services/applications";
import { userContext } from "@/services/context";
import { giveFeedback } from "@/services/feedback";
import { field, runAction } from "./run";
import type { ActionResult } from "./types";

/** <input type="datetime-local"> is entered in IST. */
function istDateTime(value: string | null): Date | null {
  if (!value) return null;
  const date = new Date(`${value.length === 16 ? `${value}:00` : value}+05:30`);
  if (Number.isNaN(date.getTime())) throw new z.ZodError([{ code: "custom", path: ["next_action_at"], message: "Invalid date", input: value }]);
  return date;
}

export async function markAppliedAction(applicationId: string, _prev: ActionResult, formData: FormData) {
  return runAction(async () => {
    const channel = z.enum(appChannelValues).parse(field(formData, "channel"));
    await markApplied(applicationId, channel, userContext);
    return "Marked applied";
  });
}

export async function dismissPackAction(applicationId: string) {
  return runAction(async () => {
    await dismissPack(applicationId, userContext);
    return "Dismissed";
  });
}

export async function changeStatusAction(applicationId: string, _prev: ActionResult, formData: FormData) {
  return runAction(async () => {
    const status = z.enum(appStatusValues).parse(field(formData, "status"));
    const change = await updateApplicationStatus(
      {
        applicationId,
        status,
        note: field(formData, "note"),
        nextAction: field(formData, "next_action"),
        nextActionAt: istDateTime(field(formData, "next_action_at")),
        channel: status === "applied" ? (z.enum(appChannelValues).optional().parse(field(formData, "channel") ?? undefined) ?? undefined) : undefined,
      },
      userContext,
    );
    return change.override ? `Moved to ${status} (manual override, logged)` : `Moved to ${status}`;
  });
}

/** Kanban drag and drop. */
export async function moveApplicationAction(applicationId: string, status: string): Promise<ActionResult> {
  return runAction(async () => {
    await updateApplicationStatus({ applicationId, status: z.enum(appStatusValues).parse(status) }, userContext);
  });
}

export async function saveNotesAction(applicationId: string, _prev: ActionResult, formData: FormData) {
  return runAction(async () => {
    const notes = z.string().max(5000).nullable().parse(field(formData, "notes"));
    await updateApplicationNotes(applicationId, notes, userContext);
    return "Saved";
  });
}

export async function updateAnswerAction(answerId: string, _prev: ActionResult, formData: FormData) {
  return runAction(async () => {
    const answer = z.string().min(1).max(2000).parse(field(formData, "answer"));
    await updateScreeningAnswer(answerId, answer, userContext);
    return "Saved";
  });
}

export async function bulkApplicationsAction(_prev: ActionResult, formData: FormData) {
  return runAction(async () => {
    const ids = z.array(z.uuid()).min(1, "Select at least one application").max(200).parse(formData.getAll("ids"));
    const op = z.enum(["archive", "unarchive", "ghosted"]).parse(field(formData, "op"));
    if (op === "ghosted") await bulkMarkGhosted(ids, userContext);
    else await setApplicationsArchived(ids, op === "archive", userContext);
    return `${ids.length} updated`;
  });
}

export async function feedbackAction(jobId: string, verdict: string, _prev: ActionResult, formData: FormData) {
  return runAction(async () => {
    await giveFeedback(
      {
        jobId,
        verdict: z.enum(feedbackVerdictValues).parse(verdict),
        reason: z.string().max(500).nullable().parse(field(formData, "reason")),
      },
      userContext,
    );
    return "Thanks, noted";
  });
}

const optionalInt = (max: number) =>
  z.preprocess((v) => (v === null || v === "" ? null : Number(v)), z.number().int().min(0).max(max).nullable());

/** "Add application" form: an application made outside the platform. Redirects to it on success. */
export async function createManualApplicationAction(_prev: ActionResult, formData: FormData) {
  let applicationId: string | null = null;
  const result = await runAction(async () => {
    const appliedOn = z.iso.date().nullable().parse(field(formData, "applied_on"));
    const input = {
      companyName: z.string().min(1, "Company is required").max(200).parse(field(formData, "company")),
      title: z.string().min(1, "Job title is required").max(300).parse(field(formData, "title")),
      url: z.url({ protocol: /^https?$/, error: "Job URL must start with http(s)://" }).max(2048).nullable().parse(field(formData, "url")),
      locationRaw: z.string().max(300).nullable().parse(field(formData, "location")),
      remoteType: z.enum(remoteTypeValues).parse(field(formData, "remote_type") ?? "unknown"),
      source: z.enum(jobSourceValues).parse(field(formData, "source") ?? "manual"),
      expMin: optionalInt(30).parse(field(formData, "exp_min")),
      expMax: optionalInt(30).parse(field(formData, "exp_max")),
      description: z.string().max(50_000).nullable().parse(field(formData, "description")),
      status: z.enum(appStatusValues).parse(field(formData, "status")),
      channel: z.enum(appChannelValues).nullable().parse(field(formData, "channel")),
      appliedAt: appliedOn ? new Date(`${appliedOn}T12:00:00+05:30`) : null,
      nextAction: z.string().max(300).nullable().parse(field(formData, "next_action")),
      nextActionAt: istDateTime(field(formData, "next_action_at")),
      notes: z.string().max(5000).nullable().parse(field(formData, "notes")),
      tier: z.enum(tierValues).nullable().parse(field(formData, "tier")),
      fitScore: optionalInt(100).parse(field(formData, "fit_score")),
      archetype: z.enum(archetypeValues).nullable().parse(field(formData, "archetype")),
    };
    ({ applicationId } = await createManualApplication(input, userContext));
  });
  if (result?.ok && applicationId) redirect(`/applications/${applicationId}`);
  return result;
}
