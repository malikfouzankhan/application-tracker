import { z } from "zod";
import { saveApplicationPack } from "@/services/applications";
import { defineTool } from "../guard";
import { generatedText, uuid } from "../schemas";

export const saveApplicationPackTool = defineTool({
  name: "save_application_pack",
  kind: "write",
  title: "Save application pack",
  description:
    "Save everything MFK needs to apply to one job: the resume variant, answers to the job's " +
    "screening questions, and an optional cover note. Creates the application with status " +
    "'ready' and shortlists the job, so it shows on MFK's /today page. Saving again while the " +
    "application is still 'ready' replaces the previous answers and cover note; after MFK " +
    "applies, the pack is frozen (CONFLICT). Use answer-bank values for factual questions.",
  idempotent: true,
  input: z
    .object({
      job_id: uuid,
      resume_variant_id: uuid,
      answers: z
        .array(z.object({ question: z.string().trim().min(1).max(500), answer: generatedText(2000) }).strict())
        .max(20),
      cover_note: generatedText(2500).optional(),
    })
    .strict(),
  handler: async (input, ctx) =>
    saveApplicationPack(
      {
        jobId: input.job_id,
        resumeVariantId: input.resume_variant_id,
        answers: input.answers,
        coverNote: input.cover_note ?? null,
      },
      ctx,
    ),
});
