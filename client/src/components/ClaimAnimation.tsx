"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { createPortal } from "react-dom";
import { Sparkles } from "lucide-react";

export type ClaimAnimationPhase = "idle" | "counting" | "burst" | "complete";

// ─── Burst rings ─────────────────────────────────────────────────────────────

function BurstEffect() {
  return (
    <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
      {[0, 1, 2, 3, 4].map((i) => (
        <motion.div
          key={i}
          className="absolute rounded-full"
          style={{ borderColor: "rgba(240,185,11,0.8)", borderStyle: "solid" }}
          initial={{ width: 48, height: 48, opacity: 1 }}
          animate={{ width: [48, 900], height: [48, 900], opacity: [0.85, 0], borderWidth: [6, 1] }}
          transition={{ duration: 1.4, delay: i * 0.22, ease: "easeOut" }}
        />
      ))}
      {/* Central flash */}
      <motion.div
        className="absolute w-40 h-40 rounded-full"
        style={{ background: "radial-gradient(circle, rgba(240,185,11,0.9) 0%, rgba(240,185,11,0) 70%)" }}
        initial={{ scale: 0.4, opacity: 1 }}
        animate={{ scale: [0.4, 7, 0], opacity: [1, 0.6, 0] }}
        transition={{ duration: 1.1, ease: "easeOut" }}
      />
      {/* Particles */}
      {[...Array(8)].map((_, i) => {
        const angle = (i / 8) * 360;
        const rad = (angle * Math.PI) / 180;
        return (
          <motion.div
            key={`p-${i}`}
            className="absolute w-2 h-2 rounded-full bg-claw"
            initial={{ x: 0, y: 0, opacity: 1, scale: 1 }}
            animate={{ x: Math.cos(rad) * 160, y: Math.sin(rad) * 160, opacity: 0, scale: 0 }}
            transition={{ duration: 1, delay: 0.1 + i * 0.05, ease: "easeOut" }}
          />
        );
      })}
    </div>
  );
}

// ─── Count-up ─────────────────────────────────────────────────────────────────

function TokenCounter({
  target,
  symbol,
  onComplete,
  duration = 3000,
}: {
  target: number;
  symbol: string;
  onComplete: () => void;
  duration?: number;
}) {
  const [count, setCount] = useState(0);
  const startRef = useRef<number | null>(null);
  const frameRef = useRef<number | null>(null);
  const doneRef = useRef(false);
  const onCompleteRef = useRef(onComplete);
  useEffect(() => { onCompleteRef.current = onComplete; }, [onComplete]);

  useEffect(() => {
    doneRef.current = false;
    startRef.current = null;

    const animate = (ts: number) => {
      if (!startRef.current) startRef.current = ts;
      const progress = Math.min((ts - startRef.current) / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 4);
      setCount(Math.floor(eased * target));

      if (progress < 1) {
        frameRef.current = requestAnimationFrame(animate);
      } else if (!doneRef.current) {
        doneRef.current = true;
        setCount(target);
        onCompleteRef.current();
      }
    };

    frameRef.current = requestAnimationFrame(animate);
    return () => { if (frameRef.current) cancelAnimationFrame(frameRef.current); };
  }, [target, duration]);

  return (
    <motion.div
      className="absolute inset-0 flex items-center justify-center"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, scale: 0.95, transition: { duration: 0.4 } }}
    >
      <div
        className="absolute inset-0 pointer-events-none"
        style={{ background: "radial-gradient(ellipse at center, rgba(240,185,11,0.1) 0%, transparent 65%)" }}
      />
      <div className="relative text-center select-none">
        <motion.p
          className="text-xs font-semibold uppercase tracking-[0.2em] mb-6"
          style={{ color: "rgba(240,185,11,0.6)" }}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15 }}
        >
          Claim reward
        </motion.p>
        <motion.div
          className="text-[96px] leading-none font-bold text-claw tabular-nums"
          animate={{ scale: [1, 1.06, 1] }}
          transition={{ duration: 0.35, repeat: Infinity, ease: "easeInOut" }}
          style={{ textShadow: "0 0 60px rgba(240,185,11,0.5)" }}
        >
          {count.toLocaleString()}
        </motion.div>
        <motion.p
          className="text-2xl font-semibold text-white mt-3"
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
        >
          {symbol}
        </motion.p>
      </div>
    </motion.div>
  );
}

