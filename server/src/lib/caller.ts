import { getUserByTelegramId } from "./supabase/index.js";

/**
 * Resolves a Safe address from a callerId string.
 * Supports the "telegram:<numeric_id>" format produced by the agent skill.
 * Returns null if the callerId is missing, malformed, or the user is not found.
 */
export async function getSafeAddressFromCallerId(
  callerId: string | undefined | null
): Promise<string | null> {
  if (!callerId) return null;

  if (callerId.startsWith("telegram:")) {
    const telegramId = callerId.slice("telegram:".length);
    if (!telegramId) return null;
    const user = await getUserByTelegramId(telegramId);
    return user?.safe_address ?? null;
  }

  return null;
}
