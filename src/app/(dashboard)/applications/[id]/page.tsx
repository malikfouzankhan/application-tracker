import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { changeStatusAction, saveNotesAction, updateAnswerAction } from "@/actions/applications";
import { outreachStatusAction } from "@/actions/misc";
import { ActionForm, SubmitButton } from "@/components/client/action-form";
import { Select } from "@/components/client/select";
import { CopyButton } from "@/components/client/copy-button";
import {
  Badge,
  Card,
  ExternalLink,
  ExternalText,
  Loading,
  RemoteBadge,
  ScamFlags,
  SectionTitle,
  StatusBadge,
  TierBadge,
  btn,
  cx,
  inputClass,
} from "@/components/ui";
import { VariantReview } from "@/components/variant-review";
import { appChannelValues, appStatusValues } from "@/db/enums";
import { requireOwnerPage } from "@/lib/auth";
import { isAppError } from "@/lib/errors";
import { fmtDate, fmtDateTime, humanize } from "@/lib/format";
import { APP_TRANSITIONS, type AppStatus } from "@/lib/state-machine";
import { getApplication } from "@/services/applications";
import { getVariantForRender } from "@/services/resume";

export const metadata = { title: "Application" };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default function ApplicationPage({ params }: PageProps<"/applications/[id]">) {
  return (
    <Suspense fallback={<Loading />}>
      <ApplicationContent params={params} />
    </Suspense>
  );
}

