import { Suspense } from "react";
import {
  createClaimAction,
  saveBaseResumeAction,
  setClaimActiveAction,
  setClaimVerifiedAction,
  updateClaimAction,
} from "@/actions/library";
import { ActionForm, SubmitButton } from "@/components/client/action-form";
import { Select } from "@/components/client/select";
import { Badge, Card, Empty, Loading, PageHeader, SectionTitle, btn, cx, inputBase, inputClass } from "@/components/ui";
import { VariantReview } from "@/components/variant-review";
import type { claims as claimsTable } from "@/db/schema";
import { archetypeValues, claimKindValues } from "@/db/enums";
import { requireOwnerPage } from "@/lib/auth";
import { fmtDate, humanize } from "@/lib/format";
import { getVariantForRender, listBaseResumes, listClaims, listDraftVariants } from "@/services/resume";

export const metadata = { title: "Library" };

type Claim = typeof claimsTable.$inferSelect;

export default function LibraryPage() {
  return (
    <>
      <PageHeader
        title="Library"
        description="Verified facts are the only thing Claude can put on a resume. Verify each claim, shape the base resumes, approve tailored variants."
      />
      <Suspense fallback={<Loading />}>
        <LibraryContent />
      </Suspense>
    </>
  );
}

async function LibraryContent() {
  await requireOwnerPage();
  const [drafts, claims, bases] = await Promise.all([listDraftVariants(), listClaims({ includeInactive: true }), listBaseResumes()]);
  const reviews = await Promise.all(drafts.map((d) => getVariantForRender(d.id)));
  const unverified = claims.filter((c) => !c.verified && c.active).length;

  return (
    <div>
      <SectionTitle aside={<span className="text-xs text-muted">{drafts.length}</span>}>Variants awaiting approval</SectionTitle>
      {drafts.length ? (
        <div className="space-y-3">
          {drafts.map((d, i) => (
            <Card key={d.id}>
              <p className="mb-2 font-medium">
                {d.companyName} · {d.title} <span className="text-xs font-normal text-muted">drafted {fmtDate(d.createdAt)}</span>
              </p>
              <VariantReview review={reviews[i]} />
            </Card>
          ))}
        </div>
      ) : (
        <Empty>No drafts waiting.</Empty>
      )}

      <SectionTitle
        aside={
          <span className="text-xs text-muted">
            {claims.length} claims{unverified ? ` · ${unverified} unverified` : ""}
          </span>
        }
      >
        Claims
      </SectionTitle>
      <div className="space-y-4">
        {claimKindValues.map((kind) => {
          const ofKind = claims.filter((c) => c.kind === kind);
          if (!ofKind.length) return null;
          return (
            <div key={kind}>
              <p className="mb-1 text-xs font-medium capitalize text-muted">{humanize(kind)}</p>
              <Card className="divide-y divide-border overflow-hidden p-0">
                {ofKind.map((c) => (
                  <ClaimRow key={c.id} claim={c} />
                ))}
              </Card>
            </div>
          );
        })}
        <details className="rounded-xl border border-border bg-surface shadow-card p-3">
          <summary className="cursor-pointer text-xs font-medium">Add a claim</summary>
          <ActionForm action={createClaimAction} resetOnSuccess className="mt-3">
            <ClaimFields />
            <SubmitButton className={cx(btn.base, btn.primary, "mt-2")}>Add claim</SubmitButton>
          </ActionForm>
        </details>
      </div>

      <SectionTitle>Base resumes</SectionTitle>
      <div className="space-y-3">
        {archetypeValues.map((archetype) => (
          <BaseResumeEditor key={archetype} archetype={archetype} base={bases.find((b) => b.archetype === archetype)} claims={claims.filter((c) => c.active && c.kind !== "skill" && c.kind !== "summary")} />
        ))}
      </div>
    </div>
  );
}

function ClaimRow({ claim: c }: { claim: Claim }) {
  return (
    <div className={cx("p-3", !c.active && "opacity-50")}>
      <div className="flex flex-wrap items-start gap-2">
        <div className="min-w-0 flex-1">
          <p className="text-xs text-muted">
            {[c.role, c.entity, c.context, c.dateLabel].filter(Boolean).join(" · ")}
            {c.tags.length ? ` · ${c.tags.join(", ")}` : ""}
          </p>
          <p>{c.text}</p>
          {c.metrics ? <p className="text-xs text-muted">Metrics: {c.metrics}</p> : null}
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {c.verified ? <Badge tone="green">verified</Badge> : <Badge tone="amber">unverified</Badge>}
          <ActionForm action={setClaimVerifiedAction.bind(null, c.id, !c.verified)}>
            <SubmitButton className={cx(btn.base, c.verified ? btn.ghost : btn.primary)}>{c.verified ? "Unverify" : "Verify"}</SubmitButton>
          </ActionForm>
          <ActionForm action={setClaimActiveAction.bind(null, c.id, !c.active)}>
            <SubmitButton className={cx(btn.base, btn.ghost)}>{c.active ? "Retire" : "Restore"}</SubmitButton>
          </ActionForm>
        </div>
      </div>
      <details className="mt-1">
        <summary className="cursor-pointer text-xs text-muted">Edit</summary>
        <ActionForm action={updateClaimAction.bind(null, c.id)} className="mt-2">
          <ClaimFields claim={c} />
          <SubmitButton className={cx(btn.base, btn.secondary, "mt-2")}>Save (resets verification)</SubmitButton>
        </ActionForm>
      </details>
    </div>
  );
}

