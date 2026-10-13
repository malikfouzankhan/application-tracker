import Link from "next/link";
import { Suspense } from "react";
import { createManualApplicationAction } from "@/actions/applications";
import { ActionForm, SubmitButton } from "@/components/client/action-form";
import { Select } from "@/components/client/select";
import { Card, Loading, PageHeader, btn, cx, inputClass, labelClass } from "@/components/ui";
import { appChannelValues, appStatusValues, archetypeValues, jobSourceValues, remoteTypeValues, tierValues } from "@/db/enums";
import { requireOwnerPage } from "@/lib/auth";
import { humanize } from "@/lib/format";

// The form itself has no server data; the owner check still gates it, and the action checks again.

export const metadata = { title: "Add application" };

const SOURCE_LABELS: Record<string, string> = {
  manual: "Somewhere else (LinkedIn, Naukri, referral...)",
  gmail_alert: "Job alert email",
  greenhouse: "Greenhouse board",
  lever: "Lever board",
  ashby: "Ashby board",
  hn: "Hacker News",
  feed: "Job feed",
};

const options = (values: readonly string[]) => values.map((v) => ({ value: v, label: humanize(v) }));

function Field({ label, hint, children, wide = false }: { label: string; hint?: string; children: React.ReactNode; wide?: boolean }) {
  return (
    <label className={cx(labelClass, wide && "md:col-span-2")}>
      {label}
      {children}
      {hint ? <span className="font-normal text-muted/80">{hint}</span> : null}
    </label>
  );
}

function Section({ title, description, children }: { title: string; description: string; children: React.ReactNode }) {
  return (
    <Card className="grid gap-6 p-6 lg:grid-cols-[16rem_minmax(0,1fr)]">
      <div>
        <h2 className="font-semibold text-ink">{title}</h2>
        <p className="mt-1 text-sm text-muted">{description}</p>
      </div>
      <div className="grid gap-4 md:grid-cols-2">{children}</div>
    </Card>
  );
}

export default function NewApplicationPage() {
  return (
    <>
      <Link href="/applications" className="text-sm text-muted hover:text-navy">
        ← Applications
      </Link>
      <div className="mt-2">
        <PageHeader title="Add application" description="Track an application you made outside this app, so it shows up in your pipeline, follow-ups and stats." />
      </div>

      <Suspense fallback={<Loading />}>
        <NewApplicationForm />
      </Suspense>
    </>
  );
}

async function NewApplicationForm() {
  await requireOwnerPage();
  return (
    <ActionForm action={createManualApplicationAction} className="space-y-5">
      <Section title="Job" description="What you applied to. Only company and role are required.">
        <Field label="Company *">
          <input name="company" required maxLength={200} placeholder="e.g. Hevo Data" className={inputClass} />
        </Field>
        <Field label="Role *">
          <input name="title" required maxLength={300} placeholder="e.g. SDE I" className={inputClass} />
        </Field>
        <Field label="Job posting link" hint="Leave empty for referrals without a link." wide>
          <input name="url" type="url" maxLength={2048} placeholder="https://..." className={inputClass} />
        </Field>
        <Field label="Location">
          <input name="location" maxLength={300} placeholder="e.g. Bengaluru, India" className={inputClass} />
        </Field>
        <Field label="Work mode">
          <Select name="remote_type" defaultValue="unknown" options={options(remoteTypeValues)} />
        </Field>
        <Field label="Where you found it">
          <Select name="source" defaultValue="manual" options={jobSourceValues.map((v) => ({ value: v, label: SOURCE_LABELS[v] ?? humanize(v) }))} />
        </Field>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Experience asked, min (yrs)">
            <input name="exp_min" type="number" min={0} max={30} className={inputClass} />
          </Field>
          <Field label="Max (yrs)">
            <input name="exp_max" type="number" min={0} max={30} className={inputClass} />
          </Field>
        </div>
        <Field label="Job description" hint="Optional. Paste it to keep a copy; stored as plain text." wide>
          <textarea name="description" rows={5} maxLength={50000} className={inputClass} />
        </Field>
      </Section>

      <Section title="Application" description="Where it stands now. Moving it later works like any other application.">
        <Field label="Status *">
          <Select name="status" defaultValue="applied" options={options(appStatusValues)} />
        </Field>
        <Field label="Applied via">
          <Select name="channel" anyLabel="Not set" defaultValue="careers_page" options={options(appChannelValues)} />
        </Field>
        <Field label="Applied on" hint="Defaults to today when the status is past ready.">
          <input name="applied_on" type="date" className={inputClass} />
        </Field>
        <Field label="Next action">
          <input name="next_action" maxLength={300} placeholder="e.g. Follow up with the recruiter" className={inputClass} />
        </Field>
        <Field label="Next action due (IST)">
          <input name="next_action_at" type="datetime-local" className={inputClass} />
        </Field>
        <Field label="Notes" wide>
          <textarea name="notes" rows={3} maxLength={5000} placeholder="Referral from..., salary discussed..., etc." className={inputClass} />
        </Field>
      </Section>

      <Section title="Assessment (optional)" description="Your own read of the fit, so stats by tier and archetype include this application.">
        <Field label="Tier">
          <Select name="tier" anyLabel="Not set" options={options(tierValues)} />
        </Field>
        <Field label="Fit score (0-100)" hint="Defaults by tier when empty.">
          <input name="fit_score" type="number" min={0} max={100} className={inputClass} />
        </Field>
        <Field label="Resume type (archetype)">
          <Select name="archetype" anyLabel="Not set" options={options(archetypeValues)} />
        </Field>
      </Section>

      <div className="flex items-center justify-end gap-3">
        <Link href="/applications" className={cx(btn.base, btn.ghost)}>
          Cancel
        </Link>
        <SubmitButton className={cx(btn.base, btn.primary, "px-5")} pendingLabel="Saving…">
          Add application
        </SubmitButton>
      </div>
    </ActionForm>
  );
}
