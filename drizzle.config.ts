import { existsSync } from "node:fs";
import { defineConfig } from "drizzle-kit";

// Local runs read .env.local; GitHub Actions provides env vars directly.
if (existsSync(".env.local")) process.loadEnvFile(".env.local");

const url = process.env.DIRECT_DATABASE_URL;
if (!url) throw new Error("DIRECT_DATABASE_URL is not set");

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/db/schema.ts",
  out: "./src/db/migrations",
  dbCredentials: { url }, // session pooler (5432), never the transaction pooler
  strict: true,
  verbose: true,
});
