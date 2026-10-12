import { z } from "zod";
import { getBriefing } from "@/services/digest";
import { defineTool } from "../guard";

export const getBriefingTool = defineTool({
  name: "get_briefing",
  kind: "read",
  title: "Get daily briefing",
  description:
    "Call this first in the daily routine. Returns today's date in IST, MFK's search preferences " +
    "(roles, locations, experience bands, exclusions, keywords), a 30-day feedback summary " +
    "(thumbs up/down counts and recent reasons, use these to calibrate scoring), pipeline counts " +
    "by application status, follow-ups that are due (applications and sent outreach), and " +
    "yesterday's digest.",
  input: z.object({}).strict(),
  handler: async () => getBriefing(),
});
