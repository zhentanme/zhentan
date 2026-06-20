"use client";

import { ReactNode, useEffect, useState } from "react";
import { TwinTick } from "@/components/BrandMark";
import s from "./GuardianCard.module.css";

function SwapIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#f5d060" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17 3l4 4-4 4" />
      <path d="M21 7H7" />
      <path d="M7 21l-4-4 4-4" />
      <path d="M3 17h14" />
    </svg>
  );
}

function ContractIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#E5524F" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
      <path d="M14 3v5h5" />
      <path d="M9 13h6M9 17h6M9 9h2" />
    </svg>
  );
}

// ── Phase state machine ──────────────────────────────────────────────────────
const PHASES = [
  "idle", "tx",
  "c1", "c1d",
  "c2", "c2d",
  "c3", "c3d",
  "verdict", "exec", "done",
] as const;
type Phase = (typeof PHASES)[number];

const pi = (p: Phase) => PHASES.indexOf(p);
const gte = (curr: Phase, target: Phase) => pi(curr) >= pi(target);

const DURATIONS: Record<Phase, number> = {
  idle:    1800,
  tx:       900,
  c1:      1300, c1d: 380,
  c2:      1100, c2d: 380,
  c3:      1500, c3d: 600,
  verdict: 1000,
  exec:    1800,
  done:    2900,
};

// ── Scenarios ────────────────────────────────────────────────────────────────
interface Scenario {
  tx: { who: string; addr: string; amount: string; sub: string; icon?: ReactNode };
  checks: Array<{ label: string; result: "pass" | "warn" | "fail" }>;
  verdict: "safe" | "danger";
  action: string;
}

const SCENARIOS: Scenario[] = [
  {
    tx: { who: "PancakeSwap Router", addr: "0x10ED…A2c8", amount: "−0.42 BNB", sub: "BNB → USDC swap", icon: <SwapIcon /> },
    checks: [
      { label: "Checking onchain behaviour",  result: "pass" },
      { label: "Scanning contract & tokens",  result: "pass" },
      { label: "Simulating transaction",      result: "pass" },
    ],
    verdict: "safe",
    action: "SIGNED · 14ms",
  },
  {
    tx: { who: "Unknown contract", addr: "0xDRA1…nrZk", amount: "−ALL BNB", sub: "drain attempt", icon: <ContractIcon /> },
    checks: [
      { label: "Checking onchain behaviour",  result: "pass" },
      { label: "Scanning contract & tokens",  result: "warn" },
      { label: "Simulating transaction",      result: "fail" },
    ],
    verdict: "danger",
    action: "BLOCKED",
  },
];

// ── SVG helpers ──────────────────────────────────────────────────────────────
function Spinner() {
  return (
    <svg className={s.spinSvg} width="15" height="15" viewBox="0 0 15 15" fill="none">
      <circle cx="7.5" cy="7.5" r="5.5" stroke="rgba(245,208,96,0.15)" strokeWidth="2" />
      <circle cx="7.5" cy="7.5" r="5.5" stroke="#f5d060" strokeWidth="2"
        strokeDasharray="8 26" strokeLinecap="round" />
    </svg>
  );
}

function Check({ result }: { result: "pass" | "warn" | "fail" }) {
  const c = result === "pass" ? "#3FBE76" : result === "warn" ? "#F0B33C" : "#E5524F";
  const f = result === "pass" ? "rgba(63,190,118,0.12)" : result === "warn" ? "rgba(240,179,60,0.12)" : "rgba(229,82,79,0.12)";
  return (
    <svg className={s.checkSvg} width="15" height="15" viewBox="0 0 15 15" fill="none">
      <circle cx="7.5" cy="7.5" r="6.5" fill={f} stroke={c} strokeWidth="1.4" />
      {result === "pass" && <path d="M4.5 7.5l2 2 4-4" stroke={c} strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />}
      {result === "warn" && <path d="M7.5 4.5v3.5M7.5 10.5v.3" stroke={c} strokeWidth="1.5" strokeLinecap="round" />}
      {result === "fail" && <path d="M5 5l5 5M10 5l-5 5" stroke={c} strokeWidth="1.4" strokeLinecap="round" />}
    </svg>
  );
}

