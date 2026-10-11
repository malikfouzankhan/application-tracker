import { z } from "zod";
import { archetypeValues } from "@/db/enums";
import { signedResumeUrl } from "@/lib/resume-link";
import { createResumeVariant } from "@/services/resume";
import { defineTool } from "../guard";
import { generatedText, uuid } from "../schemas";

export const createResumeVariantTool = defineTool({
  name: "create_resume_variant",
  kind: "write",
  title: "Create resume variant",
  description:
    "Tailor a resume for one job from MFK's verified claims (get_resume_library). Rules, enforced " +
    "in code: only verified, active claim ids may be used (otherwise INVALID_CLAIM). You may " +
    "rephrase a claim for relevance (emphasis, keywords, wording, order), but a rephrase must not " +
    "add facts that are not in the claim's text or metrics: no new technologies, numbers, titles, " +
    "dates, scope, team sizes or outcomes. Every rephrase needs a one-line justification pointing " +
    "to what in the original claim supports it, and its claim must be in claim_ids. The summary " +
    "may only combine facts from the included claims. The variant is a draft until MFK approves " +
    "it. Returns the variant id and a signed PDF link valid for 24 hours.",
  input: z
    .object({
      job_id: uuid,
      archetype: z.enum(archetypeValues),
      summary: generatedText(600),
      claim_ids: z.array(uuid).min(1).max(30).describe("Ordered as they should appear"),
      skills_order: z.array(z.string().trim().min(1).max(60)).max(40),
      rephrases: z.record(uuid, generatedText(300)).optional(),
      rephrase_justifications: z.record(uuid, generatedText(300)).optional(),
    })
    .strict(),
  handler: async (input, ctx) => {
    const { variantId } = await createResumeVariant(
      {
        jobId: input.job_id,
        archetype: input.archetype,
        summary: input.summary,
        claimIds: input.claim_ids,
        skillsOrder: input.skills_order,
        rephrases: input.rephrases,
        rephraseJustifications: input.rephrase_justifications,
      },
      ctx,
    );
    const link = signedResumeUrl(variantId);
    return { variantId, status: "draft", pdfUrl: link.url, pdfUrlExpiresAt: link.expiresAt };
  },
});
