import Link from "next/link";
import { Suspense } from "react";
import { bulkApplicationsAction } from "@/actions/applications";
import { ActionForm, SubmitButton } from "@/components/client/action-form";
import { KanbanBoard } from "@/components/client/kanban";
import {
  Badge,
  Empty,
  Loading,
  PageHeader,
  RemoteBadge,
  ScamFlags,
  StatusBadge,
  TierBadge,
  btn,
  cx,
  inputClass,
  labelClass,
  selectInline,
} from "@/components/ui";
import {
  appChannelValues,
  appStatusValues,
  archetypeValues,
  jobSourceValues,
  outreachStatusValues,
  tierValues,
} from "@/db/enums";
import { requireOwnerPage } from "@/lib/auth";
import { APPLICATION_SORTS, type ApplicationFilters, parseApplicationFilters, toQuery } from "@/lib/filters";
import { fmtDate, fmtRelative, humanize } from "@/lib/format";
import { searchApplications } from "@/services/applications";

export const metadata = { title: "Applications" };

export default function ApplicationsPage({ searchParams }: PageProps<"/applications">) {
  return (
    <>
      <PageHeader title="Applications" description="Every application across all statuses. Filters live in the URL, so any view can be bookmarked." />
      <Suspense fallback={<Loading />}>
        <ApplicationsContent searchParams={searchParams} />
      </Suspense>
    </>
  );
}