// ─── Complete screen ──────────────────────────────────────────────────────────

function CompleteScreen({ tokenAmount, tokenSymbol }: { tokenAmount: number; tokenSymbol: string }) {
  return (
    <motion.div
      className="absolute inset-0 flex items-center justify-center"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, transition: { duration: 0.5 } }}
      transition={{ duration: 0.4 }}
    >
      <div
        className="absolute inset-0 pointer-events-none"
        style={{ background: "radial-gradient(ellipse at center, rgba(240,185,11,0.12) 0%, transparent 65%)" }}
      />
      <motion.div
        className="relative text-center"
        initial={{ scale: 0.5, opacity: 0, y: 24 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        transition={{ type: "spring", damping: 14, stiffness: 120, delay: 0.1 }}
      >
        <motion.div
          className="w-24 h-24 rounded-3xl flex items-center justify-center mx-auto mb-6"
          style={{
            background: "rgba(240,185,11,0.15)",
            boxShadow: "0 0 0 1px rgba(240,185,11,0.25)",
          }}
          animate={{
            boxShadow: [
              "0 0 40px rgba(240,185,11,0.3), 0 0 0 1px rgba(240,185,11,0.25)",
              "0 0 70px rgba(240,185,11,0.55), 0 0 0 1px rgba(240,185,11,0.4)",
              "0 0 40px rgba(240,185,11,0.3), 0 0 0 1px rgba(240,185,11,0.25)",
            ],
          }}
          transition={{ duration: 1.6, repeat: Infinity }}
        >
          <Sparkles className="w-10 h-10 text-claw" />
        </motion.div>
        <motion.div
          className="text-6xl font-bold text-claw mb-2"
          style={{ textShadow: "0 0 40px rgba(240,185,11,0.6)" }}
        >
          {tokenAmount.toLocaleString()}
        </motion.div>
        <div className="text-2xl font-semibold text-white mb-2">{tokenSymbol}</div>
        <div className="text-sm" style={{ color: "rgba(255,255,255,0.4)" }}>
          Claimed
        </div>
      </motion.div>
    </motion.div>
  );
}

// ─── Orchestrator ─────────────────────────────────────────────────────────────

interface ClaimAnimationProps {
  phase: ClaimAnimationPhase;
  tokenAmount: number;
  tokenSymbol: string;
  onPhaseChange: (phase: ClaimAnimationPhase) => void;
}

export function ClaimAnimation({ phase, tokenAmount, tokenSymbol, onPhaseChange }: ClaimAnimationProps) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const handleCountComplete = useCallback(() => {
    onPhaseChange("burst");
  }, [onPhaseChange]);

  // Burst runs for 1.8s, then show complete for 2.5s, then fade out
  const handleBurstComplete = useCallback(() => {
    onPhaseChange("complete");
  }, [onPhaseChange]);

  useEffect(() => {
    if (phase !== "burst") return;
    const t = setTimeout(handleBurstComplete, 1800);
    return () => clearTimeout(t);
  }, [phase, handleBurstComplete]);

  useEffect(() => {
    if (phase !== "complete") return;
    const t = setTimeout(() => onPhaseChange("idle"), 2800);
    return () => clearTimeout(t);
  }, [phase, onPhaseChange]);

  if (!mounted || phase === "idle") return null;

  return createPortal(
    <motion.div
      className="fixed inset-0"
      style={{ zIndex: 99999, backdropFilter: "blur(14px)", background: "rgba(0,0,0,0.82)" }}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      <AnimatePresence mode="sync">
        {phase === "counting" && (
          <TokenCounter
            key="counter"
            target={tokenAmount}
            symbol={tokenSymbol}
            onComplete={handleCountComplete}
            duration={3000}
          />
        )}
        {phase === "burst" && (
          <motion.div
            key="burst"
            className="absolute inset-0"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, transition: { duration: 0.4 } }}
          >
            <BurstEffect />
          </motion.div>
        )}
        {phase === "complete" && (
          <CompleteScreen key="complete" tokenAmount={tokenAmount} tokenSymbol={tokenSymbol} />
        )}
      </AnimatePresence>
    </motion.div>,
    document.body
  );
}
