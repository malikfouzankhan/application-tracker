import "server-only";
import { db } from "@/db/client";
import { ingestionRuns } from "@/db/schema";

export type IngestionError = { target: string; message: string };

export type IngestionRunSummary = {
  source: string;
  startedAt: Date;
  finishedAt: Date;
  fetched: number;
  newJobs: number;
  passedPrefilter: number;
  errors: IngestionError[];
};

/** One row per source per run (claude.md section 6.11). */
export async function recordIngestionRun(run: IngestionRunSummary): Promise<void> {
  await db.insert(ingestionRuns).values({
    source: run.source,
    startedAt: run.startedAt,
    finishedAt: run.finishedAt,
    fetched: run.fetched,
    newJobs: run.newJobs,
    passedPrefilter: run.passedPrefilter,
    errors: run.errors,
  });
}
