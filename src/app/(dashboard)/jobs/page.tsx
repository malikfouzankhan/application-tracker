import Link from "next/link";
import { Suspense } from "react";
import { archiveJobAction, dismissJobAction } from "@/actions/misc";
import { ActionForm, SubmitButton } from "@/components/client/action-form";
import { Select } from "@/components/client/select";
import { Badge, Empty, ExternalLink, Loading, PageHeader, RemoteBadge, ScamFlags, TierBadge, btn, cx, inputClass, labelClass } from "@/components/ui";
import { jobSourceValues } from "@/db/enums";
import { requireOwnerPage } from "@/lib/auth";
import { type JobFilters, parseJobFilters, toQuery } from "@/lib/filters";
import { fmtDate, humanize } from "@/lib/format";
import { countJobsByTier, searchJobs } from "@/services/jobs";

export const metadata = { title: "Jobs" };

export default function JobsPage({ searchParams }: PageProps<"/jobs">) {
  return (
    <>
      <PageHeader
        title="Jobs"
        description="Relevant jobs only: software roles in your stack, location and experience range. Irrelevant postings are discarded at ingestion, and jobs Claude marks skip are hidden."
      />
      <Suspense fallback={<Loading />}>
        <JobsContent searchParams={searchParams} />
      </Suspense>
    </>
  );
}

const STAGE_TONE = { new: "blue", assessed: "gray", shortlisted: "green" } as const;