// ── Component ────────────────────────────────────────────────────────────────
export function GuardianCard() {
  const [idx, setIdx] = useState(0);
  const [phase, setPhase] = useState<Phase>("idle");

  useEffect(() => {
    const t = setTimeout(() => {
      const next = pi(phase) + 1;
      if (next < PHASES.length) {
        setPhase(PHASES[next]);
      } else {
        setIdx((i) => (i + 1) % SCENARIOS.length);
        setPhase("idle");
      }
    }, DURATIONS[phase]);
    return () => clearTimeout(t);
  }, [phase]);

  const sc = SCENARIOS[idx];
  const txVisible = gte(phase, "tx");

  const status = gte(phase, "verdict")
    ? sc.verdict === "safe" ? "VERIFIED" : "BLOCKED"
    : txVisible ? "WATCHING" : "LISTENING";

  const CHECK_SPIN: Phase[] = ["c1", "c2", "c3"];
  const CHECK_DONE: Phase[] = ["c1d", "c2d", "c3d"];

  return (
    <aside className={`${s.card} ${phase === "done" ? s.fading : ""}`}>
      {/* ── Header ── */}
      <div className={s.head}>
        <span className={s.headTitle}>
          <TwinTick size={18} halo="none" />
          Zhentan · live readout
        </span>
        <span className={`${s.statusBadge} ${gte(phase, "verdict") && sc.verdict === "danger" ? s.statusDanger : ""}`}>
          <span className={s.statusDot} />
          {status}
        </span>
      </div>

      {/* ── Idle: sonar animation centered ── */}
      <div className={`${s.sonarSlot} ${txVisible ? s.sonarSlotHidden : ""}`}>
        <div className={s.sonarWrap}>
          {[0, 1, 2].map((i) => (
            <span key={i} className={s.sonarRing} style={{ animationDelay: `${i * 0.8}s` }} />
          ))}
          <div className={s.sonarCenter}>
            <TwinTick size={22} halo="none" style={{ opacity: 0.85 }} />
          </div>
        </div>
        <p className={s.sonarLabel}>Zhentan is monitoring</p>
      </div>

      {/* ── Transaction card ── */}
      <div className={`${s.txCard} ${txVisible ? s.txCardIn : ""}`}>
        <div className={s.txLeft}>
          {sc.tx.icon && <span className={s.txIcon}>{sc.tx.icon}</span>}
          <div>
            <div className={s.txWho}>{sc.tx.who}</div>
            <div className={s.txAddr}>{sc.tx.addr}</div>
          </div>
        </div>
        <div className={s.txRight}>
          <div className={s.txAmount}>{sc.tx.amount}</div>
          <div className={s.txSub}>{sc.tx.sub}</div>
        </div>
      </div>

      {/* ── Checks ── */}
      {sc.checks.map((check, i) => {
        const spinning = gte(phase, CHECK_SPIN[i]);
        const done     = gte(phase, CHECK_DONE[i]);
        const resClass = check.result === "pass" ? s.pass : check.result === "warn" ? s.warn : s.fail;

        return (
          <div key={i} className={`${s.checkRow} ${spinning ? s.checkRowIn : ""}`}>
            <span className={s.iconSlot}>
              <span className={`${s.iconFace} ${done ? s.iconGone : ""}`}><Spinner /></span>
              <span className={`${s.iconFace} ${done ? "" : s.iconGone}`}><Check result={check.result} /></span>
            </span>
            <span className={s.checkLabel}>{check.label}</span>
            <span className={`${s.badge} ${resClass} ${done ? s.badgeIn : ""}`}>
              {check.result === "pass" ? "PASS" : check.result === "warn" ? "WARN" : "FAIL"}
            </span>
          </div>
        );
      })}

      {/* ── Verdict ── */}
      <div className={`${s.verdict} ${gte(phase, "verdict") ? s.verdictIn : ""} ${sc.verdict === "safe" ? s.verdictSafe : s.verdictDanger}`}>
        <span className={s.verdictDot} />
        <span className={s.verdictLabel}>{sc.verdict === "safe" ? "SAFE" : "THREAT DETECTED"}</span>
        <span className={s.verdictMsg}>{sc.verdict === "safe" ? "All checks passed" : "Drainer fingerprint matched"}</span>
      </div>

      {/* ── Execute ── */}
      <div className={`${s.exec} ${gte(phase, "exec") ? s.execIn : ""} ${sc.verdict === "safe" ? s.execSafe : s.execDanger}`}>
        ◆ {sc.action}
      </div>
    </aside>
  );
}
