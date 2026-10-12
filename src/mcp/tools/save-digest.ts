import { z } from "zod";
import { saveDigest } from "@/services/digest";
import { defineTool } from "../guard";
import { generatedText, isoDate } from "../schemas";

export const saveDigestTool = defineTool({
  name: "save_digest",
  kind: "write",
  title: "Save digest",
  description:
    "Save the daily digest shown at the top of MFK's /today page, in Markdown: the shortlist " +
    "summary, follow-ups due, and one profile nudge. Use today's IST date from get_briefing. " +
    "Saving again for the same date replaces it.",
  idempotent: true,
  input: z.object({ date: isoDate, summary_md: generatedText(8000) }).strict(),
  handler: async ({ date, summary_md }, ctx) => saveDigest({ date, summaryMd: summary_md }, ctx),
});
