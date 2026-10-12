import { Suspense } from "react";
import { deleteAnswerAction, upsertAnswerAction } from "@/actions/misc";
import { ActionForm, SubmitButton } from "@/components/client/action-form";
import { Badge, Card, Empty, Loading, PageHeader, btn, cx, inputClass } from "@/components/ui";
import { requireOwnerPage } from "@/lib/auth";
import { getAnswerBank } from "@/services/answers";

export const metadata = { title: "Answers" };

export default function AnswersPage() {
  return (
    <>
      <PageHeader
        title="Answer bank"
        description="Standard answers for application forms. Sensitive values are masked for Claude unless a question needs them."
      />
      <Suspense fallback={<Loading />}>
        <AnswersContent />
      </Suspense>
    </>
  );
}

async function AnswersContent() {
  await requireOwnerPage();
  const answers = await getAnswerBank({ includeSensitive: true });

  return (
    <div className="space-y-3">
      {answers.length ? (
        <Card className="divide-y divide-border overflow-hidden p-0">
          {answers.map((a) => (
            <div key={a.key} className="p-3">
              <ActionForm action={upsertAnswerAction} className="grid items-end gap-2 sm:grid-cols-[10rem_12rem_1fr_auto]">
                <input type="hidden" name="key" value={a.key} />
                <div className="text-xs">
                  <p className="font-mono">{a.key}</p>
                  {a.isSensitive ? <Badge tone="amber">sensitive</Badge> : null}
                </div>
                <input name="label" defaultValue={a.label} aria-label="Label" className={inputClass} />
                <input
                  name="value"
                  defaultValue={a.value}
                  aria-label="Value"
                  type={a.isSensitive ? "password" : "text"}
                  autoComplete="off"
                  className={inputClass}
                />
                <div className="flex items-center gap-2">
                  <label className="flex items-center gap-1 text-xs">
                    <input type="checkbox" name="is_sensitive" defaultChecked={a.isSensitive} /> Sensitive
                  </label>
                  <SubmitButton className={cx(btn.base, btn.secondary)}>Save</SubmitButton>
                </div>
              </ActionForm>
              <ActionForm action={deleteAnswerAction.bind(null, a.key)} confirm={`Delete "${a.key}"?`} className="mt-1">
                <SubmitButton className={cx(btn.base, btn.ghost, "px-0")}>Delete</SubmitButton>
              </ActionForm>
            </div>
          ))}
        </Card>
      ) : (
        <Empty>No answers yet.</Empty>
      )}

      <Card>
        <p className="mb-2 text-xs font-medium">Add an answer</p>
        <ActionForm action={upsertAnswerAction} resetOnSuccess className="grid items-end gap-2 sm:grid-cols-[10rem_12rem_1fr_auto]">
          <input name="key" placeholder="notice_period" required pattern="[a-z0-9_]{1,64}" className={cx(inputClass, "font-mono text-xs")} />
          <input name="label" placeholder="Notice period" required className={inputClass} />
          <input name="value" placeholder="30 days" required className={inputClass} />
          <div className="flex items-center gap-2">
            <label className="flex items-center gap-1 text-xs">
              <input type="checkbox" name="is_sensitive" /> Sensitive
            </label>
            <SubmitButton className={cx(btn.base, btn.primary)}>Add</SubmitButton>
          </div>
        </ActionForm>
        <p className="mt-2 text-xs text-muted">
          Common keys: notice_period, current_ctc, expected_ctc, work_authorization, relocation, earliest_start_date. Resume header uses
          full_name, headline, email, phone, location, linkedin_url, github_url, website_url.
        </p>
      </Card>
    </div>
  );
}
