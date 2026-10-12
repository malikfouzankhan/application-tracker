import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  date,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";
import {
  actor,
  answerSource,
  appChannel,
  appStatus,
  archetype,
  ats,
  claimKind,
  companySource,
  feedbackVerdict,
  jobSource,
  jobStage,
  outreachChannel,
  outreachStatus,
  remoteType,
  tier,
  variantStatus,
  watchStatus,
} from "./enums";

// drizzle-kit only creates enum types that are exported from the schema file.
export * from "./enums";

// claude.md section 5. Every table has RLS enabled with NO policies, so Supabase's
// Data API returns nothing. The app connects as the owner role, which bypasses RLS.

const id = () => uuid("id").primaryKey().defaultRandom();

const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
};

const tz = (name: string) => timestamp(name, { withTimezone: true });
const textArray = (name: string) =>
  text(name)
    .array()
    .notNull()
    .default(sql`'{}'::text[]`);

// ---------------------------------------------------------------- Discovery (5.2)

export const companies = pgTable(
  "companies",
  {
    id: id(),
    name: text("name").notNull(),
    slug: text("slug").notNull().unique(),
    ats: ats("ats").notNull().default("other"),
    boardToken: text("board_token"),
    careersUrl: text("careers_url"),
    isDream: boolean("is_dream").notNull().default(false),
    tags: textArray("tags"),
    watchStatus: watchStatus("watch_status").notNull().default("active"),
    source: companySource("source").notNull(),
    lastPolledAt: tz("last_polled_at"),
    lastRelevantJobAt: tz("last_relevant_job_at"),
    ...timestamps,
  },
  (t) => [
    unique("companies_ats_board_token_unique").on(t.ats, t.boardToken),
    check("companies_board_token_format", sql`${t.boardToken} ~ '^[a-z0-9-]{1,64}$'`),
  ],
).enableRLS();

export const jobs = pgTable(
  "jobs",
  {
    id: id(),
    url: text("url").notNull(),
    urlHash: text("url_hash").notNull().unique(),
    companyId: uuid("company_id").references(() => companies.id),
    companyName: text("company_name").notNull(),
    title: text("title").notNull(),
    locationRaw: text("location_raw"),
    remoteType: remoteType("remote_type").notNull().default("unknown"),
    country: text("country"),
    expMin: integer("exp_min"),
    expMax: integer("exp_max"),
    descriptionText: text("description_text").notNull().default(""),
    source: jobSource("source").notNull(),
    sourceRef: text("source_ref"),
    postedAt: tz("posted_at"),
    firstSeenAt: tz("first_seen_at").notNull().defaultNow(),
    closedAt: tz("closed_at"),
    prefilterPassed: boolean("prefilter_passed").notNull(),
    prefilterReason: text("prefilter_reason"),
    scamFlags: textArray("scam_flags"),
    stage: jobStage("stage").notNull().default("new"),
    ...timestamps,
  },
  (t) => [
    index("jobs_stage_prefilter_first_seen_idx").on(
      t.stage,
      t.prefilterPassed,
      t.firstSeenAt.desc(),
    ),
    index("jobs_company_id_idx").on(t.companyId),
    check("jobs_description_length", sql`char_length(${t.descriptionText}) <= 20000`),
  ],
).enableRLS();

export const jobAssessments = pgTable(
  "job_assessments",
  {
    id: id(),
    jobId: uuid("job_id")
      .notNull()
      .unique()
      .references(() => jobs.id),
    fitScore: integer("fit_score").notNull(),
    tier: tier("tier").notNull(),
    archetype: archetype("archetype").notNull(),
    reasons: text("reasons").notNull(),
    justifyNote: text("justify_note"),
    risks: text("risks"),
    recommended: boolean("recommended").notNull().default(false),
    ...timestamps,
  },
  (t) => [
    check("job_assessments_fit_score_range", sql`${t.fitScore} between 0 and 100`),
    check("job_assessments_reasons_length", sql`char_length(${t.reasons}) <= 600`),
    check("job_assessments_justify_note_length", sql`char_length(${t.justifyNote}) <= 400`),
    check("job_assessments_risks_length", sql`char_length(${t.risks}) <= 400`),
  ],
).enableRLS();

export const feedback = pgTable(
  "feedback",
  {
    id: id(),
    jobId: uuid("job_id")
      .notNull()
      .references(() => jobs.id),
    verdict: feedbackVerdict("verdict").notNull(),
    reason: text("reason"),
    ...timestamps,
  },
  (t) => [index("feedback_job_id_idx").on(t.jobId)],
).enableRLS();

