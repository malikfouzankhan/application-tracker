import type { atsValues } from "@/db/enums";

// Any Greenhouse/Lever/Ashby URL seen anywhere yields an (ats, board_token) to watch
// (claude.md section 6.9). Tokens are validated here and again by the DB check constraint.

export type PollableAts = Exclude<(typeof atsValues)[number], "other">;
export type BoardRef = { ats: PollableAts; boardToken: string };

export const BOARD_TOKEN_RE = /^[a-z0-9-]{1,64}$/;

const BOARD_URL_PATTERNS: { ats: PollableAts; re: RegExp }[] = [
  {
    ats: "greenhouse",
    re: /\b(?:boards|job-boards)(?:\.eu)?\.greenhouse\.io\/(?:embed\/job_board\?for=)?([A-Za-z0-9-]+)/g,
  },
  { ats: "greenhouse", re: /\bboards-api\.greenhouse\.io\/v1\/boards\/([A-Za-z0-9-]+)/g },
  { ats: "lever", re: /\bjobs\.(?:eu\.)?lever\.co\/([A-Za-z0-9-]+)/g },
  { ats: "lever", re: /\bapi\.(?:eu\.)?lever\.co\/v0\/postings\/([A-Za-z0-9-]+)/g },
  { ats: "ashby", re: /\bjobs\.ashbyhq\.com\/([A-Za-z0-9-]+)/g },
  { ats: "ashby", re: /\bapi\.ashbyhq\.com\/posting-api\/job-board\/([A-Za-z0-9-]+)/g },
];

// Path segments that are not company boards.
const RESERVED = new Set(["embed", "v1", "api", "jobs", "job", "careers", "static", "assets"]);

export function isValidBoardToken(token: string): boolean {
  return BOARD_TOKEN_RE.test(token) && !RESERVED.has(token);
}

export function extractBoardRefs(...texts: (string | null | undefined)[]): BoardRef[] {
  const seen = new Map<string, BoardRef>();
  for (const text of texts) {
    if (!text) continue;
    for (const { ats, re } of BOARD_URL_PATTERNS) {
      re.lastIndex = 0;
      let m: RegExpExecArray | null;
      while ((m = re.exec(text))) {
        const boardToken = m[1].toLowerCase();
        if (!isValidBoardToken(boardToken)) continue;
        seen.set(`${ats}:${boardToken}`, { ats, boardToken });
      }
    }
  }
  return [...seen.values()];
}
