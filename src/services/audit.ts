import "server-only";
import { and, count, eq, gt, isNull, sql } from "drizzle-orm";
import { type DbOrTx, db } from "@/db/client";
import { auditLog } from "@/db/schema";
import { AppError } from "@/lib/errors";
import { RATE_LIMIT_WINDOW_SECONDS, RATE_LIMITS, type ToolKind, isOverRateLimit } from "@/lib/rate-limit";
import type { ServiceContext } from "./context";

export type AuditEntry = {
  /** Service action, e.g. "applications.updateStatus". ctx.tool (MCP tool name) takes precedence. */
  action: string;
  targetType?: string | null;
  targetId?: string | null;
  /** Field names and non-sensitive values only. NEVER PII. */
  diff?: Record<string, unknown> | null;
  ok?: boolean;
  errorCode?: string | null;
};

/**
 * One audit row per service call. Mutating services call this inside their transaction,
 * so the row only exists if the change committed.
 */
export async function recordAudit(
  dbOrTx: DbOrTx,
  ctx: ServiceContext,
  entry: AuditEntry,
): Promise<void> {
  await dbOrTx.insert(auditLog).values({
    actor: ctx.actor,
    clientId: ctx.clientId ?? null,
    tool: ctx.tool ?? entry.action,
    targetType: entry.targetType ?? null,
    targetId: entry.targetId ?? null,
    diff: entry.diff ?? null,
    ok: entry.ok ?? true,
    errorCode: entry.errorCode ?? null,
  });
}

/** Audit row outside any transaction: read tools and failed calls (MCP guard). */
export async function recordCallAudit(ctx: ServiceContext, entry: AuditEntry): Promise<void> {
  await recordAudit(db, ctx, entry);
}

/** Calls of `tool` by `clientId` in the rate-limit window, counted from audit_log. */
export async function countRecentCalls(tool: string, clientId: string | null): Promise<number> {
  const [row] = await db
    .select({ n: count() })
    .from(auditLog)
    .where(
      and(
        eq(auditLog.tool, tool),
        clientId === null ? isNull(auditLog.clientId) : eq(auditLog.clientId, clientId),
        gt(auditLog.createdAt, sql`now() - make_interval(secs => ${RATE_LIMIT_WINDOW_SECONDS})`),
      ),
    );
  return row?.n ?? 0;
}

/** Throws RATE_LIMITED when the client has used up this tool's budget for the window. */
export async function assertWithinRateLimit(
  tool: string,
  clientId: string | null,
  kind: ToolKind,
): Promise<void> {
  const calls = await countRecentCalls(tool, clientId);
  if (isOverRateLimit(calls, kind)) {
    throw new AppError(
      "RATE_LIMITED",
      `Rate limit reached for ${tool}: ${RATE_LIMITS[kind]} calls per ${RATE_LIMIT_WINDOW_SECONDS}s`,
    );
  }
}
