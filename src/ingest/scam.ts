// Scam signals (claude.md section 6.8). Flags are stored and surfaced, never used to drop.

export const scamFlagValues = [
  "fee_request",
  "freemail_recruiter",
  "unrealistic_pay",
  "missing_company",
  "messaging_app_contact",
] as const;
export type ScamFlag = (typeof scamFlagValues)[number];

const FEE_REQUEST =
  /\b(registration|security|processing|training|joining|application|onboarding|refundable)\s+(fee|fees|deposit|charges?|amount)\b|\b(pay|deposit|transfer)\b[^.\n]{0,40}\b(fee|deposit|amount|rs\.?|inr|₹|\$)|\bfee\b[^.\n]{0,30}\b(to apply|for (the )?(interview|training|job|offer))/i;

const FREEMAIL =
  /\b[a-z0-9._%+-]+@(gmail|googlemail|yahoo|ymail|hotmail|outlook|live|rediffmail|aol|proton|protonmail|icloud|zoho)\.(com|co\.in|in|me)\b/i;

// High pay for little work, typical of task/"work from home" scams.
const UNREALISTIC_PAY =
  /\b(earn|income|salary|pay)\b[^.\n]{0,40}(₹|rs\.?|inr|\$|usd)\s?\d[\d,]*\s*(k|\+)?\s*(per|\/|a)\s*(day|week|hour|hr)\b|\b(daily|weekly)\s+(payout|payment|income)\b|\bno (experience|interview) (needed|required)\b[^.\n]{0,60}\b(earn|income|salary)\b/i;

const MESSAGING_APP = /\b(whatsapp|telegram)\b[^.\n]{0,40}(\+?\d[\d\s-]{8,}|\bme\b|\bus\b|\bhr\b|\brecruiter\b)/i;

const PLACEHOLDER_COMPANY =
  /^(confidential|undisclosed|not disclosed|hiring|company|private|stealth|n\/?a|unknown|-)?$/i;

export function detectScamFlags(input: {
  companyName: string;
  title: string;
  description: string;
}): ScamFlag[] {
  const text = `${input.title}\n${input.description}`;
  const flags: ScamFlag[] = [];

  if (FEE_REQUEST.test(text)) flags.push("fee_request");
  if (FREEMAIL.test(text)) flags.push("freemail_recruiter");
  if (UNREALISTIC_PAY.test(text)) flags.push("unrealistic_pay");
  if (PLACEHOLDER_COMPANY.test(input.companyName.trim())) flags.push("missing_company");
  if (MESSAGING_APP.test(text)) flags.push("messaging_app_contact");

  return flags;
}
