/**
 * Deep transaction analysis using external security APIs.
 * Checks recipient address reputation, token security, and honeypot risk.
 *
 * Usage: node skills/zhentan/deep-analyze.js <tx-id>
 *
 * APIs used (all free, no keys required):
 *   - GoPlus Security: address risk + token security
 *   - Honeypot.is: honeypot simulation + buy/sell tax
 */
import { readFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const BSC_CHAIN_ID = "56";

// Well-known stablecoins on BSC — skip honeypot check for these
const KNOWN_STABLECOINS = new Set([
  "0x8ac76a51cc950d9822d68b83fe1ad97b32cd580d", // USDC
  "0x55d398326f99059ff775485246999027b3197955", // USDT
  "0xe9e7cea3dedca5984780bafc599bd69add087d56", // BUSD
  "0x1af3f329e8be154074d8769d1ffa4ee058b1dbc3", // DAI
]);

const txId = process.argv[2];
if (!txId) {
  console.error("Usage: node deep-analyze.js <tx-id>");
  process.exit(1);
}

async function fetchJson(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${url}`);
  return res.json();
}

async function checkAddressSecurity(address) {
  try {
    const data = await fetchJson(
      `https://api.gopluslabs.io/api/v1/address_security/${address}?chain_id=${BSC_CHAIN_ID}`
    );
    if (data.code !== 1) return { error: data.message };

    const r = data.result;
    const flags = [];

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
      flags.push(
        `Created ${r.number_of_malicious_contracts_created} malicious contracts`
      );

    const isContract = r.contract_address === "1";

    return {
      safe: flags.length === 0,
      isContract,
      flags,
      dataSource: r.data_source || "GoPlus",
    };
  } catch (err) {
    return { error: err.message };
  }
}

async function checkTokenSecurity(tokenAddress) {
  try {
    const data = await fetchJson(
      `https://api.gopluslabs.io/api/v1/token_security/${BSC_CHAIN_ID}?contract_addresses=${tokenAddress}`
    );
    if (data.code !== 1) return { error: data.message };

    const token = data.result[tokenAddress.toLowerCase()];
    if (!token) return { error: "Token not found in GoPlus database" };

    const flags = [];
    const info = {};

    info.name = token.token_name || "Unknown";
    info.symbol = token.token_symbol || "Unknown";
    info.totalSupply = token.total_supply;
    info.holderCount = token.holder_count;
    info.isOpenSource = token.is_open_source === "1";
    info.isProxy = token.is_proxy === "1";
    info.creatorAddress = token.creator_address;

    if (token.is_honeypot === "1") flags.push("HONEYPOT detected");
    if (token.is_mintable === "1") flags.push("Mintable (supply can increase)");
    if (token.can_take_back_ownership === "1")
      flags.push("Ownership can be reclaimed");
    if (token.owner_change_balance === "1")
      flags.push("Owner can change balances");
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
    if (token.personal_slippage_modifiable === "1")
      flags.push("Per-address slippage modifiable");
    if (token.is_true_token === "0") flags.push("Not a true token (fake)");
    if (token.is_airdrop_scam === "1") flags.push("Airdrop scam");

    if (token.buy_tax && parseFloat(token.buy_tax) > 0.05)
      flags.push(`High buy tax: ${(parseFloat(token.buy_tax) * 100).toFixed(1)}%`);
    if (token.sell_tax && parseFloat(token.sell_tax) > 0.05)
      flags.push(`High sell tax: ${(parseFloat(token.sell_tax) * 100).toFixed(1)}%`);

    info.buyTax = token.buy_tax
      ? `${(parseFloat(token.buy_tax) * 100).toFixed(1)}%`
      : "N/A";
    info.sellTax = token.sell_tax
      ? `${(parseFloat(token.sell_tax) * 100).toFixed(1)}%`
      : "N/A";

    // Top holder concentration
    if (token.holders && token.holders.length > 0) {
      const topHolder = token.holders[0];
      if (topHolder.percent && parseFloat(topHolder.percent) > 0.5) {
        flags.push(
          `Top holder owns ${(parseFloat(topHolder.percent) * 100).toFixed(1)}%`
        );
      }
    }

    // Liquidity info
    if (token.lp_total_supply === "0") flags.push("No liquidity");
    info.lpHolderCount = token.lp_holder_count;

    return { info, flags, safe: flags.length === 0 };
  } catch (err) {
    return { error: err.message };
  }
}

async function checkHoneypot(tokenAddress) {
  try {
    const data = await fetchJson(
      `https://api.honeypot.is/v2/IsHoneypot?address=${tokenAddress}&chainId=${BSC_CHAIN_ID}`
    );

    return {
      isHoneypot: data.honeypotResult?.isHoneypot ?? null,
      riskLevel: data.summary?.risk ?? "unknown",
      flags: data.summary?.flags ?? [],
      buyTax: data.simulationResult?.buyTax ?? null,
      sellTax: data.simulationResult?.sellTax ?? null,
      buyGas: data.simulationResult?.buyGas ?? null,
      sellGas: data.simulationResult?.sellGas ?? null,
      simulationSuccess: data.simulationSuccess ?? false,
      isOpenSource: data.contractCode?.openSource ?? null,
      isProxy: data.contractCode?.isProxy ?? null,
      hasProxyCalls: data.contractCode?.hasProxyCalls ?? null,
      tokenName: data.token?.name ?? null,
      tokenSymbol: data.token?.symbol ?? null,
      totalHolders: data.token?.totalHolders ?? null,
      pairLiquidity: data.pair?.liquidity ?? null,
    };
  } catch (err) {
    return { error: err.message };
  }
}