async function ApplicationsContent({ searchParams }: { searchParams: PageProps<"/applications">["searchParams"] }) {
  await requireOwnerPage();
  const filters = parseApplicationFilters(await searchParams);
  const kanban = filters.view === "kanban";
  const { rows, total, pageSize } = await searchApplications(filters, { all: kanban });

  return (
    <div className="space-y-5">
      <Toolbar filters={filters} total={total} />

      {rows.length === 0 ? (
        <Empty>No applications match these filters.</Empty>
      ) : kanban ? (
        <KanbanBoard
          key={JSON.stringify(rows.map((r) => [r.id, r.status]))}
          statuses={filters.status.length ? filters.status : appStatusValues}
          cards={rows.map((r) => ({
            id: r.id,
            status: r.status,
            companyName: r.companyName,
            title: r.title,
            locationRaw: r.locationRaw,
            tier: r.tier,
            fitScore: r.fitScore,
          }))}
        />
      ) : (
        <>
          <ActionForm action={bulkApplicationsAction} confirm="Apply this bulk action to the selected applications?">
            <div className="overflow-hidden rounded-xl border border-border bg-surface shadow-card">
              <div className="flex flex-wrap items-center gap-3 border-b border-border px-4 py-3">
                <span className="text-sm text-muted">With selected</span>
                <select name="op" className={selectInline} aria-label="Bulk action">
                  <option value="archive">Archive</option>
                  <option value="unarchive">Unarchive</option>
                  <option value="ghosted">Mark ghosted</option>
                </select>
                <SubmitButton className={cx(btn.base, btn.secondary)}>Apply</SubmitButton>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full min-w-240 text-left text-sm">
                  <thead className="border-b border-border bg-subtle text-xs font-semibold uppercase tracking-wide text-muted">
                    <tr>
                      <th className="w-10 px-4 py-3" />
                      <th className="px-4 py-3">Company and role</th>
                      <th className="px-4 py-3">Location</th>
                      <th className="px-4 py-3">Status</th>
                      <th className="px-4 py-3">Tier</th>
                      <th className="px-4 py-3">Applied</th>
                      <th className="px-4 py-3">Next action</th>
                      <th className="px-4 py-3">Outreach</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {rows.map((r) => (
                      <tr key={r.id} className={cx("align-top hover:bg-subtle/60", r.archived && "opacity-60")}>
                        <td className="px-4 py-4">
                          <input type="checkbox" name="ids" value={r.id} aria-label={`Select ${r.companyName}`} className="h-4 w-4 accent-navy" />
                        </td>
                        <td className="px-4 py-3">
                          <Link href={`/applications/${r.id}`} className="group block">
                            <span className="flex flex-wrap items-center gap-1.5">
                              <span className="font-semibold text-ink group-hover:text-navy">{r.companyName}</span>
                              {r.isDream ? <Badge tone="violet">dream</Badge> : null}
                              {r.archived ? <Badge>archived</Badge> : null}
                            </span>
                            <span className="mt-0.5 block text-ink group-hover:underline">{r.title}</span>
                          </Link>
                          <span className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-muted">
                            {humanize(r.source)} · updated {fmtRelative(r.updatedAt)}
                            <ScamFlags flags={r.scamFlags} />
                          </span>
                        </td>
                        <td className="max-w-52 px-4 py-3 text-ink">
                          {r.locationRaw ?? <span className="text-muted">Not stated</span>}
                          <span className="ml-1">
                            <RemoteBadge type={r.remoteType} />
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <StatusBadge status={r.status} />
                        </td>
                        <td className="px-4 py-3">
                          <TierBadge tier={r.tier} score={r.fitScore} />
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 text-ink">
                          {r.appliedAt ? fmtDate(r.appliedAt) : <span className="text-muted">Not yet</span>}
                          {r.channel ? <span className="block text-xs text-muted">via {humanize(r.channel)}</span> : null}
                        </td>
                        <td className="max-w-56 px-4 py-3 text-ink">
                          {r.nextAction ?? <span className="text-muted">None</span>}
                          {r.nextActionAt ? <span className="block text-xs text-muted">{fmtRelative(r.nextActionAt)}</span> : null}
                        </td>
                        <td className="px-4 py-3">{r.outreachStatus ? <StatusBadge status={r.outreachStatus} /> : <span className="text-muted">None</span>}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </ActionForm>
          <Pagination filters={filters} total={total} pageSize={pageSize} />
        </>
      )}
    </div>
  );
}

function Pagination({ filters, total, pageSize }: { filters: ApplicationFilters; total: number; pageSize: number }) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (pages === 1) return null;
  return (
    <div className="flex items-center justify-center gap-4 text-sm">
      {filters.page > 1 ? (
        <Link href={`/applications${toQuery(filters, { page: filters.page - 1 })}`} className={cx(btn.base, btn.secondary)}>
          Previous
        </Link>
      ) : null}
      <span className="text-muted">
        Page {filters.page} of {pages}
      </span>
      {filters.page < pages ? (
        <Link href={`/applications${toQuery(filters, { page: filters.page + 1 })}`} className={cx(btn.base, btn.secondary)}>
          Next
        </Link>
      ) : null}
    </div>
  );
}

function Select({ name, value, options, label }: { name: string; value?: string; options: readonly string[]; label: string }) {
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

function DateInput({ name, value, label }: { name: string; value?: string; label: string }) {
  return (
    <label className={labelClass}>
      {label}
      <input type="date" name={name} defaultValue={value} className={inputClass} />
    </label>
  );
}

/** One GET form: search and status chips always visible, the rest under "More filters". */
function Toolbar({ filters: f, total }: { filters: ApplicationFilters; total: number }) {
  const kanban = f.view === "kanban";
  const advancedActive = Boolean(
    f.tier || f.archetype || f.source || f.channel || f.company || f.hasOutreach || f.outreachStatus || f.createdFrom || f.createdTo || f.appliedFrom || f.appliedTo || f.scam || f.dream || f.archived,
  );
  return (
    <form method="get" action="/applications" className="rounded-xl border border-border bg-surface p-4 shadow-card">
      {kanban ? <input type="hidden" name="view" value="kanban" /> : null}
      <div className="flex flex-wrap items-end gap-3">
        <label className={cx(labelClass, "min-w-64 flex-1")}>
          Search company or title
          <input name="q" defaultValue={f.q} placeholder="e.g. Hevo, backend" className={inputClass} />
        </label>
        <label className={labelClass}>
          Sort by
          <select name="sort" defaultValue={f.sort} className={selectInline}>
            {APPLICATION_SORTS.map((s) => (
              <option key={s} value={s}>
                {s === "activity" ? "Most recent activity" : s === "fit" ? "Fit score" : s === "company" ? "Company" : `${s[0].toUpperCase()}${s.slice(1)} date`}
              </option>
            ))}
          </select>
        </label>
        <button type="submit" className={cx(btn.base, btn.primary)}>
          Apply
        </button>
        <Link href={kanban ? "/applications?view=kanban" : "/applications"} className={cx(btn.base, btn.ghost)}>
          Clear
        </Link>
        <div className="ml-auto flex items-center gap-3">
          <span className="text-sm text-muted">{total} total</span>
          <div className="flex rounded-lg border border-border p-0.5">
            <Link href={`/applications${toQuery(f, { view: "table", page: 1 })}`} className={cx("rounded-md px-3 py-1.5 text-sm", kanban ? "text-navy hover:bg-subtle" : "bg-navy font-medium text-white")}>
              Table
            </Link>
            <Link href={`/applications${toQuery(f, { view: "kanban", page: 1 })}`} className={cx("rounded-md px-3 py-1.5 text-sm", kanban ? "bg-navy font-medium text-white" : "text-navy hover:bg-subtle")}>
              Kanban
            </Link>
          </div>
          <a href={`/applications/export${toQuery(f, { view: undefined, page: undefined })}`} className={cx(btn.base, btn.secondary)}>
            Export CSV
          </a>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        {appStatusValues.map((s) => (
          <label
            key={s}
            className="flex cursor-pointer items-center rounded-full border border-border px-3 py-1 text-xs font-medium text-navy transition-colors hover:border-mist has-checked:border-navy has-checked:bg-navy has-checked:text-white"
          >
            <input type="checkbox" name="status" value={s} defaultChecked={f.status.includes(s)} className="sr-only" />
            {humanize(s)}
          </label>
        ))}
      </div>

      <details className="mt-3 border-t border-border pt-3" open={advancedActive}>
        <summary className="cursor-pointer text-sm font-medium text-navy">More filters</summary>
        <div className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-6">
          <label className={labelClass}>
            Company
            <input name="company" defaultValue={f.company} className={inputClass} />
          </label>
          <Select name="tier" value={f.tier} options={tierValues} label="Tier" />
          <Select name="archetype" value={f.archetype} options={archetypeValues} label="Archetype" />
          <Select name="source" value={f.source} options={jobSourceValues} label="Job source" />
          <Select name="channel" value={f.channel} options={appChannelValues} label="Channel" />
          <Select name="hasOutreach" value={f.hasOutreach} options={["yes", "no"]} label="Has outreach" />
          <Select name="outreachStatus" value={f.outreachStatus} options={outreachStatusValues} label="Outreach status" />
          <DateInput name="createdFrom" value={f.createdFrom} label="Created from" />
          <DateInput name="createdTo" value={f.createdTo} label="Created to" />
          <DateInput name="appliedFrom" value={f.appliedFrom} label="Applied from" />
          <DateInput name="appliedTo" value={f.appliedTo} label="Applied to" />
        </div>
        <div className="mt-3 flex flex-wrap gap-5 text-sm text-ink">
          <label className="flex items-center gap-2">
            <input type="checkbox" name="scam" value="1" defaultChecked={f.scam} className="h-4 w-4 accent-navy" /> Scam-flagged only
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" name="dream" value="1" defaultChecked={f.dream} className="h-4 w-4 accent-navy" /> Dream companies only
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" name="archived" value="1" defaultChecked={f.archived} className="h-4 w-4 accent-navy" /> Include archived
          </label>
        </div>
      </details>
    </form>
  );
}
