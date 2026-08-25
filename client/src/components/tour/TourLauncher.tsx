"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";

import { useAuth } from "@/app/context/AuthContext";
import { useTour } from "./TourProvider";
import {
  TOUR_QUEUED_EVENT,
  clearPendingTour,
  hasSeenTour,
  mainTour,
  readPendingTour,
  upgradeTour,
} from "@/lib/tours";

/**
 * Fires QUEUED guided tours. The flow where a milestone happens queues its
 * tour via queueTour() — onboarding finish → "main", a transition that adds
 * the backup key → "upgrade" — and this launcher only consumes the marker.
 * It never infers "new user" from account state, so a new device or cleared
 * storage doesn't replay a tour; the per-Safe seen-flags act as suppressors
 * and Settings → Product tour is the on-demand replay.
 */
export function TourLauncher() {
  const { safeAddress, safeConfig } = useAuth();
  const { start, active } = useTour();
  const pathname = usePathname();
  // Bumped when a flow queues a tour mid-session, so the effect re-checks.
  const [queueTick, setQueueTick] = useState(0);

  useEffect(() => {
    const onQueued = () => setQueueTick((t) => t + 1);
    window.addEventListener(TOUR_QUEUED_EVENT, onQueued);
    return () => window.removeEventListener(TOUR_QUEUED_EVENT, onQueued);
  }, []);

  useEffect(() => {
    if (active || !safeAddress) return;
    const pending = readPendingTour();
    if (!pending) return;
    // The main tour starts on /home, where its anchors live — hold the
    // marker until the user lands there.
    if (pending === "main" && pathname !== "/home") return;
    if (hasSeenTour(pending, safeAddress)) {
      clearPendingTour();
      return;
    }

    let timer: ReturnType<typeof setTimeout> | undefined;
    let attempts = 0;

    // Delay past the page's entry animations; retry while a dialog is open
    // (e.g. the upgrade wizard's success screen).
    const tick = () => {
      if (document.querySelector('[role="dialog"]') && attempts++ < 20) {
        timer = setTimeout(tick, 1500);
        return;
      }
      clearPendingTour();
      start(
        pending === "main"
          ? mainTour(safeAddress, safeConfig?.profile)
          : upgradeTour(safeAddress)
      );
    };
    timer = setTimeout(tick, 900);

    return () => clearTimeout(timer);
  }, [active, safeAddress, safeConfig?.profile, pathname, start, queueTick]);

  return null;
}
