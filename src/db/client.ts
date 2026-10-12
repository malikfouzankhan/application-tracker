import "server-only";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { z } from "zod";
import * as schema from "./schema";

// The app runs on the Supabase transaction pooler (DATABASE_URL, port 6543). Scripts and
// GitHub Actions set DB_USE_DIRECT=1 to use the session pooler (DIRECT_DATABASE_URL, 5432).
// Only the needed variable is read here, so scripts do not need the app's other secrets.
function connectionUrl(): string {
  const name = process.env.DB_USE_DIRECT === "1" ? "DIRECT_DATABASE_URL" : "DATABASE_URL";
  const parsed = z.url().safeParse(process.env[name]);
  if (!parsed.success) throw new Error(`Invalid or missing environment variable: ${name}`);
  return parsed.data;
}

// The transaction pooler does not support prepared statements.
function createClient() {
  return postgres(connectionUrl(), { prepare: false, max: 10 });
}

// Reuse one connection pool across dev hot reloads.
const globalForDb = globalThis as unknown as { pgClient?: ReturnType<typeof createClient> };
const client = globalForDb.pgClient ?? createClient();
if (process.env.NODE_ENV !== "production") globalForDb.pgClient = client;

export const db = drizzle(client, { schema });

export type Db = typeof db;
export type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];
/** Services accept either, so they can run inside a caller's transaction. */
export type DbOrTx = Db | Tx;

/** For scripts: close the pool so the process can exit. */
export async function closeDb(): Promise<void> {
  await client.end({ timeout: 5 });
}
