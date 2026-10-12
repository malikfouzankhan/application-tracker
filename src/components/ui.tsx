import Link from "next/link";
import type { ReactNode } from "react";
import { STATUS_TONE, TIER_TONE, type Tone, humanize } from "@/lib/format";

// Server-safe UI primitives (no hooks). Colors come from the palette tokens in globals.css.

export function cx(...classes: (string | false | null | undefined)[]): string {
  return classes.filter(Boolean).join(" ");
}

export const btn = {
  base: "inline-flex items-center justify-center gap-1.5 rounded-lg px-3.5 py-2 text-sm font-medium transition-colors disabled:pointer-events-none disabled:opacity-50",
  primary: "bg-navy text-white shadow-sm hover:bg-ink",
  secondary: "border border-border bg-surface text-navy hover:border-mist hover:bg-subtle",
  danger: "border border-red-200 bg-surface text-red-700 hover:bg-red-50",
  ghost: "text-muted hover:bg-subtle hover:text-navy",
  small: "px-2.5 py-1.5 text-xs",
};

export const inputClass =
  "w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-ink placeholder:text-muted/70 outline-none transition-colors focus:border-navy focus:ring-2 focus:ring-mist/40";

/** Same look as inputClass but sized to content, for selects that sit inline next to buttons. */
export const selectInline =
  "rounded-lg border border-border bg-surface px-3 py-2 text-sm text-ink outline-none transition-colors focus:border-navy focus:ring-2 focus:ring-mist/40";

export const labelClass = "flex flex-col gap-1 text-xs font-medium text-muted";

export function PageHeader({ title, description, actions }: { title: string; description?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-ink">{title}</h1>
        {description ? <p className="mt-1 max-w-3xl text-sm text-muted">{description}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
    </div>
  );
}

export function Card({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cx("rounded-xl border border-border bg-surface p-5 shadow-card", className)}>{children}</div>;
}

export function SectionTitle({ children, aside }: { children: ReactNode; aside?: ReactNode }) {
  return (
    <div className="mb-3 mt-8 flex items-center justify-between first:mt-0">
      <h2 className="text-sm font-semibold text-navy">{children}</h2>
      {aside}
    </div>
  );
}

export function Stat({ label, value, hint }: { label: string; value: ReactNode; hint?: ReactNode }) {
  return (
    <div className="rounded-xl border border-border bg-surface px-4 py-3 shadow-card">
      <p className="text-xs font-medium text-muted">{label}</p>
      <p className="mt-0.5 text-2xl font-semibold tabular-nums text-ink">{value}</p>
      {hint ? <p className="text-xs text-muted">{hint}</p> : null}
    </div>
  );
}

const TONES: Record<Tone, string> = {
  gray: "bg-slate-100 text-slate-700 ring-slate-200",
  blue: "bg-sky text-navy ring-mist/60",
  indigo: "bg-indigo-50 text-indigo-800 ring-indigo-200",
  violet: "bg-violet-50 text-violet-800 ring-violet-200",
  amber: "bg-amber-50 text-amber-800 ring-amber-200",
  green: "bg-emerald-50 text-emerald-800 ring-emerald-200",
  red: "bg-red-50 text-red-700 ring-red-200",
  sky: "bg-cyan-50 text-cyan-800 ring-cyan-200",
};

export function Badge({ children, tone = "gray", title }: { children: ReactNode; tone?: Tone; title?: string }) {
  return (
    <span title={title} className={cx("inline-flex items-center whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset", TONES[tone])}>
      {children}
    </span>
  );
}

export function StatusBadge({ status }: { status: string }) {
  return <Badge tone={STATUS_TONE[status] ?? "gray"}>{humanize(status)}</Badge>;
}

export function TierBadge({ tier, score }: { tier: string | null | undefined; score?: number | null }) {
  if (!tier) return null;
  return (
    <Badge tone={TIER_TONE[tier] ?? "gray"}>
      {tier}
      {score !== null && score !== undefined ? ` · ${score}` : ""}
    </Badge>
  );
}

export function ScamFlags({ flags }: { flags: string[] | null | undefined }) {
  if (!flags?.length) return null;
  return (
    <span className="inline-flex flex-wrap gap-1">
      {flags.map((f) => (
        <Badge key={f} tone="red" title="Possible scam signal">
          ⚠ {humanize(f)}
        </Badge>
      ))}
    </span>
  );
}

export function RemoteBadge({ type }: { type: string | null | undefined }) {
  if (!type || type === "unknown" || type === "onsite") return null;
  return <Badge tone="blue">{type}</Badge>;
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="rounded-xl border border-dashed border-mist bg-surface/60 px-6 py-10 text-center text-sm text-muted">{children}</p>;
}

export function Loading({ label = "Loading…" }: { label?: string }) {
  return (
    <div className="space-y-3" aria-busy="true" aria-label={label}>
      {[0, 1, 2].map((i) => (
        <div key={i} className="h-24 animate-pulse rounded-xl border border-border bg-surface/70" />
      ))}
    </div>
  );
}

/** Untrusted text (job descriptions etc.): always plain text, never HTML (claude.md section 10). */
export function ExternalText({ text, className }: { text: string; className?: string }) {
  return <div className={cx("whitespace-pre-wrap break-words", className)}>{text}</div>;
}

export function ExternalLink({ href, children }: { href: string; children: ReactNode }) {
  const safe = /^https?:\/\//i.test(href) ? href : "#";
  return (
    <a href={safe} target="_blank" rel="noopener noreferrer nofollow" className="font-medium text-navy underline decoration-mist underline-offset-2 hover:decoration-navy">
      {children}
    </a>
  );
}

export function NavLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link href={href} className="font-medium text-navy underline decoration-mist underline-offset-2 hover:decoration-navy">
      {children}
    </Link>
  );
}

/** Small label/value line used in detail panels. */
export function Meta({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex justify-between gap-4 py-1.5 text-sm">
      <span className="text-muted">{label}</span>
      <span className="text-right text-ink">{children}</span>
    </div>
  );
}
