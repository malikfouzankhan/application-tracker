CREATE TYPE "public"."actor" AS ENUM('user', 'claude', 'system');--> statement-breakpoint
CREATE TYPE "public"."answer_source" AS ENUM('claude', 'user');--> statement-breakpoint
CREATE TYPE "public"."app_channel" AS ENUM('careers_page', 'platform', 'referral', 'email');--> statement-breakpoint
CREATE TYPE "public"."app_status" AS ENUM('ready', 'applied', 'oa', 'interviewing', 'offer', 'accepted', 'declined', 'rejected', 'withdrawn', 'ghosted');--> statement-breakpoint
CREATE TYPE "public"."archetype" AS ENUM('fullstack', 'backend', 'frontend', 'ai');--> statement-breakpoint
CREATE TYPE "public"."ats" AS ENUM('greenhouse', 'lever', 'ashby', 'other');--> statement-breakpoint
CREATE TYPE "public"."claim_kind" AS ENUM('experience', 'project', 'skill', 'education', 'summary', 'achievement');--> statement-breakpoint
CREATE TYPE "public"."company_source" AS ENUM('manual', 'snowball', 'seed', 'claude');--> statement-breakpoint
CREATE TYPE "public"."feedback_verdict" AS ENUM('up', 'down');--> statement-breakpoint
CREATE TYPE "public"."job_source" AS ENUM('greenhouse', 'lever', 'ashby', 'gmail_alert', 'hn', 'feed', 'manual');--> statement-breakpoint
CREATE TYPE "public"."job_stage" AS ENUM('new', 'assessed', 'shortlisted', 'dismissed', 'archived');--> statement-breakpoint
CREATE TYPE "public"."outreach_channel" AS ENUM('linkedin', 'email', 'wellfound', 'other');--> statement-breakpoint
CREATE TYPE "public"."outreach_status" AS ENUM('drafted', 'sent', 'replied', 'no_reply');--> statement-breakpoint
CREATE TYPE "public"."remote_type" AS ENUM('onsite', 'hybrid', 'remote', 'unknown');--> statement-breakpoint
CREATE TYPE "public"."tier" AS ENUM('fit', 'justify', 'stretch', 'skip');--> statement-breakpoint
CREATE TYPE "public"."variant_status" AS ENUM('draft', 'approved');--> statement-breakpoint
CREATE TYPE "public"."watch_status" AS ENUM('active', 'low_freq', 'paused');--> statement-breakpoint
CREATE TABLE "answer_bank" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"key" text NOT NULL,
	"label" text NOT NULL,
	"value" text NOT NULL,
	"is_sensitive" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "answer_bank_key_unique" UNIQUE("key")
);
--> statement-breakpoint
ALTER TABLE "answer_bank" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "app_settings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"key" text NOT NULL,
	"value" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "app_settings_key_unique" UNIQUE("key")
);
--> statement-breakpoint
ALTER TABLE "app_settings" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "application_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"application_id" uuid NOT NULL,
	"from_status" "app_status",
	"to_status" "app_status" NOT NULL,
	"actor" "actor" NOT NULL,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "application_events" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "applications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"job_id" uuid NOT NULL,
	"resume_variant_id" uuid,
	"status" "app_status" DEFAULT 'ready' NOT NULL,
	"channel" "app_channel",
	"applied_at" timestamp with time zone,
	"next_action" text,
	"next_action_at" timestamp with time zone,
	"notes" text,
	"archived" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "applications_job_id_unique" UNIQUE("job_id")
);
--> statement-breakpoint
ALTER TABLE "applications" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "audit_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"actor" "actor" NOT NULL,
	"client_id" text,
	"tool" text,
	"target_type" text,
	"target_id" uuid,
	"diff" jsonb,
	"ok" boolean NOT NULL,
	"error_code" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "audit_log" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "base_resumes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"archetype" "archetype" NOT NULL,
	"summary" text NOT NULL,
	"claim_ids" uuid[] NOT NULL,
	"skills_order" text[] NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "base_resumes_archetype_unique" UNIQUE("archetype")
);
--> statement-breakpoint
ALTER TABLE "base_resumes" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "claims" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind" "claim_kind" NOT NULL,
	"entity" text NOT NULL,
	"text" text NOT NULL,
	"metrics" text,
	"tags" text[] DEFAULT '{}'::text[] NOT NULL,
	"start_date" date,
	"end_date" date,
	"verified" boolean DEFAULT false NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "claims" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "companies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"ats" "ats" DEFAULT 'other' NOT NULL,
	"board_token" text,
	"careers_url" text,
	"is_dream" boolean DEFAULT false NOT NULL,
	"tags" text[] DEFAULT '{}'::text[] NOT NULL,
	"watch_status" "watch_status" DEFAULT 'active' NOT NULL,
	"source" "company_source" NOT NULL,
	"last_polled_at" timestamp with time zone,
	"last_relevant_job_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "companies_slug_unique" UNIQUE("slug"),
	CONSTRAINT "companies_ats_board_token_unique" UNIQUE("ats","board_token"),
	CONSTRAINT "companies_board_token_format" CHECK ("companies"."board_token" ~ '^[a-z0-9-]{1,64}$')
);
--> statement-breakpoint
ALTER TABLE "companies" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "contacts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid,
	"name" text NOT NULL,
	"role" text,
	"public_profile_url" text,
	"source_url" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "contacts_company_name_unique" UNIQUE NULLS NOT DISTINCT("company_id","name"),
	CONSTRAINT "contacts_public_profile_url_https" CHECK ("contacts"."public_profile_url" like 'https://%'),
	CONSTRAINT "contacts_source_url_https" CHECK ("contacts"."source_url" like 'https://%')
);
--> statement-breakpoint
ALTER TABLE "contacts" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "digests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"date" date NOT NULL,
	"summary_md" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "digests_date_unique" UNIQUE("date"),
	CONSTRAINT "digests_summary_md_length" CHECK (char_length("digests"."summary_md") <= 8000)
);
--> statement-breakpoint
ALTER TABLE "digests" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "feedback" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"job_id" uuid NOT NULL,
	"verdict" "feedback_verdict" NOT NULL,
	"reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "feedback" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "ingestion_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source" text NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"finished_at" timestamp with time zone,
	"fetched" integer DEFAULT 0 NOT NULL,
	"new_jobs" integer DEFAULT 0 NOT NULL,
	"passed_prefilter" integer DEFAULT 0 NOT NULL,
	"errors" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "ingestion_runs" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "job_assessments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"job_id" uuid NOT NULL,
	"fit_score" integer NOT NULL,
	"tier" "tier" NOT NULL,
	"archetype" "archetype" NOT NULL,
	"reasons" text NOT NULL,
	"justify_note" text,
	"risks" text,
	"recommended" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "job_assessments_job_id_unique" UNIQUE("job_id"),
	CONSTRAINT "job_assessments_fit_score_range" CHECK ("job_assessments"."fit_score" between 0 and 100),
	CONSTRAINT "job_assessments_reasons_length" CHECK (char_length("job_assessments"."reasons") <= 600),
	CONSTRAINT "job_assessments_justify_note_length" CHECK (char_length("job_assessments"."justify_note") <= 400),
	CONSTRAINT "job_assessments_risks_length" CHECK (char_length("job_assessments"."risks") <= 400)
);
--> statement-breakpoint
ALTER TABLE "job_assessments" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"url" text NOT NULL,
	"url_hash" text NOT NULL,
	"company_id" uuid,
	"company_name" text NOT NULL,
	"title" text NOT NULL,
	"location_raw" text,
	"remote_type" "remote_type" DEFAULT 'unknown' NOT NULL,
	"country" text,
	"exp_min" integer,
	"exp_max" integer,
	"description_text" text DEFAULT '' NOT NULL,
	"source" "job_source" NOT NULL,
	"source_ref" text,
	"posted_at" timestamp with time zone,
	"first_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"closed_at" timestamp with time zone,
	"prefilter_passed" boolean NOT NULL,
	"prefilter_reason" text,
	"scam_flags" text[] DEFAULT '{}'::text[] NOT NULL,
	"stage" "job_stage" DEFAULT 'new' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "jobs_url_hash_unique" UNIQUE("url_hash"),
	CONSTRAINT "jobs_description_length" CHECK (char_length("jobs"."description_text") <= 20000)
);
--> statement-breakpoint
ALTER TABLE "jobs" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "mcp_clients" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client_id" text NOT NULL,
	"name" text,
	"first_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"revoked" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "mcp_clients_client_id_unique" UNIQUE("client_id")
);
--> statement-breakpoint
ALTER TABLE "mcp_clients" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "outreach" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"job_id" uuid NOT NULL,
	"contact_id" uuid,
	"channel" "outreach_channel" NOT NULL,
	"message" text NOT NULL,
	"status" "outreach_status" DEFAULT 'drafted' NOT NULL,
	"sent_at" timestamp with time zone,
	"follow_up_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "outreach_message_length" CHECK (char_length("outreach"."message") <= 1500)
);
--> statement-breakpoint
ALTER TABLE "outreach" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "preferences" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"key" text NOT NULL,
	"value" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "preferences_key_unique" UNIQUE("key")
);
--> statement-breakpoint
ALTER TABLE "preferences" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "resume_variants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"job_id" uuid NOT NULL,
	"base_resume_id" uuid NOT NULL,
	"summary" text NOT NULL,
	"claim_ids" uuid[] NOT NULL,
	"skills_order" text[] NOT NULL,
	"rephrases" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"rephrase_justifications" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"status" "variant_status" DEFAULT 'draft' NOT NULL,
	"storage_path" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "resume_variants" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "screening_answers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"application_id" uuid NOT NULL,
	"question" text NOT NULL,
	"answer" text NOT NULL,
	"source" "answer_source" NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "screening_answers" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "application_events" ADD CONSTRAINT "application_events_application_id_applications_id_fk" FOREIGN KEY ("application_id") REFERENCES "public"."applications"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "applications" ADD CONSTRAINT "applications_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "applications" ADD CONSTRAINT "applications_resume_variant_id_resume_variants_id_fk" FOREIGN KEY ("resume_variant_id") REFERENCES "public"."resume_variants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contacts" ADD CONSTRAINT "contacts_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feedback" ADD CONSTRAINT "feedback_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_assessments" ADD CONSTRAINT "job_assessments_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "outreach" ADD CONSTRAINT "outreach_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "outreach" ADD CONSTRAINT "outreach_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "resume_variants" ADD CONSTRAINT "resume_variants_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "resume_variants" ADD CONSTRAINT "resume_variants_base_resume_id_base_resumes_id_fk" FOREIGN KEY ("base_resume_id") REFERENCES "public"."base_resumes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "screening_answers" ADD CONSTRAINT "screening_answers_application_id_applications_id_fk" FOREIGN KEY ("application_id") REFERENCES "public"."applications"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "application_events_application_id_idx" ON "application_events" USING btree ("application_id","created_at");--> statement-breakpoint
CREATE INDEX "applications_status_applied_at_idx" ON "applications" USING btree ("status","applied_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "applications_updated_at_idx" ON "applications" USING btree ("updated_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "audit_log_tool_created_at_idx" ON "audit_log" USING btree ("tool","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "feedback_job_id_idx" ON "feedback" USING btree ("job_id");--> statement-breakpoint
CREATE INDEX "jobs_stage_prefilter_first_seen_idx" ON "jobs" USING btree ("stage","prefilter_passed","first_seen_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "jobs_company_id_idx" ON "jobs" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "outreach_job_id_idx" ON "outreach" USING btree ("job_id");--> statement-breakpoint
CREATE INDEX "resume_variants_job_id_idx" ON "resume_variants" USING btree ("job_id");--> statement-breakpoint
CREATE INDEX "screening_answers_application_id_idx" ON "screening_answers" USING btree ("application_id");