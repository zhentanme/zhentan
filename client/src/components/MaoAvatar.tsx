"use client";

import * as React from "react";
import { useCallback, useEffect, useId, useRef } from "react";

/**
 * Mao — the Zhentan agent character. One geometric cat, solid gold, opaque
 * shades; the lens is the status screen. Every state the agent can be in is
 * drawn INSIDE the glass — work is never a spinner somewhere else on the
 * page, it's light moving across Mao's shades.
 *
 * The mark is ONE weight (per the character spec): solid gold head, ink
 * details, knocked-out glass — so nothing changes down the size ladder,
 * details just drop away:
 *  - "detail" (≥28px): whiskers/mouth from 48px, inner ears from 96px;
 *    cleared/flagged/resting keep the gold body and speak through a colored
 *    glass rim + the light inside the lens.
 *  - "solid" (below 28px): the simplified mark for chips and pills; the
 *    WHOLE cat takes the state tint (or `currentColor` from the chip).
 *
 * Only the lens animates; the silhouette holds still while a loader runs
 * (an occasional ear flick is the one exception — it plays between loads of
 * work, never during a result). Under reduced motion every animation stops
 * and the sweep bar rests at centre-glass, so the state still reads.
 */

export type MaoState =
  | "idle" //     two static glints + a slow soft sweep — on duty, nothing to do
  | "scanning" // bright sweep — actively screening
  | "thinking" // ears back, dots pulse — weighing a verdict
  | "cleared" //  green rim, twin ticks draw in the glass
  | "flagged" //  red rim, alert bars pulse — blocked / needs attention
  | "resting" //  dimmed rim + z — screening paused
  | "asking"; //  ?? in the lenses — paused on YOUR decision

/**
 * Gesture vocabulary (design: "the lens carries status; the body carries
 * intent"). Each gesture is under ~a second, fires once, and returns Mao to
 * rest. Some carry event semantics — shake is refusal (flagged results
 * only), nod confirms, double-take means something looks off — so ambient
 * pools should stick to the neutral ones.
 */
export type MaoGesture =
  | "perk" //        ears snap up, head lifts — work just arrived
  | "tilt" //        head cocks and holds — pairs with a question
  | "nod" //         two dips — confirms the action you chose
  | "shake" //       refusal — only ever with a flagged result
  | "double-take" // recoil then lean in — something looks off
  | "shades-down" // glass drops for a beat — off the record
  | "stretch" //     squash then rebound — waking from rest
  | "pounce" //      crouch, hop, land — found the thing
  | "ear-flick" //   ambient — the baseline idle motion
  | "glint"; //      light crosses the glass — acknowledges you

/** Animation target → [keyframe spec] per gesture (timings from the design). */
const GESTURE_PARTS: Record<MaoGesture, [target: "root" | "earL" | "earR" | "ear" | "shades" | "glint", anim: string][]> = {
  perk: [
    ["root", "mao-perk-root 0.7s cubic-bezier(.2,1.4,.4,1) 1"],
    ["earL", "mao-perk-l 0.7s cubic-bezier(.2,1.4,.4,1) 1"],
    ["earR", "mao-perk-r 0.7s cubic-bezier(.2,1.4,.4,1) 1"],
  ],
  tilt: [["root", "mao-tilt 1.3s cubic-bezier(.3,0,.3,1) 1"]],
  nod: [["root", "mao-nod 0.8s cubic-bezier(.3,0,.3,1) 1"]],
  shake: [["root", "mao-shake 0.62s cubic-bezier(.36,0,.3,1) 1"]],
  "double-take": [["root", "mao-take 0.8s cubic-bezier(.3,0,.3,1) 1"]],
  "shades-down": [["shades", "mao-shades-down 1.5s cubic-bezier(.3,0,.3,1) 1"]],
  stretch: [["root", "mao-stretch 0.9s cubic-bezier(.3,0,.3,1) 1"]],
  pounce: [["root", "mao-pounce 0.85s cubic-bezier(.3,0,.35,1) 1"]],
  "ear-flick": [["ear", ""]], // resolved at fire time — random ear, twitch keyframe
  glint: [["glint", "mao-glint 0.7s cubic-bezier(.4,0,.4,1) 1"]],
};

/** Neutral gestures — safe to play without an event behind them. */
const NEUTRAL_GESTURES: MaoGesture[] = ["ear-flick", "perk", "tilt", "stretch", "pounce", "shades-down"];

