// Daily ingestion entry point (claude.md section 6). Run via `pnpm ingest`.
//   pnpm ingest                      all due companies + HN
//   pnpm ingest --only=acme,beta     just these company slugs
//   pnpm ingest --no-hn              skip the HN thread
// Exits non-zero if any source had errors, so the GitHub Action fails and emails MFK.

async function main() {
  // Session pooler: long-running process (claude.md section 2). Must be set before db/client loads.
  process.env.DB_USE_DIRECT = "1";
  const { runIngestion } = await import("@/ingest/run");
  const { closeDb } = await import("@/db/client");

  const args = process.argv.slice(2);
  const only = args.find((a) => a.startsWith("--only="))?.slice("--only=".length);

  const started = Date.now();
  try {
    const result = await runIngestion({
      onlySlugs: only ? only.split(",").map((s) => s.trim()).filter(Boolean) : undefined,
      skipHn: args.includes("--no-hn"),
      log: (line) => console.log(line),
    });

    console.log("\nSource       fetched   new  passed  snowballed  errors");
    for (const s of result.sources) {
      console.log(
        `${s.source.padEnd(12)} ${String(s.fetched).padStart(7)} ${String(s.newJobs).padStart(5)} ${String(s.passedPrefilter).padStart(7)} ${String(s.snowballed).padStart(11)} ${String(s.errors.length).padStart(7)}`,
      );
      for (const e of s.errors) console.log(`  ! ${e.target}: ${e.message}`);
    }
    console.log(
      `\n${result.companiesPolled} companies polled, ${result.prunedToLowFreq} moved to low_freq, ${((Date.now() - started) / 1000).toFixed(1)}s`,
    );
    process.exitCode = result.hadErrors ? 1 : 0;
  } finally {
    await closeDb();
  }
}

main().catch((error) => {
  console.error("Ingestion crashed:", error instanceof Error ? error.name : error);
  process.exitCode = 1;
});
