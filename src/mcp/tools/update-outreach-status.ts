import { z } from "zod";
import { updateOutreachStatus } from "@/services/outreach";
import { defineTool } from "../guard";
import { generatedText, uuid } from "../schemas";

export const updateOutreachStatusTool = defineTool({
  name: "update_outreach_status",
  kind: "write",
  title: "Update outreach status",
  description:
    "Record what happened to an outreach message: drafted -> sent -> replied or no_reply " +
    "(no_reply -> replied if a late reply arrives). Marking sent starts the follow-up clock.",
  input: z
    .object({
      outreach_id: uuid,
      status: z.enum(["sent", "replied", "no_reply"]),
      note: generatedText(500).optional(),
    })
    .strict(),
  handler: async (input, ctx) =>
    updateOutreachStatus({ outreachId: input.outreach_id, status: input.status, note: input.note }, ctx),
});
