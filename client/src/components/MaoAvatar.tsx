"use client";

import * as React from "react";
import { useEffect, useId, useRef } from "react";

/**
 * Mao — the Zhentan agent character. A geometric black cat with gold
 * linework and opaque shades; the lens is the status screen. Every state
 * the agent can be in is drawn INSIDE the glass — work is never a spinner
 * somewhere else on the page, it's light moving across Mao's shades.
 *
 * Two weights (per the character spec):
 *  - "line": outlined head, detailed lens animations. 28px and up.
 *  - "solid": filled head with knocked-out glass. Below 28px, and for
 *    chips/pills where the mark takes the surrounding text color.
 *
 * Only the lens animates; ears, whiskers and mouth hold still while a
 * loader runs (an occasional ear flick is the one exception — it plays
 * between loads of work, never during a result). Under reduced motion the
 * sweep bar rests at centre-glass, so the state still reads.
 */

export type MaoState =
  | "idle" //     two static glints + a slow soft sweep — on duty, nothing to do
  | "scanning" // bright sweep, mouth flat — actively screening
  | "thinking" // ears back, dots pulse — weighing a verdict
  | "cleared" //  green, twin ticks draw in the glass
  | "flagged" //  red, alert bars pulse — blocked / needs attention
  | "resting" //  dimmed glass, z — screening paused
  | "asking"; //  ?? in the lenses — paused on YOUR decision

interface MaoAvatarProps {
  state?: MaoState;
  /** Rendered width/height in px (the mark is square). */
  size?: number;
  /** Defaults to "solid" below 28px, "line" otherwise. */
  variant?: "line" | "solid";
  /** Solid-weight tint override (e.g. "currentColor" inside a colored chip). */
  color?: string;
  /** Random ear flicks (line weight, awake states, ≥48px). Defaults on. */
  earTwitch?: boolean;
  className?: string;
  "aria-label"?: string;
}

/* ── Palette (mirrors the brand tokens in globals.css) ─────────────── */
const GOLD = "#c49428";
const GOLD_LIGHT = "#e8b93a";
const SAFE = "var(--safe, #3fbe76)";
const DANGER = "var(--danger, #e5524f)";
const MUTED = "var(--ink-300, #8e938a)";
const HEAD = "#12171a";

/* ── Line-weight geometry ──────────────────────────────────────────── */
const L_HEAD =
  "M50 19 C72 19, 88 34, 88 55 C88 76, 71 89, 50 89 C29 89, 12 76, 12 55 C12 34, 28 19, 50 19 Z";
const L_SHADES =
  "M18 41 L82 41 C84.8 41, 86 42.8, 85.4 45.4 L82.6 57.4 C82 60, 80 61.4, 77.4 61.4 L60 61.4 C57.4 61.4, 55.6 60, 55 57.4 L53.4 51 L46.6 51 L45 57.4 C44.4 60, 42.6 61.4, 40 61.4 L22.6 61.4 C20 61.4, 18 60, 17.4 57.4 L14.6 45.4 C14 42.8, 15.2 41, 18 41 Z";
const NOSE = "M46.6 62.6 L53.4 62.6 L50 68.6 Z";
const EARS: Record<"default" | "back" | "alert", [string, string]> = {
  default: ["M20 12 L42 32 L16 44 Z", "M80 12 L58 32 L84 44 Z"],
  back: ["M23 15 L43 33 L20 45 Z", "M77 15 L57 33 L80 45 Z"],
  alert: ["M19 9 L42 31 L15 43 Z", "M81 9 L58 31 L85 43 Z"],
};
const INNER_EARS: [string, string] = ["M25 21 L35 31 L23 36 Z", "M75 21 L65 31 L77 36 Z"];
const WHISKERS = ["M37 70 L18 66", "M37 75 L17 78", "M63 70 L82 66", "M63 75 L83 78"];
const MOUTHS: Record<"smile" | "flat" | "worried" | "frown", string[]> = {
  smile: ["M50 69.4 C48 73, 44.4 72.6, 43.2 69.6", "M50 69.4 C52 73, 55.6 72.6, 56.8 69.6"],
  flat: ["M43.6 71 L56.4 71"],
  worried: ["M43.6 71.6 C46.4 69.8, 51 69.8, 53.6 71.2"],
  frown: ["M43.6 72 C46.4 69.8, 53.6 69.8, 56.4 72"],
};

