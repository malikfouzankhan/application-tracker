import { z } from "zod";
import { jobSourceValues, remoteTypeValues } from "@/db/enums";

// Common shape every source (ATS fetchers, HN, import_jobs) converts to before the
// shared pipeline in services/jobs.ingestNormalized().

export const normalizedJobSchema = z
  .object({
    url: z.url({ protocol: /^https?$/ }).max(2048),
    companyName: z.string().trim().min(1).max(200),
    title: z.string().trim().min(1).max(300),
    locationRaw: z.string().max(300).nullish(),
    remoteType: z.enum(remoteTypeValues).optional(),
    country: z.string().max(80).nullish(),
    /** Raw HTML or text. Sanitized by the pipeline, never stored as-is. */
    description: z.string().max(500_000).nullish(),
    source: z.enum(jobSourceValues),
    sourceRef: z.string().max(200).nullish(),
    postedAt: z.coerce.date().nullish(),
    /** Set by ATS fetchers that already know the watched company. */
    companyId: z.uuid().nullish(),
  })
  .strict();

export type NormalizedJob = z.infer<typeof normalizedJobSchema>;
export type RemoteType = (typeof remoteTypeValues)[number];

/** Best-effort remote type from location (and description) text. */
export function inferRemoteType(location: string | null | undefined, description = ""): RemoteType {
  const loc = (location ?? "").toLowerCase();
  if (/\bhybrid\b/.test(loc)) return "hybrid";
  if (/\b(remote|work from home|wfh|anywhere)\b/.test(loc)) return "remote";
  if (/\b(on-?site|in[- ]office)\b/.test(loc)) return "onsite";

  const desc = description.slice(0, 3000).toLowerCase();
  if (/\bhybrid\b/.test(desc)) return "hybrid";
  if (/\b(fully remote|100% remote|remote[- ]first|work from home)\b/.test(desc)) return "remote";
  if (loc) return "onsite";
  return "unknown";
}
