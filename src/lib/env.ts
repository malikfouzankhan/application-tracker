import "server-only";
import { z } from "zod";

const envSchema = z.object({
  APP_URL: z.url(),
  DATABASE_URL: z.url(),
  DIRECT_DATABASE_URL: z.url(),
  NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: z.string().regex(/^pk_(test|live)_/),
  CLERK_SECRET_KEY: z.string().regex(/^sk_(test|live)_/),
  OWNER_CLERK_USER_ID: z.string().regex(/^user_[A-Za-z0-9]+$/),
  SUPABASE_URL: z.url(),
  SUPABASE_SECRET_KEY: z.string().startsWith("sb_secret_"),
  PDF_SIGNING_SECRET: z.string().min(32),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  // Report variable names only, never values.
  const names = parsed.error.issues.map((issue) => issue.path.join(".")).join(", ");
  throw new Error(`Invalid or missing environment variables: ${names}`);
}

export const env = parsed.data;
