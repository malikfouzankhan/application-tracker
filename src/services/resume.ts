import "server-only";
import { and, asc, eq, inArray } from "drizzle-orm";
import { type DbOrTx, db } from "@/db/client";
import type { archetypeValues, claimKindValues } from "@/db/enums";
import { baseResumes, claims, jobs, resumeVariants } from "@/db/schema";
import { AppError } from "@/lib/errors";
import { recordAudit } from "./audit";
import { type ServiceContext, requireUser } from "./context";

type Archetype = (typeof archetypeValues)[number];
type ClaimKind = (typeof claimKindValues)[number];

// ---------------------------------------------------------------- Claims (dashboard only)

export type ClaimInput = {
  kind: ClaimKind;
  entity: string;
  text: string;
  metrics?: string | null;
  tags?: string[];
  startDate?: string | null;
  endDate?: string | null;
  sortOrder?: number;
};

export async function listClaims(options: { includeInactive?: boolean } = {}) {
  return db
    .select()
    .from(claims)
    .where(options.includeInactive ? undefined : eq(claims.active, true))
    .orderBy(asc(claims.sortOrder), asc(claims.createdAt));
}

/** New claims start unverified; MFK verifies each one. */
export async function createClaim(input: ClaimInput, ctx: ServiceContext) {
  requireUser(ctx);
  return db.transaction(async (tx) => {
    const [row] = await tx
      .insert(claims)
      .values({ ...input, tags: input.tags ?? [], verified: false })
      .returning({ id: claims.id });
    await recordAudit(tx, ctx, {
      action: "resume.createClaim",
      targetType: "claim",
      targetId: row.id,
      diff: { kind: input.kind },
    });
    return row;
  });
}

/** Changing the fact itself (entity, text, metrics, dates) drops verification until re-approved. */
export async function updateClaim(
  id: string,
  patch: Partial<ClaimInput> & { active?: boolean },
  ctx: ServiceContext,
) {
  requireUser(ctx);
  const factChanged = ["entity", "text", "metrics", "startDate", "endDate"].some((k) => k in patch);
  await db.transaction(async (tx) => {
    const [row] = await tx
      .update(claims)
      .set({ ...patch, ...(factChanged ? { verified: false } : {}) })
      .where(eq(claims.id, id))
      .returning({ id: claims.id });
    if (!row) throw new AppError("NOT_FOUND", "Claim not found");
    await recordAudit(tx, ctx, {
      action: "resume.updateClaim",
      targetType: "claim",
      targetId: id,
      diff: { fields: Object.keys(patch), verificationReset: factChanged },
    });
  });
}

export async function setClaimVerified(id: string, verified: boolean, ctx: ServiceContext) {
  requireUser(ctx);
  await db.transaction(async (tx) => {
    const [row] = await tx
      .update(claims)
      .set({ verified })
      .where(eq(claims.id, id))
      .returning({ id: claims.id });
    if (!row) throw new AppError("NOT_FOUND", "Claim not found");
    await recordAudit(tx, ctx, {
      action: "resume.setClaimVerified",
      targetType: "claim",
      targetId: id,
      diff: { verified },
    });
  });
}

// ---------------------------------------------------------------- Base resumes

async function assertClaimsExist(dbOrTx: DbOrTx, claimIds: string[]) {
  if (claimIds.length === 0) return;
  const rows = await dbOrTx.select({ id: claims.id }).from(claims).where(inArray(claims.id, claimIds));
  if (rows.length !== new Set(claimIds).size) throw new AppError("INVALID_CLAIM", "Unknown claim id");
}

export async function upsertBaseResume(
  input: { archetype: Archetype; summary: string; claimIds: string[]; skillsOrder: string[] },
  ctx: ServiceContext,
) {
  requireUser(ctx);
  await db.transaction(async (tx) => {
    await assertClaimsExist(tx, input.claimIds);
    const [row] = await tx
      .insert(baseResumes)
      .values(input)
      .onConflictDoUpdate({
        target: baseResumes.archetype,
        set: {
          summary: input.summary,
          claimIds: input.claimIds,
          skillsOrder: input.skillsOrder,
          updatedAt: new Date(),
        },
      })
      .returning({ id: baseResumes.id });
    await recordAudit(tx, ctx, {
      action: "resume.upsertBase",
      targetType: "base_resume",
      targetId: row.id,
      diff: { archetype: input.archetype, claims: input.claimIds.length },
    });
  });
}

/** get_resume_library: verified active claims + base resumes. */
export async function getResumeLibrary(options: { archetype?: Archetype } = {}) {
  const [claimRows, baseRows] = await Promise.all([
    db
      .select({
        id: claims.id,
        kind: claims.kind,
        entity: claims.entity,
        text: claims.text,
        metrics: claims.metrics,
        tags: claims.tags,
        startDate: claims.startDate,
        endDate: claims.endDate,
      })
      .from(claims)
      .where(and(eq(claims.verified, true), eq(claims.active, true)))
      .orderBy(asc(claims.sortOrder), asc(claims.createdAt)),
    db
      .select()
      .from(baseResumes)
      .where(options.archetype ? eq(baseResumes.archetype, options.archetype) : undefined),
  ]);
  return { claims: claimRows, baseResumes: baseRows };
}

// ---------------------------------------------------------------- Variants

export type VariantInput = {
  jobId: string;
  archetype: Archetype;
  summary: string;
  claimIds: string[];
  skillsOrder: string[];
  rephrases?: Record<string, string>;
  rephraseJustifications?: Record<string, string>;
};

