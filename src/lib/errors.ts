export const errorCodes = [
  "NOT_FOUND",
  "INVALID_INPUT",
  "INVALID_TRANSITION",
  "INVALID_CLAIM",
  "CONFLICT",
  "FORBIDDEN",
  "RATE_LIMITED",
  "MCP_DISABLED",
  "INTERNAL",
] as const;

export type ErrorCode = (typeof errorCodes)[number];

/** Typed error thrown by services. The MCP layer maps `code` to a tool error. */
export class AppError extends Error {
  readonly code: ErrorCode;

  constructor(code: ErrorCode, message: string) {
    super(message);
    this.name = "AppError";
    this.code = code;
  }
}

export function isAppError(error: unknown): error is AppError {
  return error instanceof AppError;
}
