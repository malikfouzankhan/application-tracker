import { z } from "zod";
import { getBriefing } from "@/services/digest";
import { defineTool } from "../guard";

export const getBriefingTool = defineTool({
  name: "get_briefing",
  kind: "read",
  title: "Get daily briefing",
  description:
    "Call this first in the daily routine. Returns today's date in IST, when job ingestion last " +
    "finished and how many new jobs the last 24 hours brought (if the last run is older than about " +
    "20 hours, today's jobs are not in yet: say so at the top of the digest), MFK's search preferences " +
    "(roles, locations, experience bands, exclusions, keywords), a 30-day feedback summary " +
    "(thumbs up/down counts and recent reasons, use these to calibrate scoring), pipeline counts " +
    "by application status, follow-ups that are due (applications and sent outreach), and " +
    "yesterday's digest.",
  input: z.object({}).strict(),
  handler: async () => getBriefing(),
});
