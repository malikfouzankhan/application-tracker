import { auth } from "@clerk/nextjs/server";
import type { NextRequest } from "next/server";
import { todayIst } from "@/lib/dates";
import { env } from "@/lib/env";
import { parseApplicationFilters } from "@/lib/filters";
import { searchApplications } from "@/services/applications";

// CSV export of the current /applications view (same filters, all pages, up to 5,000 rows).

/** Quotes a cell and neutralizes spreadsheet formulas (=, +, -, @, tab, CR) from external text. */
function cell(value: unknown): string {
  let s = value instanceof Date ? value.toISOString() : value === null || value === undefined ? "" : String(value);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return `"${s.replace(/"/g, '""')}"`;
}

export async function GET(req: NextRequest) {
  const { userId } = await auth();
  if (userId !== env.OWNER_CLERK_USER_ID) return new Response("Not found", { status: 404 });

  const params: Record<string, string[]> = {};
  for (const [key, value] of req.nextUrl.searchParams) (params[key] ??= []).push(value);
  const { rows } = await searchApplications(parseApplicationFilters(params), { all: true });

  const header = ["company", "title", "location", "remote", "status", "tier", "fit_score", "archetype", "channel", "applied_at", "created_at", "updated_at", "next_action", "next_action_at", "outreach_status", "source", "url", "archived"];
  const body = rows.map((r) =>
    [r.companyName, r.title, r.locationRaw, r.remoteType, r.status, r.tier, r.fitScore, r.archetype, r.channel, r.appliedAt, r.createdAt, r.updatedAt, r.nextAction, r.nextActionAt, r.outreachStatus, r.source, r.url, r.archived]
      .map(cell)
      .join(","),
  );

  return new Response([header.join(","), ...body].join("\r\n"), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="applications-${todayIst()}.csv"`,
      "Cache-Control": "private, no-store",
    },
  });
}
