import "server-only";
import { desc, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { appSettings, mcpClients } from "@/db/schema";
import { AppError } from "@/lib/errors";
import { recordAudit } from "./audit";
import { type ServiceContext, requireUser } from "./context";

const MCP_ENABLED_KEY = "mcp_enabled";

/** Kill switch. A missing row means disabled (deny by default). */
export async function isMcpEnabled(): Promise<boolean> {
  const [row] = await db
    .select({ value: appSettings.value })
    .from(appSettings)
    .where(eq(appSettings.key, MCP_ENABLED_KEY));
  return row?.value === true;
}

export async function setMcpEnabled(enabled: boolean, ctx: ServiceContext): Promise<void> {
  requireUser(ctx);
  await db.transaction(async (tx) => {
    await tx
      .insert(appSettings)
      .values({ key: MCP_ENABLED_KEY, value: enabled })
      .onConflictDoUpdate({ target: appSettings.key, set: { value: enabled, updatedAt: new Date() } });
    await recordAudit(tx, ctx, {
      action: "settings.setMcpEnabled",
      targetType: "app_setting",
      diff: { key: MCP_ENABLED_KEY, enabled },
    });
  });
}

/** Records that an OAuth client called us. Returns whether it has been revoked. */
export async function touchMcpClient(clientId: string): Promise<{ revoked: boolean }> {
  const now = new Date();
  const [row] = await db
    .insert(mcpClients)
    .values({ clientId, firstSeenAt: now, lastSeenAt: now })
    .onConflictDoUpdate({ target: mcpClients.clientId, set: { lastSeenAt: now, updatedAt: now } })
    .returning({ revoked: mcpClients.revoked });
  return { revoked: row?.revoked ?? false };
}

export async function listMcpClients() {
  return db.select().from(mcpClients).orderBy(desc(mcpClients.lastSeenAt));
}

export async function setMcpClientRevoked(
  id: string,
  revoked: boolean,
  ctx: ServiceContext,
): Promise<void> {
  requireUser(ctx);
  await db.transaction(async (tx) => {
    const [row] = await tx
      .update(mcpClients)
      .set({ revoked })
      .where(eq(mcpClients.id, id))
      .returning({ id: mcpClients.id });
    if (!row) throw new AppError("NOT_FOUND", "MCP client not found");
    await recordAudit(tx, ctx, {
      action: "mcpClients.setRevoked",
      targetType: "mcp_client",
      targetId: id,
      diff: { revoked },
    });
  });
}
