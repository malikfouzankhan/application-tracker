import Link from "next/link";
import { Suspense } from "react";
import { archiveJobAction, dismissJobAction } from "@/actions/misc";
import { ActionForm, SubmitButton } from "@/components/client/action-form";
import { Badge, Empty, ExternalLink, Loading, PageHeader, RemoteBadge, ScamFlags, TierBadge, btn, cx, inputClass, labelClass } from "@/components/ui";
import { jobSourceValues } from "@/db/enums";
import { requireOwnerPage } from "@/lib/auth";
import { type JobFilters, parseJobFilters, toQuery } from "@/lib/filters";
import { fmtDate, humanize } from "@/lib/format";
import { searchJobs } from "@/services/jobs";

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
  const { rows, total, pageSize } = await searchJobs(f);

  return (
    <div className="space-y-5">
      <form method="get" action="/jobs" className="grid grid-cols-2 items-end gap-3 rounded-xl border border-border bg-surface p-4 shadow-card md:grid-cols-[2fr_1fr_1fr_1fr_auto]">
        <label className={cx(labelClass, "col-span-2 md:col-span-1")}>
          Search company or title
          <input name="q" defaultValue={f.q} className={inputClass} />
        </label>
        <FilterSelect name="tier" value={f.tier} options={["fit", "justify", "stretch"]} label="Tier" />
        <FilterSelect name="stage" value={f.stage} options={["new", "assessed", "shortlisted"]} label="Stage" />
        <FilterSelect name="source" value={f.source} options={jobSourceValues} label="Source" />
        <div className="col-span-2 flex gap-2 md:col-span-1">
          <button type="submit" className={cx(btn.base, btn.primary)}>
            Filter
          </button>
          <Link href="/jobs" className={cx(btn.base, btn.ghost)}>
            Clear
          </Link>
        </div>
      </form>

      <p className="text-sm text-muted">
        {total} relevant {total === 1 ? "job" : "jobs"}
      </p>

      {rows.length === 0 ? (
        <Empty>No relevant jobs match. New ones arrive with the daily run at 05:30 IST.</Empty>
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
      <select name={name} defaultValue={value ?? ""} className={inputClass}>
        <option value="">Any</option>
        {options.map((o) => (
          <option key={o} value={o}>
            {humanize(o)}
          </option>
        ))}
      </select>
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
