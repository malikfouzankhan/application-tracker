import Link from "next/link";
import { Suspense } from "react";
import { dismissPackAction, feedbackAction, markAppliedAction } from "@/actions/applications";
import { approveVariantAction } from "@/actions/library";
import { outreachStatusAction } from "@/actions/misc";
import { ActionForm, SubmitButton } from "@/components/client/action-form";
import { CopyButton } from "@/components/client/copy-button";
import { Markdown } from "@/components/markdown";
import {
  Badge,
  Card,
  Empty,
  ExternalLink,
  Loading,
  PageHeader,
  RemoteBadge,
  ScamFlags,
  Stat,
  TierBadge,
  btn,
  selectInline,
  cx,
  inputClass,
} from "@/components/ui";
import { appChannelValues } from "@/db/enums";
import { requireOwnerPage } from "@/lib/auth";
import { todayIst } from "@/lib/dates";
import { fmtDate, fmtRelative, humanize } from "@/lib/format";
import { getApplicationFollowUpsDue, getPackCards, getPipelineCounts } from "@/services/applications";
import { getDigest } from "@/services/digest";
import { getOutreachFollowUpsDue } from "@/services/outreach";

export const metadata = { title: "Today" };

export default function TodayPage() {
  return (
    <>
      <PageHeader title="Today" description="Review the packs Claude prepared, apply, then send outreach." />
      <Suspense fallback={<Loading />}>
        <TodayContent />
      </Suspense>
    </>
  );
}

type Pack = Awaited<ReturnType<typeof getPackCards>>[number];

