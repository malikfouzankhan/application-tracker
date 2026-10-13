import { Suspense } from "react";
import { addCompanyAction, updateCompanyAction } from "@/actions/misc";
import { ActionForm, SubmitButton } from "@/components/client/action-form";
import { Select } from "@/components/client/select";
import { Badge, Card, Loading, PageHeader, btn, cx, inputClass, labelClass } from "@/components/ui";
import { requireOwnerPage } from "@/lib/auth";
import { fmtDate, fmtRelative } from "@/lib/format";
import { listCompanies } from "@/services/companies";

export const metadata = { title: "Companies" };

export default function CompaniesPage() {
  return (
    <>
      <PageHeader title="Companies" description="Boards polled daily. Low-frequency boards are polled on Sundays; paused ones never." />
      <Suspense fallback={<Loading />}>
        <CompaniesContent />
      </Suspense>
    </>
  );
}

const STATUS_TONE = { active: "green", low_freq: "amber", paused: "gray" } as const;

async function CompaniesContent() {
  await requireOwnerPage();
  const companies = await listCompanies();
  const counts = { active: 0, low_freq: 0, paused: 0 };
  for (const c of companies) counts[c.watchStatus]++;

  return (
    <div className="space-y-4">
      <Card>
        <h2 className="mb-3 text-sm font-semibold text-navy">Watch a company</h2>
        <ActionForm action={addCompanyAction} resetOnSuccess className="grid items-end gap-3 md:grid-cols-[minmax(0,1.3fr)_10rem_minmax(0,1fr)_minmax(0,1.3fr)_auto]">
          <label className={labelClass}>
            Company name
            <input name="name" placeholder="e.g. Acme" required className={inputClass} />
          </label>
          <label className={labelClass}>
            Board type
            <Select
              name="ats"
              label="ATS"
              options={[
                { value: "greenhouse", label: "Greenhouse" },
                { value: "lever", label: "Lever" },
                { value: "ashby", label: "Ashby" },
              ]}
            />
          </label>
          <label className={labelClass}>
            Board token
            <input name="board_token" placeholder="acme" required pattern="[a-z0-9-]{1,64}" className={cx(inputClass, "font-mono")} />
          </label>
          <label className={labelClass}>
            Careers page (optional)
            <input name="careers_url" placeholder="https://..." className={inputClass} />
          </label>
          <SubmitButton className={cx(btn.base, btn.primary)}>Add company</SubmitButton>
        </ActionForm>
        <p className="mt-2 text-xs text-muted">The token is the slug in the board URL: boards.greenhouse.io/acme, jobs.lever.co/acme, jobs.ashbyhq.com/acme.</p>
      </Card>

      <p className="text-xs text-muted">
        {companies.length} companies · {counts.active} active · {counts.low_freq} low frequency · {counts.paused} paused
      </p>
      <div className="overflow-x-auto rounded-xl border border-border bg-surface shadow-card">
        <table className="w-full min-w-[760px] text-left">
          <thead className="border-b border-border bg-subtle text-xs font-semibold uppercase tracking-wide text-muted">
            <tr>
              <th className="px-4 py-3">Company</th>
              <th className="px-4 py-3">Board</th>
              <th className="px-4 py-3">Source</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Last polled</th>
              <th className="px-4 py-3">Last relevant job</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {companies.map((c) => (
              <tr key={c.id} className="hover:bg-subtle/60">
                <td className="px-4 py-3 font-medium">
                  {c.name} {c.isDream ? <Badge tone="violet">dream</Badge> : null}
                </td>
                <td className="px-4 py-3 font-mono text-xs">
                  {c.ats}/{c.boardToken}
                </td>
                <td className="px-4 py-3 text-xs text-muted">{c.source}</td>
                <td className="px-4 py-3">
                  <Badge tone={STATUS_TONE[c.watchStatus]}>{c.watchStatus.replace("_", " ")}</Badge>
                </td>
                <td className="px-4 py-3 text-xs text-muted">{fmtRelative(c.lastPolledAt)}</td>
                <td className="px-4 py-3 text-xs text-muted">{fmtDate(c.lastRelevantJobAt)}</td>
                <td className="px-4 py-3">
                  <div className="flex justify-end gap-1">
                    <ActionForm action={updateCompanyAction.bind(null, c.id, { isDream: !c.isDream })}>
                      <SubmitButton className={cx(btn.base, btn.ghost)}>{c.isDream ? "Undream" : "Dream"}</SubmitButton>
                    </ActionForm>
                    <ActionForm action={updateCompanyAction.bind(null, c.id, { watchStatus: c.watchStatus === "paused" ? "active" : "paused" })}>
                      <SubmitButton className={cx(btn.base, btn.ghost)}>{c.watchStatus === "paused" ? "Resume" : "Pause"}</SubmitButton>
                    </ActionForm>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
