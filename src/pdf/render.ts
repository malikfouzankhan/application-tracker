import "server-only";
import { renderToBuffer } from "@react-pdf/renderer";
import { createElement } from "react";
import { getResumeProfile } from "@/services/answers";
import { getVariantForRender, listVerifiedSkillClaims } from "@/services/resume";
import { ResumeDocument } from "./ResumeDocument";
import { buildResumeLayout, resumeFilename } from "./layout";

/** Renders a variant to PDF. Draft variants render live for review; approved ones are cached. */
export async function renderVariantPdf(variantId: string): Promise<{ pdf: Buffer; filename: string }> {
  const [{ variant, job, items }, profile, skillClaims] = await Promise.all([
    getVariantForRender(variantId),
    getResumeProfile(),
    listVerifiedSkillClaims(),
  ]);

  const layout = buildResumeLayout({
    profile,
    summary: variant.summary,
    items: items.map((i) => ({ claim: i.claim, text: i.text })),
    skillsOrder: variant.skillsOrder,
    skillClaims,
  });
  const filename = resumeFilename(profile.fullName, job.companyName, job.title);
  const title = `${profile.fullName} - ${job.title} at ${job.companyName}`;

  const pdf = await renderToBuffer(createElement(ResumeDocument, { layout, title }) as Parameters<typeof renderToBuffer>[0]);
  return { pdf, filename };
}

export async function variantFilename(variantId: string): Promise<string> {
  const [{ job }, profile] = await Promise.all([getVariantForRender(variantId), getResumeProfile()]);
  return resumeFilename(profile.fullName, job.companyName, job.title);
}
