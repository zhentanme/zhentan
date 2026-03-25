"use client";

import { useRef, useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { motion, useInView } from "framer-motion";
import {
  Zap,
  Bell,
  Bot,
  Search,
  TrendingUp,
  ArrowRight,
  Lock,
} from "lucide-react";
import { Button } from "@/components/ui/Button";

/* ─── Helpers ─────────────────────────────────────────────────────── */

function Section({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  const ref = useRef(null);
  const inView = useInView(ref, { once: true, margin: "-80px" });
  return (
    <motion.section
      ref={ref}
      initial={{ opacity: 0, y: 40 }}
      animate={inView ? { opacity: 1, y: 0 } : {}}
      transition={{ duration: 0.6, type: "spring", bounce: 0.18 }}
      className={className}
    >
      {children}
    </motion.section>
  );
}

/* ─── Animated Risk Gauge ─────────────────────────────────────────── */

function RiskGauge() {
  const ref = useRef(null);
  const inView = useInView(ref, { once: true });
  const [score, setScore] = useState(0);
  const TARGET = 65; // REVIEW zone — most interesting to demonstrate

  useEffect(() => {
    if (!inView) return;
    let raf: number;
    const duration = 1800;
    const startTime = Date.now();
    const tick = () => {
      const elapsed = Date.now() - startTime;
      const t = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - t, 3); // ease-out cubic
      setScore(Math.round(eased * TARGET));
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    const delay = setTimeout(() => {
      raf = requestAnimationFrame(tick);
    }, 500);
    return () => {
      clearTimeout(delay);
      cancelAnimationFrame(raf);
    };
  }, [inView]);

  const R = 70;
  const cx = 90;
  const cy = 90;

  const arcPath = (fromDeg: number, toDeg: number) => {
    const toRad = (d: number) => (d * Math.PI) / 180;
    const fx = cx + R * Math.cos(toRad(fromDeg));
    const fy = cy + R * Math.sin(toRad(fromDeg));
    const tx = cx + R * Math.cos(toRad(toDeg));
    const ty = cy + R * Math.sin(toRad(toDeg));
    const large = toDeg - fromDeg > 180 ? 1 : 0;
    return `M ${fx.toFixed(2)} ${fy.toFixed(2)} A ${R} ${R} 0 ${large} 1 ${tx.toFixed(2)} ${ty.toFixed(2)}`;
  };

  // Gauge: 135° → 405° (= 45°), 270° total sweep, clockwise
  const progressEndDeg = 135 + (score / 100) * 270;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const nx = cx + R * Math.cos(toRad(progressEndDeg));
  const ny = cy + R * Math.sin(toRad(progressEndDeg));

  const color = score < 40 ? "#10b981" : score < 70 ? "#f59e0b" : "#ef4444";
  const label = score < 40 ? "SAFE" : score < 70 ? "REVIEW" : "BLOCK";
  const labelColor =
    score < 40 ? "text-emerald-400" : score < 70 ? "text-amber-400" : "text-red-400";

  return (
    <div ref={ref} className="flex flex-col items-center gap-2">
      <svg
        width="180"
        height="150"
        viewBox="0 0 180 150"
        className="overflow-visible"
      >
        <defs>
          <filter id="glow-gauge" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="4" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>
        {/* Background track */}
        <path
          d={arcPath(135, 405)}
          fill="none"
          stroke="rgba(255,255,255,0.07)"
          strokeWidth="12"
          strokeLinecap="round"
        />
        {/* Zone shading */}
        <path
          d={arcPath(135, 243)}
          fill="none"
          stroke="rgba(16,185,129,0.2)"
          strokeWidth="12"
          strokeLinecap="butt"
        />
        <path
          d={arcPath(243, 324)}
          fill="none"
          stroke="rgba(245,158,11,0.2)"
          strokeWidth="12"
          strokeLinecap="butt"
        />
        <path
          d={arcPath(324, 405)}
          fill="none"
          stroke="rgba(239,68,68,0.2)"
          strokeWidth="12"
          strokeLinecap="butt"
        />
        {/* Animated progress arc */}
        {score > 0 && (
          <path
            d={arcPath(135, Math.min(progressEndDeg, 405))}
            fill="none"
            stroke={color}
            strokeWidth="12"
            strokeLinecap="round"
            filter="url(#glow-gauge)"
          />
        )}
        {/* Needle dot */}
        <circle
          cx={nx}
          cy={ny}
          r="7"
          fill={color}
          filter="url(#glow-gauge)"
        />
        {/* Score display */}
        <text
          x={cx}
          y={cy - 4}
          textAnchor="middle"
          dominantBaseline="middle"
          fill="white"
          fontSize="30"
          fontWeight="bold"
        >
          {score}
        </text>
        <text
          x={cx}
          y={cy + 18}
          textAnchor="middle"
          fill="rgba(255,255,255,0.3)"
          fontSize="9"
          letterSpacing="2"
        >
          RISK SCORE
        </text>
      </svg>
      {/* Zone labels */}
      <div className="flex justify-between w-[170px] -mt-3 text-[8px] font-bold uppercase tracking-widest">
        <span className="text-emerald-400/60">Safe</span>
        <span className="text-amber-400/60">Review</span>
        <span className="text-red-400/60">Block</span>
      </div>
      {/* Current verdict */}
      <motion.span
        key={label}
        initial={{ opacity: 0, scale: 0.8 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ type: "spring", bounce: 0.4 }}
        className={`text-[10px] font-black tracking-[0.2em] uppercase mt-1 ${labelColor}`}
      >
        ● {label}
      </motion.span>
    </div>
  );
}

/* ─── Architecture Diagram ────────────────────────────────────────── */

function ArchitectureDiagram() {
  const ref = useRef(null);
  const inView = useInView(ref, { once: true, margin: "-60px" });
  const SF = "system-ui, -apple-system, sans-serif";

  // Layout (viewBox 720×640):
  // Layer 0 y=15  — User Wallet (center x=117) + DApp (center x=602)
  // Layer 1 y=135 — Safe Multisig (center x=360)
  // Layer 2 y=300 — Zhentan Agent circle (center 360,300) ← hero node
  // Layer 3 y=450 — APPROVE / REVIEW / BLOCK
  // Layer 4 y=572 — BNB Chain / Telegram / Blocked

  const PATHS = [
    { id: "ap1", d: "M 117,80 C 117,112 360,110 360,135",        color: "rgba(240,185,11,0.45)", dur: "2.4s", begin: "0.3s", delay: 0.40 },
    { id: "ap2", d: "M 602,105 C 602,122 360,122 360,135",       color: "rgba(240,185,11,0.45)", dur: "2.4s", begin: "1.1s", delay: 0.55 },
    { id: "ap3", d: "M 360,203 L 360,232",                       color: "rgba(240,185,11,0.45)", dur: "2.0s", begin: "0.8s", delay: 0.78 },
    { id: "ap4", d: "M 288,300 C 200,358 117,390 117,450",       color: "rgba(16,185,129,0.60)", dur: "2.0s", begin: "0.6s", delay: 1.05 },
    { id: "ap5", d: "M 360,368 L 360,450",                       color: "rgba(245,158,11,0.60)", dur: "1.8s", begin: "0.2s", delay: 1.00 },
    { id: "ap6", d: "M 432,300 C 520,358 602,390 602,450",       color: "rgba(239,68,68,0.60)",  dur: "2.0s", begin: "1.4s", delay: 1.10 },
    { id: "ap7", d: "M 117,525 L 117,572",                       color: "rgba(16,185,129,0.40)", dur: "1.4s", begin: "0.9s", delay: 1.50 },
    { id: "ap8", d: "M 360,525 L 360,572",                       color: "rgba(245,158,11,0.40)", dur: "1.4s", begin: "0.4s", delay: 1.60 },
    { id: "ap9", d: "M 602,525 L 602,572",                       color: "rgba(239,68,68,0.40)",  dur: "1.4s", begin: "1.2s", delay: 1.70 },
  ];

  const n = (delay: number) => ({
    initial: { opacity: 0, scale: 0.92 },
    animate: inView ? { opacity: 1, scale: 1 } : { opacity: 0, scale: 0.92 },
    transition: { delay, type: "spring" as const, bounce: 0.22 },
  });

  return (
    <div ref={ref} className="w-full max-w-4xl mx-auto">
      <svg viewBox="0 0 720 640" className="w-full" style={{ maxHeight: 600 }}>
        <defs>
          {PATHS.map((p) => (
            <path key={`def-${p.id}`} id={p.id} d={p.d} fill="none" />
          ))}

          {/* Horizontal gradient top-edge accents (objectBoundingBox = per element) */}
          <linearGradient id="g-gold" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%"   stopColor="#F0B90B" stopOpacity={0} />
            <stop offset="50%"  stopColor="#F0B90B" stopOpacity={0.7} />
            <stop offset="100%" stopColor="#F0B90B" stopOpacity={0} />
          </linearGradient>
          <linearGradient id="g-green" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%"   stopColor="#10b981" stopOpacity={0} />
            <stop offset="50%"  stopColor="#10b981" stopOpacity={0.7} />
            <stop offset="100%" stopColor="#10b981" stopOpacity={0} />
          </linearGradient>
          <linearGradient id="g-amber" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%"   stopColor="#f59e0b" stopOpacity={0} />
            <stop offset="50%"  stopColor="#f59e0b" stopOpacity={0.7} />
            <stop offset="100%" stopColor="#f59e0b" stopOpacity={0} />
          </linearGradient>
          <linearGradient id="g-red" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%"   stopColor="#ef4444" stopOpacity={0} />
            <stop offset="50%"  stopColor="#ef4444" stopOpacity={0.7} />
            <stop offset="100%" stopColor="#ef4444" stopOpacity={0} />
          </linearGradient>
          {/* Vertical glass fill — top lighter, bottom darker */}
          <linearGradient id="g-glass" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%"   stopColor="white" stopOpacity={0.07} />
            <stop offset="100%" stopColor="white" stopOpacity={0.02} />
          </linearGradient>

          {/* dapp logos strip: 16px padding each side → x=521,y=46 w=163,h=48 */}
          <clipPath id="clip-dapps"><rect x="521" y="46" width="163" height="48" rx="6" /></clipPath>
          <clipPath id="clip-agent-c"><circle cx="360" cy="300" r="54" /></clipPath>
          <clipPath id="clip-safe-c"><circle cx="256" cy="169" r="24" /></clipPath>
          {/* bnb logo center: x=30+20=50, y=582+20=602 */}
          <clipPath id="clip-bnb-c"><circle cx="50" cy="602" r="20" /></clipPath>
          {/* telegram logo left-aligned: x=272+20=292, y=582+20=602 */}
          <clipPath id="clip-tg-c"><circle cx="292" cy="602" r="20" /></clipPath>
        </defs>

        {/* ── Connector lines ───────────────────────────────────────── */}
        {PATHS.map((p) => (
          <motion.path key={p.id} d={p.d} fill="none" stroke={p.color}
            strokeWidth="1.5" strokeLinecap="round"
            initial={{ pathLength: 0, opacity: 0 }}
            animate={inView ? { pathLength: 1, opacity: 1 } : {}}
            transition={{ duration: 1.1, delay: p.delay, ease: "easeInOut" }}
          />
        ))}

        {/* ── Flowing data-packet dots ──────────────────────────────── */}
        {inView && PATHS.map((p) => (
          <circle key={`dot-${p.id}`} r="3.5" fill={p.color} opacity="0.9">
            <animateMotion dur={p.dur} repeatCount="indefinite" begin={p.begin}>
              <mpath href={`#${p.id}`} />
            </animateMotion>
          </circle>
        ))}

        {/* ══════════════════════════════════════════════════════════ */}

        {/* ── User Wallet ─────────────────────────────────────────── */}
        <motion.g {...n(0.10)}>
          <rect x="20" y="15" width="195" height="65" rx="12"
            fill="url(#g-glass)" stroke="rgba(255,255,255,0.10)" strokeWidth="1" />
          <rect x="20" y="15" width="195" height="1.5" rx="1" fill="url(#g-gold)" />
          <text x="117" y="43" textAnchor="middle" fill="rgba(255,255,255,0.90)" fontSize="12" fontWeight="600" fontFamily={SF}>User Wallet</text>
          <text x="117" y="59" textAnchor="middle" fill="rgba(240,185,11,0.65)" fontSize="8.5" fontFamily={SF}>1 of 2 signers · Privy</text>
        </motion.g>

        {/* ── WalletConnect DApp ───────────────────────────────────── */}
        {/* box bottom y=105 to match ap2 path start */}
        <motion.g {...n(0.20)}>
          <rect x="505" y="15" width="195" height="90" rx="12"
            fill="url(#g-glass)" stroke="rgba(255,255,255,0.10)" strokeWidth="1" />
          <rect x="505" y="15" width="195" height="1.5" rx="1" fill="url(#g-gold)" />
          <text x="602" y="33" textAnchor="middle" fill="rgba(255,255,255,0.90)" fontSize="12" fontWeight="600" fontFamily={SF}>WalletConnect DApp</text>
          {/* DApp logo strip — arch-dapps.png 684×200 (ratio 3.42:1), display 163×48 ≈ same ratio, 16px padding */}
          <image href="/arch-dapps.png" x="521" y="46" width="163" height="48"
            clipPath="url(#clip-dapps)" preserveAspectRatio="xMidYMid slice" />
        </motion.g>

        {/* ── Safe Multisig (logo + one line) ─────────────────────── */}
        <motion.g {...n(0.38)}>
          <rect x="222" y="135" width="276" height="68" rx="12"
            fill="url(#g-glass)" stroke="rgba(255,255,255,0.10)" strokeWidth="1" />
          <rect x="222" y="135" width="276" height="1.5" rx="1" fill="url(#g-gold)" />
          {/* Safe logo — scaled down inside circle so edges aren't cut (padding) */}
          <image href="/arch-safe.png" x="236" y="149" width="40" height="40"
            clipPath="url(#clip-safe-c)" preserveAspectRatio="xMidYMid meet" />
          <circle cx="256" cy="169" r="25" fill="none" stroke="rgba(240,185,11,0.18)" strokeWidth="1" />
          {/* Text centered in remaining space: logo right ≈ 281, box right = 498 → center = 389 */}
          <text x="389" y="162" textAnchor="middle" fill="white" fontSize="11.5" fontWeight="700" fontFamily={SF}>Safe Multisig — 2 of 2</text>
          <text x="389" y="178" textAnchor="middle" fill="rgba(255,255,255,0.45)" fontSize="9" fontFamily={SF}>User + OpenClaw agent both must sign</text>
        </motion.g>

        {/* ── Zhentan Agent — HERO CIRCLE NODE ────────────────────── */}
        <motion.g {...n(0.62)}>
          {/* ── Float wrapper: whole agent bobs up/down (OpenClaw-style "float") */}
          <motion.g
            animate={inView ? { y: [0, -7, 0] } : {}}
            transition={{ repeat: Infinity, duration: 4, ease: "easeInOut" }}
          >
            {/* Outermost pulse ring */}
            <motion.circle cx="360" cy="300" r="82"
              fill="none" stroke="rgba(240,185,11,0.10)" strokeWidth="1"
              animate={inView ? { opacity: [0.2, 0.8, 0.2], r: [78, 86, 78] } : {}}
              transition={{ repeat: Infinity, duration: 3.5, ease: "easeInOut" }}
            />
            {/* Middle breathing ring */}
            <motion.circle cx="360" cy="300" r="70"
              fill="rgba(240,185,11,0.04)" stroke="rgba(240,185,11,0.22)" strokeWidth="1"
              animate={inView ? { opacity: [0.8, 0.3, 0.8] } : {}}
              transition={{ repeat: Infinity, duration: 2.8, ease: "easeInOut", delay: 0.4 }}
            />
            {/* Inner glow ring */}
            <motion.circle cx="360" cy="300" r="60"
              fill="rgba(240,185,11,0.08)"
              stroke="rgba(240,185,11,0.50)" strokeWidth="1.8"
              style={{ filter: "drop-shadow(0 0 12px rgba(240,185,11,0.45))" }}
              animate={inView ? { opacity: [1, 0.5, 1] } : {}}
              transition={{ repeat: Infinity, duration: 2.2, ease: "easeInOut", delay: 0.9 }}
            />

            {/* ── Agent image: glow-pulse + snap jolt layers ────────── */}
            {/* Glow layer: drop-shadow breathes in/out (OpenClaw eye blink / logo-glow) */}
            <motion.g
              animate={inView ? {
                filter: [
                  "drop-shadow(0 0 4px rgba(240,185,11,0.15))",
                  "drop-shadow(0 0 22px rgba(240,185,11,0.80))",
                  "drop-shadow(0 0 4px rgba(240,185,11,0.15))",
                ],
              } : {}}
              transition={{ repeat: Infinity, duration: 2.5, ease: "easeInOut", delay: 0.3 }}
            >
              {/* Snap layer: stays still for 70% of cycle then briefly pops (OpenClaw clawSnap) */}
              <motion.g
                style={{ transformBox: "fill-box", transformOrigin: "center" }}
                animate={inView ? {
                  scale: [1, 1, 1, 1, 1, 1, 1, 1.08, 1.02, 1],
                } : {}}
                transition={{
                  repeat: Infinity,
                  duration: 5,
                  ease: "easeInOut",
                  delay: 1.5,
                  times: [0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.68, 0.80, 0.90, 1],
                }}
              >
                <image href="/arch-agent.png" x="306" y="246" width="108" height="108"
                  clipPath="url(#clip-agent-c)" preserveAspectRatio="xMidYMid slice" />
              </motion.g>
            </motion.g>

            {/* Labels */}
            <text x="360" y="382" textAnchor="middle" fill="#F0B90B" fontSize="14" fontWeight="700" fontFamily={SF}>Zhentan Agent</text>
            <text x="360" y="397" textAnchor="middle" fill="rgba(255,255,255,0.40)" fontSize="9" fontFamily={SF}>powered by OpenClaw</text>
            <text x="360" y="414" textAnchor="middle" fill="rgba(255,255,255,0.55)" fontSize="8.5" fontFamily={SF}>Assesses risks · learns behaviour · communicates with user</text>
          </motion.g>
        </motion.g>

        {/* ── APPROVE ─────────────────────────────────────────────── */}
        <motion.g {...n(1.00)}>
          <motion.rect x="20" y="450" width="195" height="75" rx="12"
            fill="rgba(16,185,129,0.07)" stroke="rgba(16,185,129,0.30)" strokeWidth="1"
            animate={inView ? { opacity: [0.7, 1, 0.7] } : {}}
            transition={{ repeat: Infinity, duration: 3, ease: "easeInOut", delay: 2 }}
          />
          <rect x="20" y="450" width="195" height="1.5" rx="1" fill="url(#g-green)" />
          <text x="117" y="482" textAnchor="middle" fill="#10b981" fontSize="13" fontWeight="700" fontFamily={SF}>APPROVE</text>
          <text x="117" y="498" textAnchor="middle" fill="rgba(255,255,255,0.42)" fontSize="9" fontFamily={SF}>Score &lt; 40</text>
          <text x="117" y="513" textAnchor="middle" fill="rgba(16,185,129,0.65)" fontSize="8" fontFamily={SF}>Auto-execute · gasless</text>
        </motion.g>

        {/* ── REVIEW ──────────────────────────────────────────────── */}
        <motion.g {...n(1.12)}>
          <motion.rect x="262" y="450" width="196" height="75" rx="12"
            fill="rgba(245,158,11,0.07)" stroke="rgba(245,158,11,0.30)" strokeWidth="1"
            animate={inView ? { opacity: [1, 0.6, 1] } : {}}
            transition={{ repeat: Infinity, duration: 2.5, ease: "easeInOut", delay: 2.3 }}
          />
          <rect x="262" y="450" width="196" height="1.5" rx="1" fill="url(#g-amber)" />
          <text x="360" y="482" textAnchor="middle" fill="#f59e0b" fontSize="13" fontWeight="700" fontFamily={SF}>REVIEW</text>
          <text x="360" y="498" textAnchor="middle" fill="rgba(255,255,255,0.42)" fontSize="9" fontFamily={SF}>Score 40–70</text>
          <text x="360" y="513" textAnchor="middle" fill="rgba(245,158,11,0.65)" fontSize="8" fontFamily={SF}>Telegram notified</text>
        </motion.g>

        {/* ── BLOCK ───────────────────────────────────────────────── */}
        <motion.g {...n(1.24)}>
          <motion.rect x="505" y="450" width="195" height="75" rx="12"
            fill="rgba(239,68,68,0.07)" stroke="rgba(239,68,68,0.30)" strokeWidth="1"
            animate={inView ? { opacity: [0.7, 1, 0.7] } : {}}
            transition={{ repeat: Infinity, duration: 3.2, ease: "easeInOut", delay: 2.6 }}
          />
          <rect x="505" y="450" width="195" height="1.5" rx="1" fill="url(#g-red)" />
          <text x="602" y="482" textAnchor="middle" fill="#ef4444" fontSize="13" fontWeight="700" fontFamily={SF}>BLOCK</text>
          <text x="602" y="498" textAnchor="middle" fill="rgba(255,255,255,0.42)" fontSize="9" fontFamily={SF}>Score &gt; 70</text>
          <text x="602" y="513" textAnchor="middle" fill="rgba(239,68,68,0.65)" fontSize="8" fontFamily={SF}>Denied · user alerted</text>
        </motion.g>

        {/* ── BNB Chain (logo left, text centered in remaining space) ── */}
        <motion.g {...n(1.42)}>
          <rect x="20" y="572" width="195" height="58" rx="12"
            fill="url(#g-glass)" stroke="rgba(255,255,255,0.09)" strokeWidth="1" />
          <rect x="20" y="572" width="195" height="1.5" rx="1" fill="url(#g-gold)" />
          {/* Logo center at (50, 602) — 10px left padding */}
          <image href="/arch-bnb.png" x="30" y="582" width="40" height="40"
            clipPath="url(#clip-bnb-c)" preserveAspectRatio="xMidYMid slice" />
          <circle cx="50" cy="602" r="21" fill="none" stroke="rgba(240,185,11,0.20)" strokeWidth="1" />
          {/* Text centered from logo right (71) to box right (215): center = 143 */}
          <text x="143" y="597" textAnchor="middle" fill="rgba(255,255,255,0.88)" fontSize="11" fontWeight="600" fontFamily={SF}>BNB Chain</text>
          <text x="143" y="613" textAnchor="middle" fill="rgba(240,185,11,0.55)" fontSize="8.5" fontFamily={SF}>Gasless · ERC-4337 · Pimlico</text>
        </motion.g>

        {/* ── Telegram (logo left, text centered in remaining space) ─── */}
        <motion.g {...n(1.55)}>
          <rect x="262" y="572" width="196" height="58" rx="12"
            fill="url(#g-glass)" stroke="rgba(255,255,255,0.09)" strokeWidth="1" />
          <rect x="262" y="572" width="196" height="1.5" rx="1" fill="url(#g-amber)" />
          {/* Logo center at (292, 602) — 10px left padding */}
          <image href="/arch-telegram.png" x="272" y="582" width="40" height="40"
            clipPath="url(#clip-tg-c)" preserveAspectRatio="xMidYMid slice" />
          <circle cx="292" cy="602" r="21" fill="none" stroke="rgba(245,158,11,0.20)" strokeWidth="1" />
          {/* Text centered from logo right (313) to box right (458): center = 385 */}
          <text x="385" y="597" textAnchor="middle" fill="rgba(255,255,255,0.88)" fontSize="11" fontWeight="600" fontFamily={SF}>Telegram</text>
          <text x="385" y="613" textAnchor="middle" fill="rgba(245,158,11,0.55)" fontSize="8.5" fontFamily={SF}>Interactive approve / reject</text>
        </motion.g>

        {/* ── Blocked ─────────────────────────────────────────────── */}
        <motion.g {...n(1.68)}>
          <rect x="505" y="572" width="195" height="58" rx="12"
            fill="url(#g-glass)" stroke="rgba(255,255,255,0.09)" strokeWidth="1" />
          <rect x="505" y="572" width="195" height="1.5" rx="1" fill="url(#g-red)" />
          <text x="602" y="597" textAnchor="middle" fill="rgba(255,255,255,0.85)" fontSize="12" fontWeight="600" fontFamily={SF}>Blocked</text>
          <text x="602" y="613" textAnchor="middle" fill="rgba(239,68,68,0.55)" fontSize="8.5" fontFamily={SF}>Rejected · alert dispatched</text>
        </motion.g>
      </svg>
    </div>
  );
}

/* ─── Data ────────────────────────────────────────────────────────── */

const verdicts = [
  {
    range: "< 40",
    label: "APPROVE",
    desc: "Auto-signed and executed immediately. Pattern recorded asynchronously for future learning.",
    border: "rgba(16,185,129,0.28)",
    accent: "rgba(16,185,129,0.70)",
    bg: "rgba(16,185,129,0.07)",
    text: "text-emerald-400",
  },
  {
    range: "40 – 70",
    label: "REVIEW",
    desc: "Telegram notification sent with interactive [Approve] [Reject] buttons for user review.",
    border: "rgba(245,158,11,0.28)",
    accent: "rgba(245,158,11,0.70)",
    bg: "rgba(245,158,11,0.07)",
    text: "text-amber-400",
  },
  {
    range: "> 70",
    label: "BLOCK",
    desc: "Transaction blocked outright. Telegram alert dispatched with full risk breakdown.",
    border: "rgba(239,68,68,0.28)",
    accent: "rgba(239,68,68,0.70)",
    bg: "rgba(239,68,68,0.07)",
    text: "text-red-400",
  },
];

const features = [
  {
    icon: Bot,
    title: "Agentic AI Co-Signer",
    desc: "OpenClaw agent (Qwen3-235B) acts as the second signer on your Safe multisig, making autonomous decisions on every transaction.",
  },
  {
    icon: TrendingUp,
    title: "Behavioral Pattern Learning",
    desc: "Builds a profile of your onchain habits — typical recipients, amounts, timing, daily limits — and flags deviations instantly.",
  },
  {
    icon: Lock,
    title: "2-of-2 Safe Multisig",
    desc: "Your embedded wallet holds one key; the OpenClaw agent holds the other. Both signatures required — no single point of compromise, ever.",
  },
  {
    icon: Search,
    title: "Deep Security Scan",
    desc: "On-demand GoPlus + Honeypot.is checks for address reputation, scam detection, and token security analysis via Telegram.",
  },
  {
    icon: Zap,
    title: "Gasless via ERC-4337",
    desc: "Account abstraction with Pimlico bundler means zero gas fees for every transaction. Sponsored automatically.",
  },
  {
    icon: Bell,
    title: "Telegram Reviews",
    desc: "Borderline transactions trigger interactive Telegram messages. Approve or reject from anywhere on your phone.",
  },
];

const techStack = [
  "OpenClaw Agent",
  "Safe Multisig",
  "ERC-4337",
  "BNB Chain",
  "Privy Auth",
  "OpenRouter",
];

/* ─── Page ────────────────────────────────────────────────────────── */

export default function LandingPage() {
  return (
    <div className="min-h-screen cosmic-bg starfield text-white overflow-x-hidden">
      {/* ── Hero ──────────────────────────────────────────────────── */}
      <section className="min-h-screen flex flex-col items-center justify-center px-4 text-center relative">
        {/* Ambient background glow */}
        <div className="absolute inset-0 pointer-events-none overflow-hidden">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 2 }}
            className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[700px] h-[700px] rounded-full"
            style={{
              background:
                "radial-gradient(circle, rgba(240,185,11,0.07) 0%, transparent 70%)",
            }}
          />
        </div>

        {/* Logo */}
        <motion.div
          initial={{ opacity: 0, scale: 0.92 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.1, type: "spring", bounce: 0.35 }}
          className="relative w-[260px] h-[104px] sm:w-[340px] sm:h-[136px]"
        >
          <Image
            src="/brand-kit/Lockup.png"
            alt="Zhentan"
            fill
            className="object-contain drop-shadow-[0_0_32px_rgba(240,185,11,0.28)]"
            priority
            sizes="(max-width: 640px) 260px, 340px"
          />
        </motion.div>



        {/* Headline */}
        <motion.h1
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.35, type: "spring", bounce: 0.18 }}
          className="mt-5 text-3xl sm:text-5xl font-black tracking-tight leading-tight"
        >
          Your Onchain Behavior, <br />
          <span className="gradient-text">Guarded</span>
        </motion.h1>

        {/* Subtitle */}
        <motion.p
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5, type: "spring", bounce: 0.18 }}
          className="mt-4 text-slate-400 text-base sm:text-lg max-w-xl"
        >
          Your personalized onchain detective - an AI agent that learns how you transact onchain - auto-approving secure
          flows, routing borderline ones for review, and blocking threats in real
          time. 
        </motion.p>

                {/* Hackathon/Chain badge */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.25, type: "spring" }}
          className="mt-6 inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-claw/10 border border-claw/20 text-[10px] font-semibold text-claw/70 uppercase tracking-widest"
        >
          <motion.span
            animate={{ opacity: [1, 0.4, 1] }}
            transition={{ repeat: Infinity, duration: 2.5 }}
            className="w-1.5 h-1.5 rounded-full bg-claw"
          />
          Powered by OpenClaw Agent on BNB Chain
        </motion.div>

        {/* CTA */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.65, type: "spring", bounce: 0.18 }}
          className="mt-8"
        >
          <Link href="/login">
            <Button className="text-lg px-12 py-4 text-black font-bold">Get Started</Button>
          </Link>
        </motion.div>

        {/* Scroll indicator */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1.4 }}
          className="absolute bottom-8 left-1/2 -translate-x-1/2 flex flex-col items-center gap-1"
        >
          <motion.div
            animate={{ y: [0, 8, 0] }}
            transition={{ repeat: Infinity, duration: 2.2, ease: "easeInOut" }}
            className="flex flex-col items-center gap-1 text-claw/30"
          >
            <div className="w-px h-8 bg-gradient-to-b from-transparent to-claw/30" />
            <ArrowRight className="w-3.5 h-3.5 rotate-90" />
          </motion.div>
        </motion.div>
      </section>

      {/* ── Architecture / How It Works ───────────────────────────── */}
      <Section className="py-20 sm:py-28 px-4">
        <h2 className="text-2xl sm:text-3xl font-bold text-center mb-3">
          How It <span className="gradient-text">Works</span>
        </h2>
        <p className="text-slate-400 text-center max-w-lg mx-auto mb-12 text-sm">
          Each transaction goes from your wallet after you sign to the AI agent (OpenClaw), which can-sign and auto-execute, send for review, or block it based on transaction risk.
        </p>
        <ArchitectureDiagram />
      </Section>

      {/* ── Dynamic Risk Assessment ───────────────────────────────── */}
      <Section className="py-20 sm:py-28 px-4">
        <h2 className="text-2xl sm:text-3xl font-bold text-center mb-3">
          Dynamic <span className="gradient-text">Risk Assessment</span>
        </h2>
        <p className="text-slate-400 text-center max-w-md mx-auto mb-12 text-sm">
          Every transaction receives a real-time 0–100 risk score computed
          against your learned behavioral patterns and dynamic assessment via GoPlus and Honeypot.is. The agent acts instantly —
          no delays, no manual steps.
        </p>

        <div className="max-w-4xl mx-auto flex flex-col items-center gap-10">
          {/* Gauge */}
          <RiskGauge />

          {/* Verdict cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 w-full">
            {verdicts.map((v, i) => (
              <motion.div
                key={v.label}
                initial={{ opacity: 0, y: 24 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-40px" }}
                transition={{ delay: i * 0.12, type: "spring", bounce: 0.18 }}
                whileHover={{ scale: 1.02 }}
                className="relative rounded-2xl p-5 overflow-hidden"
                style={{
                  background: `linear-gradient(to bottom, rgba(255,255,255,0.05), transparent), ${v.bg}`,
                  border: `1px solid ${v.border}`,
                }}
              >
                {/* Vivid gradient top accent — matches architecture 1.5px gradient line */}
                <div
                  className="absolute top-0 left-0 right-0"
                  style={{
                    height: "1.5px",
                    background: `linear-gradient(90deg, transparent, ${v.accent}, transparent)`,
                  }}
                />
                <div className="flex items-baseline gap-2 mb-2">
                  <span className={`text-base font-black ${v.text}`}>
                    {v.label}
                  </span>
                  <span className="text-[10px] text-slate-500 font-mono">
                    {v.range}
                  </span>
                </div>
                <p className="text-slate-400 text-xs leading-relaxed">
                  {v.desc}
                </p>
              </motion.div>
            ))}
          </div>
        </div>
      </Section>

      {/* ── Features ──────────────────────────────────────────────── */}
      <Section className="py-20 sm:py-28 px-4">
        <h2 className="text-2xl sm:text-3xl font-bold text-center mb-3">
          Built with <span className="gradient-text">Agentic Security</span>
        </h2>
        <p className="text-slate-400 text-center max-w-md mx-auto mb-12 text-sm">
          Full-stack AI protection — from behavioral modeling to on-chain
          execution.
        </p>
        <div className="max-w-4xl mx-auto grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {features.map((feat, i) => {
            const Icon = feat.icon;
            return (
              <motion.div
                key={feat.title}
                initial={{ opacity: 0, y: 28 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-60px" }}
                transition={{ delay: i * 0.08, type: "spring", bounce: 0.18 }}
                whileHover={{ scale: 1.02, y: -4 }}
                className="relative rounded-2xl overflow-hidden bg-white/[0.05] border border-white/[0.07] hover:border-claw/20 transition-colors p-5"
              >
                <div
                  className="absolute top-0 left-0 right-0 h-px"
                  style={{
                    background:
                      "linear-gradient(90deg, transparent, rgba(240,185,11,0.3), transparent)",
                  }}
                />
                <div className="w-10 h-10 rounded-xl bg-claw/10 shadow-[0_0_10px_rgba(240,185,11,0.08)] flex items-center justify-center mb-3">
                  <Icon className="w-5 h-5 text-claw" />
                </div>
                <h3 className="text-sm font-semibold mb-1.5">{feat.title}</h3>
                <p className="text-slate-500 text-xs leading-relaxed">
                  {feat.desc}
                </p>
              </motion.div>
            );
          })}
        </div>
      </Section>

      {/* ── Tech Stack ────────────────────────────────────────────── */}
      <Section className="py-12 px-4">
        <p className="text-center text-[10px] text-slate-600 uppercase tracking-[0.25em] mb-5">
          Powered by
        </p>
        <div className="flex flex-wrap justify-center gap-2 max-w-2xl mx-auto">
          {techStack.map((tech, i) => (
            <motion.span
              key={tech}
              initial={{ opacity: 0, scale: 0.85 }}
              whileInView={{ opacity: 1, scale: 1 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.04, type: "spring" }}
              whileHover={{ scale: 1.06 }}
              className="px-3 py-1.5 rounded-full border border-white/[0.08] bg-white/[0.03] text-xs text-slate-400 font-medium cursor-default"
            >
              {tech}
            </motion.span>
          ))}
        </div>
      </Section>


      {/* ── Final CTA ─────────────────────────────────────────────── */}
      <Section className="py-20 sm:py-28 px-4 text-center relative">
        <div className="absolute inset-0 pointer-events-none overflow-hidden">
          <motion.div
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true }}
            className="absolute bottom-0 left-1/2 -translate-x-1/2 w-[500px] h-[300px]"
            style={{
              background:
                "radial-gradient(ellipse, rgba(240,185,11,0.07) 0%, transparent 70%)",
            }}
          />
        </div>
        <h2 className="text-2xl sm:text-4xl font-bold mb-4">
          Ready to guard your{" "}
          <span className="gradient-text">assets</span>?
        </h2>
        <p className="text-slate-400 mb-8 max-w-md mx-auto text-sm">
          Set up your AI-secured wallet in seconds. No gas fees, no
          friction - just intelligent protection on BNB Chain.
        </p>
        <Link href="/login">
          <Button className="text-lg px-8 py-4">Launch App</Button>
        </Link>
      </Section>

      {/* ── Footer ────────────────────────────────────────────────── */}
      <footer className="py-8 px-4 border-t border-white/[0.04]">
        <div className="max-w-4xl mx-auto flex flex-col items-center gap-4 text-center">
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="inline-flex items-center gap-2 px-5 py-2 rounded-full border border-claw/20 bg-claw/5"
          >
            <motion.span
              animate={{ opacity: [1, 0.5, 1] }}
              transition={{ repeat: Infinity, duration: 3 }}
              className="w-1.5 h-1.5 rounded-full bg-claw flex-shrink-0"
            />
            <span className="text-[11px] text-claw/60 font-medium">
              Built for DoraHacks Good Vibes Only: OpenClaw Edition | BNBChain
            </span>
          </motion.div>
        </div>
      </footer>
    </div>
  );
}
