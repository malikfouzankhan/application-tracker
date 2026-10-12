import { APP_TIME_ZONE } from "./dates";

// Display helpers. Dates are stored in UTC and shown in IST (claude.md section 15).

const dateFmt = new Intl.DateTimeFormat("en-IN", { timeZone: APP_TIME_ZONE, day: "numeric", month: "short" });
const dateYearFmt = new Intl.DateTimeFormat("en-IN", { timeZone: APP_TIME_ZONE, day: "numeric", month: "short", year: "numeric" });
const dateTimeFmt = new Intl.DateTimeFormat("en-IN", {
  timeZone: APP_TIME_ZONE,
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

export function fmtDate(value: Date | string | null | undefined, withYear = false): string {
  if (!value) return "";
  const date = typeof value === "string" ? new Date(value) : value;
  return (withYear || date.getFullYear() !== new Date().getFullYear() ? dateYearFmt : dateFmt).format(date);
}

export function fmtDateTime(value: Date | null | undefined): string {
  return value ? dateTimeFmt.format(value) : "";
}

/** "3d ago", "in 2d", "today". */
export function fmtRelative(value: Date | null | undefined, now: Date = new Date()): string {
  if (!value) return "";
  const days = Math.round((value.getTime() - now.getTime()) / 86_400_000);
  if (days === 0) return "today";
  return days < 0 ? `${-days}d ago` : `in ${days}d`;
}

export function humanize(value: string | null | undefined): string {
  return (value ?? "").replace(/_/g, " ");
}

export type Tone = "gray" | "blue" | "indigo" | "violet" | "amber" | "green" | "red" | "sky";

export const STATUS_TONE: Record<string, Tone> = {
  ready: "blue",
  applied: "indigo",
  oa: "violet",
  interviewing: "amber",
  offer: "green",
  accepted: "green",
  declined: "gray",
  rejected: "red",
  withdrawn: "gray",
  ghosted: "gray",
  drafted: "gray",
  sent: "indigo",
  replied: "green",
  no_reply: "gray",
};

export const TIER_TONE: Record<string, Tone> = { fit: "green", justify: "sky", stretch: "amber", skip: "gray" };
