"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useApiClient } from "@/lib/api/client";
import type { TelegramIdentity } from "@/lib/api/telegram";
import { useAutoRefresh } from "@/hooks/useAutoRefresh";
import { useAuth } from "./AuthContext";

interface ScreeningStatusContextType {
  screeningMode: boolean;
  /** Guarded wallets: screening is structural — the toggle is locked ON (#136.1). */
  screeningLocked: boolean;
  /**
   * Runtime liveness from the server (#136.5). null while unknown (first
   * load) — treat as "don't claim online". Every "Monitoring"/"Watching"
   * surface must consult this, never configuration alone.
   */
  agentOnline: boolean | null;
  /** Server-truth Telegram binding (#134) — the ONLY link signal. */
  telegramLinked: boolean;
  telegramIdentity: TelegramIdentity | null;
  /** Linked chat implies an open, messageable bot — one step, one flag. */
  fullyActivated: boolean;
  isScreeningActive: boolean;
  loading: boolean;
  setScreeningMode: (v: boolean) => void;
  refresh: () => Promise<void>;
}

const ScreeningStatusContext = createContext<ScreeningStatusContextType | null>(null);

export function ScreeningStatusProvider({ children }: { children: ReactNode }) {
  const { safeAddress } = useAuth();
  const api = useApiClient();
  const [screeningMode, setScreeningMode] = useState(false);
  const [screeningLocked, setScreeningLocked] = useState(false);
  const [agentOnline, setAgentOnline] = useState<boolean | null>(null);
  const [telegramLinked, setTelegramLinked] = useState(false);
  const [telegramIdentity, setTelegramIdentity] = useState<TelegramIdentity | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!safeAddress) return;
    try {
      const data = await api.status.get(safeAddress);
      setScreeningMode(data.screeningMode ?? false);
      setScreeningLocked(data.screeningLocked ?? false);
      // Older servers omit `agent` — stay null (unknown) rather than lying
      // in either direction.
      setAgentOnline(data.agent ? data.agent.online : null);
      setTelegramLinked(data.telegramLinked ?? false);
      setTelegramIdentity(data.telegram ?? null);
    } catch {
      // silent
    }
  }, [safeAddress, api]);

  useEffect(() => {
    if (!safeAddress) return;
    setLoading(true);
    refresh().finally(() => setLoading(false));
  }, [safeAddress, refresh]);

  useAutoRefresh(refresh, 30_000);

  const fullyActivated = telegramLinked;
  // Structurally locked screening (guarded v2) is ACTIVE even without the
  // Telegram channel — the server screens every proposal regardless; reviews
  // reach email + dashboard. Claiming "Paused" there was a lie (#136.1/.6).
  const isScreeningActive = screeningMode && (fullyActivated || screeningLocked);

  const value = useMemo(
    () => ({
      screeningMode,
      screeningLocked,
      agentOnline,
      telegramLinked,
      telegramIdentity,
      fullyActivated,
      isScreeningActive,
      loading,
      setScreeningMode,
      refresh,
    }),
    [screeningMode, screeningLocked, agentOnline, telegramLinked, telegramIdentity, fullyActivated, isScreeningActive, loading, refresh]
  );

  return (
    <ScreeningStatusContext.Provider value={value}>
      {children}
    </ScreeningStatusContext.Provider>
  );
}

export function useScreeningStatus() {
  const ctx = useContext(ScreeningStatusContext);
  if (!ctx) {
    throw new Error("useScreeningStatus must be used within ScreeningStatusProvider");
  }
  return ctx;
}
