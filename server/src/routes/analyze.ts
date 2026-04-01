import { Router, Request, Response, type IRouter } from "express";
import { getTransaction, getRecipientProfile } from "../lib/supabase/index.js";

const BSC_CHAIN_ID = "56";

const KNOWN_STABLECOINS = new Set([
  "0x8ac76a51cc950d9822d68b83fe1ad97b32cd580d", // USDC
  "0x55d398326f99059ff775485246999027b3197955", // USDT
  "0xe9e7cea3dedca5984780bafc599bd69add087d56", // BUSD
  "0x1af3f329e8be154074d8769d1ffa4ee058b1dbc3", // DAI
]);

async function fetchJson(url: string): Promise<Record<string, unknown>> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${url}`);
  return res.json() as Promise<Record<string, unknown>>;
}

async function checkAddressSecurity(address: string) {
  try {
    const data = await fetchJson(
      `https://api.gopluslabs.io/api/v1/address_security/${address}?chain_id=${BSC_CHAIN_ID}`
    );
    if (data.code !== 1) return { error: data.message };

    const r = data.result as Record<string, string>;
    const flags: string[] = [];

    if (r.cybercrime === "1") flags.push("Cybercrime associated");
    if (r.money_laundering === "1") flags.push("Money laundering associated");
    if (r.phishing_activities === "1") flags.push("Phishing activities");
    if (r.stealing_attack === "1") flags.push("Stealing attack");
    if (r.blackmail_activities === "1") flags.push("Blackmail activities");
    if (r.sanctioned === "1") flags.push("SANCTIONED address");
    if (r.malicious_mining_activities === "1") flags.push("Malicious mining");
    if (r.darkweb_transactions === "1") flags.push("Darkweb transactions");
    if (r.mixer === "1") flags.push("Mixer usage");
    if (r.honeypot_related_address === "1") flags.push("Honeypot related");
    if (r.fake_kyc === "1") flags.push("Fake KYC");
    if (r.blacklist_doubt === "1") flags.push("Blacklist doubt");
    if (r.financial_crime === "1") flags.push("Financial crime");
    if (r.fake_token === "1") flags.push("Fake token creator");
    if (Number(r.number_of_malicious_contracts_created) > 0)
      flags.push(`Created ${r.number_of_malicious_contracts_created} malicious contracts`);

    return { safe: flags.length === 0, isContract: r.contract_address === "1", flags, dataSource: r.data_source || "GoPlus" };
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) };
  }
}

async function checkTokenSecurity(tokenAddress: string) {
  try {
    const data = await fetchJson(
      `https://api.gopluslabs.io/api/v1/token_security/${BSC_CHAIN_ID}?contract_addresses=${tokenAddress}`
    );
    if (data.code !== 1) return { error: data.message };

    const result = data.result as Record<string, Record<string, unknown>>;
    const token = result[tokenAddress.toLowerCase()];
    if (!token) return { error: "Token not found in GoPlus database" };

    const flags: string[] = [];
    const info: Record<string, unknown> = {
      name: token.token_name || "Unknown",
      symbol: token.token_symbol || "Unknown",
      totalSupply: token.total_supply,
      holderCount: token.holder_count,
      isOpenSource: token.is_open_source === "1",
      isProxy: token.is_proxy === "1",
      creatorAddress: token.creator_address,
      buyTax: token.buy_tax ? `${(parseFloat(token.buy_tax as string) * 100).toFixed(1)}%` : "N/A",
      sellTax: token.sell_tax ? `${(parseFloat(token.sell_tax as string) * 100).toFixed(1)}%` : "N/A",
      lpHolderCount: token.lp_holder_count,
    };

    if (token.is_honeypot === "1") flags.push("HONEYPOT detected");
    if (token.is_mintable === "1") flags.push("Mintable (supply can increase)");
    if (token.can_take_back_ownership === "1") flags.push("Ownership can be reclaimed");
    if (token.owner_change_balance === "1") flags.push("Owner can change balances");
    if (token.hidden_owner === "1") flags.push("Hidden owner");
    if (token.selfdestruct === "1") flags.push("Has selfdestruct");
    if (token.external_call === "1") flags.push("External calls in contract");
    if (token.cannot_buy === "1") flags.push("Cannot buy");
    if (token.cannot_sell_all === "1") flags.push("Cannot sell all");
    if (token.trading_cooldown === "1") flags.push("Trading cooldown enforced");
    if (token.is_blacklisted === "1") flags.push("Has blacklist function");
    if (token.is_whitelisted === "1") flags.push("Has whitelist function");
    if (token.is_anti_whale === "1") flags.push("Anti-whale mechanism");
    if (token.slippage_modifiable === "1") flags.push("Slippage modifiable");
    if (token.personal_slippage_modifiable === "1") flags.push("Per-address slippage modifiable");
    if (token.is_true_token === "0") flags.push("Not a true token (fake)");
    if (token.is_airdrop_scam === "1") flags.push("Airdrop scam");
    if (token.buy_tax && parseFloat(token.buy_tax as string) > 0.05)
      flags.push(`High buy tax: ${(parseFloat(token.buy_tax as string) * 100).toFixed(1)}%`);
    if (token.sell_tax && parseFloat(token.sell_tax as string) > 0.05)
      flags.push(`High sell tax: ${(parseFloat(token.sell_tax as string) * 100).toFixed(1)}%`);

    const holders = token.holders as Array<{ percent?: string }> | undefined;
    if (holders && holders.length > 0 && holders[0].percent && parseFloat(holders[0].percent) > 0.5)
      flags.push(`Top holder owns ${(parseFloat(holders[0].percent) * 100).toFixed(1)}%`);

    if (token.lp_total_supply === "0") flags.push("No liquidity");

    return { info, flags, safe: flags.length === 0 };
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) };
  }
}

