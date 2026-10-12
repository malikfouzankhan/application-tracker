import Link from "next/link";
import { Suspense } from "react";
import { Card, Loading, PageHeader, SectionTitle, btn, cx } from "@/components/ui";
import { requireOwnerPage } from "@/lib/auth";
import { fmtDateTime, humanize } from "@/lib/format";
import { type StatsRange, getRecentIngestionRuns, getStats } from "@/services/stats";

export const metadata = { title: "Stats" };

const RANGES: StatsRange[] = ["7d", "30d", "all"];

export default function StatsPage({ searchParams }: PageProps<"/stats">) {
  return (
    <>
      <PageHeader title="Stats" description="Where applications go, what gets responses, and how ingestion is doing." />
      <Suspense fallback={<Loading />}>
        <StatsContent searchParams={searchParams} />
      </Suspense>
    </>
  );
}

function pct(rate: number | null): string {
  return rate === null ? "-" : `${Math.round(rate * 100)}%`;
}

async function StatsContent({ searchParams }: { searchParams: PageProps<"/stats">["searchParams"] }) {
  await requireOwnerPage();
  const raw = (await searchParams).range;
  const range: StatsRange = RANGES.includes(raw as StatsRange) ? (raw as StatsRange) : "30d";
  const [stats, runs] = await Promise.all([getStats(range), getRecentIngestionRuns(30)]);

  const funnel: [string, number][] = [
    ["Assessed", stats.funnel.assessed],
    ["Ready", stats.funnel.ready],
    ["Applied", stats.funnel.applied],
    ["Responded", stats.funnel.responded],
    ["Interviewed", stats.funnel.interviewed],
    ["Offers", stats.funnel.offers],
  ];
  const max = Math.max(1, ...funnel.map(([, n]) => n));

  return (
    <div>
      <div className="mb-4 flex gap-1">
        {RANGES.map((r) => (
          <Link key={r} href={`/stats?range=${r}`} className={cx(btn.base, r === range ? btn.primary : btn.secondary)}>
            {r === "all" ? "All time" : `Last ${r}`}
          </Link>
        ))}
      </div>

      <SectionTitle>Funnel</SectionTitle>
      <Card className="space-y-1.5">
        {funnel.map(([label, n]) => (
          <div key={label} className="flex items-center gap-3">
            <span className="w-24 text-xs text-muted">{label}</span>
            <div className="h-5 flex-1 rounded bg-background">
              <div className="h-5 rounded bg-accent/70" style={{ width: `${(n / max) * 100}%` }} />
            </div>
            <span className="w-10 text-right font-medium tabular-nums">{n}</span>
          </div>
        ))}
        <p className="pt-1 text-xs text-muted">
          Response rate {pct(stats.responseRate.overall.rate)} of {stats.responseRate.overall.applied} applied · outreach reply rate{" "}
          {pct(stats.outreach.replyRate)} of {stats.outreach.sent} sent
        </p>
      </Card>

      <SectionTitle>Response rate by</SectionTitle>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {(
          [
            ["Tier", stats.responseRate.byTier],
            ["Archetype", stats.responseRate.byArchetype],
            ["Source", stats.responseRate.bySource],
            ["Channel", stats.responseRate.byChannel],
          ] as const
        ).map(([label, groups]) => (
          <Card key={label} className="p-3">
            <p className="mb-1 text-xs font-medium">{label}</p>
            {Object.keys(groups).length ? (
              <table className="w-full text-xs">
                <tbody>
                  {Object.entries(groups).map(([k, v]) => (
                    <tr key={k}>
                      <td className="py-0.5">{humanize(k)}</td>
                      <td className="py-0.5 text-right tabular-nums text-muted">
                        {v.responded}/{v.applied}
                      </td>
                      <td className="w-12 py-0.5 text-right tabular-nums">{pct(v.rate)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p className="text-xs text-muted">No applications yet.</p>
            )}
          </Card>
        ))}
      </div>

      <SectionTitle>Ingestion runs</SectionTitle>
      <div className="overflow-x-auto rounded-xl border border-border bg-surface shadow-card">
        <table className="w-full min-w-[640px] text-left text-xs">
          <thead className="border-b border-border bg-subtle font-semibold uppercase tracking-wide text-muted">
            <tr>
              <th className="px-4 py-3">Started</th>
              <th className="px-4 py-3">Source</th>
              <th className="px-4 py-3 text-right">Fetched</th>
              <th className="px-4 py-3 text-right">New</th>
              <th className="px-4 py-3 text-right">Passed</th>
              <th className="px-4 py-3">Errors</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {runs.map((r) => {
              const errors = Array.isArray(r.errors) ? (r.errors as { target?: string; message?: string }[]) : [];
              return (
                <tr key={r.id} className="hover:bg-subtle/60">
                  <td className="px-4 py-3 text-muted">{fmtDateTime(r.startedAt)}</td>
                  <td className="px-4 py-3">{r.source}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{r.fetched}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{r.newJobs}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{r.passedPrefilter}</td>
                  <td className="px-4 py-3 text-red-700">{errors.map((e) => `${e.target}: ${e.message}`).join("; ")}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