/* ── Solid-weight geometry (fill head, knocked-out glass) ──────────── */
const S_EARS: [string, string] = ["M18 8 L42 32 L14 46 Z", "M82 8 L58 32 L86 46 Z"];
const S_HEAD =
  "M50 17 C74 17, 91 33, 91 55 C91 78, 71 92, 50 92 C29 92, 9 78, 9 55 C9 33, 26 17, 50 17 Z";
const S_SHADES =
  "M16 40 L84 40 C87 40, 88.4 42, 87.6 44.8 L84.6 58 C84 60.8, 81.8 62.4, 79 62.4 L60 62.4 C57.2 62.4, 55.2 60.8, 54.6 58 L53 51 L47 51 L45.4 58 C44.8 60.8, 42.8 62.4, 40 62.4 L21 62.4 C18.2 62.4, 16 60.8, 15.4 58 L12.4 44.8 C11.6 42, 13 40, 16 40 Z";

const STATE_META: Record<
  MaoState,
  { tone: string; glass: string; ears: keyof typeof EARS; mouth: keyof typeof MOUTHS; label: string }
> = {
  idle: { tone: GOLD, glass: "#0f1214", ears: "default", mouth: "smile", label: "Zhentan agent on duty" },
  scanning: { tone: GOLD, glass: "#0f1214", ears: "default", mouth: "flat", label: "Zhentan agent scanning" },
  thinking: { tone: GOLD, glass: "#0f1214", ears: "back", mouth: "worried", label: "Zhentan agent thinking" },
  cleared: { tone: SAFE, glass: "#0d1613", ears: "default", mouth: "smile", label: "Cleared by the Zhentan agent" },
  flagged: { tone: DANGER, glass: "#180f0e", ears: "alert", mouth: "frown", label: "Flagged by the Zhentan agent" },
  resting: { tone: GOLD, glass: "#0f1214", ears: "default", mouth: "smile", label: "Zhentan agent paused" },
  asking: { tone: GOLD, glass: "#0f1214", ears: "default", mouth: "smile", label: "Zhentan agent awaiting your decision" },
};

/** One sweep bar (bright core + two faint trailers), rotated to the lens angle. */
function SweepBars({ soft }: { soft?: boolean }) {
  const anim = soft
    ? "mao-sweep-soft 6.5s ease-in-out infinite"
    : "mao-sweep 1.6s cubic-bezier(.5,0,.5,1) infinite";
  return (
    <g className="mao-anim" style={{ animation: anim }}>
      <rect x="46" y="30" width={soft ? 7 : 14} height="46" fill={GOLD_LIGHT} opacity={soft ? 0.5 : 0.9} transform="rotate(24 50 50)" />
      {!soft && (
        <>
          <rect x="40" y="30" width="4" height="46" fill={GOLD_LIGHT} opacity="0.38" transform="rotate(24 50 50)" />
          <rect x="61" y="30" width="4" height="46" fill={GOLD_LIGHT} opacity="0.38" transform="rotate(24 50 50)" />
        </>
      )}
    </g>
  );
}