async function ApplicationContent({ params }: { params: PageProps<"/applications/[id]">["params"] }) {
  await requireOwnerPage();
  const { id } = await params;
  if (!UUID_RE.test(id)) notFound();

  let data: Awaited<ReturnType<typeof getApplication>>;
  try {
    data = await getApplication(id);
  } catch (error) {
    if (isAppError(error) && error.code === "NOT_FOUND") notFound();
    throw error;
  }
  const { application: app, job, assessment, answers, events, outreach } = data;
  const review = app.resumeVariantId ? await getVariantForRender(app.resumeVariantId) : null;
  const allowedNext = APP_TRANSITIONS[app.status as AppStatus];

  return (
    <div className="space-y-5">
      <div>
        <Link href="/applications" className="text-xs text-muted hover:text-foreground">
          ← Applications
        </Link>
        <div className="mt-1 flex flex-wrap items-center gap-2">
          <h1 className="text-2xl font-semibold tracking-tight text-ink">{job.companyName}</h1>
          <StatusBadge status={app.status} />
          <TierBadge tier={assessment?.tier} score={assessment?.fitScore} />
          {app.archived ? <Badge>archived</Badge> : null}
          <ScamFlags flags={job.scamFlags} />
        </div>
        <p className="text-base text-ink">{job.title}</p>
        <p className="text-xs text-muted">
          {job.locationRaw ?? "Location not stated"} <RemoteBadge type={job.remoteType} /> · {humanize(job.source)} · seen{" "}
          {fmtDate(job.firstSeenAt)}
          {app.appliedAt ? ` · applied ${fmtDate(app.appliedAt)}${app.channel ? ` via ${humanize(app.channel)}` : ""}` : ""} ·{" "}
          {job.url.startsWith("http") ? <ExternalLink href={job.url}>Job posting</ExternalLink> : <span>No posting link</span>}
        </p>
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        <div className="space-y-5 lg:col-span-2">
          {assessment ? (
            <Card>
              <SectionTitle>Assessment</SectionTitle>
              <p>{assessment.reasons}</p>
              {assessment.justifyNote ? <p className="mt-1 text-muted">Justify: {assessment.justifyNote}</p> : null}
              {assessment.risks ? <p className="mt-1 text-amber-700">Risks: {assessment.risks}</p> : null}
              <p className="mt-2 text-xs text-muted">
                Archetype {assessment.archetype} · {assessment.recommended ? "recommended" : "not recommended"}
              </p>
            </Card>
          ) : null}

          {review ? (
            <Card>
              <SectionTitle>Resume</SectionTitle>
              <VariantReview review={review} />
            </Card>
          ) : null}

          {answers.length || app.coverNote ? (
            <Card>
              <SectionTitle>Screening answers</SectionTitle>
              <div className="space-y-3">
                {answers.map((a) => (
                  <ActionForm key={a.id} action={updateAnswerAction.bind(null, a.id)} className="space-y-1">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-xs font-medium text-muted">
                        {a.question} {a.source === "user" ? <Badge>edited</Badge> : null}
                      </p>
                      <CopyButton text={a.answer} />
                    </div>
                    <textarea name="answer" defaultValue={a.answer} rows={3} maxLength={2000} className={inputClass} />
                    <SubmitButton className={cx(btn.base, btn.secondary)}>Save</SubmitButton>
                  </ActionForm>
                ))}
                {app.coverNote ? (
                  <div>
                    <div className="flex items-center justify-between">
                      <p className="text-xs font-medium text-muted">Cover note</p>
                      <CopyButton text={app.coverNote} />
                    </div>
                    <p className="whitespace-pre-wrap">{app.coverNote}</p>
                  </div>
                ) : null}
              </div>
            </Card>
          ) : null}

          {outreach.length ? (
            <Card>
              <SectionTitle>Outreach</SectionTitle>
              <div className="space-y-3">
                {outreach.map(({ outreach: o, contactName, contactRole, contactUrl }) => (
                  <div key={o.id} className="rounded-lg border border-border p-4">
                    <div className="flex flex-wrap items-center gap-2 text-xs">
                      <StatusBadge status={o.status} />
                      <span>
                        {humanize(o.channel)} to {contactUrl ? <ExternalLink href={contactUrl}>{contactName}</ExternalLink> : contactName}
                        {contactRole ? ` (${contactRole})` : ""}
                      </span>
                      <CopyButton text={o.message} label="Copy message" />
                      <OutreachButtons id={o.id} status={o.status} />
                    </div>
                    <p className="mt-2 whitespace-pre-wrap">{o.message}</p>
                    {o.note ? <p className="mt-1 text-xs text-muted">Note: {o.note}</p> : null}
                  </div>
                ))}
              </div>
            </Card>
          ) : null}

          <Card>
            <SectionTitle>Job description</SectionTitle>
            {job.descriptionText ? (
              <ExternalText text={job.descriptionText} className="max-h-[32rem] overflow-y-auto text-sm leading-relaxed" />
            ) : (
              <p className="text-muted">No description stored.</p>
            )}
          </Card>
        </div>

        <div className="space-y-5">
          <Card>
            <SectionTitle>Change status</SectionTitle>
            <ActionForm action={changeStatusAction.bind(null, app.id)} className="space-y-2">
              <Select
                name="status"
                label="New status"
                defaultValue={allowedNext[0]}
                options={[
                  ...allowedNext.map((s) => ({ value: s, label: humanize(s) })),
                  ...appStatusValues
                    .filter((s) => s !== app.status && !allowedNext.includes(s))
                    .map((s) => ({ value: s, label: `${humanize(s)} (override)` })),
                ]}
              />
              <Select
                name="channel"
                label="Applied via"
                anyLabel="Applied via (if applied)"
                options={appChannelValues.map((c) => ({ value: c, label: humanize(c) }))}
              />
              <input name="note" placeholder="Note (optional)" maxLength={500} className={inputClass} />
              <input name="next_action" placeholder="Next action" defaultValue={app.nextAction ?? ""} maxLength={300} className={inputClass} />
              <label className="block text-xs text-muted">
                Due (IST)
                <input type="datetime-local" name="next_action_at" className={inputClass} />
              </label>
              <SubmitButton className={cx(btn.base, btn.primary, "w-full")}>Update</SubmitButton>
              <p className="text-xs text-muted">Moves outside the normal flow are allowed here and logged as manual overrides.</p>
            </ActionForm>
          </Card>

          <Card>
            <SectionTitle>Notes</SectionTitle>
            <ActionForm action={saveNotesAction.bind(null, app.id)} className="space-y-2">
              <textarea name="notes" defaultValue={app.notes ?? ""} rows={5} maxLength={5000} className={inputClass} />
              <SubmitButton className={cx(btn.base, btn.secondary)}>Save notes</SubmitButton>
            </ActionForm>
          </Card>

          <Card>
            <SectionTitle>History</SectionTitle>
            <ol className="space-y-2 border-l border-border pl-3">
              {events.map((e) => (
                <li key={e.id} className="text-xs">
                  <p>
                    {e.fromStatus ? `${humanize(e.fromStatus)} → ` : ""}
                    <span className="font-medium">{humanize(e.toStatus)}</span>
                    <span className="text-muted"> · {e.actor}</span>
                  </p>
                  <p className="text-muted">{fmtDateTime(e.createdAt)}</p>
                  {e.note ? <p className="mt-0.5">{e.note}</p> : null}
                </li>
              ))}
            </ol>
          </Card>
        </div>
      </div>
    </div>
  );
}

function OutreachButtons({ id, status }: { id: string; status: string }) {
  const next = status === "drafted" ? ["sent"] : status === "sent" ? ["replied", "no_reply"] : status === "no_reply" ? ["replied"] : [];
  return (
    <span className="ml-auto flex gap-1">
      {next.map((s) => (
        <ActionForm key={s} action={outreachStatusAction.bind(null, id, s)}>
          <SubmitButton className={cx(btn.base, btn.secondary)}>Mark {humanize(s)}</SubmitButton>
        </ActionForm>
      ))}
    </span>
  );
}