/** Every id must be a verified, active claim (claude.md section 8). */
async function assertUsableClaims(dbOrTx: DbOrTx, claimIds: string[]) {
  const rows = await dbOrTx
    .select({ id: claims.id, verified: claims.verified, active: claims.active })
    .from(claims)
    .where(inArray(claims.id, claimIds));
  const usable = new Set(rows.filter((r) => r.verified && r.active).map((r) => r.id));
  const bad = claimIds.filter((id) => !usable.has(id));
  if (bad.length > 0) {
    throw new AppError(
      "INVALID_CLAIM",
      `These claim ids are unknown, unverified or inactive: ${bad.join(", ")}`,
    );
  }
}

/**
 * create_resume_variant. Enforces the tailoring rules in code: only verified active claims,
 * every rephrase must target an included claim and carry a justification. Created as draft.
 */
export async function createResumeVariant(
  input: VariantInput,
  ctx: ServiceContext,
): Promise<{ variantId: string }> {
  if (new Set(input.claimIds).size !== input.claimIds.length) {
    throw new AppError("INVALID_INPUT", "claim_ids contains duplicates");
  }
  const rephrases = input.rephrases ?? {};
  const justifications = input.rephraseJustifications ?? {};
  const included = new Set(input.claimIds);
  for (const id of Object.keys(rephrases)) {
    if (!included.has(id)) throw new AppError("INVALID_INPUT", `Rephrase for claim ${id}, which is not in claim_ids`);
    if (!justifications[id]?.trim()) throw new AppError("INVALID_INPUT", `Rephrase for claim ${id} has no justification`);
  }
  for (const id of Object.keys(justifications)) {
    if (!(id in rephrases)) throw new AppError("INVALID_INPUT", `Justification for claim ${id} without a rephrase`);
  }

  return db.transaction(async (tx) => {
    const [job] = await tx.select({ id: jobs.id }).from(jobs).where(eq(jobs.id, input.jobId));
    if (!job) throw new AppError("NOT_FOUND", "Job not found");

    const [base] = await tx
      .select({ id: baseResumes.id })
      .from(baseResumes)
      .where(eq(baseResumes.archetype, input.archetype));
    if (!base) throw new AppError("NOT_FOUND", `No base resume for archetype ${input.archetype}`);

    await assertUsableClaims(tx, input.claimIds);

    const [row] = await tx
      .insert(resumeVariants)
      .values({
        jobId: input.jobId,
        baseResumeId: base.id,
        summary: input.summary,
        claimIds: input.claimIds,
        skillsOrder: input.skillsOrder,
        rephrases,
        rephraseJustifications: justifications,
        status: "draft",
      })
      .returning({ id: resumeVariants.id });

    await recordAudit(tx, ctx, {
      action: "resume.createVariant",
      targetType: "resume_variant",
      targetId: row.id,
      diff: { jobId: input.jobId, archetype: input.archetype, claims: input.claimIds.length, rephrases: Object.keys(rephrases).length },
    });
    return { variantId: row.id };
  });
}

/** Dashboard only. Re-checks claims at approval time; approved variants are immutable. */
export async function approveResumeVariant(variantId: string, ctx: ServiceContext) {
  requireUser(ctx);
  await db.transaction(async (tx) => {
    const [variant] = await tx
      .select({ status: resumeVariants.status, claimIds: resumeVariants.claimIds })
      .from(resumeVariants)
      .where(eq(resumeVariants.id, variantId))
      .for("update");
    if (!variant) throw new AppError("NOT_FOUND", "Resume variant not found");
    if (variant.status === "approved") throw new AppError("CONFLICT", "Variant is already approved");

    await assertUsableClaims(tx, variant.claimIds);
    await tx.update(resumeVariants).set({ status: "approved" }).where(eq(resumeVariants.id, variantId));
    await recordAudit(tx, ctx, {
      action: "resume.approveVariant",
      targetType: "resume_variant",
      targetId: variantId,
      diff: { status: "approved" },
    });
  });
}

/** Set once, after the approved PDF is rendered and cached (M5). */
export async function setVariantStoragePath(variantId: string, storagePath: string, ctx: ServiceContext) {
  await db.transaction(async (tx) => {
    const [row] = await tx
      .update(resumeVariants)
      .set({ storagePath })
      .where(and(eq(resumeVariants.id, variantId), eq(resumeVariants.status, "approved")))
      .returning({ id: resumeVariants.id });
    if (!row) throw new AppError("CONFLICT", "Only approved variants are cached");
    await recordAudit(tx, ctx, {
      action: "resume.setStoragePath",
      targetType: "resume_variant",
      targetId: variantId,
      diff: { cached: true },
    });
  });
}

/**
 * Variant with its claims in order and rephrases applied, for rendering and the side-by-side
 * review. `original` is always the verified claim text.
 */
export async function getVariantForRender(variantId: string) {
  const [row] = await db
    .select({ variant: resumeVariants, job: { title: jobs.title, companyName: jobs.companyName } })
    .from(resumeVariants)
    .innerJoin(jobs, eq(jobs.id, resumeVariants.jobId))
    .where(eq(resumeVariants.id, variantId));
  if (!row) throw new AppError("NOT_FOUND", "Resume variant not found");

  const claimRows = row.variant.claimIds.length
    ? await db.select().from(claims).where(inArray(claims.id, row.variant.claimIds))
    : [];
  const byId = new Map(claimRows.map((c) => [c.id, c]));

  const items = row.variant.claimIds.flatMap((id) => {
    const claim = byId.get(id);
    if (!claim) return [];
    const rephrase = row.variant.rephrases[id];
    return [
      {
        claim,
        text: rephrase ?? claim.text,
        original: claim.text,
        rephrased: rephrase !== undefined,
        justification: row.variant.rephraseJustifications[id] ?? null,
      },
    ];
  });

  return { variant: row.variant, job: row.job, items };
}