/** What lives inside the glass for each state (line weight). */
function LensContent({ state }: { state: MaoState }) {
  switch (state) {
    case "idle":
      return (
        <>
          <rect x="20" y="34" width="5" height="36" fill="rgba(232,185,58,0.42)" transform="rotate(24 30 50)" />
          <rect x="62" y="34" width="5" height="36" fill="rgba(232,185,58,0.42)" transform="rotate(24 66 50)" />
          <SweepBars soft />
        </>
      );
    case "scanning":
      return <SweepBars />;
    case "thinking":
      return (
        <g fill={GOLD_LIGHT}>
          {[26, 33.5, 41, 60, 67.5, 75].map((cx, i) => (
            <circle
              key={cx}
              cx={cx}
              cy="51"
              r="2.6"
              className="mao-anim"
              style={{ animation: `mao-dot 1.3s ease-in-out ${i * 0.18}s infinite` }}
            />
          ))}
        </g>
      );
    case "cleared":
      return (
        <g fill="none" stroke={SAFE} strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round">
          <path d="M26 51.4 L31 56 L39 46" strokeDasharray="26" className="mao-anim" style={{ animation: "mao-tick 2.6s ease-out infinite" }} />
          <path d="M60 51.4 L65 56 L73 46" strokeDasharray="26" className="mao-anim" style={{ animation: "mao-tick 2.6s ease-out .12s infinite" }} />
        </g>
      );
    case "flagged":
      return (
        <g className="mao-anim" style={{ animation: "mao-alert 1.1s ease-in-out infinite" }}>
          {[
            [24, 44],
            [24, 52],
            [58, 44],
            [58, 52],
          ].map(([x, y]) => (
            <rect key={`${x}-${y}`} x={x} y={y} width="18" height="4.4" rx="1.6" fill={DANGER} />
          ))}
        </g>
      );
    case "resting":
      return (
        <>
          <rect x="24" y="49.6" width="18" height="2.8" rx="1.4" fill="rgba(232,185,58,0.45)" />
          <rect x="58" y="49.6" width="18" height="2.8" rx="1.4" fill="rgba(232,185,58,0.45)" />
        </>
      );
    case "asking":
      return (
        <g fill={GOLD_LIGHT} fontFamily="var(--font-mono, monospace)" fontSize="16" fontWeight="700">
          <text x="26" y="57">?</text>
          <text x="61" y="57">?</text>
        </g>
      );
  }
}

function MaoLine({ state, size, earTwitch }: { state: MaoState; size: number; earTwitch: boolean }) {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, "");
  const clipId = `maoShades-${uid}`;
  const meta = STATE_META[state];
  const dimmed = state === "resting";
  const [earL, earR] = EARS[meta.ears];
  const earLRef = useRef<SVGGElement>(null);
  const earRRef = useRef<SVGGElement>(null);

  // Occasional ear flick — the timer only decides WHEN; the flick itself is a
  // CSS keyframe so it plays independently of React renders. Awake states only.
  const awake = state === "idle" || state === "scanning" || state === "thinking" || state === "asking";
  const flicking = earTwitch && awake && size >= 48;
  useEffect(() => {
    if (!flicking) return;
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    let alive = true;
    let timer: ReturnType<typeof setTimeout>;
    const schedule = (delay: number) => {
      timer = setTimeout(() => {
        if (!alive) return;
        const left = Math.random() < 0.5;
        const el = (left ? earLRef : earRRef).current;
        if (el) {
          el.style.animation = "none";
          void el.getBoundingClientRect().width;
          el.style.animation = `${left ? "mao-twitch-l" : "mao-twitch-r"} 0.44s cubic-bezier(.3,0,.4,1) 1`;
        }
        schedule(4000 + Math.random() * 7000);
      }, delay);
    };
    schedule(2500 + Math.random() * 5500);
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [flicking]);

  const stroke = meta.tone;
  const detail = size >= 64;

  return (
    <svg viewBox="0 0 100 100" width={size} height={size} style={{ display: "block" }} aria-hidden="true">
      <defs>
        <clipPath id={clipId}>
          <path d={L_SHADES} />
        </clipPath>
      </defs>

      <g ref={earLRef} style={{ transformOrigin: "30px 42px" }}>
        <path d={earL} fill={HEAD} stroke={stroke} strokeWidth="2.6" strokeLinejoin="round" />
        {detail && meta.ears === "default" && <path d={INNER_EARS[0]} fill="rgba(196,148,40,0.3)" />}
      </g>
      <g ref={earRRef} style={{ transformOrigin: "70px 42px" }}>
        <path d={earR} fill={HEAD} stroke={stroke} strokeWidth="2.6" strokeLinejoin="round" />
        {detail && meta.ears === "default" && <path d={INNER_EARS[1]} fill="rgba(196,148,40,0.3)" />}
      </g>

      <path d={L_HEAD} fill={HEAD} stroke={stroke} strokeWidth="2.6" />

      <g fill="none" stroke={stroke} strokeOpacity="0.55" strokeWidth="1.8" strokeLinecap="round">
        {WHISKERS.map((d) => (
          <path key={d} d={d} />
        ))}
      </g>

      <path d={NOSE} fill={stroke} />
      <g fill="none" stroke={stroke} strokeWidth="2.2" strokeLinecap="round">
        {MOUTHS[meta.mouth].map((d) => (
          <path key={d} d={d} />
        ))}
      </g>

      <path
        d={L_SHADES}
        fill={meta.glass}
        stroke={stroke}
        strokeOpacity={dimmed ? 0.5 : 1}
        strokeWidth="2.8"
        strokeLinejoin="round"
      />
      <g clipPath={`url(#${clipId})`}>
        <LensContent state={state} />
      </g>

      {state === "resting" && (
        <g className="mao-anim" style={{ animation: "mao-zzz 2.6s ease-out infinite" }}>
          <text x="76" y="22" fontFamily="var(--font-mono, monospace)" fontSize="15" fontWeight="700" fill={GOLD}>
            z
          </text>
        </g>
      )}
    </svg>
  );
}

