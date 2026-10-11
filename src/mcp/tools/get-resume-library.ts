import { z } from "zod";
import { archetypeValues } from "@/db/enums";
import { getResumeLibrary } from "@/services/resume";
import { defineTool } from "../guard";

export const getResumeLibraryTool = defineTool({
  name: "get_resume_library",
  kind: "read",
  title: "Get resume library",
  description:
    "MFK's verified, active resume claims (the only facts that may appear on a resume) and the " +
    "base resume for each archetype (summary, ordered claim ids, skills order). Call once per " +
    "routine before tailoring variants.",
  input: z.object({ archetype: z.enum(archetypeValues).optional() }).strict(),
  handler: async ({ archetype }) => {
    const library = await getResumeLibrary({ archetype });
    return {
      claims: library.claims.map(({ id, ...rest }) => ({ claimId: id, ...rest })),
      baseResumes: library.baseResumes.map(({ id, createdAt, updatedAt, ...rest }) => ({
        baseResumeId: id,
        ...rest,
      })),
    };
  },
});
