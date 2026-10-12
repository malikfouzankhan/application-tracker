// Seeds the answer bank (resume header and profile fields) from seed-data/profile.json
// (gitignored: it holds contact details). Safe to re-run: values are upserted by key.
// Run via `pnpm seed:answers`. Notice period, CTC and the like are added in /answers.

import { readFileSync } from "node:fs";
import { z } from "zod";

const fileSchema = z.array(
  z
    .object({
      key: z.string().regex(/^[a-z0-9_]{1,64}$/),
      label: z.string().min(1),
      value: z.string().min(1),
      isSensitive: z.boolean(),
    })
    .strict(),
);

async function main() {
  process.env.DB_USE_DIRECT = "1";
  const { closeDb } = await import("@/db/client");
  const { upsertAnswer } = await import("@/services/answers");
  const { userContext } = await import("@/services/context");

  const entries = fileSchema.parse(JSON.parse(readFileSync("seed-data/profile.json", "utf8")));
  try {
    for (const entry of entries) await upsertAnswer(entry, userContext);
    console.log(`${entries.length} answers upserted: ${entries.map((e) => e.key + (e.isSensitive ? " (sensitive)" : "")).join(", ")}`);
  } finally {
    await closeDb();
  }
}

main().catch((error) => {
  console.error("Seeding answers failed:", error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
