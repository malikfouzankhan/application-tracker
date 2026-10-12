import Link from "next/link";
import { Suspense } from "react";
import { outreachStatusAction } from "@/actions/misc";
import { ActionForm, SubmitButton } from "@/components/client/action-form";
import { CopyButton } from "@/components/client/copy-button";
import { Badge, Card, Empty, ExternalLink, Loading, PageHeader, SectionTitle, StatusBadge, btn, cx, inputClass } from "@/components/ui";
import { requireOwnerPage } from "@/lib/auth";
import { fmtDate, fmtRelative, humanize } from "@/lib/format";
import { listOutreach } from "@/services/outreach";

export const metadata = { title: "Outreach" };

export default function OutreachPage() {
  return (
    <>
      <PageHeader title="Outreach" description="Drafts to send by hand, and replies to track. Nothing is sent from here." />
      <Suspense fallback={<Loading />}>
        <OutreachContent />
      </Suspense>
    </>
  );
}

type Row = Awaited<ReturnType<typeof listOutreach>>[number];

async function OutreachContent() {
  await requireOwnerPage();
  const rows = await listOutreach({ limit: 300 });
  const due = rows.filter((r) => r.followUpDue);
  const groups: [string, Row[]][] = [
    ["Drafted", rows.filter((r) => r.outreach.status === "drafted")],
    ["Sent", rows.filter((r) => r.outreach.status === "sent")],
    ["Replied", rows.filter((r) => r.outreach.status === "replied")],
    ["No reply", rows.filter((r) => r.outreach.status === "no_reply")],
  ];

  if (rows.length === 0) return <Empty>No outreach yet. Claude drafts messages for fit-tier jobs.</Empty>;

  return (
    <div>
      {due.length ? (
        <>
          <SectionTitle>Follow-ups due</SectionTitle>
          <div className="space-y-2">
            {due.map((r) => (
              <OutreachCard key={`due-${r.outreach.id}`} row={r} />
            ))}
          </div>
        </>
      ) : null}
      {groups.map(([label, list]) =>
        list.length ? (
          <div key={label}>
            <SectionTitle aside={<span className="text-xs text-muted">{list.length}</span>}>{label}</SectionTitle>
            <div className="space-y-2">
              {list.map((r) => (
                <OutreachCard key={r.outreach.id} row={r} />
              ))}
            </div>
          </div>
        ) : null,
      )}
    </div>
  );
}

function OutreachCard({ row }: { row: Row }) {
  const { outreach: o, contact, job } = row;
  const next = o.status === "drafted" ? ["sent"] : o.status === "sent" ? ["replied", "no_reply"] : o.status === "no_reply" ? ["replied"] : [];
  return (
    <Card className="p-3">
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <StatusBadge status={o.status} />
        <span className="font-medium">
          {contact?.publicProfileUrl ? <ExternalLink href={contact.publicProfileUrl}>{contact.name}</ExternalLink> : (contact?.name ?? "Contact")}
        </span>
        {contact?.role ? <span className="text-muted">{contact.role}</span> : null}
        <span className="text-muted">
          · {job.companyName}, {job.title} · {humanize(o.channel)}
        </span>
        {o.sentAt ? <span className="text-muted">· sent {fmtDate(o.sentAt)}</span> : null}
        {o.followUpAt && o.status === "sent" ? <Badge tone="amber">follow up {fmtRelative(o.followUpAt)}</Badge> : null}
        <Link href={`/applications?q=${encodeURIComponent(job.companyName)}`} className="ml-auto text-accent hover:underline">
          Application
        </Link>
      </div>
      <p className="mt-2 whitespace-pre-wrap">{o.message}</p>
      {o.note ? <p className="mt-1 text-xs text-muted">Note: {o.note}</p> : null}
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <CopyButton text={o.message} label="Copy message" />
        {next.map((s) => (
          <ActionForm key={s} action={outreachStatusAction.bind(null, o.id, s)} className="flex gap-1">
            {s !== "sent" ? <input name="note" placeholder="Note" maxLength={500} className={cx(inputClass, "w-40 py-1 text-xs")} /> : null}
            <SubmitButton className={cx(btn.base, btn.secondary)}>Mark {humanize(s)}</SubmitButton>
          </ActionForm>
        ))}
      </div>
    </Card>
  );
}
