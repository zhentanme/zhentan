import * as jose from "jose";

const PRIVY_APP_ID = process.env.PRIVY_APP_ID ?? "";
const PRIVY_JWT_VERIFICATION_KEY = process.env.PRIVY_JWT_VERIFICATION_KEY ?? "";

let cachedKey: jose.KeyLike | null = null;

async function getPublicKey(): Promise<jose.KeyLike> {
  if (cachedKey) return cachedKey;
  if (!PRIVY_JWT_VERIFICATION_KEY) throw new Error("PRIVY_JWT_VERIFICATION_KEY not set");
  try {
    const jwk = JSON.parse(PRIVY_JWT_VERIFICATION_KEY);
    cachedKey = (await jose.importJWK(jwk, "ES256")) as jose.KeyLike;
  } catch {
    cachedKey = await jose.importSPKI(PRIVY_JWT_VERIFICATION_KEY, "ES256");
  }
  return cachedKey;
}

/**
 * Verifies a Privy identity token and returns the user's Privy DID.
 * Throws if the token is invalid or expired.
 */
export async function verifyPrivyToken(token: string): Promise<{ userId: string }> {
  const key = await getPublicKey();
  const { payload } = await jose.jwtVerify(token, key, {
    issuer: "privy.io",
    audience: PRIVY_APP_ID,
  });
  const userId = payload.sub;
  if (!userId) throw new Error("Invalid token: missing sub");
  return { userId };
}
