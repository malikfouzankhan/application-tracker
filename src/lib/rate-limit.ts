// MCP rate limits per tool per client (claude.md section 7.2). The count itself is a
// Postgres query over audit_log in services/audit.ts.

export const RATE_LIMIT_WINDOW_SECONDS = 60;

export const RATE_LIMITS = {
  read: 120,
  write: 30,
} as const;

export type ToolKind = keyof typeof RATE_LIMITS;

export function isOverRateLimit(callsInWindow: number, kind: ToolKind): boolean {
  return callsInWindow >= RATE_LIMITS[kind];
}
