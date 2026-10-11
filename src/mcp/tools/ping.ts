import { z } from "zod";
import { defineTool } from "../guard";

export const ping = defineTool({
  name: "ping",
  kind: "read",
  title: "Ping",
  description: "Health check. Returns ok and the current server time. Use to confirm the connector works.",
  input: z.object({}).strict(),
  handler: async () => ({ ok: true, now: new Date() }),
});
