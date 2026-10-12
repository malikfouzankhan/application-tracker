"use server";

import { z } from "zod";
import { outreachStatusValues, watchStatusValues } from "@/db/enums";
import { BOARD_TOKEN_RE } from "@/ingest/snowball";
import { type PreferenceKey, preferencesSchema } from "@/lib/preferences";
import { deleteAnswer, upsertAnswer } from "@/services/answers";
import { addWatchCompanies, updateCompany } from "@/services/companies";
import { userContext } from "@/services/context";
import { archiveJobs, dismissJob } from "@/services/jobs";
import { setMcpClientRevoked, setMcpEnabled } from "@/services/mcp-clients";
import { updateOutreachStatus } from "@/services/outreach";
import { setPreference } from "@/services/preferences";
import { field, lines, runAction } from "./run";
import type { ActionResult } from "./types";

// ---------------------------------------------------------------- Jobs

export async function dismissJobAction(jobId: string) {
  return runAction(async () => {
    await dismissJob(jobId, userContext);
  });
}

export async function archiveJobAction(jobId: string) {
  return runAction(async () => {
    await archiveJobs([jobId], userContext);
  });
}

// ---------------------------------------------------------------- Answers

export async function upsertAnswerAction(_prev: ActionResult, formData: FormData) {
  return runAction(async () => {
    await upsertAnswer(
      {
        key: z.string().regex(/^[a-z0-9_]{1,64}$/, "Key: lowercase letters, digits, underscores").parse(field(formData, "key")),
        label: z.string().min(1).max(200).parse(field(formData, "label")),
        value: z.string().min(1).max(2000).parse(field(formData, "value")),
        isSensitive: formData.get("is_sensitive") === "on",
      },
      userContext,
    );
    return "Saved";
  });
}

export async function deleteAnswerAction(key: string) {
  return runAction(async () => {
    await deleteAnswer(key, userContext);
  });
}

// ---------------------------------------------------------------- Outreach

export async function outreachStatusAction(outreachId: string, status: string, _prev: ActionResult, formData: FormData) {
  return runAction(async () => {
    await updateOutreachStatus(
      { outreachId, status: z.enum(outreachStatusValues).parse(status), note: field(formData, "note") ?? undefined },
      userContext,
    );
    return `Marked ${status.replace("_", " ")}`;
  });
}

// ---------------------------------------------------------------- Companies

export async function addCompanyAction(_prev: ActionResult, formData: FormData) {
  return runAction(async () => {
    const result = await addWatchCompanies(
      [
        {
          name: z.string().min(1).max(200).parse(field(formData, "name")),
          ats: z.enum(["greenhouse", "lever", "ashby"]).parse(field(formData, "ats")),
          boardToken: z.string().regex(BOARD_TOKEN_RE, "Board token: lowercase letters, digits, hyphens").parse(field(formData, "board_token")),
          careersUrl: z.url({ protocol: /^https$/ }).nullable().parse(field(formData, "careers_url")),
        },
      ],
      userContext,
    );
    return result.added.length ? "Added; polled from the next run" : "Already watched";
  });
}

export async function updateCompanyAction(companyId: string, patch: { watchStatus?: string; isDream?: boolean }) {
  return runAction(async () => {
    await updateCompany(
      companyId,
      {
        watchStatus: patch.watchStatus ? z.enum(watchStatusValues).parse(patch.watchStatus) : undefined,
        isDream: patch.isDream,
      },
      userContext,
    );
  });
}

// ---------------------------------------------------------------- Settings

export async function savePreferencesAction(_prev: ActionResult, formData: FormData) {
  return runAction(async () => {
    const shape = preferencesSchema.shape;
    const values: { [K in PreferenceKey]: unknown } = {
      role_keywords: lines(formData, "role_keywords"),
      title_exclusions: lines(formData, "title_exclusions"),
      include_internships: formData.get("include_internships") === "on",
      locations: lines(formData, "locations"),
      allow_remote_india: formData.get("allow_remote_india") === "on",
      exp_bands: {
        fit_max: Number(field(formData, "fit_max")),
        justify_max: Number(field(formData, "justify_max")),
        stretch_max: Number(field(formData, "stretch_max")),
      },
      excluded_companies: lines(formData, "excluded_companies"),
      keywords: lines(formData, "keywords"),
    };
    for (const key of Object.keys(values) as PreferenceKey[]) {
      const parsed = shape[key].parse(values[key]);
      await setPreference(key, parsed as never, userContext);
    }
    return "Preferences saved. New jobs use them now; earlier rejects are re-checked when seen again.";
  });
}

export async function setMcpEnabledAction(enabled: boolean) {
  return runAction(async () => {
    await setMcpEnabled(enabled, userContext);
    return enabled ? "MCP enabled" : "MCP disabled";
  });
}

export async function setClientRevokedAction(id: string, revoked: boolean) {
  return runAction(async () => {
    await setMcpClientRevoked(id, revoked, userContext);
  });
}
