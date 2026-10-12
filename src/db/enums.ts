import { pgEnum } from "drizzle-orm/pg-core";

// claude.md section 5.1. Value tuples are exported for zod schemas (z.enum(atsValues)).

export const atsValues = ["greenhouse", "lever", "ashby", "other"] as const;
export const ats = pgEnum("ats", atsValues);

export const watchStatusValues = ["active", "low_freq", "paused"] as const;
export const watchStatus = pgEnum("watch_status", watchStatusValues);

export const companySourceValues = ["manual", "snowball", "seed", "claude"] as const;
export const companySource = pgEnum("company_source", companySourceValues);

export const jobSourceValues = [
  "greenhouse",
  "lever",
  "ashby",
  "gmail_alert",
  "hn",
  "feed",
  "manual",
] as const;
export const jobSource = pgEnum("job_source", jobSourceValues);

export const remoteTypeValues = ["onsite", "hybrid", "remote", "unknown"] as const;
export const remoteType = pgEnum("remote_type", remoteTypeValues);

export const jobStageValues = ["new", "assessed", "shortlisted", "dismissed", "archived"] as const;
export const jobStage = pgEnum("job_stage", jobStageValues);

export const tierValues = ["fit", "justify", "stretch", "skip"] as const;
export const tier = pgEnum("tier", tierValues);

export const archetypeValues = ["fullstack", "backend", "frontend", "ai"] as const;
export const archetype = pgEnum("archetype", archetypeValues);

export const appStatusValues = [
  "ready",
  "applied",
  "oa",
  "interviewing",
  "offer",
  "accepted",
  "declined",
  "rejected",
  "withdrawn",
  "ghosted",
] as const;
export const appStatus = pgEnum("app_status", appStatusValues);

export const appChannelValues = ["careers_page", "platform", "referral", "email"] as const;
export const appChannel = pgEnum("app_channel", appChannelValues);

export const actorValues = ["user", "claude", "system"] as const;
export const actor = pgEnum("actor", actorValues);

export const answerSourceValues = ["claude", "user"] as const;
export const answerSource = pgEnum("answer_source", answerSourceValues);

export const outreachChannelValues = ["linkedin", "email", "wellfound", "other"] as const;
export const outreachChannel = pgEnum("outreach_channel", outreachChannelValues);

export const outreachStatusValues = ["drafted", "sent", "replied", "no_reply"] as const;
export const outreachStatus = pgEnum("outreach_status", outreachStatusValues);

export const claimKindValues = [
  "experience",
  "project",
  "skill",
  "education",
  "summary",
  "achievement",
] as const;
export const claimKind = pgEnum("claim_kind", claimKindValues);

export const variantStatusValues = ["draft", "approved"] as const;
export const variantStatus = pgEnum("variant_status", variantStatusValues);

export const feedbackVerdictValues = ["up", "down"] as const;
export const feedbackVerdict = pgEnum("feedback_verdict", feedbackVerdictValues);
