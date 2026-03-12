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
import { getBackendApiUrl } from "@/lib/api";
import type { DappMetadata, TransactionWithStatus } from "@/types";

type SessionMap = Record<string, WalletKitTypes.SessionRequest["params"]>;

interface WCPendingRequest {
  id: number;
  topic: string;
  method: string;
  params: unknown[];
  dappMetadata?: DappMetadata;
}

interface WalletConnectContextType {
  ready: boolean;
  pair: (uri: string) => Promise<void>;
  sessions: SessionMap;
  sessionProposal: WalletKitTypes.SessionProposal | null;
  pendingRequest: WCPendingRequest | null;
  approveSession: () => Promise<void>;
  rejectSession: () => Promise<void>;
  approveRequest: () => Promise<string>;
  rejectRequest: () => Promise<void>;
  disconnectSession: (topic: string) => Promise<void>;
  requestStatus: "idle" | "signing" | "queued" | "polling" | "success" | "error";
  requestTxHash: string | null;
  requestError: string | null;
  resetRequestState: () => void;
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
  const { wallet, getOwnerAccount, safeAddress } = useAuth();
  const [walletKit, setWalletKit] = useState<InstanceType<typeof WalletKit> | null>(null);
  const [ready, setReady] = useState(false);
  const [sessions, setSessions] = useState<SessionMap>({});
  const [sessionProposal, setSessionProposal] = useState<WalletKitTypes.SessionProposal | null>(null);
  const [pendingRequest, setPendingRequest] = useState<WCPendingRequest | null>(null);
  const [requestStatus, setRequestStatus] = useState<WalletConnectContextType["requestStatus"]>("idle");
  const [requestTxHash, setRequestTxHash] = useState<string | null>(null);
  const [requestError, setRequestError] = useState<string | null>(null);
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

      // Unsupported methods for MVP
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
          const statusRes = await fetch(
            `${getBackendApiUrl("status")}?safe=${encodeURIComponent(safeAddress)}`
          );
          if (statusRes.ok) {
            const statusData = await statusRes.json();
            screeningOn = statusData.screeningMode !== false;
          }
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
      });

      let txHash: string;

      if (!screeningOn) {
        // Screening OFF: execute immediately (same as SendPanel)
        setRequestStatus("queued");
        const execRes = await fetch(getBackendApiUrl("execute"), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ txId: pending.id }),
        });
        if (!execRes.ok) {
          const data = await execRes.json();
          throw new Error(data.error || "Execution failed");
        }
        const execData = await execRes.json();
        txHash = execData.txHash;
      } else {
        // Screening ON: poll for AI agent execution
        setRequestStatus("polling");
        txHash = await pollForExecution(pending.id, safeAddress);
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
  }, [walletKit, pendingRequest, wallet, safeAddress, getOwnerAccount]);

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
    approveSession,
    rejectSession,
    approveRequest,
    rejectRequest,
    disconnectSession,
    requestStatus,
    requestTxHash,
    requestError,
    resetRequestState,
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
async function pollForExecution(txId: string, safeAddress: string): Promise<string> {
  const maxAttempts = 60; // ~3 minutes at 3s intervals
  const interval = 3000;

  for (let i = 0; i < maxAttempts; i++) {
    await new Promise((r) => setTimeout(r, interval));
    try {
      const res = await fetch(
        `${getBackendApiUrl("transactions")}?safeAddress=${encodeURIComponent(safeAddress)}`
      );
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
