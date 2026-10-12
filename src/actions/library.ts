"use server";

import { z } from "zod";
import { archetypeValues, claimKindValues } from "@/db/enums";
import { userContext } from "@/services/context";
import { createClaim, setClaimVerified, updateClaim, upsertBaseResume } from "@/services/resume";
import { approveAndCacheVariant } from "@/services/resume-files";
import { field, lines, runAction } from "./run";
import type { ActionResult } from "./types";

const optionalDate = z.iso.date().nullable();

function claimFields(formData: FormData) {
  return {
    kind: z.enum(claimKindValues).parse(field(formData, "kind")),
    entity: z.string().min(1).max(200).parse(field(formData, "entity")),
    role: z.string().max(200).nullable().parse(field(formData, "role")),
    context: z.string().max(200).nullable().parse(field(formData, "context")),
    dateLabel: z.string().max(60).nullable().parse(field(formData, "date_label")),
    text: z.string().min(1).max(1000).parse(field(formData, "text")),
    metrics: z.string().max(300).nullable().parse(field(formData, "metrics")),
    tags: (field(formData, "tags") ?? "").split(",").map((t) => t.trim()).filter(Boolean).slice(0, 20),
    startDate: optionalDate.parse(field(formData, "start_date")),
    endDate: optionalDate.parse(field(formData, "end_date")),
    sortOrder: z.coerce.number().int().min(0).max(100000).catch(0).parse(field(formData, "sort_order") ?? 0),
  };
}

export async function createClaimAction(_prev: ActionResult, formData: FormData) {
  return runAction(async () => {
    await createClaim(claimFields(formData), userContext);
    return "Claim added (unverified)";
  });
}

export async function updateClaimAction(claimId: string, _prev: ActionResult, formData: FormData) {
  return runAction(async () => {
    await updateClaim(claimId, claimFields(formData), userContext);
    return "Saved. Changing the fact resets verification.";
  });
}

export async function setClaimVerifiedAction(claimId: string, verified: boolean) {
  return runAction(async () => {
    await setClaimVerified(claimId, verified, userContext);
  });
}

export async function setClaimActiveAction(claimId: string, active: boolean) {
  return runAction(async () => {
    await updateClaim(claimId, { active }, userContext);
  });
}

/** Claims are chosen with checkboxes and ordered by the number next to each. */
export async function saveBaseResumeAction(archetype: string, _prev: ActionResult, formData: FormData) {
  return runAction(async () => {
    const chosen = z.array(z.uuid()).min(1, "Pick at least one claim").parse(formData.getAll("claim"));
    const order = (id: string) => Number(field(formData, `order_${id}`) ?? 9999);
    const claimIds = [...chosen].sort((a, b) => order(a) - order(b));
    await upsertBaseResume(
      {
        archetype: z.enum(archetypeValues).parse(archetype),
        summary: z.string().min(1).max(1000).parse(field(formData, "summary")),
        claimIds,
        skillsOrder: z.array(z.string().max(60)).max(40).parse(lines(formData, "skills")),
      },
      userContext,
    );
    return "Base resume saved";
  });
}

export async function approveVariantAction(variantId: string) {
  return runAction(async () => {
    const { cached } = await approveAndCacheVariant(variantId, userContext);
    return cached ? "Approved and saved as PDF" : "Approved (PDF will render on demand)";
  });
}
