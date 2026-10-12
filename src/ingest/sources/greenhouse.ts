import { z } from "zod";
import { decodeHtmlEntities } from "../sanitize";
import { type AtsSource, assertBoardToken, toDate } from "./types";

// https://boards-api.greenhouse.io/v1/boards/{token}/jobs?content=true
// `content` is HTML that has been entity-escaped once more ("&lt;p&gt;").

const responseSchema = z.looseObject({
  jobs: z.array(
    z.looseObject({
      id: z.number(),
      title: z.string(),
      absolute_url: z.string(),
      content: z.string().nullish(),
      location: z.looseObject({ name: z.string().nullish() }).nullish(),
      first_published: z.string().nullish(),
      updated_at: z.string().nullish(),
    }),
  ),
});

export const greenhouse: AtsSource = {
  ats: "greenhouse",
  boardUrl: (token) =>
    `https://boards-api.greenhouse.io/v1/boards/${assertBoardToken(token)}/jobs?content=true`,
  parse: (json, company) =>
    responseSchema.parse(json).jobs.map((job) => ({
      url: job.absolute_url,
      companyName: company.name,
      companyId: company.id,
      title: job.title,
      locationRaw: job.location?.name ?? null,
      description: job.content ? decodeHtmlEntities(job.content) : null,
      source: "greenhouse",
      sourceRef: String(job.id),
      postedAt: toDate(job.first_published ?? job.updated_at),
    })),
};
