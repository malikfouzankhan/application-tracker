import { z } from "zod";
import { archetypeValues, tierValues } from "@/db/enums";
import { submitAssessments } from "@/services/assessments";
import { defineTool } from "../guard";
import { generatedText, uuid } from "../schemas";

export const submitAssessmentsTool = defineTool({
  name: "submit_assessments",
  kind: "write",
  title: "Submit assessments",
  description:
    "Record your judgment for candidate jobs, all in one call. Tiers: fit (meets the bar), " +
    "justify (small experience gap that can be argued, explain how in justify_note), stretch " +
    "(bigger gap, worth a shot), skip. Archetype picks the base resume (fullstack, backend, " +
    "frontend, ai). Mark recommended: true for jobs worth preparing a pack for today. Upserts on " +
    "job_id, so resubmitting replaces the previous assessment; new jobs move to stage 'assessed'.",
  idempotent: true,
  input: z
    .object({
      items: z
        .array(
          z
            .object({
              job_id: uuid,
              fit_score: z.number().int().min(0).max(100),
              tier: z.enum(tierValues),
              archetype: z.enum(archetypeValues),
              reasons: generatedText(600),
              justify_note: generatedText(400).optional(),
              risks: generatedText(400).optional(),
              recommended: z.boolean(),
            })
            .strict(),
        )
        .min(1)
        .max(60),
    })
    .strict(),
  handler: async ({ items }, ctx) =>
    submitAssessments(
      items.map((i) => ({
        jobId: i.job_id,
        fitScore: i.fit_score,
        tier: i.tier,
        archetype: i.archetype,
        reasons: i.reasons,
        justifyNote: i.justify_note ?? null,
        risks: i.risks ?? null,
        recommended: i.recommended,
      })),
      ctx,
    ),
});
