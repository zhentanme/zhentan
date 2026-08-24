import { ApiError, ApiTimeoutError, AuthRequiredError } from "./api.js";

export interface ToolResult {
  [key: string]: unknown;
  content: { type: "text"; text: string }[];
  isError?: boolean;
}

/** Successful tool result: JSON payload the model can read directly. */
export function ok(data: unknown): ToolResult {
  return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
}

/** Failed tool result with a plain-language message. */
export function fail(message: string): ToolResult {
  return { content: [{ type: "text", text: message }], isError: true };
}

/**
 * The `auth_required` envelope (#134), surfaced identically by EVERY tool:
 * the model's only correct move is to relay the server-pinned message
 * verbatim — the instruction rides inside the result so the behavior is
 * mechanical, not interpretive. Not an error result: this IS the answer.
 */
function authRequired(err: AuthRequiredError): ToolResult {
  return ok({
    auth_required: true,
    action:
      "The user's Telegram is not linked to a Zhentan account. Reply with the " +
      "message below EXACTLY as written (verbatim, nothing added or removed) " +
      "and do not call any other tools this turn.",
    message: err.relay,
  });
}

/** Map thrown errors to a tool failure without leaking internals. */
export function failFrom(err: unknown): ToolResult {
  if (err instanceof AuthRequiredError) return authRequired(err);
  if (err instanceof ApiTimeoutError) return fail(err.message);
  if (err instanceof ApiError) return fail(`Server error: ${err.message}`);
  return fail(`Unexpected error: ${err instanceof Error ? err.message : String(err)}`);
}
