import { z } from "zod";
import { outreachChannelValues } from "@/db/enums";
import { createOutreach } from "@/services/outreach";
import { defineTool } from "../guard";
import { generatedText, httpsUrl, uuid } from "../schemas";

export const createOutreachTool = defineTool({
  name: "create_outreach",
  kind: "write",
  title: "Create outreach draft",
  description:
    "Draft a message to a person at the company (recruiter, hiring manager, engineer) for MFK to " +
    "send manually. Nothing is sent. Use only professional public info about the contact, with " +
    "https URLs for their profile and for where you found them. Contacts are reused by company + " +
    "name. Keep it short and specific to the role. Do not include sensitive answer-bank values " +
    "unless MFK asked. The follow-up reminder fires follow_up_days after MFK marks it sent.",
  input: z
    .object({
      job_id: uuid,
      contact: z
        .object({
          name: z.string().trim().min(1).max(120),
          role: z.string().trim().max(120).optional(),
          public_profile_url: httpsUrl.optional(),
          source_url: httpsUrl.optional(),
        })
        .strict(),
      channel: z.enum(outreachChannelValues),
      message: generatedText(1500),
      follow_up_days: z.number().int().min(3).max(14).default(7),
    })
    .strict(),
  handler: async (input, ctx) =>
    createOutreach(
      {
        jobId: input.job_id,
        contact: {
          name: input.contact.name,
          role: input.contact.role ?? null,
          publicProfileUrl: input.contact.public_profile_url ?? null,
          sourceUrl: input.contact.source_url ?? null,
        },
        channel: input.channel,
        message: input.message,
        followUpDays: input.follow_up_days,
      },
      ctx,
    ),
});
