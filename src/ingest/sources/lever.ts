import { z } from "zod";
import type { RemoteType } from "../normalize";
import { type AtsSource, assertBoardToken, toDate } from "./types";

// https://api.lever.co/v0/postings/{token}?mode=json

const responseSchema = z.array(
  z.looseObject({
    id: z.string(),
    text: z.string(),
    hostedUrl: z.string(),
    categories: z
      .looseObject({ location: z.string().nullish(), allLocations: z.array(z.string()).nullish() })
      .nullish(),
    workplaceType: z.string().nullish(),
    country: z.string().nullish(),
    createdAt: z.number().nullish(),
    description: z.string().nullish(),
    lists: z.array(z.looseObject({ text: z.string().nullish(), content: z.string().nullish() })).nullish(),
    additional: z.string().nullish(),
  }),
);

const WORKPLACE: Record<string, RemoteType> = { remote: "remote", hybrid: "hybrid", onsite: "onsite" };

export const lever: AtsSource = {
  ats: "lever",
  boardUrl: (token) => `https://api.lever.co/v0/postings/${assertBoardToken(token)}?mode=json`,
  parse: (json, company) =>
    responseSchema.parse(json).map((job) => {
      const locations = job.categories?.allLocations?.length
        ? job.categories.allLocations
        : [job.categories?.location].filter((l): l is string => Boolean(l));
      const sections = (job.lists ?? []).map(
        (list) => `<h3>${list.text ?? ""}</h3><ul>${list.content ?? ""}</ul>`,
      );
      return {
        url: job.hostedUrl,
        companyName: company.name,
        companyId: company.id,
        title: job.text,
        locationRaw: locations.join(", ") || null,
        remoteType: WORKPLACE[job.workplaceType?.toLowerCase() ?? ""],
        country: job.country ?? null,
        description: [job.description ?? "", ...sections, job.additional ?? ""].join("\n"),
        source: "lever",
        sourceRef: job.id,
        postedAt: toDate(job.createdAt),
      };
    }),
};
