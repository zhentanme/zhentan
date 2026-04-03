import type { Address } from "viem";
import { updateCampaignClaim } from "./supabase/index.js";
import { sendTokenFromTreasury } from "./treasury.js";

const DEFAULT_TOKEN_ADDRESS = process.env.TREASURY_TOKEN_ADDRESS;
const DEFAULT_TOKEN_DECIMALS = Number(process.env.TREASURY_TOKEN_DECIMALS ?? "18");

/**
 * Sends tokens from the treasury Safe to a campaign claim recipient and
 * marks the claim as paid.
 *
 * @param campaignId   Campaign identifier
 * @param safeAddress  Recipient's Safe address
 * @param tokenAmount  Human-readable amount (taken from the claim row)
 * @param tokenAddress ERC-20 contract address; falls back to TREASURY_TOKEN_ADDRESS
 * @param decimals     Token decimals; falls back to TREASURY_TOKEN_DECIMALS (default 18)
 */
export async function payCampaignClaim(
  campaignId: string,
  safeAddress: string,
  tokenAmount: string,
  tokenAddress?: string,
  decimals?: number
): Promise<string> {
  const addr = tokenAddress ?? DEFAULT_TOKEN_ADDRESS;
  if (!addr) {
    throw new Error(
      "Token address required: pass tokenAddress or set TREASURY_TOKEN_ADDRESS"
    );
  }

  const txHash = await sendTokenFromTreasury(
    safeAddress as Address,
    addr as Address,
    tokenAmount,
    decimals ?? DEFAULT_TOKEN_DECIMALS
  );

  await updateCampaignClaim(campaignId, safeAddress, {
    status: "paid",
    tx_hash: txHash,
    paid_at: new Date().toISOString(),
  });

  return txHash;
}