function ClaimFields({ claim: c }: { claim?: Claim }) {
  const input = (name: string, label: string, value: string | null | undefined, placeholder?: string) => (
    <label className="flex flex-col gap-1 text-xs font-medium text-muted">
      {label}
      <input name={name} defaultValue={value ?? ""} placeholder={placeholder} className={inputClass} />
    </label>
  );
  return (
    <div className="grid gap-2 sm:grid-cols-3">
      <label className="flex flex-col gap-1 text-xs font-medium text-muted">
        Kind
        <Select name="kind" defaultValue={c?.kind ?? "experience"} options={claimKindValues.map((k) => ({ value: k, label: humanize(k) }))} />
      </label>
      {input("entity", "Entity (company, school, project, skill category)", c?.entity)}
      {input("role", "Role or degree", c?.role)}
      {input("context", "Context (sub-project, stack, place)", c?.context)}
      {input("date_label", "Date label", c?.dateLabel, "08/2026 - Present")}
      {input("tags", "Tags (comma separated)", c?.tags.join(", "))}
      {input("start_date", "Start date (YYYY-MM-DD)", c?.startDate)}
      {input("end_date", "End date (YYYY-MM-DD)", c?.endDate)}
      {input("sort_order", "Sort order", c ? String(c.sortOrder) : "")}
      <label className="flex flex-col gap-1 text-xs font-medium text-muted sm:col-span-2">
        Text (the bullet, as it may appear on a resume)
        <textarea name="text" defaultValue={c?.text} rows={2} maxLength={1000} required className={inputClass} />
      </label>
      {input("metrics", "Metrics backing it", c?.metrics)}
    </div>
  );
}

function BaseResumeEditor({
  archetype,
  base,
  claims,
}: {
  archetype: string;
  base: { summary: string; claimIds: string[]; skillsOrder: string[] } | undefined;
  claims: Claim[];
}) {
  const position = (id: string) => {
    const i = base?.claimIds.indexOf(id) ?? -1;
    return i === -1 ? "" : String((i + 1) * 10);
  };
  return (
    <details className="rounded-xl border border-border bg-surface shadow-card p-3">
      <summary className="cursor-pointer font-medium capitalize">
        {archetype} <span className="text-xs font-normal text-muted">{base ? `${base.claimIds.length} claims, ${base.skillsOrder.length} skills` : "not set up"}</span>
      </summary>
      <ActionForm action={saveBaseResumeAction.bind(null, archetype)} className="mt-3 space-y-3">
        <label className="flex flex-col gap-1 text-xs font-medium text-muted">
          Summary (facts from your claims only)
          <textarea name="summary" defaultValue={base?.summary} rows={3} maxLength={1000} className={inputClass} />
        </label>
        <div>
          <p className="mb-1 text-xs text-muted">Claims: tick to include, number sets the order</p>
          <div className="space-y-1">
            {claims.map((c) => (
              <label key={c.id} className="flex items-start gap-2 text-xs">
                <input type="checkbox" name="claim" value={c.id} defaultChecked={base?.claimIds.includes(c.id)} className="mt-0.5" />
                <input name={`order_${c.id}`} defaultValue={position(c.id)} inputMode="numeric" aria-label="Order" className={cx(inputBase, "w-16 px-2 py-1 text-center")} />
                <span>
                  <span className="text-muted">{c.entity}: </span>
                  {c.text}
                  {!c.verified ? <Badge tone="amber">unverified</Badge> : null}
                </span>
              </label>
            ))}
          </div>
        </div>
        <label className="flex flex-col gap-1 text-xs font-medium text-muted">
          Skills, one per line, in order (must match your skill claims)
          <textarea name="skills" defaultValue={base?.skillsOrder.join("\n")} rows={6} className={cx(inputClass, "font-mono text-xs")} />
        </label>
        <SubmitButton className={cx(btn.base, btn.primary)}>Save {archetype} base resume</SubmitButton>
      </ActionForm>
    </details>
  );
}
