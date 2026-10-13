import { Suspense } from "react";
import { savePreferencesAction, setClientRevokedAction, setMcpEnabledAction } from "@/actions/misc";
import { ActionForm, SubmitButton } from "@/components/client/action-form";
import { Badge, Card, Loading, PageHeader, SectionTitle, btn, cx, inputBase, inputClass } from "@/components/ui";
import { requireOwnerPage } from "@/lib/auth";
import { fmtDate, fmtRelative } from "@/lib/format";
import type { Preferences } from "@/lib/preferences";
import { isMcpEnabled, listMcpClients } from "@/services/mcp-clients";
import { getPreferences } from "@/services/preferences";

export const metadata = { title: "Settings" };

export default function SettingsPage() {
  return (
    <>
      <PageHeader title="Settings" />
      <Suspense fallback={<Loading />}>
        <SettingsContent />
      </Suspense>
    </>
  );
}

async function SettingsContent() {
  await requireOwnerPage();
  const [{ preferences, invalidKeys }, enabled, clients] = await Promise.all([getPreferences(), isMcpEnabled(), listMcpClients()]);

  return (
    <div>
      <SectionTitle>Claude connector</SectionTitle>
      <Card className="space-y-3">
        <div className="flex flex-wrap items-center gap-3">
          <Badge tone={enabled ? "green" : "red"}>{enabled ? "MCP enabled" : "MCP disabled"}</Badge>
          <p className="flex-1 text-xs text-muted">Kill switch. When disabled, every tool call fails with MCP_DISABLED.</p>
          <ActionForm action={setMcpEnabledAction.bind(null, !enabled)} confirm={enabled ? "Disable Claude's access to this app?" : undefined}>
            <SubmitButton className={cx(btn.base, enabled ? btn.danger : btn.primary)}>{enabled ? "Disable MCP" : "Enable MCP"}</SubmitButton>
          </ActionForm>
        </div>
        <div className="divide-y divide-border rounded-md border border-border">
          {clients.length ? (
            clients.map((c) => (
              <div key={c.id} className="flex flex-wrap items-center gap-2 px-4 py-3 text-xs">
                <span className="min-w-0 flex-1 break-all font-mono">{c.clientId}</span>
                <span className="text-muted">
                  first {fmtDate(c.firstSeenAt)} · last {fmtRelative(c.lastSeenAt)}
                </span>
                {c.revoked ? <Badge tone="red">revoked</Badge> : <Badge tone="green">active</Badge>}
                <ActionForm action={setClientRevokedAction.bind(null, c.id, !c.revoked)} confirm={c.revoked ? undefined : "Revoke this client?"}>
                  <SubmitButton className={cx(btn.base, c.revoked ? btn.secondary : btn.danger)}>{c.revoked ? "Restore" : "Revoke"}</SubmitButton>
                </ActionForm>
              </div>
            ))
          ) : (
            <p className="px-4 py-3 text-xs text-muted">No clients have connected yet.</p>
          )}
        </div>
        <p className="text-xs text-muted">
          Revoking blocks the client here. To end its OAuth grant entirely, also revoke it in the Clerk dashboard (OAuth applications).
        </p>
      </Card>

      <SectionTitle>Search preferences</SectionTitle>
      <Card>
        {invalidKeys.length ? (
          <p className="mb-3 text-xs text-red-600">Stored values for {invalidKeys.join(", ")} were invalid; defaults are shown.</p>
        ) : null}
        <PreferencesForm prefs={preferences} />
      </Card>
    </div>
  );
}

function ListField({ name, label, values, hint, rows = 6 }: { name: string; label: string; values: string[]; hint?: string; rows?: number }) {
  return (
    <label className="flex flex-col gap-1 text-xs font-medium text-muted">
      {label}
      <textarea name={name} defaultValue={values.join("\n")} rows={rows} className={cx(inputClass, "font-mono text-xs")} />
      {hint ? <span>{hint}</span> : null}
    </label>
  );
}

function NumberField({ name, label, value }: { name: string; label: string; value: number }) {
  return (
    <label className="flex flex-col gap-1 text-xs font-medium text-muted">
      {label}
      <input type="number" name={name} min={0} max={30} defaultValue={value} className={cx(inputBase, "w-28")} />
    </label>
  );
}

function PreferencesForm({ prefs }: { prefs: Preferences }) {
  return (
    <ActionForm action={savePreferencesAction} className="space-y-4">
      <div className="grid gap-3 md:grid-cols-2">
        <ListField name="role_keywords" label="Role keywords (title must contain one), one per line" values={prefs.role_keywords} rows={8} />
        <ListField name="title_exclusions" label="Title exclusions, one per line" values={prefs.title_exclusions} rows={8} />
        <ListField name="locations" label="Accepted locations, one per line" values={prefs.locations} rows={8} hint="Matched as whole words in the job's location." />
        <ListField name="keywords" label="Skills and topics of interest (for Claude's scoring)" values={prefs.keywords} rows={8} />
        <ListField name="excluded_companies" label="Excluded companies, one per line" values={prefs.excluded_companies} rows={4} />
      </div>
      <div className="flex flex-wrap items-end gap-4">
        <NumberField name="fit_max" label="Fit: asks up to (years)" value={prefs.exp_bands.fit_max} />
        <NumberField name="justify_max" label="Justify: up to" value={prefs.exp_bands.justify_max} />
        <NumberField name="stretch_max" label="Stretch: up to (more is discarded)" value={prefs.exp_bands.stretch_max} />
        <label className="flex items-center gap-1 text-xs">
          <input type="checkbox" name="allow_remote_india" defaultChecked={prefs.allow_remote_india} /> Remote roles open to India
        </label>
        <label className="flex items-center gap-1 text-xs">
          <input type="checkbox" name="allow_remote_anywhere" defaultChecked={prefs.allow_remote_anywhere} /> Remote roles anywhere (any region)
        </label>
        <label className="flex items-center gap-1 text-xs">
          <input type="checkbox" name="include_internships" defaultChecked={prefs.include_internships} /> Include internships
        </label>
      </div>
      <SubmitButton className={cx(btn.base, btn.primary)} pendingLabel="Saving…">
        Save preferences
      </SubmitButton>
    </ActionForm>
  );
}
