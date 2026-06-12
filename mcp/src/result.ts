import { ApiError, ApiTimeoutError } from "./api.js";

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

/** Map thrown errors to a tool failure without leaking internals. */
export function failFrom(err: unknown): ToolResult {
  if (err instanceof ApiTimeoutError) return fail(err.message);
  if (err instanceof ApiError) return fail(`Server error: ${err.message}`);
  return fail(`Unexpected error: ${err instanceof Error ? err.message : String(err)}`);
}
