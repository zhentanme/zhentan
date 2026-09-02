/**
 * Server-side canonical USD pricing for screened amounts (#144 follow-up).
 *
 * The engine scores in DOLLARS; feeding it token units silently
 * misrepresents value in both directions (0.5 BNB screened as "$0.50").
 * Every intake path prices the transfer HERE — before the row is stored
 * and the screen job enqueued, so the priced value rides the job payload
 * and replays deterministically. The engine itself stays pure: an absent
 * price is an explicit "value unknown" signal there, never a guess.
 *
 * Price source: the Safe's own Zerion portfolio positions — the token
 * being sent is (almost by definition) held by the sender, and position
 * prices are already what the app displays. No trustworthy price → null,
 * which the engine treats as fail-closed (≥ REVIEW), so oracle gaps
 * degrade to over-review, never under-review.
 */
import { getPortfolioForAddress, type TokenPosition } from "../zerion.js";

const NATIVE_SENTINEL = "0x0000000000000000000000000000000000000000";

/** Portfolio cache: pricing must not add a Zerion round-trip per proposal. */
const CACHE_TTL_MS = 60_000;
const positionsCache = new Map<string, { at: number; tokens: TokenPosition[] }>();

async function positionsFor(safeAddress: string): Promise<TokenPosition[]> {
  const key = safeAddress.toLowerCase();
  const hit = positionsCache.get(key);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.tokens;
  const portfolio = await getPortfolioForAddress(key);
  positionsCache.set(key, { at: Date.now(), tokens: portfolio.tokens });
  return portfolio.tokens;
}

/**
 * USD value of `amount` (human units) of a token held by the Safe, as a
 * 2-decimal string, or null when no trustworthy price exists.
 * `tokenAddress` null/undefined = native BNB.
 */
export async function priceTransferUsd(
  safeAddress: string,
  tokenAddress: string | null | undefined,
  amount: string | number
): Promise<string | null> {
  const qty = Number(amount);
  if (!Number.isFinite(qty) || qty < 0) return null;
  if (qty === 0) return "0";

  let tokens: TokenPosition[];
  try {
    tokens = await positionsFor(safeAddress);
  } catch {
    return null;
  }

  const target = (tokenAddress ?? NATIVE_SENTINEL).toLowerCase();
  const position = tokens.find((t) => (t.address ?? NATIVE_SENTINEL).toLowerCase() === target);
  if (!position || !(position.price > 0)) return null;

  return (qty * position.price).toFixed(2);
}

/**
 * Symbol-based variant for request-time scoring, where the kind registry's
 * scoringView carries a token SYMBOL, not an address (no calldata exists
 * yet). Symbols are spoofable — two held positions sharing one symbol is
 * ambiguous, so anything but exactly one priced match returns null and the
 * engine fails closed to ≥ REVIEW.
 */
export async function priceTransferUsdBySymbol(
  safeAddress: string,
  tokenSymbol: string,
  amount: string | number
): Promise<string | null> {
  const qty = Number(amount);
  if (!Number.isFinite(qty) || qty < 0 || !tokenSymbol) return null;
  if (qty === 0) return "0";

  let tokens: TokenPosition[];
  try {
    tokens = await positionsFor(safeAddress);
  } catch {
    return null;
  }

  const symbol = tokenSymbol.toLowerCase();
  const matches = tokens.filter((t) => t.symbol.toLowerCase() === symbol && t.price > 0);
  if (matches.length !== 1) return null;

  return (qty * matches[0].price).toFixed(2);
}
