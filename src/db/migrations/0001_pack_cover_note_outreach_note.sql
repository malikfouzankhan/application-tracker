ALTER TABLE "applications" ADD COLUMN "cover_note" text;--> statement-breakpoint
ALTER TABLE "outreach" ADD COLUMN "note" text;--> statement-breakpoint
CREATE INDEX "audit_log_tool_client_created_at_idx" ON "audit_log" USING btree ("tool","client_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "outreach_status_follow_up_idx" ON "outreach" USING btree ("status","follow_up_at");--> statement-breakpoint
ALTER TABLE "applications" ADD CONSTRAINT "applications_cover_note_length" CHECK (char_length("applications"."cover_note") <= 2500);--> statement-breakpoint
ALTER TABLE "outreach" ADD CONSTRAINT "outreach_note_length" CHECK (char_length("outreach"."note") <= 500);