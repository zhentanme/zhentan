import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { callApi, ApiError } from "../api.js";
import { ok, fail, failFrom } from "../result.js";

const CHAT_ID = z.string().regex(/^\d+$/, "chatId is the numeric Telegram chat id, e.g. 593960240");

export function registerProfileTools(server: McpServer) {
  server.registerTool(
    "handle_bot_start",
    {
      title: "Handle /start (bot connect)",
      description:
        "Call when a user sends /start or asks to connect the Zhentan agent. Marks the bot as connected " +
        "for the user's Safe and returns their name/username/safeAddress for a greeting. " +
        "found:false means they haven't linked Telegram in the Zhentan app yet — tell them to link via " +
        "app Settings → Telegram Link.",
      inputSchema: {
        chatId: CHAT_ID.describe("Numeric Telegram chat id from the session (origin.chat.id)"),
      },
    },
    async ({ chatId }) => {
      try {
        const result = await callApi("POST", "/bot-ping", { chatId });
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
        'Fetch the user\'s profile (name, username, email, safeAddress, signerAddress) by Telegram chat id. ' +
        'Use when the user asks "who am I", "my wallet", "my details", or when you need their Safe address ' +
        "for other tools.",
      inputSchema: {
        chatId: CHAT_ID,
      },
    },
    async ({ chatId }) => {
      try {
        const result = await callApi("GET", `/me?chatId=${encodeURIComponent(chatId)}`);
        return ok(result);
      } catch (err) {
        if (err instanceof ApiError && err.status === 404) {
          return fail(
            "No user is linked to this Telegram chat. Ask the user to link Telegram in the Zhentan app (Settings → Telegram Link).",
          );
        }
        return failFrom(err);
      }
    },
  );
}
