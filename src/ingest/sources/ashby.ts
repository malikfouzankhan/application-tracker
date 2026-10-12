import { z } from "zod";
import type { RemoteType } from "../normalize";
import { type AtsSource, assertBoardToken, toDate } from "./types";

// https://api.ashbyhq.com/posting-api/job-board/{token}

const responseSchema = z.looseObject({
  jobs: z.array(
    z.looseObject({
      id: z.string(),
      title: z.string(),
      jobUrl: z.string(),
      location: z.string().nullish(),
      secondaryLocations: z.array(z.looseObject({ location: z.string().nullish() })).nullish(),
      isRemote: z.boolean().nullish(),
      workplaceType: z.string().nullish(),
      isListed: z.boolean().nullish(),
      publishedAt: z.string().nullish(),
      descriptionHtml: z.string().nullish(),
      address: z
        .looseObject({
          postalAddress: z.looseObject({ addressCountry: z.string().nullish() }).nullish(),
        })
        .nullish(),
    }),
  ),
});

function remoteType(job: { isRemote?: boolean | null; workplaceType?: string | null }): RemoteType | undefined {
  const type = job.workplaceType?.toLowerCase().replace(/[^a-z]/g, "");
  if (type === "remote" || job.isRemote) return "remote";
  if (type === "hybrid") return "hybrid";
  if (type === "onsite") return "onsite";
  return undefined; // inferred from location text
}

export const ashby: AtsSource = {
  ats: "ashby",
  boardUrl: (token) => `https://api.ashbyhq.com/posting-api/job-board/${assertBoardToken(token)}`,
  parse: (json, company) =>
    responseSchema
      .parse(json)
      .jobs.filter((job) => job.isListed !== false)
      .map((job) => {
        const locations = [job.location, ...(job.secondaryLocations ?? []).map((l) => l.location)].filter(
          (l): l is string => Boolean(l),
        );
        return {
          url: job.jobUrl,
          companyName: company.name,
          companyId: company.id,
          title: job.title,
          locationRaw: locations.join(", ") || null,
          remoteType: remoteType(job),
          country: job.address?.postalAddress?.addressCountry ?? null,
          description: job.descriptionHtml ?? null,
          source: "ashby",
          sourceRef: job.id,
          postedAt: toDate(job.publishedAt),
        };
      }),
};
