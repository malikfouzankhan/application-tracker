import { z } from "zod";
import { getAnswerBank } from "@/services/answers";
import { defineTool } from "../guard";

export const getAnswerBankTool = defineTool({
  name: "get_answer_bank",
  kind: "read",
  title: "Get answer bank",
  description:
    "MFK's standard answers for application forms (notice period, CTC, phone, links, ...). " +
    "Sensitive values are returned as \"[masked]\". Only set include_sensitive: true when a " +
    "specific screening question needs that exact value, and never put sensitive values in " +
    "outreach drafts unless MFK asked.",
  input: z.object({ include_sensitive: z.boolean().default(false) }).strict(),
  handler: async ({ include_sensitive }) => ({
    answers: await getAnswerBank({ includeSensitive: include_sensitive }),
  }),
});
