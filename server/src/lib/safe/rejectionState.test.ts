import { describe, it, expect } from "vitest";
import {
  canTransition,
  assertTransition,
  isRejectionActive,
  nextRetryAt,
  MAX_CANCEL_ATTEMPTS,
} from "./rejectionState.js";
import type { RejectionStatus } from "../../types.js";

describe("rejection state machine", () => {
  it("allows the happy path", () => {
    expect(canTransition("requested", "cancel_signing")).toBe(true);
    expect(canTransition("cancel_signing", "cancel_submitted")).toBe(true);
    expect(canTransition("cancel_submitted", "rejected_confirmed")).toBe(true);
  });

  it("allows failure and retry", () => {
    expect(canTransition("cancel_signing", "failed_retryable")).toBe(true);
    expect(canTransition("cancel_submitted", "failed_retryable")).toBe(true);
    expect(canTransition("failed_retryable", "cancel_signing")).toBe(true);
  });

  it("allows supersession from every non-terminal state", () => {
    for (const from of [
      "requested",
      "cancel_signing",
      "cancel_submitted",
      "failed_retryable",
    ] as RejectionStatus[]) {
      expect(canTransition(from, "superseded")).toBe(true);
    }
  });

  it("terminal states go nowhere", () => {
    for (const to of [
      "requested",
      "cancel_signing",
      "cancel_submitted",
      "failed_retryable",
      "superseded",
    ] as RejectionStatus[]) {
      expect(canTransition("rejected_confirmed", to)).toBe(false);
      expect(canTransition("superseded", to)).toBe(false);
    }
  });

  it("refuses skipping straight to confirmed", () => {
    expect(canTransition("requested", "rejected_confirmed")).toBe(false);
    expect(canTransition("cancel_signing", "rejected_confirmed")).toBe(false);
    expect(() => assertTransition("requested", "rejected_confirmed")).toThrow(
      /Illegal rejection transition/
    );
  });

  it("classifies active vs settled states", () => {
    expect(isRejectionActive("requested")).toBe(true);
    expect(isRejectionActive("cancel_signing")).toBe(true);
    expect(isRejectionActive("cancel_submitted")).toBe(true);
    expect(isRejectionActive("failed_retryable")).toBe(true);
    expect(isRejectionActive("rejected_confirmed")).toBe(false);
    expect(isRejectionActive("superseded")).toBe(false);
    expect(isRejectionActive(undefined)).toBe(false);
  });
});

describe("retry backoff", () => {
  const now = new Date("2026-08-07T00:00:00Z");

  it("doubles from 5 minutes", () => {
    expect(nextRetryAt(1, now)).toBe(new Date(now.getTime() + 5 * 60_000).toISOString());
    expect(nextRetryAt(2, now)).toBe(new Date(now.getTime() + 10 * 60_000).toISOString());
    expect(nextRetryAt(3, now)).toBe(new Date(now.getTime() + 20 * 60_000).toISOString());
  });

  it("caps at 6 hours", () => {
    // Attempt 8 uncapped would be 5m * 2^7 = 640m; the cap holds it at 360m.
    for (const attempts of [8, MAX_CANCEL_ATTEMPTS - 1]) {
      expect(nextRetryAt(attempts, now)).toBe(
        new Date(now.getTime() + 6 * 60 * 60_000).toISOString()
      );
    }
  });

  it("dead-letters after the attempt budget", () => {
    expect(nextRetryAt(MAX_CANCEL_ATTEMPTS, now)).toBeNull();
    expect(nextRetryAt(MAX_CANCEL_ATTEMPTS + 3, now)).toBeNull();
  });
});