async function JobsContent({ searchParams }: { searchParams: PageProps<"/jobs">["searchParams"] }) {
  await requireOwnerPage();
  const f = parseJobFilters(await searchParams);
  const [{ rows, total, pageSize }, counts] = await Promise.all([searchJobs(f), countJobsByTier(f)]);
  const tierChips: { value: JobFilters["tier"]; label: string; n: number }[] = [
    { value: undefined, label: "All", n: counts.all },
    { value: "fit", label: "Fit", n: counts.fit },
    { value: "justify", label: "Justify", n: counts.justify },
    { value: "stretch", label: "Stretch", n: counts.stretch },
    { value: "unassessed", label: "Not assessed yet", n: counts.unassessed },
  ];

  return (
    <div className="space-y-5">
      <div className="rounded-xl border border-border bg-surface p-4 shadow-card">
        <div className="flex flex-wrap gap-2" role="tablist" aria-label="Tier">
          {tierChips.map((chip) => {
            const active = f.tier === chip.value;
            return (
              <Link
                key={chip.label}
                href={`/jobs${toQuery(f, { tier: chip.value, page: 1 })}`}
                role="tab"
                aria-selected={active}
                className={cx(
                  "flex items-center gap-2 rounded-full border px-3.5 py-1.5 text-sm font-medium transition-colors",
                  active ? "border-navy bg-navy text-white" : "border-border text-navy hover:border-mist hover:bg-subtle",
                )}
              >
                {chip.label}
                <span className={cx("rounded-full px-1.5 text-xs tabular-nums", active ? "bg-white text-navy" : "bg-sky text-navy")}>{chip.n}</span>
              </Link>
            );
          })}
        </div>

        <form method="get" action="/jobs" className="mt-4 grid grid-cols-2 items-end gap-3 border-t border-border pt-4 md:grid-cols-[2fr_1fr_1fr_auto]">
          {f.tier ? <input type="hidden" name="tier" value={f.tier} /> : null}
          <label className={cx(labelClass, "col-span-2 md:col-span-1")}>
            Search company or title
            <input name="q" defaultValue={f.q} placeholder="e.g. Supabase, backend" className={inputClass} />
          </label>
          <FilterSelect name="stage" value={f.stage} options={["new", "assessed", "shortlisted"]} label="Stage" />
          <FilterSelect name="source" value={f.source} options={jobSourceValues} label="Source" />
          <div className="col-span-2 flex gap-2 md:col-span-1">
            <button type="submit" className={cx(btn.base, btn.primary)}>
              Apply
            </button>
            <Link href="/jobs" className={cx(btn.base, btn.ghost)}>
              Clear
            </Link>
          </div>
        </form>
      </div>

      {rows.length === 0 ? (
        <Empty>
          {f.tier && f.tier !== "unassessed"
            ? `No ${f.tier} jobs yet. Tiers come from Claude's daily assessment; ${counts.unassessed} ${counts.unassessed === 1 ? "job is" : "jobs are"} still waiting to be assessed.`
            : "No relevant jobs match. New ones arrive with the early-morning runs (02:43 and 04:13 IST)."}
        </Empty>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border bg-surface shadow-card">
          <table className="w-full min-w-225 text-left text-sm">
            <thead className="border-b border-border bg-subtle text-xs font-semibold uppercase tracking-wide text-muted">
              <tr>
                <th className="px-4 py-3">Company and role</th>
                <th className="px-4 py-3">Location</th>
                <th className="px-4 py-3">Experience</th>
                <th className="px-4 py-3">Assessment</th>
                <th className="px-4 py-3">Seen</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.map((j) => (
                <tr key={j.id} className="align-top hover:bg-subtle/60">
                  <td className="px-4 py-3">
                    <p className="font-semibold text-ink">{j.companyName}</p>
                    <p className="mt-0.5">
                      <ExternalLink href={j.url}>{j.title}</ExternalLink>
                    </p>
                    <div className="mt-1 flex flex-wrap gap-1">
                      <Badge>{humanize(j.source)}</Badge>
                      <ScamFlags flags={j.scamFlags} />
                    </div>
                  </td>
                  <td className="max-w-56 px-4 py-3 text-ink">
                    {j.locationRaw ?? <span className="text-muted">Not stated</span>} <RemoteBadge type={j.remoteType} />
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-ink">
                    {j.expMin !== null ? `${j.expMin}${j.expMax !== null ? `-${j.expMax}` : "+"} yrs` : <span className="text-muted">Not stated</span>}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <Badge tone={STAGE_TONE[j.stage as keyof typeof STAGE_TONE] ?? "gray"}>{humanize(j.stage)}</Badge>
                      <TierBadge tier={j.tier} score={j.fitScore} />
                    </div>
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-muted">{fmtDate(j.firstSeenAt)}</td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-1">
                      {j.stage !== "shortlisted" ? (
                        <ActionForm action={dismissJobAction.bind(null, j.id)}>
                          <SubmitButton className={cx(btn.base, btn.ghost, btn.small)}>Dismiss</SubmitButton>
                        </ActionForm>
                      ) : null}
                      <ActionForm action={archiveJobAction.bind(null, j.id)}>
                        <SubmitButton className={cx(btn.base, btn.ghost, btn.small)}>Archive</SubmitButton>
                      </ActionForm>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <Pager f={f} total={total} pageSize={pageSize} />
    </div>
  );
}

function FilterSelect({ name, value, options, label }: { name: string; value?: string; options: readonly string[]; label: string }) {
  return (
    <label className={labelClass}>
      {label}
      <Select name={name} defaultValue={value} anyLabel="Any" options={options.map((o) => ({ value: o, label: humanize(o) }))} />
    </label>
  );
}

function Pager({ f, total, pageSize }: { f: JobFilters; total: number; pageSize: number }) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (pages === 1) return null;
  return (
    <div className="flex items-center justify-center gap-4 text-sm">
      {f.page > 1 ? (
        <Link href={`/jobs${toQuery(f, { page: f.page - 1 })}`} className={cx(btn.base, btn.secondary)}>
          Previous
        </Link>
      ) : null}
      <span className="text-muted">
        Page {f.page} of {pages}
      </span>
      {f.page < pages ? (
        <Link href={`/jobs${toQuery(f, { page: f.page + 1 })}`} className={cx(btn.base, btn.secondary)}>
          Next
        </Link>
      ) : null}
    </div>
  );
}
