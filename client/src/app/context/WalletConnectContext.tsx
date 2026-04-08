"use client";

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useRef,
  type ReactNode,
} from "react";
import { Core } from "@walletconnect/core";
import { WalletKit, type WalletKitTypes } from "@reown/walletkit";
import { buildApprovedNamespaces, getSdkError } from "@walletconnect/utils";
import { useAuth } from "./AuthContext";
import { proposeDappTransaction } from "@/lib/propose-dapp";
import { useApiClient, apiFetch } from "@/lib/api/client";
import { hexToBytes } from "viem";
import type { DappMetadata, TransactionWithStatus } from "@/types";

type SessionMap = Record<string, WalletKitTypes.SessionRequest["params"]>;

interface WCPendingRequest {
  id: number;
  topic: string;
  method: string;
  params: unknown[];
  dappMetadata?: DappMetadata;
}

interface WCPendingSignRequest {
  id: number;
  topic: string;
  method: "personal_sign" | "eth_sign" | "eth_signTypedData" | "eth_signTypedData_v4";
  params: unknown[];
  dappMetadata?: DappMetadata;
}

interface WalletConnectContextType {
  ready: boolean;
  pair: (uri: string) => Promise<void>;
  sessions: SessionMap;
  sessionProposal: WalletKitTypes.SessionProposal | null;
  pendingRequest: WCPendingRequest | null;
  pendingSignRequest: WCPendingSignRequest | null;
  approveSession: () => Promise<void>;
  rejectSession: () => Promise<void>;
  approveRequest: () => Promise<string>;
  rejectRequest: () => Promise<void>;
  approveSignRequest: () => Promise<string>;
  rejectSignRequest: () => Promise<void>;
  disconnectSession: (topic: string) => Promise<void>;
  requestStatus: "idle" | "signing" | "queued" | "polling" | "success" | "error";
  requestTxHash: string | null;
  requestError: string | null;
  resetRequestState: () => void;
  signStatus: "idle" | "signing" | "success" | "error";
  signResult: string | null;
  signError: string | null;
  resetSignState: () => void;
}

const WalletConnectContext = createContext<WalletConnectContextType | null>(null);

const BNB_CHAIN_ID = "eip155:56";
const SUPPORTED_METHODS = [
  "eth_sendTransaction",
  "personal_sign",
  "eth_signTypedData",
  "eth_signTypedData_v4",
  "eth_sign",
  "eth_accounts",
  "eth_chainId",
];
const SUPPORTED_EVENTS = ["chainChanged", "accountsChanged"];

