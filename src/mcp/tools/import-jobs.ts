import { z } from "zod";
import { ingestNormalized } from "@/services/jobs";
import { defineTool } from "../guard";
import { httpsUrl, isoDateTime } from "../schemas";

export const importJobsTool = defineTool({
  name: "import_jobs",
  kind: "write",
  title: "Import jobs",
  description:
    "Add jobs found outside the ATS feeds, e.g. from LinkedIn/Naukri/Indeed/Instahyre alert " +
    "emails. Use the posting's https URL. Runs the same pipeline as daily ingestion (sanitize, " +
    "dedupe on URL, prefilter, scam flags, company discovery). Safe to retry: known URLs come " +
    "back as status 'duplicate' with their existing job_id. Returns counts and one item per job.",
  idempotent: true,
  input: z
    .object({
      jobs: z
        .array(
          z
            .object({
              url: httpsUrl,
              company_name: z.string().trim().min(1).max(200),
              title: z.string().trim().min(1).max(300),
              location: z.string().trim().max(300).optional(),
              description: z.string().max(50_000).optional(),
              posted_at: isoDateTime.optional(),
              source: z.enum(["gmail_alert", "manual", "feed"]),
            })
            .strict(),
        )
        .min(1)
        .max(50),
    })
    .strict(),
  handler: async ({ jobs }, ctx) => {
    const result = await ingestNormalized(
      jobs.map((j) => ({
        url: j.url,
        companyName: j.company_name,
        title: j.title,
        locationRaw: j.location ?? null,
        description: j.description ?? null,
        postedAt: j.posted_at ?? null,
        source: j.source,
      })),
      ctx,
    );
    return {
      ...result,
      items: result.items.map((item) =>
        item.status === "invalid" ? item : { url: item.url, status: item.status, jobId: item.jobId, prefilterPassed: item.prefilterPassed },
      ),
    };
  },
});
