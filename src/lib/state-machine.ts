import type { actorValues, appStatusValues, jobStageValues } from "@/db/enums";

export type AppStatus = (typeof appStatusValues)[number];
export type JobStage = (typeof jobStageValues)[number];
export type Actor = (typeof actorValues)[number];

// claude.md section 5.6. Terminal statuses map to [].
export const APP_TRANSITIONS: Record<AppStatus, readonly AppStatus[]> = {
  ready: ["applied", "withdrawn"],
  applied: ["oa", "interviewing", "rejected", "ghosted", "withdrawn"],
  oa: ["interviewing", "rejected", "ghosted", "withdrawn"],
  interviewing: ["offer", "rejected", "ghosted", "withdrawn"],
  offer: ["accepted", "declined"],
  ghosted: ["oa", "interviewing", "rejected"],
  rejected: [],
  withdrawn: [],
  accepted: [],
  declined: [],
};

export const MANUAL_OVERRIDE_NOTE = "manual override";

export function isValidAppTransition(from: AppStatus, to: AppStatus): boolean {
  return APP_TRANSITIONS[from].includes(to);
}

export function isTerminalAppStatus(status: AppStatus): boolean {
  return APP_TRANSITIONS[status].length === 0;
}

export type TransitionDecision =
  | { allowed: true; override: boolean }
  | { allowed: false; reason: string };

/**
 * Claude and the system must follow the table exactly. The user (dashboard) may force any
 * change, which is flagged as an override and logged with MANUAL_OVERRIDE_NOTE.
 * A transition to the same status is never allowed.
 */
export function decideAppTransition(from: AppStatus, to: AppStatus, actor: Actor): TransitionDecision {
  if (from === to) return { allowed: false, reason: `Application is already ${to}` };
  if (isValidAppTransition(from, to)) return { allowed: true, override: false };
  if (actor === "user") return { allowed: true, override: true };

  const allowed = APP_TRANSITIONS[from];
  return {
    allowed: false,
    reason: allowed.length
      ? `Cannot move from ${from} to ${to}. Allowed: ${allowed.join(", ")}`
      : `${from} is terminal`,
  };
}

// Job stage: new -> assessed -> shortlisted | dismissed, any -> archived.
const JOB_STAGE_TRANSITIONS: Record<JobStage, readonly JobStage[]> = {
  new: ["assessed", "shortlisted", "dismissed", "archived"],
  assessed: ["shortlisted", "dismissed", "archived"],
  shortlisted: ["dismissed", "archived"],
  dismissed: ["archived"],
  archived: [],
};

export function isValidJobStageTransition(from: JobStage, to: JobStage): boolean {
  return JOB_STAGE_TRANSITIONS[from].includes(to);
}