export function WalletConnectProvider({ children }: { children: ReactNode }) {
  const { wallet, getOwnerAccount, safeAddress, identityToken } = useAuth();
  const api = useApiClient();
  const [walletKit, setWalletKit] = useState<InstanceType<typeof WalletKit> | null>(null);
  const [ready, setReady] = useState(false);
  const [sessions, setSessions] = useState<SessionMap>({});
  const [sessionProposal, setSessionProposal] = useState<WalletKitTypes.SessionProposal | null>(null);
  const [pendingRequest, setPendingRequest] = useState<WCPendingRequest | null>(null);
  const [pendingSignRequest, setPendingSignRequest] = useState<WCPendingSignRequest | null>(null);
  const [requestStatus, setRequestStatus] = useState<WalletConnectContextType["requestStatus"]>("idle");
  const [requestTxHash, setRequestTxHash] = useState<string | null>(null);
  const [requestError, setRequestError] = useState<string | null>(null);
  const [signStatus, setSignStatus] = useState<WalletConnectContextType["signStatus"]>("idle");
  const [signResult, setSignResult] = useState<string | null>(null);
  const [signError, setSignError] = useState<string | null>(null);
  const walletKitRef = useRef<InstanceType<typeof WalletKit> | null>(null);
  const initRef = useRef(false);

  // Initialize WalletKit
  useEffect(() => {
    const projectId = process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID;
    if (!projectId || initRef.current) return;
    initRef.current = true;

    (async () => {
      try {
        const core = new Core({ projectId });
        const kit = await WalletKit.init({
          core,
          metadata: {
            name: "Zhentan",
            description: "AI-secured wallet on BNB Chain",
            url: "https://zhentan.me",
            icons: [],
          },
        });
        walletKitRef.current = kit;
        setWalletKit(kit);
        setReady(true);

        // Restore active sessions
        const active = kit.getActiveSessions();
        if (active && Object.keys(active).length > 0) {
          const mapped: SessionMap = {};
          for (const [topic, session] of Object.entries(active)) {
            mapped[topic] = session as unknown as WalletKitTypes.SessionRequest["params"];
          }
          setSessions(mapped);
        }
      } catch (err) {
        console.error("WalletKit init failed:", err);
      }
    })();
  }, []);

  // Register event listeners
  useEffect(() => {
    if (!walletKit) return;

    const handleSessionProposal = (proposal: WalletKitTypes.SessionProposal) => {
      setSessionProposal(proposal);
    };

    const handleSessionRequest = (event: WalletKitTypes.SessionRequest) => {
      const { id, topic, params } = event;
      const { request } = params;

      // Get DApp metadata from session
      const activeSessions = walletKit.getActiveSessions();
      const session = activeSessions[topic];
      const peer = session?.peer?.metadata;
      const dappMeta: DappMetadata | undefined = peer
        ? { name: peer.name, url: peer.url, icons: peer.icons, description: peer.description }
        : undefined;

      if (request.method === "eth_chainId") {
        // Respond immediately
        walletKit.respondSessionRequest({
          topic,
          response: { id, jsonrpc: "2.0", result: "0x38" },
        });
        return;
      }

      if (request.method === "eth_accounts") {
        walletKit.respondSessionRequest({
          topic,
          response: { id, jsonrpc: "2.0", result: safeAddress ? [safeAddress] : [] },
        });
        return;
      }

      if (request.method === "eth_sendTransaction") {
        setPendingRequest({
          id,
          topic,
          method: request.method,
          params: request.params,
          dappMetadata: dappMeta,
        });
        return;
      }

      if (
        request.method === "personal_sign" ||
        request.method === "eth_sign" ||
        request.method === "eth_signTypedData" ||
        request.method === "eth_signTypedData_v4"
      ) {
        setPendingSignRequest({
          id,
          topic,
          method: request.method as WCPendingSignRequest["method"],
          params: request.params,
          dappMetadata: dappMeta,
        });
        return;
      }

      // Unsupported methods
      walletKit.respondSessionRequest({
        topic,
        response: {
          id,
          jsonrpc: "2.0",
          error: getSdkError("UNSUPPORTED_METHODS"),
        },
      });
    };

    const handleSessionDelete = () => {
      const active = walletKit.getActiveSessions();
      const mapped: SessionMap = {};
      for (const [topic, session] of Object.entries(active)) {
        mapped[topic] = session as unknown as WalletKitTypes.SessionRequest["params"];
      }
      setSessions(mapped);
    };

    walletKit.on("session_proposal", handleSessionProposal);
    walletKit.on("session_request", handleSessionRequest);
    walletKit.on("session_delete", handleSessionDelete);

    return () => {
      walletKit.off("session_proposal", handleSessionProposal);
      walletKit.off("session_request", handleSessionRequest);
      walletKit.off("session_delete", handleSessionDelete);
    };
  }, [walletKit, safeAddress]);

  const pair = useCallback(
    async (uri: string) => {
      if (!walletKit) throw new Error("WalletKit not ready");
      await walletKit.pair({ uri });
    },
    [walletKit]
  );

  const approveSession = useCallback(async () => {
    if (!walletKit || !sessionProposal || !safeAddress) return;

    const namespaces = buildApprovedNamespaces({
      proposal: sessionProposal.params,
      supportedNamespaces: {
        eip155: {
          chains: [BNB_CHAIN_ID],
          methods: SUPPORTED_METHODS,
          events: SUPPORTED_EVENTS,
          accounts: [`${BNB_CHAIN_ID}:${safeAddress}`],
        },
      },
    });

    await walletKit.approveSession({
      id: sessionProposal.id,
      namespaces,
    });

    setSessionProposal(null);

    // Refresh sessions
    const active = walletKit.getActiveSessions();
    const mapped: SessionMap = {};
    for (const [topic, session] of Object.entries(active)) {
      mapped[topic] = session as unknown as WalletKitTypes.SessionRequest["params"];
    }
    setSessions(mapped);
  }, [walletKit, sessionProposal, safeAddress]);

  const rejectSession = useCallback(async () => {
    if (!walletKit || !sessionProposal) return;
    await walletKit.rejectSession({
      id: sessionProposal.id,
      reason: getSdkError("USER_REJECTED"),
    });
    setSessionProposal(null);
  }, [walletKit, sessionProposal]);

  const approveSignRequest = useCallback(async (): Promise<string> => {
    if (!walletKit || !pendingSignRequest || !wallet) {
      throw new Error("Not ready to sign");
    }

    setSignStatus("signing");

    try {
      const ownerAccount = await getOwnerAccount();
      if (!ownerAccount) throw new Error("Could not get signer account");

      // ownerAccount is a viem WalletClient spread, cast to access sign methods
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const client = ownerAccount as any;

      let signature: string;
      const { method, params } = pendingSignRequest;

      if (method === "personal_sign") {
        // params: [message_hex, address]
        const messageHex = params[0] as `0x${string}`;
        signature = await client.signMessage({
          account: wallet.address,
          message: { raw: hexToBytes(messageHex) },
        });
      } else if (method === "eth_sign") {
        // params: [address, message_hex] — reversed from personal_sign
        const messageHex = params[1] as `0x${string}`;
        signature = await client.signMessage({
          account: wallet.address,
          message: { raw: hexToBytes(messageHex) },
        });
      } else {
        // eth_signTypedData / eth_signTypedData_v4
        // params: [address, typedDataJson]
        const typedData = JSON.parse(params[1] as string);
        const { domain, types, primaryType, message } = typedData;
        // Remove EIP712Domain from types if present (viem adds it automatically)
        const { EIP712Domain: _eip712Domain, ...filteredTypes } = types;
        signature = await client.signTypedData({
          account: wallet.address,
          domain,
          types: filteredTypes,
          primaryType,
          message,
        });
      }

      await walletKit.respondSessionRequest({
        topic: pendingSignRequest.topic,
        response: { id: pendingSignRequest.id, jsonrpc: "2.0", result: signature },
      });

      setSignResult(signature);
      setSignStatus("success");
      setPendingSignRequest(null);
      return signature;
    } catch (err) {
      const message = err instanceof Error ? err.message : "Signing failed";
      setSignStatus("error");
      setSignError(message);
      await walletKit.respondSessionRequest({
        topic: pendingSignRequest.topic,
        response: {
          id: pendingSignRequest.id,
          jsonrpc: "2.0",
          error: { code: -32000, message },
        },
      });
      throw err;
    }
  }, [walletKit, pendingSignRequest, wallet, getOwnerAccount]);

  const rejectSignRequest = useCallback(async () => {
    if (!walletKit || !pendingSignRequest) return;
    await walletKit.respondSessionRequest({
      topic: pendingSignRequest.topic,
      response: {
        id: pendingSignRequest.id,
        jsonrpc: "2.0",
        error: getSdkError("USER_REJECTED"),
      },
    });
    setPendingSignRequest(null);
    setSignStatus("idle");
  }, [walletKit, pendingSignRequest]);

  const resetSignState = useCallback(() => {
    setSignStatus("idle");
    setSignResult(null);
    setSignError(null);
  }, []);

  const approveRequest = useCallback(async (): Promise<string> => {
    if (!walletKit || !pendingRequest || !wallet || !safeAddress) {
      throw new Error("Not ready to approve request");
    }

    const txParams = (pendingRequest.params as Array<{
      to?: string;
      value?: string;
      data?: string;
    }>)[0];
    if (!txParams?.to) throw new Error("Invalid transaction params");

    setRequestStatus("signing");

    try {
      // Check screening mode before propose so queue can skip risk when off (same as SendPanel)
      let screeningOn = true;
      if (safeAddress) {
        try {
          const statusData = await api.status.get(safeAddress);
          screeningOn = statusData.screeningMode !== false;
        } catch {
          // Default to screening on if status fetch fails
        }
      }

      const pending = await proposeDappTransaction({
        to: txParams.to,
        value: txParams.value ? BigInt(txParams.value) : 0n,
        data: txParams.data || "0x",
        ownerAddress: wallet.address,
        getOwnerAccount,
        dappMetadata: pendingRequest.dappMetadata,
        screeningDisabled: !screeningOn,
        identityToken,
      });

      let txHash: string;

      if (!screeningOn) {
        // Screening OFF: execute immediately (same as SendPanel)
        setRequestStatus("queued");
        const execData = await api.execute.run(pending.id);
        txHash = execData.txHash;
      } else {
        // Screening ON: poll for AI agent execution
        setRequestStatus("polling");
        txHash = await pollForExecution(pending.id, safeAddress, identityToken);
      }
      setRequestStatus("success");
      setRequestTxHash(txHash);

      // Respond to DApp with txHash
      await walletKit.respondSessionRequest({
        topic: pendingRequest.topic,
        response: {
          id: pendingRequest.id,
          jsonrpc: "2.0",
          result: txHash,
        },
      });

      setPendingRequest(null);
      return txHash;
    } catch (err) {
      const message = err instanceof Error ? err.message : "Transaction failed";
      setRequestStatus("error");
      setRequestError(message);

      // Respond with error to DApp
      await walletKit.respondSessionRequest({
        topic: pendingRequest.topic,
        response: {
          id: pendingRequest.id,
          jsonrpc: "2.0",
          error: { code: -32000, message },
        },
      });

      throw err;
    }
  }, [walletKit, pendingRequest, wallet, safeAddress, getOwnerAccount, identityToken, api]);

  const rejectRequest = useCallback(async () => {
    if (!walletKit || !pendingRequest) return;
    await walletKit.respondSessionRequest({
      topic: pendingRequest.topic,
      response: {
        id: pendingRequest.id,
        jsonrpc: "2.0",
        error: getSdkError("USER_REJECTED"),
      },
    });
    setPendingRequest(null);
    setRequestStatus("idle");
  }, [walletKit, pendingRequest]);

  const disconnectSession = useCallback(
    async (topic: string) => {
      if (!walletKit) return;
      await walletKit.disconnectSession({
        topic,
        reason: getSdkError("USER_DISCONNECTED"),
      });
      setSessions((prev) => {
        const next = { ...prev };
        delete next[topic];
        return next;
      });
    },
    [walletKit]
  );

  const resetRequestState = useCallback(() => {
    setRequestStatus("idle");
    setRequestTxHash(null);
    setRequestError(null);
  }, []);

  const value: WalletConnectContextType = {
    ready,
    pair,
    sessions,
    sessionProposal,
    pendingRequest,
    pendingSignRequest,
    approveSession,
    rejectSession,
    approveRequest,
    rejectRequest,
    approveSignRequest,
    rejectSignRequest,
    disconnectSession,
    requestStatus,
    requestTxHash,
    requestError,
    resetRequestState,
    signStatus,
    signResult,
    signError,
    resetSignState,
  };

  return (
    <WalletConnectContext.Provider value={value}>
      {children}
    </WalletConnectContext.Provider>
  );
}

export function useWalletConnect() {
  const ctx = useContext(WalletConnectContext);
  if (!ctx) {
    throw new Error("useWalletConnect must be used within WalletConnectProvider");
  }
  return ctx;
}

/** Poll the transactions endpoint until we find an executed tx with this ID, or timeout. */
async function pollForExecution(txId: string, safeAddress: string, identityToken: string | null): Promise<string> {
  const maxAttempts = 60; // ~3 minutes at 3s intervals
  const interval = 3000;

  for (let i = 0; i < maxAttempts; i++) {
    await new Promise((r) => setTimeout(r, interval));
    try {
      const res = await apiFetch(`/transactions?safeAddress=${encodeURIComponent(safeAddress)}`, identityToken);
      if (!res.ok) continue;
      const data = await res.json();
      const tx = (data.transactions as TransactionWithStatus[])?.find(
        (t) => t.id === txId
      );
      if (tx?.txHash) return tx.txHash;
      if (tx?.rejected) throw new Error(tx.rejectReason || "Transaction rejected by agent");
    } catch (err) {
      if (err instanceof Error && err.message.includes("rejected")) throw err;
    }
  }
  throw new Error("Transaction execution timed out");
}