function MaoSolid({ state, size, color }: { state: MaoState; size: number; color?: string }) {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, "");
  const clipId = `maoShadesS-${uid}`;
  const meta = STATE_META[state];
  const tone = color ?? (state === "resting" ? MUTED : meta.tone);
  // The knockout glass stays ink even on light surfaces — black shades on a
  // tinted cat is the mark; "currentColor" callers keep it too.
  const glass = "#0a0d0e";

  // At solid sizes only the sweep, ticks and alert bars survive; everything
  // finer (dots, glints, "?") collapses to a static mark.
  const lens =
    state === "scanning" ? (
      <g clipPath={`url(#${clipId})`}>
        <g className="mao-anim" style={{ animation: "mao-sweep 1.6s cubic-bezier(.5,0,.5,1) infinite" }}>
          <rect x="42" y="30" width="20" height="46" fill={GOLD_LIGHT} opacity="0.95" transform="rotate(24 50 50)" />
        </g>
      </g>
    ) : state === "cleared" ? (
      <g clipPath={`url(#${clipId})`} fill="none" stroke={tone} strokeWidth="4" strokeLinecap="round" strokeLinejoin="round">
        <path d="M26 51.4 L31 56 L39 46" />
        <path d="M60 51.4 L65 56 L73 46" />
      </g>
    ) : state === "flagged" ? (
      <g clipPath={`url(#${clipId})`} className="mao-anim" style={{ animation: "mao-alert 1.1s ease-in-out infinite" }}>
        <rect x="22" y="43" width="22" height="6" fill={tone} />
        <rect x="22" y="53" width="22" height="6" fill={tone} />
        <rect x="56" y="43" width="22" height="6" fill={tone} />
        <rect x="56" y="53" width="22" height="6" fill={tone} />
      </g>
    ) : null;

  return (
    <svg viewBox="0 0 100 100" width={size} height={size} style={{ display: "block" }} aria-hidden="true">
      <defs>
        <clipPath id={clipId}>
          <path d={S_SHADES} />
        </clipPath>
      </defs>
      <path d={S_EARS[0]} fill={tone} />
      <path d={S_EARS[1]} fill={tone} />
      <path d={S_HEAD} fill={tone} />
      <path d={S_SHADES} fill={glass} />
      {lens}
    </svg>
  );
}

export function MaoAvatar({
  state = "idle",
  size = 40,
  variant,
  color,
  earTwitch = true,
  className,
  "aria-label": ariaLabel,
}: MaoAvatarProps) {
  const weight = variant ?? (size < 28 ? "solid" : "line");
  return (
    <span
      role="img"
      aria-label={ariaLabel ?? STATE_META[state].label}
      className={className}
      style={{ display: "inline-flex", width: size, height: size }}
    >
      {weight === "solid" ? (
        <MaoSolid state={state} size={size} color={color} />
      ) : (
        <MaoLine state={state} size={size} earTwitch={earTwitch} />
      )}
    </span>
  );
}
