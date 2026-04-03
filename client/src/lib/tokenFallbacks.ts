import type { TokenPosition } from "@/types";

const TW = (addr: string) =>
  `https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/smartchain/assets/${addr}/logo.png`;

const BNB_CHAIN: TokenPosition["chain"] = {
  id: "binance-smart-chain",
  chainId: 56,
  name: "BNB Chain",
};



/** Ordered list of fallback tokens shown as placeholders when the portfolio is sparse. */
const FALLBACKS: Omit<TokenPosition, "usdValue" | "balance" | "price">[] = [
  {
    id: "fallback-bnb",
    tokenId: "0xb8c77482e45f1f44de1745f52c74426c631bdd52",
    name: "BNB",
    symbol: "BNB",
    decimals: 18,
    address: "0x0000000000000000000000000000000000000000",
    iconUrl: "https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/binance/info/logo.png",
    chain: BNB_CHAIN,
    verified: true,
  },
  {
    id: "fallback-zhentan",
    tokenId: "0x71da0ba87ffbfc41aab54e3dddb980293c8a7777",
    name: "Zhentan",
    symbol: "ZHENTAN",
    decimals: 18,
    address: "0x71da0ba87ffbfc41aab54e3dddb980293c8a7777",
    iconUrl: "https://cdn.dexscreener.com/cms/images/rOBh0EA3qVRGOAxu?width=64&height=64&fit=crop&quality=95&format=auto",
    chain: BNB_CHAIN,
    verified: true,
  },
  {
    id: "fallback-usdc",
    tokenId: "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48",
    name: "USD Coin",
    symbol: "USDC",
    decimals: 18,
    address: "0x8ac76a51cc950d9822d68b83fe1ad97b32cd580d",
    iconUrl: TW("0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d"),
    chain: BNB_CHAIN,
    verified: true,
  },
  {
    id: "fallback-usdt",
    tokenId: "0xdac17f958d2ee523a2206206994597c13d831ec7",
    name: "Tether USD",
    symbol: "USDT",
    decimals: 18,
    address: "0x55d398326f99059ff775485246999027b3197955",
    iconUrl: TW("0x55d398326f99059fF775485246999027B3197955"),
    chain: BNB_CHAIN,
    verified: true,
  },
  {
    id: "fallback-btcb",
    tokenId: "0x2260fac5e5542a773aa44fbcfedf7c193bc2c599",
    name: "Wrapped BTC",
    symbol: "WBTC",
    decimals: 18,
    address: "0x7130d2a12b9bcbfae4f2634d864a1ee1ce3ead9c",
    iconUrl: TW("0x7130d2A12B9BCbFAe4f2634d864A1Ee1Ce3Ead9c"),
    chain: BNB_CHAIN,
    verified: true,
  },
  {
    id: "fallback-eth",
    tokenId: "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2",
    name: "Wrapped Ether",
    symbol: "ETH",
    decimals: 18,
    address: "0x2170ed0880ac9a755fd29b2688956bd959f933f8",
    iconUrl: TW("0x2170Ed0880ac9A755fd29B2688956BD959F933F8"),
    chain: BNB_CHAIN,
    verified: true,
  },
];

/**
 * Pads `tokens` with zero-balance fallback entries so the list has at least
 * `minCount` items. Fallbacks already present in the portfolio are skipped.
 */
export function padTokensWithFallbacks(
  tokens: TokenPosition[],
  minCount = 5
): TokenPosition[] {
  if (tokens.length >= minCount) return tokens;

  const existingAddresses = new Set(
    tokens.map((t) => t.address?.toLowerCase()).filter(Boolean)
  );

  const needed = minCount - tokens.length;
  const placeholders: TokenPosition[] = [];

  for (const fb of FALLBACKS) {
    if (placeholders.length >= needed) break;
    if (existingAddresses.has(fb.address?.toLowerCase() ?? "")) continue;
    placeholders.push({ ...fb, balance: "0", usdValue: null, price: 0, placeholder: true });
  }

  return [...tokens, ...placeholders];
}
