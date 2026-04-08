/**
 * Utilities for computing Safe EIP-1271 message hashes and bundling signatures.
 *
 * Safe's CompatibilityFallbackHandler.isValidSignature(bytes32 dataHash, bytes sig) works as:
 *   1. Converts dataHash → bytes via abi.encodePacked
 *   2. Computes: safeHash = keccak256(0x19 ++ 0x01 ++ domainSeparator ++ keccak256(abi.encode(SAFE_MSG_TYPEHASH, keccak256(dataHashBytes))))
 *   3. Calls safe.checkSignatures(safeHash, data, sig)
 *
 * Each owner must sign `safeHash` with personal_sign (EIP-191 prefix, v=27/28).
 * Signatures must be concatenated sorted by signer address (ascending).
 */

import {
  keccak256,
  encodeAbiParameters,
  parseAbiParameters,
  encodePacked,
  hashMessage,
  hashTypedData,
  hexToBytes,
  type Address,
  type Hex,
} from "viem";
import { bsc } from "viem/chains";

// keccak256("EIP712Domain(uint256 chainId,address verifyingContract)")
const DOMAIN_SEPARATOR_TYPEHASH: Hex =
  "0x47e79534a245952e8b16893a336b85a3d9ea9fa8c573f3d803afb92a79469218";

// keccak256("SafeMessage(bytes message)")
const SAFE_MSG_TYPEHASH: Hex =
  "0x60b3cbf8b4a223d68d641b3b6ddf9a298e7f33710cf3d3a9d1146b5a6150fbca";

/**
 * Compute the Safe-domain-specific hash that both owners must sign for EIP-1271.
 * This mirrors Safe's `getMessageHashForSafe(safe, abi.encodePacked(dataHash))`.
 */
export function computeSafeMessageHash(safeAddress: Address, dataHash: Hex): Hex {
  const chainId = bsc.id;

  const domainSeparator = keccak256(
    encodeAbiParameters(parseAbiParameters("bytes32, uint256, address"), [
      DOMAIN_SEPARATOR_TYPEHASH,
      BigInt(chainId),
      safeAddress,
    ])
  );

  // message = abi.encodePacked(dataHash) = the 32 raw bytes; keccak256 of those bytes
  const msgHash = keccak256(dataHash);

  const innerHash = keccak256(
    encodeAbiParameters(parseAbiParameters("bytes32, bytes32"), [
      SAFE_MSG_TYPEHASH,
      msgHash,
    ])
  );

  return keccak256(
    encodePacked(
      ["bytes1", "bytes1", "bytes32", "bytes32"],
      ["0x19", "0x01", domainSeparator, innerHash]
    )
  );
}

/**
 * Derive the `dataHash` (what the DApp passes to isValidSignature) from WalletConnect params.
 *
 * For personal_sign / eth_sign:   EIP-191 prefixed hash of the raw message bytes.
 * For eth_signTypedData_v4:       EIP-712 typed data hash.
 */
export function computeDataHash(
  method: "personal_sign" | "eth_sign" | "eth_signTypedData" | "eth_signTypedData_v4",
  params: unknown[]
): Hex {
  if (method === "personal_sign") {
    const msgHex = params[0] as Hex;
    return hashMessage({ raw: hexToBytes(msgHex) });
  }

  if (method === "eth_sign") {
    const msgHex = params[1] as Hex;
    return hashMessage({ raw: hexToBytes(msgHex) });
  }

  // eth_signTypedData / eth_signTypedData_v4
  const raw = params[1] as string;
  const typedData = JSON.parse(raw);
  const { domain, types, primaryType, message } = typedData;
  // viem requires EIP712Domain to be excluded from types
  const { EIP712Domain: _unused, ...filteredTypes } = types;
  return hashTypedData({ domain, types: filteredTypes, primaryType, message });
}

/**
 * Bundle owner + agent signatures into a single EIP-1271 payload for Safe.
 * Signatures must be sorted by signer address (ascending) per Safe's checkSignatures.
 */
export function bundleSignatures(
  sigs: { signer: Address; sig: Hex }[]
): Hex {
  const sorted = [...sigs].sort((a, b) =>
    a.signer.toLowerCase() < b.signer.toLowerCase() ? -1 : 1
  );
  return ("0x" + sorted.map((s) => s.sig.slice(2)).join("")) as Hex;
}
