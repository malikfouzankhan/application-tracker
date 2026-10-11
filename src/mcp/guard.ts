import "server-only";
import type {
  CallToolResult,
  ServerContext,
  StandardSchemaWithJSON,
  ToolAnnotations,
} from "@modelcontextprotocol/server";
import type { z } from "zod";
import { env } from "@/lib/env";
import { AppError, isAppError } from "@/lib/errors";
import type { ToolKind } from "@/lib/rate-limit";
import { assertWithinRateLimit, recordCallAudit } from "@/services/audit";
import type { ServiceContext } from "@/services/context";
import { isMcpEnabled, touchMcpClient } from "@/services/mcp-clients";
import { toolError, toolResult } from "./format";

export type McpTool = {
  name: string;
  kind: ToolKind;
  title: string;
  description: string;
  annotations: ToolAnnotations;
  /** What tools/list advertises. Validation itself happens in the guard (step 6). */
  listingSchema: StandardSchemaWithJSON<Record<string, unknown>>;
  parse: (args: unknown) => { success: true; data: unknown } | { success: false; error: z.ZodError };
  execute: (input: unknown, ctx: ServiceContext) => Promise<unknown>;
};

/**
 * Advertises the zod schema's JSON Schema but accepts any arguments, so invalid input still
 * goes through the kill switch, owner check, rate limit and audit log, and is rejected with
 * our INVALID_INPUT code instead of the SDK's generic error.
 */
function listingSchema(schema: z.ZodType): StandardSchemaWithJSON<Record<string, unknown>> {
  return {
    "~standard": {
      version: 1,
      vendor: "jobs-fouzan",
      validate: (value: unknown) => ({ value: (value ?? {}) as Record<string, unknown> }),
      jsonSchema: schema["~standard"].jsonSchema,
    },
  };
}

export function defineTool<S extends z.ZodObject>(def: {
  name: string;
  kind: ToolKind;
  title: string;
  description: string;
  input: S;
  /** Idempotent writes (upserts) are marked so clients may retry them. */
  idempotent?: boolean;
  handler: (input: z.output<S>, ctx: ServiceContext) => Promise<unknown>;
}): McpTool {
  return {
    name: def.name,
    kind: def.kind,
    title: def.title,
    description: def.description,
    annotations: {
      title: def.title,
      readOnlyHint: def.kind === "read",
      destructiveHint: false,
      idempotentHint: def.kind === "read" || Boolean(def.idempotent),
      openWorldHint: false,
    },
    listingSchema: listingSchema(def.input),
    parse: (args) => def.input.safeParse(args ?? {}),
    execute: (input, ctx) => def.handler(input as z.output<S>, ctx),
  };
}

function describeIssues(error: z.ZodError): string {
  // Paths and messages only; never echo input values.
  return error.issues
    .slice(0, 5)
    .map((issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`)
    .join("; ");
}

type PgLikeError = { code?: unknown; name?: unknown; cause?: unknown };

/** postgres-js errors may be wrapped (DrizzleQueryError.cause). Messages can contain values, so only codes are used. */
function findPgCode(error: unknown): string | null {
  let current: unknown = error;
  for (let depth = 0; current && depth < 5; depth++) {
    const e = current as PgLikeError;
    if (e.name === "PostgresError" && typeof e.code === "string") return e.code;
    current = e.cause;
  }
  return null;
}

function toAppError(error: unknown, toolName: string): AppError {
  if (isAppError(error)) return error;
  const pgCode = findPgCode(error);
  if (pgCode === "23505") return new AppError("CONFLICT", "A record with these values already exists");
  if (pgCode === "23503") return new AppError("INVALID_INPUT", "A referenced record does not exist");
  if (pgCode && ["23514", "23502", "22001", "22P02", "22007", "22008"].includes(pgCode)) {
    return new AppError("INVALID_INPUT", "A value is out of range or has the wrong format");
  }
  // Log the error kind only: query errors embed parameter values.
  const name = error instanceof Error ? error.name : typeof error;
  console.error(`[mcp] ${toolName} failed: ${name}${pgCode ? ` (pg ${pgCode})` : ""}`);
  return new AppError("INTERNAL", "Internal error");
}

/** The guard pipeline (claude.md section 7.2), applied to every tool call. */
export async function runTool(tool: McpTool, args: unknown, mcpCtx: ServerContext): Promise<CallToolResult> {
  const authInfo = mcpCtx.http?.authInfo;
  const clientId = authInfo?.clientId ?? null;
  const ctx: ServiceContext = { actor: "claude", clientId, tool: tool.name };

  try {
    // 1. Kill switch.
    if (!(await isMcpEnabled())) throw new AppError("MCP_DISABLED", "The MCP connector is disabled in Settings");
    // 2. Token signature, issuer, audience and expiry were verified by withMcpAuth.
    // 3. Owner only (also enforced in the route, kept here as defense in depth).
    if (!authInfo || authInfo.extra?.userId !== env.OWNER_CLERK_USER_ID || !clientId) {
      throw new AppError("FORBIDDEN", "Not allowed");
    }
    // 4. Known, non-revoked client.
    if ((await touchMcpClient(clientId)).revoked) throw new AppError("FORBIDDEN", "This client has been revoked");
    // 5. Rate limit per tool per client.
    await assertWithinRateLimit(tool.name, clientId, tool.kind);
    // 6. Strict input validation.
    const parsed = tool.parse(args);
    if (!parsed.success) throw new AppError("INVALID_INPUT", describeIssues(parsed.error));
    // 7. Service call. Write services record their own audit row in their transaction.
    const result = await tool.execute(parsed.data, ctx);
    // 8. Audit row for reads.
    if (tool.kind === "read") await recordCallAudit(ctx, { action: tool.name });
    // 9. Formatted output.
    return toolResult(result);
  } catch (error) {
    const appError = toAppError(error, tool.name);
    await recordCallAudit(ctx, { action: tool.name, ok: false, errorCode: appError.code }).catch(() => {
      console.error(`[mcp] ${tool.name}: failed to write audit row`);
    });
    return toolError(appError.code, appError.message);
  }
}
