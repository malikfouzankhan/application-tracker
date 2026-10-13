// Dates are stored in UTC and displayed in Asia/Kolkata (claude.md section 15).
export const APP_TIME_ZONE = "Asia/Kolkata";

/** YYYY-MM-DD for `date` as seen in `timeZone`. */
function isoDateInZone(date: Date, timeZone: string = APP_TIME_ZONE): string {
  // en-CA formats as YYYY-MM-DD.
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

export function todayIst(now: Date = new Date()): string {
  return isoDateInZone(now);
}

/** Adds whole days to a YYYY-MM-DD string. */
function addDays(isoDate: string, days: number): string {
  const [y, m, d] = isoDate.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

export function yesterdayIst(now: Date = new Date()): string {
  return addDays(todayIst(now), -1);
}