async function main() {
  // Load queue and find tx
  const queue = JSON.parse(
    readFileSync(join(__dirname, "pending-queue.json"), "utf8")
  );
  const tx = queue.pending.find((t) => t.id === txId);
  if (!tx) {
    console.log(
      JSON.stringify({
        status: "not_found",
        message: `Transaction ${txId} not found.`,
      })
    );
    process.exit(1);
  }

  // Load patterns for context
  let patterns;
  try {
    patterns = JSON.parse(
      readFileSync(join(__dirname, "patterns.json"), "utf8")
    );
  } catch {
    patterns = { recipients: {} };
  }

  const recipient = patterns.recipients[tx.to.toLowerCase()];
  const tokenAddr = (tx.usdcAddress || "").toLowerCase();
  const isKnownStable = KNOWN_STABLECOINS.has(tokenAddr);

  console.log(`\n🔍 Deep Analysis: ${txId}`);
  console.log(`${"=".repeat(50)}`);
  console.log(`Amount: ${tx.amount} ${tx.token || "USDC"}`);
  console.log(`To: ${tx.to}`);
  console.log(`Proposed: ${tx.proposedAt}`);
  if (recipient) {
    console.log(
      `Recipient known as: ${recipient.label || "unlabeled"} (${recipient.totalTxCount} past txs, avg ${recipient.avgAmount})`
    );
  } else {
    console.log(`Recipient: UNKNOWN (first time)`);
  }

  // 1. GoPlus Address Security
  console.log(`\n📋 Address Security (GoPlus)`);
  console.log(`${"-".repeat(40)}`);
  const addrResult = await checkAddressSecurity(tx.to);
  if (addrResult.error) {
    console.log(`⚠️  Error: ${addrResult.error}`);
  } else if (addrResult.safe) {
    console.log(`✅ No known risks found for this address`);
    if (addrResult.isContract) console.log(`ℹ️  Address is a contract`);
  } else {
    console.log(`🚨 RISKS DETECTED:`);
    addrResult.flags.forEach((f) => console.log(`   ❌ ${f}`));
    if (addrResult.isContract) console.log(`ℹ️  Address is a contract`);
  }

  // 2. GoPlus Token Security
  if (tokenAddr) {
    console.log(`\n🪙 Token Security (GoPlus)`);
    console.log(`${"-".repeat(40)}`);
    if (isKnownStable) {
      console.log(`✅ Known stablecoin — skipping detailed check`);
    } else {
      const tokenResult = await checkTokenSecurity(tokenAddr);
      if (tokenResult.error) {
        console.log(`⚠️  Error: ${tokenResult.error}`);
      } else {
        console.log(`Name: ${tokenResult.info.name} (${tokenResult.info.symbol})`);
        console.log(`Holders: ${tokenResult.info.holderCount}`);
        console.log(`Open source: ${tokenResult.info.isOpenSource ? "Yes" : "No"}`);
        console.log(`Proxy: ${tokenResult.info.isProxy ? "Yes" : "No"}`);
        console.log(
          `Tax: Buy ${tokenResult.info.buyTax} / Sell ${tokenResult.info.sellTax}`
        );

        if (tokenResult.safe) {
          console.log(`✅ No token security flags`);
        } else {
          console.log(`🚨 TOKEN FLAGS:`);
          tokenResult.flags.forEach((f) => console.log(`   ❌ ${f}`));
        }
      }
    }
  }

  // 3. Honeypot.is check
  if (tokenAddr && !isKnownStable) {
    console.log(`\n🍯 Honeypot Check (honeypot.is)`);
    console.log(`${"-".repeat(40)}`);
    const hpResult = await checkHoneypot(tokenAddr);
    if (hpResult.error) {
      console.log(`⚠️  Error: ${hpResult.error}`);
    } else {
      console.log(`Honeypot: ${hpResult.isHoneypot ? "🚨 YES" : "✅ No"}`);
      console.log(`Risk level: ${hpResult.riskLevel}`);
      console.log(`Simulation: ${hpResult.simulationSuccess ? "Success" : "Failed"}`);
      if (hpResult.buyTax !== null)
        console.log(
          `Tax: Buy ${(hpResult.buyTax * 100).toFixed(1)}% / Sell ${(hpResult.sellTax * 100).toFixed(1)}%`
        );
      if (hpResult.pairLiquidity !== null)
        console.log(
          `Liquidity: $${Number(hpResult.pairLiquidity).toLocaleString()}`
        );
      if (hpResult.totalHolders !== null)
        console.log(`Holders: ${hpResult.totalHolders.toLocaleString()}`);
      if (hpResult.flags.length > 0) {
        console.log(`Flags:`);
        hpResult.flags.forEach((f) => console.log(`   ⚠️  ${f}`));
      }
    }
  }

  // 4. Overall risk summary
  console.log(`\n📊 Summary`);
  console.log(`${"=".repeat(50)}`);

  const allFlags = [];
  if (addrResult.flags) allFlags.push(...addrResult.flags);
  if (!recipient) allFlags.push("Unknown recipient (not in patterns)");

  if (allFlags.length === 0) {
    console.log(`✅ No security risks detected. Transaction appears safe.`);
  } else {
    console.log(`⚠️  ${allFlags.length} risk factor(s) found:`);
    allFlags.forEach((f) => console.log(`   • ${f}`));
  }

  // JSON output for programmatic use
  console.log(`\n---JSON---`);
  console.log(
    JSON.stringify({
      txId,
      to: tx.to,
      amount: tx.amount,
      token: tx.token,
      addressSecurity: addrResult,
      knownRecipient: !!recipient,
      recipientLabel: recipient?.label || null,
      recipientTxCount: recipient?.totalTxCount || 0,
      totalFlags: allFlags.length,
    })
  );
}

main().catch((err) => {
  console.error(
    JSON.stringify({ status: "error", message: err.message })
  );
  process.exit(1);
});