async function TodayContent() {
  await requireOwnerPage();
  const now = new Date();
  const [digest, packs, appFollowUps, outreachFollowUps, pipeline] = await Promise.all([
    getDigest(todayIst(now)),
    getPackCards(),
    getApplicationFollowUpsDue(now),
    getOutreachFollowUpsDue(now),
    getPipelineCounts(),
  ]);
  const inFlight = (pipeline.applied ?? 0) + (pipeline.oa ?? 0) + (pipeline.ghosted ?? 0);
  const followUps = appFollowUps.length + outreachFollowUps.length;

  return (
    <div className="space-y-8">
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label="Ready to apply" value={packs.length} hint={`${packs.filter((p) => p.isNew).length} new today`} />
        <Stat label="Waiting to hear back" value={inFlight} hint="applied, OA or ghosted" />
        <Stat label="Interviewing" value={(pipeline.interviewing ?? 0) + (pipeline.offer ?? 0)} hint="incl. offers" />
        <Stat label="Follow-ups due" value={followUps} hint={followUps ? "see the right column" : "all clear"} />
      </div>

      <div className="grid items-start gap-8 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <section className="min-w-0 space-y-5">
          <h2 className="text-sm font-semibold text-navy">Application packs</h2>
          {packs.length ? packs.map((pack) => <PackCard key={pack.application.id} pack={pack} />) : <Empty>Nothing to apply to right now.</Empty>}
        </section>

        <aside className="space-y-5 xl:sticky xl:top-10">
          <Card>
            <h2 className="mb-3 text-sm font-semibold text-navy">Today&apos;s digest</h2>
            {digest ? (
              <div className="text-sm text-ink">
                <Markdown>{digest.summaryMd}</Markdown>
              </div>
            ) : (
              <p className="text-sm text-muted">No digest yet. Claude&apos;s routine runs at 06:30 IST.</p>
            )}
          </Card>

          <Card>
            <h2 className="mb-3 text-sm font-semibold text-navy">Follow-ups due</h2>
            {followUps ? (
              <ul className="-mx-2 space-y-1">
                {appFollowUps.map((f) => (
                  <li key={f.id}>
                    <Link href={`/applications/${f.id}`} className="block rounded-lg px-2 py-2 hover:bg-subtle">
                      <span className="flex items-center justify-between gap-2">
                        <span className="font-medium text-ink">{f.companyName}</span>
                        <Badge tone="amber">{fmtRelative(f.nextActionAt)}</Badge>
                      </span>
                      <span className="block text-xs text-muted">{f.nextAction ?? f.title}</span>
                    </Link>
                  </li>
                ))}
                {outreachFollowUps.map((f) => (
                  <li key={f.id}>
                    <Link href="/outreach" className="block rounded-lg px-2 py-2 hover:bg-subtle">
                      <span className="flex items-center justify-between gap-2">
                        <span className="font-medium text-ink">{f.contactName ?? "Contact"}</span>
                        <Badge tone="amber">{fmtRelative(f.followUpAt)}</Badge>
                      </span>
                      <span className="block text-xs text-muted">
                        Follow up on {humanize(f.channel)} · {f.companyName}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted">Nothing due.</p>
            )}
          </Card>
        </aside>
      </div>
    </div>
  );
}

function PackCard({ pack }: { pack: Pack }) {
  const { application: app, job, assessment, variant, answers, isNew } = pack;

  return (
    <article className="overflow-hidden rounded-xl border border-border bg-surface shadow-card">
      <header className="flex flex-wrap items-start justify-between gap-4 border-b border-border px-6 py-5">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <Link href={`/applications/${app.id}`} className="text-lg font-semibold text-ink hover:text-navy">
              {job.companyName}
            </Link>
            {isNew ? <Badge tone="blue">new</Badge> : <Badge>since {fmtDate(app.createdAt)}</Badge>}
            <ScamFlags flags={job.scamFlags} />
          </div>
          <p className="mt-0.5 text-base text-ink">{job.title}</p>
          <p className="mt-1 flex flex-wrap items-center gap-2 text-sm text-muted">
            <span>{job.locationRaw ?? "Location not stated"}</span>
            <RemoteBadge type={job.remoteType} />
            {job.expMin !== null ? (
              <span>
                · {job.expMin}
                {job.expMax !== null ? `-${job.expMax}` : "+"} yrs
              </span>
            ) : null}
          </p>
        </div>
        <div className="flex flex-col items-end gap-2">
          <TierBadge tier={assessment?.tier} score={assessment?.fitScore} />
          <div className="flex gap-3 text-sm">
            <ExternalLink href={job.url}>Job posting</ExternalLink>
            {variant ? (
              <a href={`/r/${variant.id}`} target="_blank" rel="noopener" className="font-medium text-navy underline decoration-mist underline-offset-2 hover:decoration-navy">
                Resume{variant.status === "draft" ? " (draft)" : ""}
              </a>
            ) : null}
          </div>
        </div>
      </header>

      <div className="grid gap-6 px-6 py-5 lg:grid-cols-2">
        <div className="space-y-2 text-sm">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted">Why it fits</h3>
          {assessment ? (
            <>
              <p className="text-ink">{assessment.reasons}</p>
              {assessment.justifyNote ? (
                <p className="rounded-lg bg-sky px-3 py-2 text-navy">
                  <span className="font-medium">How to justify: </span>
                  {assessment.justifyNote}
                </p>
              ) : null}
              {assessment.risks ? (
                <p className="rounded-lg bg-amber-50 px-3 py-2 text-amber-900">
                  <span className="font-medium">Risks: </span>
                  {assessment.risks}
                </p>
              ) : null}
            </>
          ) : (
            <p className="text-muted">Not assessed.</p>
          )}
        </div>

        <div className="space-y-3">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted">Screening answers</h3>
          {answers.length || app.coverNote ? (
            <>
              {answers.map((a) => (
                <div key={a.id} className="rounded-lg border border-border px-3 py-2.5">
                  <div className="flex items-start justify-between gap-3">
                    <p className="text-xs font-medium text-muted">{a.question}</p>
                    <CopyButton text={a.answer} />
                  </div>
                  <p className="mt-1 whitespace-pre-wrap text-sm text-ink">{a.answer}</p>
                </div>
              ))}
              {app.coverNote ? (
                <div className="rounded-lg border border-border px-3 py-2.5">
                  <div className="flex items-start justify-between gap-3">
                    <p className="text-xs font-medium text-muted">Cover note</p>
                    <CopyButton text={app.coverNote} />
                  </div>
                  <p className="mt-1 whitespace-pre-wrap text-sm text-ink">{app.coverNote}</p>
                </div>
              ) : null}
            </>
          ) : (
            <p className="text-sm text-muted">No questions for this one.</p>
          )}
        </div>
      </div>

      {pack.outreach.length ? (
        <div className="space-y-3 border-t border-border px-6 py-5">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted">Outreach draft</h3>
          {pack.outreach.map(({ outreach: o, contactName, contactRole, contactUrl }) => (
            <div key={o.id} className="rounded-lg bg-subtle px-4 py-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm text-muted">
                  {humanize(o.channel)} to{" "}
                  {contactUrl ? <ExternalLink href={contactUrl}>{contactName}</ExternalLink> : <span className="text-ink">{contactName}</span>}
                  {contactRole ? ` · ${contactRole}` : ""}
                </p>
                <div className="flex gap-2">
                  <CopyButton text={o.message} label="Copy message" />
                  <ActionForm action={outreachStatusAction.bind(null, o.id, "sent")}>
                    <SubmitButton className={cx(btn.base, btn.secondary, btn.small)}>Mark sent</SubmitButton>
                  </ActionForm>
                </div>
              </div>
              <p className="mt-2 whitespace-pre-wrap text-sm text-ink">{o.message}</p>
            </div>
          ))}
        </div>
      ) : null}

      <footer className="flex flex-wrap items-start gap-3 border-t border-border bg-subtle px-6 py-4">
        {variant?.status === "draft" ? (
          <ActionForm action={approveVariantAction.bind(null, variant.id)}>
            <SubmitButton className={cx(btn.base, btn.secondary)} pendingLabel="Approving…">
              Approve resume
            </SubmitButton>
          </ActionForm>
        ) : null}
        <ActionForm action={markAppliedAction.bind(null, app.id)} className="flex flex-wrap gap-2">
          <select name="channel" defaultValue="careers_page" className={selectInline} aria-label="Applied via">
            {appChannelValues.map((c) => (
              <option key={c} value={c}>
                via {humanize(c)}
              </option>
            ))}
          </select>
          <SubmitButton className={cx(btn.base, btn.primary)}>Mark applied</SubmitButton>
        </ActionForm>
        <ActionForm action={dismissPackAction.bind(null, app.id)} confirm="Dismiss this job? The application is withdrawn.">
          <SubmitButton className={cx(btn.base, btn.ghost)}>Dismiss</SubmitButton>
        </ActionForm>
        <div className="ml-auto flex gap-2">
          <FeedbackForm jobId={job.id} verdict="up" />
          <FeedbackForm jobId={job.id} verdict="down" />
        </div>
      </footer>
    </article>
  );
}

function FeedbackForm({ jobId, verdict }: { jobId: string; verdict: "up" | "down" }) {
  return (
    <details className="relative">
      <summary className={cx(btn.base, btn.secondary, "cursor-pointer list-none")} aria-label={verdict === "up" ? "Good match" : "Bad match"}>
        <svg viewBox="0 0 24 24" className={cx("h-4 w-4", verdict === "down" && "rotate-180")} fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M7 11v9H4v-9zM7 11l4-8a2 2 0 0 1 2.5 2.4L13 10h5.5a2 2 0 0 1 2 2.3l-1.2 6A2 2 0 0 1 17.3 20H7" />
        </svg>
      </summary>
      <ActionForm
        action={feedbackAction.bind(null, jobId, verdict)}
        resetOnSuccess
        className="absolute bottom-full right-0 z-10 mb-2 flex w-72 flex-wrap gap-2 rounded-xl border border-border bg-surface p-3 shadow-card"
      >
        <input name="reason" placeholder={verdict === "up" ? "What made it good? (optional)" : "What was off? (optional)"} maxLength={500} className={inputClass} />
        <SubmitButton className={cx(btn.base, btn.primary, btn.small)}>Send feedback</SubmitButton>
      </ActionForm>
    </details>
  );
}
