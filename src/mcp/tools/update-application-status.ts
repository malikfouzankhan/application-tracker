import { z } from "zod";
import { appStatusValues } from "@/db/enums";
import { updateApplicationStatus } from "@/services/applications";
import { defineTool } from "../guard";
import { generatedText, isoDateTime, uuid } from "../schemas";

export const updateApplicationStatusTool = defineTool({
  name: "update_application_status",
  kind: "write",
  title: "Update application status",
  description:
    "Move one application to a new status, e.g. after reading a rejection or interview email. " +
    "Allowed transitions: ready -> applied | withdrawn; applied -> oa | interviewing | rejected | " +
    "ghosted | withdrawn; oa -> interviewing | rejected | ghosted | withdrawn; interviewing -> " +
    "offer | rejected | ghosted | withdrawn; offer -> accepted | declined; ghosted -> oa | " +
    "interviewing | rejected. rejected, withdrawn, accepted and declined are final. Anything else " +
    "fails with INVALID_TRANSITION. Optionally set the next action and when it is due.",
  input: z
    .object({
      application_id: uuid,
      status: z.enum(appStatusValues),
      note: generatedText(500).optional(),
      next_action: generatedText(300).optional(),
      next_action_at: isoDateTime.optional(),
    })
    .strict(),
  handler: async (input, ctx) =>
    updateApplicationStatus(
      {
        applicationId: input.application_id,
        status: input.status,
        note: input.note,
        nextAction: input.next_action,
        nextActionAt: input.next_action_at,
      },
      ctx,
    ),
});
