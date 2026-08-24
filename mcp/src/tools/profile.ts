import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { callApi, ApiError } from "../api.js";
import { ok, fail, failFrom } from "../result.js";

const CALLER_ID = z
  .string()
  .regex(/^telegram:\d+$/, 'callerId must be "telegram:<numeric user id>"')
  .describe("Telegram caller identity from session context, e.g. telegram:593960240");

export function registerProfileTools(server: McpServer) {
  server.registerTool(
    "handle_bot_start",
    {
      title: "Verify chat session (bot start / link)",
      description:
        "MANDATORY first call for ANY message from a chat session you haven't verified yet, and for " +
        "/start or 'connect'. For a linked user it returns their name/username/safeAddress for a " +
        "greeting. For an UNLINKED chat it returns an auth_required message — relay that message " +
        "verbatim and do nothing else; repeat calls return the same message until the user completes " +
        "the link. Pass the chat context fields so the account-side confirmation can show the user " +
        "which Telegram they are linking. Set requestLink:true ONLY when an already-linked user " +
        "explicitly asks to link/relink/connect this Telegram to an account.",
      inputSchema: {
        callerId: CALLER_ID,
        chatId: z
          .string()
          .regex(/^\d+$/, "chatId is the numeric private-chat id, e.g. 593960240")
          .describe("Numeric Telegram chat id from the session (origin.chat.id)"),
        telegramUsername: z
          .string()
          .optional()
          .describe("Sender's Telegram @username from session context, without the @"),
        telegramName: z
          .string()
          .optional()
          .describe("Sender's display/first name from session context"),
        requestLink: z
          .boolean()
          .optional()
          .describe("true only on an explicit link/relink request from an already-linked user"),
      },
    },
    async ({ callerId, chatId, telegramUsername, telegramName, requestLink }) => {
      try {
        const result = await callApi(
          "POST",
          "/bot-start",
          {
            callerId,
            chatId,
            ...(telegramUsername ? { telegramUsername } : {}),
            ...(telegramName ? { telegramName } : {}),
            ...(requestLink ? { requestLink: true } : {}),
          },
          30_000,
          callerId,
        );
        return ok(result);
      } catch (err) {
        return failFrom(err);
      }
    },
  );

  server.registerTool(
    "get_user_profile",
    {
      title: "Get user profile",
      description:
        'Fetch the user\'s profile (name, username, email, safeAddress, signerAddress). ' +
        'Use when the user asks "who am I", "my wallet", "my details".',
      inputSchema: {
        callerId: CALLER_ID,
      },
    },
    async ({ callerId }) => {
      try {
        const result = await callApi("GET", "/me", undefined, 30_000, callerId);
        return ok(result);
      } catch (err) {
        if (err instanceof ApiError && err.status === 404) {
          return fail(
            "No Zhentan account found for this Telegram. Ask the user to message the bot to get a link, or finish onboarding at the Zhentan app.",
          );
        }
        return failFrom(err);
      }
    },
  );
}
