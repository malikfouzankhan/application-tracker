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
    "Record your judgment for candidate jobs, all in one call. Use MFK's definitions strictly " +
    "(experience bands are in get_briefing preferences.exp_bands): " +
    "fit = a software role within MFK's skill set, and the experience asked matches " +
    "MFK's (up to fit_max years). " +
    "justify = a software role within the skill set, but the experience asked is not exactly " +
    "MFK's (up to justify_max years); say how to argue the gap in justify_note. " +
    "stretch = a software role that partially matches the skill set, and the experience asked " +
    "is a little more than MFK's, about 2 years more (up to stretch_max years). " +
    "skip = everything else: non-software or other engineering fields, stacks MFK does not " +
    "use, or far more experience. Skipped jobs are hidden from MFK entirely, so use skip " +
    "rather than a low score for irrelevant jobs. Archetype picks the base resume (fullstack, " +
    "backend, frontend, ai). Mark recommended: true for jobs worth preparing a pack for today. " +
    "Upserts on job_id; new jobs move to stage 'assessed'.",
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
