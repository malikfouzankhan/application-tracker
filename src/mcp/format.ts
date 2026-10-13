import type { CallToolResult } from "@modelcontextprotocol/server";
import type { ErrorCode } from "@/lib/errors";

// Tool output (claude.md section 7.3): compact JSON text, snake_case keys, ISO dates,
// external text nested under `external_content`, list descriptions cut to 1,500 chars.

export const LIST_DESCRIPTION_CHARS = 1500;

function snakeKey(key: string): string {
  return key.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`);
}

/** Deep copy with snake_case keys and Dates as ISO strings. */
function toWire(value: unknown): unknown {
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(toWire);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([, v]) => v !== undefined)
        .map(([k, v]) => [snakeKey(k), toWire(v)]),
    );
  }
  return value;
}

export function truncate(text: string, max: number): { text: string; truncated: boolean } {
  return text.length > max ? { text: text.slice(0, max), truncated: true } : { text, truncated: false };
}

export function toolResult(data: unknown): CallToolResult {
  return { content: [{ type: "text", text: JSON.stringify(toWire(data)) }] };
}

export function toolError(code: ErrorCode, message: string): CallToolResult {
  return {
    isError: true,
    content: [{ type: "text", text: JSON.stringify({ error: { code, message } }) }],
  };
}

type JobLike = {
  id: string;
  url: string;
  title: string;
  companyName: string;
  description: string;
  descriptionTruncated: boolean;
} & Record<string, unknown>;

/** Moves the job description (untrusted internet text) under external_content. */
export function jobForModel({ id, description, descriptionTruncated, ...rest }: JobLike) {
  return {
    jobId: id,
    ...rest,
    externalContent: { description, truncated: descriptionTruncated },
  };
}
