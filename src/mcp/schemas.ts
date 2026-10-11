import { z } from "zod";

// Shared zod building blocks for MCP tool inputs. Every tool schema is .strict() with
// max lengths and max array sizes (claude.md section 10).

export const uuid = z.uuid();

export const isoDate = z.iso.date();

/** A date (YYYY-MM-DD, read as UTC midnight) or a full ISO timestamp with offset. */
export const sinceDate = z
  .union([z.iso.date(), z.iso.datetime({ offset: true })])
  .transform((value) => new Date(value));

export const isoDateTime = z.iso.datetime({ offset: true }).transform((value) => new Date(value));

export const httpsUrl = z.url({ protocol: /^https$/ }).max(2048);

/** Text Claude writes for MFK to read or send. Em dashes are replaced (claude.md section 15). */
export function generatedText(max: number) {
  return z
    .string()
    .trim()
    .min(1)
    .max(max)
    .transform((value) => value.replace(/\s*\u{2014}\s*/gu, " - "));
}
