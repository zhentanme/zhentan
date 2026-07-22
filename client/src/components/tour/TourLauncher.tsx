"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";

import { useAuth } from "@/app/context/AuthContext";
import { useTour } from "./TourProvider";
import { hasSeenTour, mainTour, upgradeTour } from "@/lib/tours";

/**
 * Auto-fires the guided tours, once per Safe per device:
 *
 * - First-time (v2 accounts): on the first landing on /home after onboarding
 *   completes — requests → agent → settings.
 * - Legacy upgraded (v1 accounts that became protected): the settings-only
 *   walkthrough, fired right after the upgrade's owner mirror flips the
 *   profile. It waits for any open dialog (the upgrade wizard's success
 *   screen) to close before starting.
 */
export function TourLauncher() {
  const { safeAddress, safeConfig, recordOnboardingCompleted } = useAuth();
  const { start, active } = useTour();
  const pathname = usePathname();
  const firedRef = useRef(false);

  useEffect(() => {
    if (active || firedRef.current || !safeAddress || !safeConfig) return;

    const isLegacy = (safeConfig.derivationVersion ?? 1) === 1;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let attempts = 0;

    // Delay past the page's entry animations; retry while a dialog is open.
    const schedule = (fire: () => void) => {
      const tick = () => {
        if (firedRef.current) return;
        if (document.querySelector('[role="dialog"]') && attempts++ < 20) {
          timer = setTimeout(tick, 1500);
          return;
        }
        firedRef.current = true;
        fire();
      };
      timer = setTimeout(tick, 900);
    };

    // The record flag lags right after onboarding (the completion POST beats
    // the record refetch to /home) — the cookie is stamped synchronously at
    // finish, so first-time users get the tour on arrival, not after reload.
    const onboardingComplete =
      recordOnboardingCompleted === true ||
      document.cookie.includes("onboarding_complete=1");

    if (isLegacy) {
      if (safeConfig.profile === "protected" && !hasSeenTour("upgrade", safeAddress)) {
        schedule(() => start(upgradeTour(safeAddress)));
      }
    } else if (
      onboardingComplete &&
      pathname === "/home" &&
      !hasSeenTour("main", safeAddress)
    ) {
      schedule(() => start(mainTour(safeAddress)));
    }

    return () => clearTimeout(timer);
  }, [active, safeAddress, safeConfig, recordOnboardingCompleted, pathname, start]);

  return null;
}