// ---------------------------------------------------------------- Pipeline (5.3)

export const applications = pgTable(
  "applications",
  {
    id: id(),
    jobId: uuid("job_id")
      .notNull()
      .unique()
      .references(() => jobs.id),
    resumeVariantId: uuid("resume_variant_id").references(() => resumeVariants.id),
    status: appStatus("status").notNull().default("ready"),
    channel: appChannel("channel"),
    appliedAt: tz("applied_at"),
    nextAction: text("next_action"),
    nextActionAt: tz("next_action_at"),
    notes: text("notes"),
    coverNote: text("cover_note"), // from save_application_pack
    archived: boolean("archived").notNull().default(false),
    ...timestamps,
  },
  (t) => [
    index("applications_status_applied_at_idx").on(t.status, t.appliedAt.desc()),
    index("applications_updated_at_idx").on(t.updatedAt.desc()),
    check("applications_cover_note_length", sql`char_length(${t.coverNote}) <= 2500`),
  ],
).enableRLS();

export const applicationEvents = pgTable(
  "application_events",
  {
    id: id(),
    applicationId: uuid("application_id")
      .notNull()
      .references(() => applications.id),
    fromStatus: appStatus("from_status"),
    toStatus: appStatus("to_status").notNull(),
    actor: actor("actor").notNull(),
    note: text("note"),
    ...timestamps,
  },
  (t) => [index("application_events_application_id_idx").on(t.applicationId, t.createdAt)],
).enableRLS();

export const screeningAnswers = pgTable(
  "screening_answers",
  {
    id: id(),
    applicationId: uuid("application_id")
      .notNull()
      .references(() => applications.id),
    question: text("question").notNull(),
    answer: text("answer").notNull(),
    source: answerSource("source").notNull(),
    sortOrder: integer("sort_order").notNull().default(0),
    ...timestamps,
  },
  (t) => [index("screening_answers_application_id_idx").on(t.applicationId)],
).enableRLS();

// Professional public info ONLY.
export const contacts = pgTable(
  "contacts",
  {
    id: id(),
    companyId: uuid("company_id").references(() => companies.id),
    name: text("name").notNull(),
    role: text("role"),
    publicProfileUrl: text("public_profile_url"),
    sourceUrl: text("source_url"),
    ...timestamps,
  },
  (t) => [
    // create_outreach reuses a contact by (company, name); a null company counts as one bucket.
    unique("contacts_company_name_unique").on(t.companyId, t.name).nullsNotDistinct(),
    check("contacts_public_profile_url_https", sql`${t.publicProfileUrl} like 'https://%'`),
    check("contacts_source_url_https", sql`${t.sourceUrl} like 'https://%'`),
  ],
).enableRLS();

export const outreach = pgTable(
  "outreach",
  {
    id: id(),
    jobId: uuid("job_id")
      .notNull()
      .references(() => jobs.id),
    contactId: uuid("contact_id").references(() => contacts.id),
    channel: outreachChannel("channel").notNull(),
    message: text("message").notNull(),
    status: outreachStatus("status").notNull().default("drafted"),
    sentAt: tz("sent_at"),
    followUpAt: tz("follow_up_at"),
    note: text("note"), // from update_outreach_status
    ...timestamps,
  },
  (t) => [
    index("outreach_job_id_idx").on(t.jobId),
    index("outreach_status_follow_up_idx").on(t.status, t.followUpAt),
    check("outreach_message_length", sql`char_length(${t.message}) <= 1500`),
    check("outreach_note_length", sql`char_length(${t.note}) <= 500`),
  ],
).enableRLS();

// ---------------------------------------------------------------- Resume and profile (5.4)

// Verified fact library. MFK approves each one.
export const claims = pgTable("claims", {
  id: id(),
  kind: claimKind("kind").notNull(),
  entity: text("entity").notNull(), // company, school, project or skill category
  role: text("role"), // job title or degree, e.g. "Software Engineer (Contract)"
  context: text("context"), // sub-project, tech stack or place, e.g. "CheckLife CRM"
  dateLabel: text("date_label"), // as printed, e.g. "08/2026 - Present"
  text: text("text").notNull(),
  metrics: text("metrics"),
  tags: textArray("tags"),
  startDate: date("start_date"),
  endDate: date("end_date"),
  verified: boolean("verified").notNull().default(false),
  active: boolean("active").notNull().default(true),
  sortOrder: integer("sort_order").notNull().default(0),
  ...timestamps,
}).enableRLS();

