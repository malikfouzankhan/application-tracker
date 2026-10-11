import "server-only";
import { and, asc, eq, inArray, or, sql } from "drizzle-orm";
import { type DbOrTx, db } from "@/db/client";
import type { companySourceValues, watchStatusValues } from "@/db/enums";
import { companies } from "@/db/schema";
import { type BoardRef, type PollableAts, isValidBoardToken } from "@/ingest/snowball";
import { AppError } from "@/lib/errors";
import { recordAudit } from "./audit";
import { type ServiceContext, requireUser } from "./context";

type CompanySource = (typeof companySourceValues)[number];
type WatchStatus = (typeof watchStatusValues)[number];

const POLLABLE_ATS: readonly PollableAts[] = ["greenhouse", "lever", "ashby"];

export function slugify(name: string): string {
  return (
    name
      .normalize("NFKD")
      .replace(/[\u{300}-\u{36F}]/gu, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "company"
  );
}

/** "acme-labs" -> "Acme Labs", used as a placeholder name for snowballed boards. */
function nameFromToken(token: string): string {
  return token
    .split("-")
    .filter(Boolean)
    .map((w) => w[0].toUpperCase() + w.slice(1))
    .join(" ");
}

function sourceFor(ctx: ServiceContext): CompanySource {
  if (ctx.actor === "claude") return "claude";
  if (ctx.actor === "user") return "manual";
  return "seed";
}

/** A free slug: the name's slug, else suffixed with the board token, else with a counter. */
async function uniqueSlug(dbOrTx: DbOrTx, name: string, token: string): Promise<string> {
  const base = slugify(name);
  const candidates = [base, `${base}-${token}`.slice(0, 64)];
  const taken = await dbOrTx
    .select({ slug: companies.slug })
    .from(companies)
    .where(or(eq(companies.slug, base), sql`${companies.slug} like ${`${base}-%`}`));
  const used = new Set(taken.map((r) => r.slug));
  for (const c of candidates) if (!used.has(c)) return c;
  for (let i = 2; ; i++) if (!used.has(`${base}-${i}`)) return `${base}-${i}`;
}

export type WatchCompanyInput = {
  name: string;
  ats: PollableAts;
  boardToken: string;
  careersUrl?: string | null;
};

/** add_watch_companies and the dashboard. Existing (ats, board_token) pairs are left alone. */
export async function addWatchCompanies(
  items: WatchCompanyInput[],
  ctx: ServiceContext,
): Promise<{ added: { id: string; name: string }[]; existing: number }> {
  for (const item of items) {
    if (!POLLABLE_ATS.includes(item.ats)) {
      throw new AppError("INVALID_INPUT", `Unsupported ATS: ${item.ats}`);
    }
    if (!isValidBoardToken(item.boardToken)) {
      throw new AppError("INVALID_INPUT", `Invalid board token: ${item.boardToken}`);
    }
    if (item.careersUrl && !item.careersUrl.startsWith("https://")) {
      throw new AppError("INVALID_INPUT", "careers_url must be https");
    }
  }

  return db.transaction(async (tx) => {
    const added: { id: string; name: string }[] = [];
    for (const item of items) {
      const [row] = await tx
        .insert(companies)
        .values({
          name: item.name.trim(),
          slug: await uniqueSlug(tx, item.name, item.boardToken),
          ats: item.ats,
          boardToken: item.boardToken,
          careersUrl: item.careersUrl ?? null,
          source: sourceFor(ctx),
        })
        .onConflictDoNothing({ target: [companies.ats, companies.boardToken] })
        .returning({ id: companies.id, name: companies.name });
      if (row) added.push(row);
    }
    await recordAudit(tx, ctx, {
      action: "companies.addWatch",
      targetType: "company",
      diff: { requested: items.length, added: added.length },
    });
    return { added, existing: items.length - added.length };
  });
}

/** Snowball: watch every board seen in ingested jobs. Runs inside the ingestion transaction. */
export async function upsertSnowballCompanies(tx: DbOrTx, refs: BoardRef[]): Promise<number> {
  let added = 0;
  for (const ref of refs) {
    const name = nameFromToken(ref.boardToken);
    const [row] = await tx
      .insert(companies)
      .values({
        name,
        slug: await uniqueSlug(tx, name, ref.boardToken),
        ats: ref.ats,
        boardToken: ref.boardToken,
        source: "snowball",
      })
      .onConflictDoNothing({ target: [companies.ats, companies.boardToken] })
      .returning({ id: companies.id });
    if (row) added++;
  }
  return added;
}

export type CompanyMatch = { id: string; isDream: boolean };

/** Finds the watched company for a job: by board reference first, then by exact name. */
export async function findCompanyForJob(
  dbOrTx: DbOrTx,
  refs: BoardRef[],
  companyName: string,
): Promise<CompanyMatch | null> {
  if (refs.length > 0) {
    const [byBoard] = await dbOrTx
      .select({ id: companies.id, isDream: companies.isDream })
      .from(companies)
      .where(
        or(
          ...refs.map((r) => and(eq(companies.ats, r.ats), eq(companies.boardToken, r.boardToken))),
        ),
      )
      .limit(1);
    if (byBoard) return byBoard;
  }
  const [byName] = await dbOrTx
    .select({ id: companies.id, isDream: companies.isDream })
    .from(companies)
    .where(sql`lower(${companies.name}) = lower(${companyName.trim()})`)
    .limit(1);
  return byName ?? null;
}

export async function getCompaniesByIds(ids: string[]) {
  if (ids.length === 0) return [];
  return db.select().from(companies).where(inArray(companies.id, ids));
}

export async function listCompanies() {
  return db.select().from(companies).orderBy(asc(companies.name));
}

export async function updateCompany(
  id: string,
  patch: { watchStatus?: WatchStatus; isDream?: boolean; tags?: string[]; careersUrl?: string | null },
  ctx: ServiceContext,
): Promise<void> {
  requireUser(ctx);
  if (patch.careersUrl && !patch.careersUrl.startsWith("https://")) {
    throw new AppError("INVALID_INPUT", "careers_url must be https");
  }
  await db.transaction(async (tx) => {
    const [row] = await tx
      .update(companies)
      .set(patch)
      .where(eq(companies.id, id))
      .returning({ id: companies.id });
    if (!row) throw new AppError("NOT_FOUND", "Company not found");
    await recordAudit(tx, ctx, {
      action: "companies.update",
      targetType: "company",
      targetId: id,
      diff: { fields: Object.keys(patch), watchStatus: patch.watchStatus, isDream: patch.isDream },
    });
  });
}
