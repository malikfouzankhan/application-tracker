// Seeds the claims library and base resumes from seed-data/claims.json (gitignored: it is MFK's
// resume). Every claim starts unverified; MFK verifies each one in /library before Claude can use
// it. Safe to re-run: claims already present (same kind, entity and text) are reused.
// Run via `pnpm seed:claims`.

import { readFileSync } from "node:fs";
import { z } from "zod";
import { archetypeValues, claimKindValues } from "@/db/enums";

const isoDate = z.iso.date();
const fileSchema = z
  .object({
    claims: z.array(
      z
        .object({
          key: z.string().min(1),
          kind: z.enum(claimKindValues),
          entity: z.string().min(1),
          role: z.string().optional(),
          context: z.string().optional(),
          dateLabel: z.string().optional(),
          startDate: isoDate.optional(),
          endDate: isoDate.optional(),
          text: z.string().min(1),
          metrics: z.string().optional(),
          tags: z.array(z.string()).default([]),
        })
        .strict(),
    ),
    baseResumes: z.array(
      z
        .object({
          archetype: z.enum(archetypeValues),
          summaryFrom: z.string(),
          claims: z.array(z.string()).min(1),
          skills: z.array(z.string()).max(40),
        })
        .strict(),
    ),
  })
  .strict();

async function main() {
  process.env.DB_USE_DIRECT = "1";
  const { and, eq } = await import("drizzle-orm");
  const { db, closeDb } = await import("@/db/client");
  const { claims } = await import("@/db/schema");
  const { createClaim, upsertBaseResume } = await import("@/services/resume");
  const { userContext } = await import("@/services/context");

  const data = fileSchema.parse(JSON.parse(readFileSync("seed-data/claims.json", "utf8")));
  const idByKey = new Map<string, string>();
  let created = 0;

  try {
    for (const [index, c] of data.claims.entries()) {
      const [existing] = await db
        .select({ id: claims.id })
        .from(claims)
        .where(and(eq(claims.kind, c.kind), eq(claims.entity, c.entity), eq(claims.text, c.text)));
      if (existing) {
        idByKey.set(c.key, existing.id);
        continue;
      }
      const { key, ...input } = c;
      const row = await createClaim({ ...input, sortOrder: index * 10 }, userContext);
      idByKey.set(key, row.id);
      created++;
    }

    const textByKey = new Map(data.claims.map((c) => [c.key, c.text]));
    for (const base of data.baseResumes) {
      const claimIds = base.claims.map((key) => {
        const id = idByKey.get(key);
        if (!id) throw new Error(`Base resume ${base.archetype} references unknown claim key ${key}`);
        return id;
      });
      const summary = textByKey.get(base.summaryFrom);
      if (!summary) throw new Error(`Base resume ${base.archetype}: unknown summaryFrom ${base.summaryFrom}`);
      await upsertBaseResume({ archetype: base.archetype, summary, claimIds, skillsOrder: base.skills }, userContext);
    }

    console.log(
      `${created} claims created, ${data.claims.length - created} already present (all new claims are UNVERIFIED).\n` +
        `${data.baseResumes.length} base resumes upserted: ${data.baseResumes.map((b) => b.archetype).join(", ")}.`,
    );
  } finally {
    await closeDb();
  }
}

main().catch((error) => {
  console.error("Seeding claims failed:", error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
