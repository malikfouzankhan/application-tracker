import "server-only";
import { db } from "@/db/client";
import { preferences } from "@/db/schema";
import { AppError } from "@/lib/errors";
import {
  type PreferenceKey,
  type Preferences,
  mergePreferences,
  preferencesSchema,
} from "@/lib/preferences";
import { recordAudit } from "./audit";
import { type ServiceContext, requireUser } from "./context";

/** Stored preferences over defaults. `invalidKeys` lists stored values that failed validation. */
export async function getPreferences(): Promise<{ preferences: Preferences; invalidKeys: string[] }> {
  const rows = await db.select({ key: preferences.key, value: preferences.value }).from(preferences);
  return mergePreferences(rows);
}

export async function setPreference<K extends PreferenceKey>(
  key: K,
  value: Preferences[K],
  ctx: ServiceContext,
): Promise<void> {
  requireUser(ctx);
  if (!(key in preferencesSchema.shape)) {
    throw new AppError("INVALID_INPUT", `Unknown preference: ${key}`);
  }
  const parsed = preferencesSchema.shape[key].safeParse(value);
  if (!parsed.success) {
    throw new AppError("INVALID_INPUT", `Invalid value for ${key}: ${parsed.error.issues[0]?.message}`);
  }

  await db.transaction(async (tx) => {
    await tx
      .insert(preferences)
      .values({ key, value: parsed.data })
      .onConflictDoUpdate({
        target: preferences.key,
        set: { value: parsed.data, updatedAt: new Date() },
      });
    await recordAudit(tx, ctx, {
      action: "preferences.set",
      targetType: "preference",
      diff: { key },
    });
  });
}
