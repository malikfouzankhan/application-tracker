import { approveVariantAction } from "@/actions/library";
import { ActionForm, SubmitButton } from "@/components/client/action-form";
import { Badge, btn, cx } from "@/components/ui";
import type { getVariantForRender } from "@/services/resume";

type Review = Awaited<ReturnType<typeof getVariantForRender>>;

/** Rephrases side by side with the verified claim, then approve (claude.md section 8). */
export function VariantReview({ review }: { review: Review }) {
  const { variant, items } = review;
  const rephrased = items.filter((i) => i.rephrased);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone={variant.status === "approved" ? "green" : "amber"}>{variant.status}</Badge>
        <span className="text-xs text-muted">
          {items.length} claims · {rephrased.length} rephrased · {variant.skillsOrder.length} skills
        </span>
        <a href={`/r/${variant.id}`} target="_blank" rel="noopener" className="text-xs text-accent hover:underline">
          Open PDF
        </a>
        {variant.status === "draft" ? (
          <ActionForm action={approveVariantAction.bind(null, variant.id)} className="ml-auto">
            <SubmitButton className={cx(btn.base, btn.primary)} pendingLabel="Approving…">
              Approve resume
            </SubmitButton>
          </ActionForm>
        ) : null}
      </div>

      <div>
        <p className="text-xs font-medium text-muted">Summary</p>
        <p>{variant.summary}</p>
      </div>

      {rephrased.length ? (
        <div className="space-y-2">
          <p className="text-xs font-medium text-muted">Rephrased claims</p>
          {rephrased.map((i) => (
            <div key={i.claim.id} className="grid gap-2 rounded-md border border-border px-4 py-3 sm:grid-cols-2">
              <div>
                <p className="text-xs uppercase text-muted">Verified claim</p>
                <p>{i.original}</p>
              </div>
              <div>
                <p className="text-xs uppercase text-muted">Rephrase</p>
                <p>{i.text}</p>
                {i.justification ? <p className="mt-1 text-xs text-muted">Why: {i.justification}</p> : null}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-xs text-muted">No rephrases: every bullet is the verified claim text.</p>
      )}
    </div>
  );
}
