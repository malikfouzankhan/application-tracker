// Seeds the watchlist with companies that hire in India or remote-from-India on public
// Greenhouse / Lever / Ashby boards. Each board is fetched first and skipped if it does not
// exist, so a typo can never make the daily run fail. Safe to re-run (existing boards are kept).
// Run via `pnpm seed:companies`. Edit the list freely; mark dream companies in /companies.

import type { WatchCompanyInput } from "@/services/companies";

const SEED: WatchCompanyInput[] = [
  // Greenhouse
  { name: "Groww", ats: "greenhouse", boardToken: "groww" },
  { name: "HackerRank", ats: "greenhouse", boardToken: "hackerrank" },
  { name: "Druva", ats: "greenhouse", boardToken: "druva" },
  { name: "Stripe", ats: "greenhouse", boardToken: "stripe" },
  { name: "Databricks", ats: "greenhouse", boardToken: "databricks" },
  { name: "Cloudflare", ats: "greenhouse", boardToken: "cloudflare" },
  { name: "GitLab", ats: "greenhouse", boardToken: "gitlab" },
  { name: "MongoDB", ats: "greenhouse", boardToken: "mongodb" },
  { name: "Elastic", ats: "greenhouse", boardToken: "elastic" },
  { name: "Okta", ats: "greenhouse", boardToken: "okta" },
  { name: "Twilio", ats: "greenhouse", boardToken: "twilio" },
  { name: "Coinbase", ats: "greenhouse", boardToken: "coinbase" },
  { name: "Samsara", ats: "greenhouse", boardToken: "samsara" },
  { name: "Zscaler", ats: "greenhouse", boardToken: "zscaler" },
  { name: "New Relic", ats: "greenhouse", boardToken: "newrelic" },
  { name: "Vercel", ats: "greenhouse", boardToken: "vercel" },
  // Lever
  { name: "CRED", ats: "lever", boardToken: "cred" },
  { name: "Meesho", ats: "lever", boardToken: "meesho" },
  { name: "Zeta", ats: "lever", boardToken: "zeta" },
  { name: "Paytm", ats: "lever", boardToken: "paytm" },
  { name: "Nium", ats: "lever", boardToken: "nium" },
  { name: "Hevo Data", ats: "lever", boardToken: "hevodata" },
  { name: "FamPay", ats: "lever", boardToken: "fampay" },
  // Ashby
  { name: "Supabase", ats: "ashby", boardToken: "supabase" },
  { name: "PostHog", ats: "ashby", boardToken: "posthog" },
  { name: "Linear", ats: "ashby", boardToken: "linear" },
  { name: "Replit", ats: "ashby", boardToken: "replit" },
  { name: "Cursor", ats: "ashby", boardToken: "cursor" },
  { name: "Perplexity", ats: "ashby", boardToken: "perplexity" },
  { name: "Sentry", ats: "ashby", boardToken: "sentry" },
  { name: "Resend", ats: "ashby", boardToken: "resend" },
];

async function main() {
  process.env.DB_USE_DIRECT = "1";
  const { addWatchCompanies } = await import("@/services/companies");
  const { systemContext } = await import("@/services/context");
  const { ATS_SOURCES } = await import("@/ingest/sources");
  const { fetchJson } = await import("@/ingest/http");
  const { mapWithConcurrency } = await import("@/ingest/pool");
  const { closeDb } = await import("@/db/client");

  try {
    const checks = await mapWithConcurrency(SEED, 6, async (company) => {
      const source = ATS_SOURCES[company.ats];
      try {
        const jobs = source.parse(await fetchJson(source.boardUrl(company.boardToken)), {
          id: "00000000-0000-0000-0000-000000000000",
          name: company.name,
          boardToken: company.boardToken,
        });
        // Ashby answers 200 with an empty list for some unknown names.
        if (company.ats === "ashby" && jobs.length === 0) return { company, ok: false, reason: "empty Ashby board" };
        return { company, ok: true, reason: `${jobs.length} jobs` };
      } catch (error) {
        return { company, ok: false, reason: error instanceof Error ? error.message : "failed" };
      }
    });

    for (const c of checks) {
      console.log(`${c.ok ? "ok  " : "skip"} ${c.company.ats.padEnd(10)} ${c.company.boardToken.padEnd(14)} ${c.reason}`);
    }

    const valid = checks.filter((c) => c.ok).map((c) => c.company);
    const result = valid.length ? await addWatchCompanies(valid, systemContext) : { added: [], existing: 0 };
    console.log(`\n${result.added.length} added, ${result.existing} already watched, ${checks.length - valid.length} skipped`);
  } finally {
    await closeDb();
  }
}

main().catch((error) => {
  console.error("Seeding failed:", error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
