import { z } from "zod";
import { getStats } from "@/services/stats";
import { defineTool } from "../guard";

export const getStatsTool = defineTool({
  name: "get_stats",
  kind: "read",
  title: "Get stats",
  description:
    "Funnel counts (assessed, ready, applied, responded, interviewed, offers), response rates by " +
    "tier, archetype, source and channel, and outreach reply rate. Use on Sundays for the weekly " +
    "review digest and to suggest preference changes.",
  input: z.object({ range: z.enum(["7d", "30d", "all"]) }).strict(),
  handler: async ({ range }) => getStats(range),
});
