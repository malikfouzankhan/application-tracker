import type { PollableAts } from "../snowball";
import { ashby } from "./ashby";
import { greenhouse } from "./greenhouse";
import { lever } from "./lever";
import type { AtsSource } from "./types";

export const ATS_SOURCES: Record<PollableAts, AtsSource> = { greenhouse, lever, ashby };

// Remote job boards with JSON/RSS feeds can be added here later as their own sources
// (claude.md section 6.2), each with its host on the http.ts allowlist.
