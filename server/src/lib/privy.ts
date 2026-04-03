import * as jose from "jose";

const PRIVY_APP_ID = process.env.PRIVY_APP_ID ?? "";
const PRIVY_JWT_VERIFICATION_KEY = process.env.PRIVY_JWT_VERIFICATION_KEY ?? "";

let cachedKey: CryptoKey | null = null;

async function getPublicKey(): Promise<CryptoKey> {
  if (cachedKey) return cachedKey;
  if (!PRIVY_JWT_VERIFICATION_KEY) throw new Error("PRIVY_JWT_VERIFICATION_KEY not set");
  try {
    const jwk = JSON.parse(PRIVY_JWT_VERIFICATION_KEY);
    cachedKey = (await jose.importJWK(jwk, "ES256")) as CryptoKey;
  } catch {
    cachedKey = await jose.importSPKI(PRIVY_JWT_VERIFICATION_KEY, "ES256");
  }
  return cachedKey;
}

type LinkedAccount = {
  type: string;
  address?: string;
  chain_type?: string;
  wallet_client_type?: string;
  connector_type?: string;
  [key: string]: unknown;
};

/**
 * Normalises the linked_accounts claim which Privy encodes as either a
 * JSON-encoded string (older SDKs) or a plain array (newer SDKs).
 */
function parseLinkedAccounts(raw: unknown): LinkedAccount[] {
  if (Array.isArray(raw)) return raw as LinkedAccount[];
  if (typeof raw === "string") {
    try { return JSON.parse(raw) as LinkedAccount[]; } catch { /* fall through */ }
  }
  return [];
}

/**
 * Extracts the Privy embedded wallet address from the JWT's linked_accounts claim.
 * Preference order:
 *   1. Privy-managed embedded wallet (wallet_client_type === "privy")
 *   2. Any ethereum-chain wallet with an address
 * Returns null if nothing usable is found.
 */
function extractWalletAddress(payload: jose.JWTPayload): string | null {
  const accounts = parseLinkedAccounts(payload.linked_accounts);
  if (!accounts.length) return null;

  const ethWallets = accounts.filter(
    (a) => a.type === "wallet" && a.address && a.chain_type !== "solana"
  );

  // Prefer the Privy-managed embedded wallet
  const embedded = ethWallets.find((a) => a.wallet_client_type === "privy");
  const wallet = embedded ?? ethWallets[0];

  return wallet?.address?.toLowerCase() ?? null;
}

/**
 * Verifies a Privy identity token and returns the user's Privy DID
 * plus the embedded wallet address (signer address) if present.
 * Throws if the token is invalid or expired.
 */
export async function verifyPrivyToken(
  token: string
): Promise<{ userId: string; walletAddress: string | null }> {
  const key = await getPublicKey();
  const { payload } = await jose.jwtVerify(token, key, {
    issuer: "privy.io",
    audience: PRIVY_APP_ID,
  });
  const userId = payload.sub;
  if (!userId) throw new Error("Invalid token: missing sub");
  return { userId, walletAddress: extractWalletAddress(payload) };
}