interface MaoAvatarProps {
  state?: MaoState;
  /** Rendered width/height in px (the mark is square). */
  size?: number;
  /** Defaults to "solid" below 28px, "detail" otherwise. */
  variant?: "detail" | "solid";
  /** Solid-weight tint override (e.g. "currentColor" inside a colored chip). */
  color?: string;
  /**
   * Mouth override (detail weight). "auto" follows the state (working states
   * are mouthless — all attention on the glass); "smile" forces the hero's
   * ink smile, for ambient placements where Mao is the friendly face of the
   * agent rather than a status readout.
   */
  mouth?: "auto" | "smile";
  /** Random ear flicks (detail weight, awake states, ≥48px). Defaults on. */
  earTwitch?: boolean;
  /**
   * Ambient gesture pool (detail weight, awake states, ≥48px). While Mao
   * waits, a random gesture from this pool fires every 4–11s — richer
   * company than the default lone ear flick. Overrides `earTwitch`.
   */
  ambient?: MaoGesture[];
  /**
   * Poke mode (detail weight): clicking Mao fires a random gesture from the
   * ambient pool (or the neutral set), and he grows slightly on hover.
   * Clicks don't bubble — safe inside a Link.
   */
  interactive?: boolean;
  className?: string;
  "aria-label"?: string;
}

/* ── Palette (mirrors the brand tokens in globals.css) ─────────────── */
const GOLD = "#c49428";
const GOLD_LIGHT = "#e8b93a";
const SAFE = "var(--safe, #3fbe76)";
const DANGER = "var(--danger, #e5524f)";
const MUTED = "var(--ink-300, #8e938a)";
const INK = "#0a0d0e";
const INK_SOFT = "rgba(10,13,14,0.5)"; //  whiskers on the gold head
const INK_FAINT = "rgba(10,13,14,0.34)"; // inner ears

/* ── Detail-weight geometry ────────────────────────────────────────── */
const HEAD =
  "M50 19 C72 19, 88 34, 88 55 C88 76, 71 89, 50 89 C29 89, 12 76, 12 55 C12 34, 28 19, 50 19 Z";
const SHADES =
  "M18 41 L82 41 C84.8 41, 86 42.8, 85.4 45.4 L82.6 57.4 C82 60, 80 61.4, 77.4 61.4 L60 61.4 C57.4 61.4, 55.6 60, 55 57.4 L53.4 51 L46.6 51 L45 57.4 C44.4 60, 42.6 61.4, 40 61.4 L22.6 61.4 C20 61.4, 18 60, 17.4 57.4 L14.6 45.4 C14 42.8, 15.2 41, 18 41 Z";
const NOSE = "M46.6 62.6 L53.4 62.6 L50 68.6 Z";
const EARS: Record<"default" | "back" | "alert", [string, string]> = {
  default: ["M20 12 L42 32 L16 44 Z", "M80 12 L58 32 L84 44 Z"],
  back: ["M23 15 L43 33 L20 45 Z", "M77 15 L57 33 L80 45 Z"],
  alert: ["M19 9 L42 31 L15 43 Z", "M81 9 L58 31 L85 43 Z"],
};
const INNER_EARS: [string, string] = ["M25 21 L35 31 L23 36 Z", "M75 21 L65 31 L77 36 Z"];
const WHISKERS = ["M37 70 L18 66", "M37 75 L17 78", "M63 70 L82 66", "M63 75 L83 78"];
const MOUTHS: Record<"smile" | "frown", string[]> = {
  smile: ["M50 69.4 C48 73, 44.4 72.6, 43.2 69.6", "M50 69.4 C52 73, 55.6 72.6, 56.8 69.6"],
  frown: ["M43.6 72 C46.4 69.8, 53.6 69.8, 56.4 72"],
};

/* ── Solid-weight geometry (simplified mark for chips) ─────────────── */
const S_EARS: [string, string] = ["M18 8 L42 32 L14 46 Z", "M82 8 L58 32 L86 46 Z"];
const S_HEAD =
  "M50 17 C74 17, 91 33, 91 55 C91 78, 71 92, 50 92 C29 92, 9 78, 9 55 C9 33, 26 17, 50 17 Z";
const S_SHADES =
  "M16 40 L84 40 C87 40, 88.4 42, 87.6 44.8 L84.6 58 C84 60.8, 81.8 62.4, 79 62.4 L60 62.4 C57.2 62.4, 55.2 60.8, 54.6 58 L53 51 L47 51 L45.4 58 C44.8 60.8, 42.8 62.4, 40 62.4 L21 62.4 C18.2 62.4, 16 60.8, 15.4 58 L12.4 44.8 C11.6 42, 13 40, 16 40 Z";

