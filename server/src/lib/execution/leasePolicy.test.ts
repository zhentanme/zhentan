import { describe, it, expect } from "vitest";
import { leaseGrantable, EXECUTION_LEASE_TTL_MS } from "./leasePolicy.js";

const NOW = new Date("2026-08-07T12:00:00Z");
// Claimants are per-attempt tokens: <host>:<pid>:<instance>:<attempt>.
const ME = "host:1:aaaa:t1";
const SAME_PROCESS_OTHER_ATTEMPT = "host:1:aaaa:t2";
const OTHER = "host:2:bbbb:t1";

const live = (owner: string) => ({
  execution_lease_owner: owner,
  execution_lease_expires_at: new Date(NOW.getTime() + 60_000).toISOString(),
});

describe("execution lease grant policy", () => {
  it("grants an unleased row", () => {
    expect(
      leaseGrantable({ execution_lease_owner: null, execution_lease_expires_at: null }, ME, NOW)
    ).toBe(true);
  });

  it("denies while another holder's lease is live — two claimants, one winner", () => {
    expect(leaseGrantable(live(OTHER), ME, NOW)).toBe(false);
  });

  it("re-entrant renewal with the SAME attempt token is granted", () => {
    expect(leaseGrantable(live(ME), ME, NOW)).toBe(true);
  });

  it("denies a second attempt from the SAME process — process identity is not ownership", () => {
    expect(leaseGrantable(live(ME), SAME_PROCESS_OTHER_ATTEMPT, NOW)).toBe(false);
  });

  it("reclaims an expired lease from a crashed holder", () => {
    const expired = {
      execution_lease_owner: OTHER,
      execution_lease_expires_at: new Date(NOW.getTime() - 1_000).toISOString(),
    };
    expect(leaseGrantable(expired, ME, NOW)).toBe(true);
  });

  it("a lease expiring exactly now is reclaimable (no dead zone)", () => {
    const boundary = {
      execution_lease_owner: OTHER,
      execution_lease_expires_at: NOW.toISOString(),
    };
    expect(leaseGrantable(boundary, ME, NOW)).toBe(true);
  });

  it("TTL outlives a worst-case receipt wait", () => {
    expect(EXECUTION_LEASE_TTL_MS).toBeGreaterThanOrEqual(3 * 60 * 1000);
  });
});
