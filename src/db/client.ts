import "server-only";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { env } from "@/lib/env";
import * as schema from "./schema";

// Supabase transaction pooler (port 6543) does not support prepared statements.
function createClient() {
  return postgres(env.DATABASE_URL, { prepare: false });
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
