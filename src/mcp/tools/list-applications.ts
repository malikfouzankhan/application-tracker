import { z } from "zod";
import { appStatusValues } from "@/db/enums";
import { listApplications } from "@/services/applications";
import { defineTool } from "../guard";
import { sinceDate } from "../schemas";

export const listApplicationsTool = defineTool({
  name: "list_applications",
  kind: "read",
  title: "List applications",
  description:
    "Applications (not archived), most recently updated first, with company, title, location, " +
    "status, dates, tier, fit score and next action. Filter by status and/or updated since a date.",
  input: z
    .object({
      status: z.array(z.enum(appStatusValues)).min(1).max(10).optional(),
      since: sinceDate.optional().describe("Only applications updated at or after this date/time"),
      limit: z.number().int().min(1).max(50).default(25),
    })
    .strict(),
  handler: async ({ status, since, limit }) => {
    const rows = await listApplications({ status, since, limit });
    return {
      count: rows.length,
      applications: rows.map(({ id, ...rest }) => ({ applicationId: id, ...rest })),
    };
  },
});
