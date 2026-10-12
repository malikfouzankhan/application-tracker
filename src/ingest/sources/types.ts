import type { NormalizedJob } from "../normalize";
import { BOARD_TOKEN_RE, type PollableAts } from "../snowball";

export type BoardCompany = { id: string; name: string; boardToken: string };

export type AtsSource = {
  ats: PollableAts;
  /** Builds the API URL from a validated token. Never from stored URLs (SSRF guard). */
  boardUrl: (boardToken: string) => string;
  /** Parses the API response into normalized jobs. Throws on an unexpected shape. */
  parse: (json: unknown, company: BoardCompany) => NormalizedJob[];
};

export function assertBoardToken(token: string): string {
  if (!BOARD_TOKEN_RE.test(token)) throw new Error(`Invalid board token: ${token}`);
  return token;
}

export function toDate(value: string | number | null | undefined): Date | null {
  if (value === null || value === undefined || value === "") return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}