/**
 * Per-state look. The body is ALWAYS gold — mood lives in the ear pose, the
 * glass rim, the mouth, and the light inside the lens. Working/resting
 * states drop the mouth entirely (all attention on the glass); results and
 * social states get one back, in the state's color.
 */
const STATE_META: Record<
  MaoState,
  {
    glass: string;
    rim?: string;
    ears: keyof typeof EARS;
    mouth?: { shape: keyof typeof MOUTHS; color: string };
    label: string;
  }
> = {
  idle: { glass: "#0b0e10", ears: "default", mouth: { shape: "smile", color: INK }, label: "Zhentan agent on duty" },
  scanning: { glass: "#0b0e10", ears: "default", label: "Zhentan agent scanning" },
  thinking: { glass: "#0b0e10", ears: "back", label: "Zhentan agent thinking" },
  cleared: {
    glass: "#0d1613",
    rim: SAFE,
    ears: "default",
    mouth: { shape: "smile", color: SAFE },
    label: "Cleared by the Zhentan agent",
  },
  flagged: {
    glass: "#180f0e",
    rim: DANGER,
    ears: "alert",
    mouth: { shape: "frown", color: DANGER },
    label: "Flagged by the Zhentan agent",
  },
  resting: { glass: "#0b0e10", rim: "rgba(196,148,40,0.5)", ears: "default", label: "Zhentan agent paused" },
  asking: {
    glass: "#0b0e10",
    ears: "default",
    mouth: { shape: "smile", color: INK },
    label: "Zhentan agent awaiting your decision",
  },
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

/** What lives inside the glass for each state (detail weight). */
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

function MaoDetail({
  state,
  size,
  earTwitch,
  mouth = "auto",
  ambient,
  interactive = false,
}: {
  state: MaoState;
  size: number;
  earTwitch: boolean;
  mouth?: "auto" | "smile";
  ambient?: MaoGesture[];
  interactive?: boolean;
}) {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, "");
  const clipId = `maoShades-${uid}`;
  const meta = STATE_META[state];
  const [earL, earR] = EARS[meta.ears];
  const rootRef = useRef<SVGGElement>(null);
  const earLRef = useRef<SVGGElement>(null);
  const earRRef = useRef<SVGGElement>(null);
  const shadesRef = useRef<SVGGElement>(null);
  const glintRef = useRef<SVGGElement>(null);

  // Each gesture is a CSS keyframe that fires once and returns Mao to rest,
  // so it plays independently of React renders. Shared by the ambient timer
  // and pokes.
  const fireGesture = useCallback((gesture: MaoGesture) => {
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    const targets = {
      root: rootRef,
      earL: earLRef,
      earR: earRRef,
      shades: shadesRef,
      glint: glintRef,
    };
    const fire = (el: SVGGElement | null, anim: string) => {
      if (!el) return;
      el.style.animation = "none";
      void el.getBoundingClientRect().width;
      el.style.animation = anim;
    };
    for (const [target, anim] of GESTURE_PARTS[gesture]) {
      if (target === "ear") {
        const left = Math.random() < 0.5;
        fire(
          (left ? earLRef : earRRef).current,
          `${left ? "mao-twitch-l" : "mao-twitch-r"} 0.44s cubic-bezier(.3,0,.4,1) 1`
        );
      } else {
        fire(targets[target].current, anim);
      }
    }
  }, []);

  // Ambient motion — the timer only decides WHEN. Awake states only; the
  // pool defaults to the lone ear flick unless the caller hands over a
  // richer vocabulary.
  const awake = state === "idle" || state === "scanning" || state === "thinking" || state === "asking";
  const pool = ambient ?? (earTwitch ? ["ear-flick" as const] : []);
  const active = awake && size >= 48 && pool.length > 0;
  const poolKey = pool.join(",");
  useEffect(() => {
    if (!active) return;
    const gestures = poolKey.split(",") as MaoGesture[];
    let alive = true;
    let timer: ReturnType<typeof setTimeout>;
    const schedule = (delay: number) => {
      timer = setTimeout(() => {
        if (!alive) return;
        fireGesture(gestures[Math.floor(Math.random() * gestures.length)]);
        schedule(4000 + Math.random() * 7000);
      }, delay);
    };
    schedule(2500 + Math.random() * 5500);
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [active, poolKey, fireGesture]);

  // Poke — a click plays a random gesture from the same pool the ambient
  // loop draws from. Never bubbles: Mao often sits inside a Link, and
  // petting the cat shouldn't navigate.
  const pokePool = pool.length > 0 ? pool : NEUTRAL_GESTURES;
  const poke = interactive
    ? (e: React.MouseEvent<SVGSVGElement>) => {
        e.preventDefault();
        e.stopPropagation();
        fireGesture(pokePool[Math.floor(Math.random() * pokePool.length)]);
      }
    : undefined;

  const face = size >= 48; //  whiskers + mouth survive to 48px
  const innerEars = size >= 96 && meta.ears === "default";

  return (
    <svg
      viewBox="0 0 100 100"
      width={size}
      height={size}
      style={{ display: "block", overflow: "visible" }} //  pounce overshoots the box
      className={interactive ? "mao-poke" : undefined}
      onClick={poke}
      aria-hidden="true"
    >
      <defs>
        <clipPath id={clipId}>
          <path d={SHADES} />
        </clipPath>
      </defs>

      <g ref={rootRef} style={{ transformOrigin: "50px 76px" }}>
        <g ref={earLRef} style={{ transformOrigin: "30px 42px" }}>
          <path d={earL} fill={GOLD} />
          {innerEars && <path d={INNER_EARS[0]} fill={INK_FAINT} />}
        </g>
        <g ref={earRRef} style={{ transformOrigin: "70px 42px" }}>
          <path d={earR} fill={GOLD} />
          {innerEars && <path d={INNER_EARS[1]} fill={INK_FAINT} />}
        </g>

        <path d={HEAD} fill={GOLD} />

        {face && (
          <g fill="none" stroke={INK_SOFT} strokeWidth="1.8" strokeLinecap="round">
            {WHISKERS.map((d) => (
              <path key={d} d={d} />
            ))}
          </g>
        )}

        <path d={NOSE} fill={INK} />
        {face &&
          (() => {
            const m = mouth === "smile" ? { shape: "smile" as const, color: INK } : meta.mouth;
            if (!m) return null;
            return (
              <g fill="none" stroke={m.color} strokeWidth="2.2" strokeLinecap="round">
                {MOUTHS[m.shape].map((d) => (
                  <path key={d} d={d} />
                ))}
              </g>
            );
          })()}

        {/* The glass block moves as one during shades-down: rim, light, glint. */}
        <g ref={shadesRef}>
          <path
            d={SHADES}
            fill={meta.glass}
            stroke={meta.rim}
            strokeWidth={meta.rim ? 2.8 : undefined}
            strokeLinejoin={meta.rim ? "round" : undefined}
          />
          <g clipPath={`url(#${clipId})`}>
            <LensContent state={state} />
            <g ref={glintRef} style={{ opacity: 0 }}>
              <rect x="46" y="30" width="11" height="46" fill={GOLD_LIGHT} opacity="0.85" transform="rotate(24 50 50)" />
            </g>
          </g>
        </g>

        {state === "resting" && (
          <g className="mao-anim" style={{ animation: "mao-zzz 2.6s ease-out infinite" }}>
            <text x="76" y="22" fontFamily="var(--font-mono, monospace)" fontSize="15" fontWeight="700" fill={GOLD}>
              z
            </text>
          </g>
        )}
      </g>
    </svg>
  );
}

function MaoSolid({ state, size, color }: { state: MaoState; size: number; color?: string }) {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, "");
  const clipId = `maoShadesS-${uid}`;
  const tone = color ?? (state === "resting" ? MUTED : state === "flagged" ? DANGER : state === "cleared" ? SAFE : GOLD);
  // The knockout glass stays ink even on light surfaces — black shades on a
  // tinted cat is the mark; "currentColor" callers keep it too.
  const glass = INK;

  // At chip sizes only the sweep, ticks and alert bars survive; everything
  // finer (dots, glints, "?") collapses to the silent mark.
  const lens =
    state === "scanning" ? (
      <g clipPath={`url(#${clipId})`}>
        <g className="mao-anim" style={{ animation: "mao-sweep 1.6s cubic-bezier(.5,0,.5,1) infinite" }}>
          <rect x="42" y="30" width="21" height="46" fill={GOLD_LIGHT} transform="rotate(24 50 50)" />
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
  mouth,
  earTwitch = true,
  ambient,
  interactive = false,
  className,
  "aria-label": ariaLabel,
}: MaoAvatarProps) {
  const weight = variant ?? (size < 28 ? "solid" : "detail");
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
        <MaoDetail
          state={state}
          size={size}
          earTwitch={earTwitch}
          mouth={mouth}
          ambient={ambient}
          interactive={interactive}
        />
      )}
    </span>
  );
}
