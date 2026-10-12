import { z } from "zod";
import { BOARD_TOKEN_RE } from "@/ingest/snowball";
import { addWatchCompanies } from "@/services/companies";
import { defineTool } from "../guard";
import { httpsUrl } from "../schemas";

export const addWatchCompaniesTool = defineTool({
  name: "add_watch_companies",
  kind: "write",
  title: "Add watch companies",
  description:
    "Add companies whose public job boards should be polled daily. Only Greenhouse, Lever and " +
    "Ashby boards are supported. board_token is the slug in the board URL, e.g. 'acme' for " +
    "boards.greenhouse.io/acme, jobs.lever.co/acme or jobs.ashbyhq.com/acme (lowercase letters, " +
    "digits, hyphens). Companies already watched are skipped.",
  idempotent: true,
  input: z
    .object({
      companies: z
        .array(
          z
            .object({
              name: z.string().trim().min(1).max(200),
              ats: z.enum(["greenhouse", "lever", "ashby"]),
              board_token: z.string().regex(BOARD_TOKEN_RE),
              careers_url: httpsUrl.optional(),
            })
            .strict(),
        )
        .min(1)
        .max(25),
    })
    .strict(),
  handler: async ({ companies }, ctx) =>
    addWatchCompanies(
      companies.map((c) => ({
        name: c.name,
        ats: c.ats,
        boardToken: c.board_token,
        careersUrl: c.careers_url ?? null,
      })),
      ctx,
    ),
});