async function checkHoneypot(tokenAddress: string) {
  try {
    const data = await fetchJson(
      `https://api.honeypot.is/v2/IsHoneypot?address=${tokenAddress}&chainId=${BSC_CHAIN_ID}`
    ) as Record<string, unknown>;

    const honeypotResult = data.honeypotResult as Record<string, unknown> | undefined;
    const summary = data.summary as Record<string, unknown> | undefined;
    const simulationResult = data.simulationResult as Record<string, unknown> | undefined;
    const contractCode = data.contractCode as Record<string, unknown> | undefined;
    const token = data.token as Record<string, unknown> | undefined;
    const pair = data.pair as Record<string, unknown> | undefined;

    return {
      isHoneypot: honeypotResult?.isHoneypot ?? null,
      riskLevel: summary?.risk ?? "unknown",
      flags: (summary?.flags ?? []) as string[],
      buyTax: simulationResult?.buyTax ?? null,
      sellTax: simulationResult?.sellTax ?? null,
      buyGas: simulationResult?.buyGas ?? null,
      sellGas: simulationResult?.sellGas ?? null,
      simulationSuccess: (data.simulationSuccess ?? false) as boolean,
      isOpenSource: contractCode?.openSource ?? null,
      isProxy: contractCode?.isProxy ?? null,
      hasProxyCalls: contractCode?.hasProxyCalls ?? null,
      tokenName: token?.name ?? null,
      tokenSymbol: token?.symbol ?? null,
      totalHolders: token?.totalHolders ?? null,
      pairLiquidity: pair?.liquidity ?? null,
    };
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) };
  }
}

export function createAnalyzeRouter(): IRouter {
  const router = Router();

  // GET /analyze/:id — deep security analysis for a transaction
  router.get("/:id", async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const callerId = (req.query.callerId as string | undefined) || null;
      console.log("callerId", callerId);

      const tx = await getTransaction(id);
      if (!tx) {
        res.status(404).json({ error: `Transaction not found: ${id}` });
        return;
      }

      // Fetch recipient profile from DB
      const profile = tx.safeAddress
        ? await getRecipientProfile(tx.to.toLowerCase(), tx.safeAddress)
        : null;

      const tokenAddr = (tx.tokenAddress || "").toLowerCase();
      const isKnownStable = KNOWN_STABLECOINS.has(tokenAddr);

      console.log("tokenAddr", tokenAddr);
      console.log("isKnownStable", isKnownStable);
      // Run external API checks in parallel
      const [addressSecurity, tokenSecurity, honeypot] = await Promise.all([
        checkAddressSecurity(tx.to),
        tokenAddr && !isKnownStable ? checkTokenSecurity(tokenAddr) : Promise.resolve(isKnownStable ? { knownStablecoin: true } : null),
        tokenAddr && !isKnownStable ? checkHoneypot(tokenAddr) : Promise.resolve(null),
      ]);

      const allFlags: string[] = [];
      const addrFlags = (addressSecurity as { flags?: string[] }).flags;
      if (addrFlags) allFlags.push(...addrFlags);
      if (!profile) allFlags.push("Unknown recipient (not in patterns)");

      res.json({
        txId: id,
        callerId,
        to: tx.to,
        amount: tx.amount,
        token: tx.token,
        proposedAt: tx.proposedAt,
        recipient: profile
          ? {
              known: true,
              label: profile.label ?? null,
              totalTxCount: profile.total_tx_count,
              avgAmount: profile.avg_amount,
            }
          : { known: false },
        addressSecurity,
        tokenSecurity,
        honeypot,
        totalFlags: allFlags.length,
        allFlags,
        safe: allFlags.length === 0,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      res.status(500).json({ error: message });
    }
  });

  return router;
}
