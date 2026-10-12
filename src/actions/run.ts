import "server-only";
import { refresh } from "next/cache";
import { unstable_rethrow } from "next/navigation";
import { ZodError } from "zod";
import { requireOwner } from "@/lib/auth";
import { isAppError } from "@/lib/errors";
import type { ActionResult } from "./types";

/**
 * Wraps every dashboard server action: owner check, then the mutation, then a router refresh.
 * Service errors become a message for the form; anything unexpected is logged by name only.
 */
export async function runAction(fn: () => Promise<string | void>): Promise<ActionResult> {
  try {
    await requireOwner();
    const message = await fn();
    refresh();
    return { ok: true, message: message ?? undefined };
  } catch (error) {
    unstable_rethrow(error); // notFound / redirect from Next.js
    if (isAppError(error)) return { ok: false, error: error.message };
    if (error instanceof ZodError) {
      const issue = error.issues[0];
      return { ok: false, error: `${issue?.path.join(".") || "Input"}: ${issue?.message ?? "invalid"}` };
    }
    console.error(`[action] failed: ${error instanceof Error ? error.name : "unknown"}`);
    return { ok: false, error: "Something went wrong" };
  }
}

/** FormData field as a trimmed string, or null when empty. */
export function field(formData: FormData, name: string): string | null {
  const value = formData.get(name);
  return typeof value === "string" && value.trim() !== "" ? value.trim() : null;
}

/** One entry per non-empty line, for list-style preferences. */
export function lines(formData: FormData, name: string): string[] {
  return (field(formData, name) ?? "")
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
}