// One per archetype.
export const baseResumes = pgTable("base_resumes", {
  id: id(),
  archetype: archetype("archetype").notNull().unique(),
  summary: text("summary").notNull(),
  claimIds: uuid("claim_ids").array().notNull(), // ordered
  skillsOrder: text("skills_order").array().notNull(),
  ...timestamps,
}).enableRLS();

// Per-job tailoring. Every claim id must be verified + active (enforced in services).
export const resumeVariants = pgTable(
  "resume_variants",
  {
    id: id(),
    jobId: uuid("job_id")
      .notNull()
      .references(() => jobs.id),
    baseResumeId: uuid("base_resume_id")
      .notNull()
      .references(() => baseResumes.id),
    summary: text("summary").notNull(),
    claimIds: uuid("claim_ids").array().notNull(), // ordered
    skillsOrder: text("skills_order").array().notNull(),
    rephrases: jsonb("rephrases")
      .$type<Record<string, string>>()
      .notNull()
      .default(sql`'{}'::jsonb`),
    rephraseJustifications: jsonb("rephrase_justifications")
      .$type<Record<string, string>>()
      .notNull()
      .default(sql`'{}'::jsonb`),
    status: variantStatus("status").notNull().default("draft"),
    storagePath: text("storage_path"),
    ...timestamps,
  },
  (t) => [index("resume_variants_job_id_idx").on(t.jobId)],
).enableRLS();

export const answerBank = pgTable("answer_bank", {
  id: id(),
  key: text("key").notNull().unique(),
  label: text("label").notNull(),
  value: text("value").notNull(),
  isSensitive: boolean("is_sensitive").notNull().default(false),
  ...timestamps,
}).enableRLS();

export const preferences = pgTable("preferences", {
  id: id(),
  key: text("key").notNull().unique(),
  value: jsonb("value").notNull(),
  ...timestamps,
}).enableRLS();

// ---------------------------------------------------------------- Ops (5.5)

export const ingestionRuns = pgTable("ingestion_runs", {
  id: id(),
  source: text("source").notNull(),
  startedAt: tz("started_at").notNull(),
  finishedAt: tz("finished_at"),
  fetched: integer("fetched").notNull().default(0),
  newJobs: integer("new_jobs").notNull().default(0),
  passedPrefilter: integer("passed_prefilter").notNull().default(0),
  errors: jsonb("errors")
    .notNull()
    .default(sql`'[]'::jsonb`),
  ...timestamps,
}).enableRLS();

export const digests = pgTable(
  "digests",
  {
    id: id(),
    date: date("date").notNull().unique(),
    summaryMd: text("summary_md").notNull(),
    ...timestamps,
  },
  (t) => [check("digests_summary_md_length", sql`char_length(${t.summaryMd}) <= 8000`)],
).enableRLS();

export const auditLog = pgTable(
  "audit_log",
  {
    id: id(),
    actor: actor("actor").notNull(),
    clientId: text("client_id"), // OAuth client id for MCP calls
    tool: text("tool"), // MCP tool name or service action
    targetType: text("target_type"),
    targetId: uuid("target_id"),
    diff: jsonb("diff"), // field names + non-sensitive values only. NEVER PII.
    ok: boolean("ok").notNull(),
    errorCode: text("error_code"),
    ...timestamps,
  },
  (t) => [
    index("audit_log_tool_created_at_idx").on(t.tool, t.createdAt.desc()),
    // Rate limiting counts rows per (tool, client) in the last minute.
    index("audit_log_tool_client_created_at_idx").on(t.tool, t.clientId, t.createdAt.desc()),
  ],
).enableRLS();

export const mcpClients = pgTable("mcp_clients", {
  id: id(),
  clientId: text("client_id").notNull().unique(), // CIMD: a URL; DCR: opaque id
  name: text("name"),
  firstSeenAt: tz("first_seen_at").notNull().defaultNow(),
  lastSeenAt: tz("last_seen_at").notNull().defaultNow(),
  revoked: boolean("revoked").notNull().default(false),
  ...timestamps,
}).enableRLS();

// Single-row toggles, e.g. 'mcp_enabled'.
export const appSettings = pgTable("app_settings", {
  id: id(),
  key: text("key").notNull().unique(),
  value: jsonb("value").notNull(),
  ...timestamps,
}).enableRLS();
