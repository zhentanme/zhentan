"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useApiClient } from "@/lib/api/client";
import { useScreeningStatus } from "@/app/context/ScreeningStatusContext";
import { TELEGRAM_BOT_URL } from "@/lib/constants";

/**
 * The one-step Telegram connect flow (#134): open the bot chat, wait for the
 * user to complete the secure link the bot hands them, poll the server-truth
 * binding until it appears. Unlink is a single atomic server call.
 */
export function useTelegramLink() {
  const api = useApiClient();
  const { telegramLinked, telegramIdentity, loading, refresh } = useScreeningStatus();
  const [waiting, setWaiting] = useState(false);
  const [checking, setChecking] = useState(false);
  const [unlinking, setUnlinking] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopPolling = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
    setWaiting(false);
  }, []);

  /** Just opens the bot chat — no polling side effects. */
  const openBot = useCallback(() => {
    window.open(TELEGRAM_BOT_URL, "_blank", "noopener,noreferrer");
  }, []);

  /**
   * Watch for the binding to land, decoupled from opening the chat — the
   * activation dialog watches for as long as it is OPEN, so the link is
   * picked up no matter which device completes it.
   */
  const setWatching = useCallback(
    (active: boolean) => {
      if (!active) {
        stopPolling();
        return;
      }
      setWaiting(true);
      if (!pollRef.current) {
        pollRef.current = setInterval(() => {
          refresh().catch(() => {});
        }, 4000);
      }
    },
    [refresh, stopPolling]
  );

  /** Opens the bot chat and starts watching (the onboarding step's one-tap). */
  const start = useCallback(() => {
    openBot();
    setWatching(true);
  }, [openBot, setWatching]);

  const check = useCallback(async () => {
    setChecking(true);
    try {
      await refresh();
    } finally {
      setChecking(false);
    }
  }, [refresh]);

  const unlink = useCallback(async () => {
    setUnlinking(true);
    try {
      await api.telegram.unlink();
      await refresh();
    } finally {
      setUnlinking(false);
    }
  }, [api, refresh]);

  // Linked → the wait is over.
  useEffect(() => {
    if (telegramLinked) stopPolling();
  }, [telegramLinked, stopPolling]);

  useEffect(() => () => stopPolling(), [stopPolling]);

  return {
    linked: telegramLinked,
    identity: telegramIdentity,
    loading,
    waiting,
    checking,
    unlinking,
    start,
    openBot,
    setWatching,
    check,
    unlink,
    refresh,
  };
}
