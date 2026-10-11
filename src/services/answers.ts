import "server-only";
import { asc, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { answerBank } from "@/db/schema";
import { AppError } from "@/lib/errors";
import { recordAudit } from "./audit";
import { type ServiceContext, requireUser } from "./context";

export const MASKED_VALUE = "[masked]";
const KEY_RE = /^[a-z0-9_]{1,64}$/;

/** get_answer_bank. Sensitive values are masked unless explicitly requested. */
export async function getAnswerBank(options: { includeSensitive: boolean }) {
  const rows = await db
    .select({
      key: answerBank.key,
      label: answerBank.label,
      value: answerBank.value,
      isSensitive: answerBank.isSensitive,
    })
    .from(answerBank)
    .orderBy(asc(answerBank.key));
  return rows.map((r) => ({
    ...r,
    value: r.isSensitive && !options.includeSensitive ? MASKED_VALUE : r.value,
  }));
}

/** Dashboard only. Values never go into the audit log. */
export async function upsertAnswer(
  input: { key: string; label: string; value: string; isSensitive: boolean },
  ctx: ServiceContext,
) {
  requireUser(ctx);
  if (!KEY_RE.test(input.key)) {
    throw new AppError("INVALID_INPUT", "Key must be lowercase letters, digits and underscores");
  }
  await db.transaction(async (tx) => {
    await tx
      .insert(answerBank)
      .values(input)
      .onConflictDoUpdate({
        target: answerBank.key,
        set: { label: input.label, value: input.value, isSensitive: input.isSensitive, updatedAt: new Date() },
      });
    await recordAudit(tx, ctx, {
      action: "answers.upsert",
      targetType: "answer_bank",
      diff: { key: input.key, isSensitive: input.isSensitive },
    });
  });
}

/** Dashboard only (MCP never deletes). */
export async function deleteAnswer(key: string, ctx: ServiceContext) {
  requireUser(ctx);
  await db.transaction(async (tx) => {
    const [row] = await tx.delete(answerBank).where(eq(answerBank.key, key)).returning({ id: answerBank.id });
    if (!row) throw new AppError("NOT_FOUND", "Answer not found");
    await recordAudit(tx, ctx, { action: "answers.delete", targetType: "answer_bank", diff: { key } });
  });
}
