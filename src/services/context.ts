import type { Actor } from "@/lib/state-machine";
import { AppError } from "@/lib/errors";

/**
 * Who is calling a service. Pages and server actions pass actor "user", MCP tools pass
 * "claude" with the OAuth client id and tool name, ingestion passes "system".
 */
export type ServiceContext = {
  actor: Actor;
  /** OAuth client id for MCP calls. */
  clientId?: string | null;
  /** MCP tool name. Used as audit_log.tool so rate limits count per tool. */
  tool?: string | null;
};

export const userContext: ServiceContext = { actor: "user" };
export const systemContext: ServiceContext = { actor: "system" };

/** Dashboard-only actions (claude.md section 7.4). Defense in depth behind the MCP tool list. */
export function requireUser(ctx: ServiceContext): void {
  if (ctx.actor !== "user") {
    throw new AppError("FORBIDDEN", "This action is only available from the dashboard");
  }
}
