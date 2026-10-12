import "server-only";
import { auth } from "@clerk/nextjs/server";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { env } from "./env";

/**
 * Owner check for pages, server actions and route handlers (claude.md section 3.2). The proxy
 * already enforces this; checking again here keeps every entry point safe on its own.
 * Non-owners see a 404, never a hint that the app exists.
 */
export async function requireOwner(): Promise<void> {
  const { userId } = await auth();
  if (!userId || userId !== env.OWNER_CLERK_USER_ID) notFound();
}

/**
 * For page content components: marks the render as request-time (so reading the clock or the
 * session is allowed under Cache Components), then checks the owner.
 */
export async function requireOwnerPage(): Promise<void> {
  await connection();
  await requireOwner();
}
