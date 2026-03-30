"use client";

import { useState, useEffect, useCallback } from "react";
import Image from "next/image";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import {
  ChevronLeft,
  ChevronRight,
  Shield,
  Users,
  Code2,
  TrendingUp,
  DollarSign,
} from "lucide-react";

/* ─── Shared visual helpers ─────────────────────────────────────────── */

function GoldLine() {
  return (
    <div className="absolute top-0 left-0 right-0 h-px"
      style={{ background: "linear-gradient(90deg, transparent, rgba(229,168,50,0.6), transparent)" }} />
  );
}

function StatCard({
  value, label, sub, delay = 0,
}: { value: string; label: string; sub?: string; delay?: number }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
      transition={{ delay, type: "spring" }}
      className="relative rounded-2xl px-5 py-4 overflow-hidden text-center"
      style={{ background: "rgba(229,168,50,0.06)", border: "1px solid rgba(229,168,50,0.20)" }}>
      <GoldLine />
      <div className="text-2xl sm:text-3xl font-black gradient-text leading-none mb-1">{value}</div>
      <div className="text-white text-xs font-semibold">{label}</div>
      {sub && <div className="text-slate-500 text-[10px] mt-0.5">{sub}</div>}
    </motion.div>
  );
}

function Tag({ children }: { children: React.ReactNode }) {
  return (
    <span className="px-3 py-1 rounded-full border border-gold/20 bg-gold/5 text-[11px] text-gold/70 font-medium">
      {children}
    </span>
  );
}

function SlideMeta({ label }: { label: string }) {
  return (
    <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.05 }}
      className="text-[10px] font-bold uppercase tracking-[0.18em] text-gold/50 mb-3">
      {label}
    </motion.p>
  );
}

/* ─── Slide 1 — Cover ───────────────────────────────────────────────── */

function SlideTitle() {
  return (
    <div className="flex flex-col items-center justify-center text-center h-full gap-5 px-8">
      <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }}
        transition={{ delay: 0.1, type: "spring", bounce: 0.3 }}
        className="relative w-[240px] h-[96px] sm:w-[320px] sm:h-[128px]">
        <Image src="/cover.png" alt="Zhentan" fill className="object-contain drop-shadow-[0_0_50px_rgba(229,168,50,0.35)]" priority sizes="320px" />
      </motion.div>

      <div>
        <motion.h1 initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.28, type: "spring" }}
          className="text-4xl sm:text-6xl font-black tracking-tight leading-none mb-3">
          Onchain Behavior, <span className="gradient-text">Guarded</span>
        </motion.h1>
        <motion.p initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4, type: "spring" }}
          className="text-slate-400 text-base sm:text-xl font-medium">
          Your personalized onchain detective
        </motion.p>
      </div>

    </div>
  );
}

/* ─── Slide 2 — Problem & Why Now ──────────────────────────────────── */

function SlideProblem() {
  return (
    <div className="flex flex-col items-center justify-center h-full gap-7 px-8 max-w-3xl mx-auto w-full">
      <div className="text-center">
        <SlideMeta label="The Problem" />
        <motion.h2 initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1, type: "spring" }}
          className="text-3xl sm:text-5xl font-black tracking-tight mb-3">
          The <span className="gradient-text">$2.7B</span> Gap
        </motion.h2>
        <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.2 }}
          className="text-slate-400 text-sm max-w-lg mx-auto leading-relaxed">
          Every transaction has a gap between sign and execute — no safety net, no second opinion.
          Crypto adoption is accelerating. Security hasn&apos;t kept up.
        </motion.p>
      </div>

      <div className="grid grid-cols-3 gap-3 w-full">
        <StatCard value="$2.2B" label="Stolen in hacks" sub="2024, Chainalysis" delay={0.22} />
        <StatCard value="$500M" label="Lost to phishing" sub="330K+ victims, 2024" delay={0.32} />
        <StatCard value="303" label="Hack incidents" sub="21% YoY increase" delay={0.42} />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 w-full">
        {[
          { icon: "⛔", t: "No Guardrails", d: "Standard wallets confirm what you sign — they don't screen it." },
          { icon: "🐢", t: "Multisigs Are Too Slow", d: "Institutional co-signers can't match real-time DeFi speed." },
          { icon: "🤖", t: "AI Is Ready", d: "Agents are finally capable enough to fill this gap autonomously." },
        ].map((p, i) => (
          <motion.div key={p.t} initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.5 + i * 0.1, type: "spring" }}
            className="glass-card p-4 flex gap-3 items-start">
            <span className="text-xl shrink-0">{p.icon}</span>
            <div>
              <div className="text-xs font-bold text-white mb-0.5">{p.t}</div>
              <div className="text-slate-500 text-[11px] leading-relaxed">{p.d}</div>
            </div>
          </motion.div>
        ))}
      </div>
    </div>
  );
}

/* ─── Slide 3 — Philosophy & Solution ──────────────────────────────── */

function SlidePhilosophy() {
  return (
    <div className="flex flex-col items-center justify-center h-full gap-8 px-8 max-w-3xl mx-auto w-full">
      <div className="text-center">
        <SlideMeta label="The Solution" />
        <motion.h2 initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1, type: "spring" }}
          className="text-3xl sm:text-5xl font-black tracking-tight mb-3">
          Trustless Doesn&apos;t Mean <span className="gradient-text">Alone</span>
        </motion.h2>
        <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.2 }}
          className="text-slate-400 text-sm max-w-lg mx-auto">
          Agents are the next evolution — not intermediaries, but autonomous trust layers that live beside the user.
        </motion.p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 w-full">
        {[
          { emoji: "🧬", title: "Agents as Trust Layers",   desc: "An autonomous layer that lives beside the user, not between them and the chain." },
          { emoji: "🕵️", title: "Personalized Detective",   desc: "Learns your recipients, amounts, timing, limits. Flags anything outside your normal." },
          { emoji: "⚡", title: "Real-Time Action",         desc: "Auto-approve safe flows, flag borderline ones via Telegram, block threats outright." },
        ].map((p, i) => (
          <motion.div key={p.title} initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.25 + i * 0.13, type: "spring" }}
            className="relative rounded-2xl p-5 overflow-hidden"
            style={{ background: "rgba(229,168,50,0.05)", border: "1px solid rgba(229,168,50,0.15)" }}>
            <GoldLine />
            <div className="text-4xl mb-3">{p.emoji}</div>
            <div className="text-sm font-bold text-white mb-2">{p.title}</div>
            <p className="text-slate-400 text-xs leading-relaxed">{p.desc}</p>
          </motion.div>
        ))}
      </div>

      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.65, type: "spring" }}
        className="w-full max-w-lg rounded-2xl px-6 py-4 text-center"
        style={{ background: "rgba(229,168,50,0.07)", border: "1px solid rgba(229,168,50,0.22)" }}>
        <p className="text-sm text-white/80 font-medium leading-relaxed">
          Zhentan is a <span className="gradient-text font-bold">personalized onchain detective</span> — it learns your behavior,
          screens every transaction, and defends your autonomy in real time.
        </p>
      </motion.div>
    </div>
  );
}

/* ─── Slide 4 — How It Works ────────────────────────────────────────── */

function SlideHowItWorks() {
  const steps = [
    {
      num: "01", title: "User Initiates",
      desc: "Signs and proposes a transaction via the Privy-secured wallet on BNB Chain.",
      sub: "Gasless via ERC-4337",
      color: "#e5a832", bg: "rgba(229,168,50,0.07)", border: "rgba(229,168,50,0.25)",
    },
    {
      num: "02", title: "Zhentan Screens",
      desc: "Agent scores 0–100 against behavioral profile + GoPlus / Honeypot.is / De.fi scanners.",
      sub: "< 200ms decision",
      color: "#6366f1", bg: "rgba(99,102,241,0.07)", border: "rgba(99,102,241,0.25)",
    },
    {
      num: "03", title: "Execute or Block",
      desc: "APPROVE auto-executed. REVIEW sent to Telegram. BLOCK denied with instant alert.",
      sub: "Safe 2-of-2 multisig",
      color: "#10b981", bg: "rgba(16,185,129,0.07)", border: "rgba(16,185,129,0.25)",
    },
  ];

  return (
    <div className="flex flex-col items-center justify-center h-full gap-8 px-8 max-w-3xl mx-auto w-full">
      <div className="text-center">
        <SlideMeta label="Product" />
        <motion.h2 initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.08, type: "spring" }}
          className="text-3xl sm:text-4xl font-black tracking-tight">
          How It <span className="gradient-text">Works</span>
        </motion.h2>
        <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.18 }}
          className="text-slate-500 text-xs mt-1">Three steps. Every transaction. Every time.</motion.p>
      </div>

      <div className="flex flex-col sm:flex-row items-stretch gap-3 w-full">
        {steps.map((s, i) => (
          <div key={s.num} className="flex sm:flex-col items-center gap-3 flex-1">
            <motion.div
              initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.18 + i * 0.14, type: "spring" }}
              className="relative rounded-2xl p-5 w-full overflow-hidden flex-1"
              style={{ background: s.bg, border: `1px solid ${s.border}` }}>
              <div className="absolute top-0 left-0 right-0 h-px"
                style={{ background: `linear-gradient(90deg, transparent, ${s.color}80, transparent)` }} />
              <div className="text-3xl font-black mb-3" style={{ color: s.color }}>{s.num}</div>
              <div className="text-sm font-bold text-white mb-2">{s.title}</div>
              <p className="text-slate-400 text-xs leading-relaxed mb-3">{s.desc}</p>
              <div className="text-[10px] font-semibold uppercase tracking-widest"
                style={{ color: s.color + "aa" }}>{s.sub}</div>
            </motion.div>
            {i < steps.length - 1 && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                transition={{ delay: 0.32 + i * 0.14 }}
                className="text-slate-600 text-lg font-light shrink-0 sm:hidden">↓</motion.div>
            )}
          </div>
        ))}
      </div>

      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.65 }}
        className="flex flex-wrap justify-center gap-2">
        {["GoPlus", "Honeypot.is", "De.fi", "OpenClaw Agent", "Pimlico Bundler"].map((tag) => (
          <Tag key={tag}>{tag}</Tag>
        ))}
      </motion.div>
    </div>
  );
}

/* ─── Slide 5 — Product & Tech ──────────────────────────────────────── */

function SlideProduct() {
  const stack = [
    { name: "Safe Multisig",  note: "2-of-2 smart account · $100B+ secured",  color: "rgba(16,185,129,0.10)", border: "rgba(16,185,129,0.28)" },
    { name: "ERC-4337",       note: "Account abstraction · 40M+ smart accounts", color: "rgba(99,102,241,0.10)", border: "rgba(99,102,241,0.28)" },
    { name: "ERC-7579",       note: "Module extensibility standard",           color: "rgba(168,85,247,0.10)", border: "rgba(168,85,247,0.28)" },
    { name: "ERC-8004",       note: "Agent identity on-chain",                 color: "rgba(229,168,50,0.10)", border: "rgba(229,168,50,0.28)" },
    { name: "OpenClaw",       note: "Qwen3-235B + Claude Sonnet agent",        color: "rgba(229,168,50,0.15)", border: "rgba(229,168,50,0.30)" },
    { name: "Pimlico",        note: "Gasless bundler + paymaster",             color: "rgba(168,85,247,0.10)", border: "rgba(168,85,247,0.25)" },
  ];

  return (
    <div className="flex flex-col items-center justify-center h-full gap-7 px-8 max-w-3xl mx-auto w-full">
      <div className="text-center">
        <SlideMeta label="Product" />
        <motion.h2 initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.08, type: "spring" }}
          className="text-3xl sm:text-4xl font-black tracking-tight">
          Not a Prototype. A <span className="gradient-text">Working Product</span>.
        </motion.h2>
      </div>

      <div className="flex flex-wrap justify-center gap-3 w-full">
        {[
          { v: "150+", l: "Users in week 1" },
          { v: "Live", l: "BNB Mainnet" },
          { v: "Gasless", l: "ERC-4337" },
          { v: "zhentan.me", l: "Preview live" },
        ].map((s, i) => (
          <motion.div key={s.l}
            initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.15 + i * 0.07, type: "spring" }}
            className="relative rounded-xl px-4 py-3 text-center overflow-hidden"
            style={{ background: "rgba(229,168,50,0.06)", border: "1px solid rgba(229,168,50,0.20)", minWidth: 90 }}>
            <GoldLine />
            <div className="text-lg font-black gradient-text leading-none">{s.v}</div>
            <div className="text-[10px] text-slate-500 mt-0.5">{s.l}</div>
          </motion.div>
        ))}
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 w-full">
        {stack.map((s, i) => (
          <motion.div key={s.name} initial={{ opacity: 0, scale: 0.92 }} animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.32 + i * 0.06, type: "spring" }}
            className="rounded-xl p-3.5" style={{ background: s.color, border: `1px solid ${s.border}` }}>
            <div className="text-xs font-bold text-white mb-0.5">{s.name}</div>
            <div className="text-[10px] text-slate-500">{s.note}</div>
          </motion.div>
        ))}
      </div>
    </div>
  );
}

/* ─── Slide 6 — Traction & Team ─────────────────────────────────────── */

function SlideTraction() {
  return (
    <div className="flex flex-col items-center justify-center h-full gap-7 px-8 max-w-3xl mx-auto w-full">
      <div className="text-center">
        <SlideMeta label="Traction" />
        <motion.h2 initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.08, type: "spring" }}
          className="text-3xl sm:text-4xl font-black tracking-tight">
          Traction &amp; <span className="gradient-text">Team</span>
        </motion.h2>
      </div>

      <div className="grid grid-cols-3 gap-3 w-full">
        <StatCard value="$200K" label="AUM" sub="Agentic wallet solution" delay={0.15} />
        <StatCard value="2×" label="Devcon Stage" sub="2024 & 2025" delay={0.25} />
        <StatCard value="150+" label="Launch Users" sub="Week 1 organic" delay={0.35} />
      </div>

      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.45, type: "spring" }}
        className="flex flex-wrap justify-center gap-2 w-full">
        {["Safe", "Zerion", "Pimlico", "LiFi", "EF ERC-4337 Team"].map((p) => (
          <span key={p} className="px-3 py-1.5 rounded-full text-[10px] font-semibold text-slate-400"
            style={{ border: "1px solid rgba(255,255,255,0.10)", background: "rgba(255,255,255,0.04)" }}>
            Built alongside {p}
          </span>
        ))}
      </motion.div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 w-full">
        {[
          {
            handle: "@rajkoshik",
            role: "Security & smart accounts since 2018",
            bio: "Author of Foundations of Blockchain. Demoed to Vitalik at Devcon 2024.",
          },
          {
            handle: "@rohanreddy",
            role: "Product & DeFi",
            bio: "Multiple ETHGlobal wins. Deep DeFi protocol experience.",
          },
        ].map((t, i) => (
          <motion.div key={t.handle} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.55 + i * 0.1, type: "spring" }}
            className="relative rounded-2xl p-4 overflow-hidden"
            style={{ background: "rgba(229,168,50,0.05)", border: "1px solid rgba(229,168,50,0.18)" }}>
            <GoldLine />
            <div className="flex items-center gap-2 mb-1">
              <div className="w-7 h-7 rounded-full bg-gold/20 flex items-center justify-center text-gold text-xs font-bold">
                {t.handle[1].toUpperCase()}
              </div>
              <div>
                <div className="text-sm font-bold gradient-text">{t.handle}</div>
                <div className="text-[10px] text-slate-500">{t.role}</div>
              </div>
            </div>
            <p className="text-slate-400 text-xs leading-relaxed">{t.bio}</p>
          </motion.div>
        ))}
      </div>
    </div>
  );
}

/* ─── Slide 7 — Market Opportunity ─────────────────────────────────── */

function SlideMarket() {
  const audiences = [
    {
      Icon: Users, title: "Individual BNB Users",
      desc: "486M+ addresses on BNB Chain. Protection without complexity — one-click setup, silent AI screening.",
      color: "#10b981", bg: "rgba(16,185,129,0.08)", border: "rgba(16,185,129,0.25)",
    },
    {
      Icon: Shield, title: "DAOs & Treasuries",
      desc: "Safe secures $100B+. DAOs need intelligent co-signers, not unreliable human multisig participants.",
      color: "#e5a832", bg: "rgba(229,168,50,0.08)", border: "rgba(229,168,50,0.25)",
    },
    {
      Icon: Code2, title: "Safe Developers",
      desc: "10,000+ Safe devs. Security & screening SDK with its own developer integration surface.",
      color: "#6366f1", bg: "rgba(99,102,241,0.08)", border: "rgba(99,102,241,0.25)",
    },
  ];

  return (
    <div className="flex flex-col items-center justify-center h-full gap-7 px-8 max-w-3xl mx-auto w-full">
      <div className="text-center">
        <SlideMeta label="Market" />
        <motion.h2 initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.08, type: "spring" }}
          className="text-3xl sm:text-4xl font-black tracking-tight">
          <span className="gradient-text">$100B+</span> Market by 2033
        </motion.h2>
        <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.18 }}
          className="text-slate-400 text-xs mt-1 max-w-sm mx-auto">
          Crypto wallet security market at 26% CAGR. Three distinct entry points.
        </motion.p>
      </div>

      <div className="grid grid-cols-3 gap-3 w-full">
        <StatCard value="486M+" label="BNB Chain addresses" sub="17.7% YoY growth" delay={0.2} />
        <StatCard value="$100B+" label="Wallet security TAM" sub="by 2033, 26% CAGR" delay={0.3} />
        <StatCard value="40M+" label="ERC-4337 smart accounts" sub="7× YoY growth" delay={0.4} />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 w-full">
        {audiences.map((a, i) => {
          const Icon = a.Icon;
          return (
            <motion.div key={a.title} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.48 + i * 0.12, type: "spring" }}
              className="relative rounded-2xl p-4 overflow-hidden"
              style={{ background: a.bg, border: `1px solid ${a.border}` }}>
              <div className="absolute top-0 left-0 right-0 h-px"
                style={{ background: `linear-gradient(90deg, transparent, ${a.color}88, transparent)` }} />
              <div className="w-7 h-7 rounded-xl flex items-center justify-center mb-2"
                style={{ background: `${a.color}18` }}>
                <Icon className="w-3.5 h-3.5" style={{ color: a.color }} />
              </div>
              <div className="text-xs font-bold text-white mb-1">{a.title}</div>
              <p className="text-slate-400 text-[11px] leading-relaxed">{a.desc}</p>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}

/* ─── Slide 8 — Revenue Model ───────────────────────────────────────── */

function SlideRevenue() {
  const tiers = [
    {
      name: "Free",
      target: "Individual users",
      desc: "Core AI screening, gasless txs, behavioral profiling, Telegram alerts.",
      metric: "→ Drives adoption",
      color: "rgba(255,255,255,0.05)", border: "rgba(255,255,255,0.10)", accent: "rgba(255,255,255,0.5)",
    },
    {
      name: "Advanced",
      target: "Power users · subscription",
      desc: "Personalized agent instances, custom thresholds, priority screening, advanced analytics.",
      metric: "→ Per-user MRR",
      color: "rgba(229,168,50,0.08)", border: "rgba(229,168,50,0.28)", accent: "#e5a832",
    },
    {
      name: "SDK & Licensing",
      target: "DAOs · institutions · Safe devs",
      desc: "Co-signer licensing, white-label agent deployment, Safe developer integrations.",
      metric: "→ High-ACV contracts",
      color: "rgba(99,102,241,0.08)", border: "rgba(99,102,241,0.28)", accent: "#6366f1",
    },
    {
      name: "Enterprise",
      target: "Protocols · treasuries",
      desc: "Custom integrations, managed agent infra, SLAs, on-premise deployment.",
      metric: "→ Enterprise ARR",
      color: "rgba(168,85,247,0.08)", border: "rgba(168,85,247,0.28)", accent: "#a855f7",
    },
  ];

  return (
    <div className="flex flex-col items-center justify-center h-full gap-7 px-8 max-w-3xl mx-auto w-full">
      <div className="text-center">
        <SlideMeta label="Business" />
        <motion.h2 initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.08, type: "spring" }}
          className="text-3xl sm:text-4xl font-black tracking-tight">
          Revenue <span className="gradient-text">Model</span>
        </motion.h2>
        <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.18 }}
          className="text-slate-500 text-xs mt-1">Revenue scales with adoption across all three audiences.</motion.p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 w-full">
        {tiers.map((t, i) => (
          <motion.div key={t.name} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 + i * 0.1, type: "spring" }}
            className="relative rounded-2xl p-5 overflow-hidden"
            style={{ background: t.color, border: `1px solid ${t.border}` }}>
            <div className="absolute top-0 left-0 right-0 h-px"
              style={{ background: `linear-gradient(90deg, transparent, ${t.accent}, transparent)` }} />
            <div className="flex items-baseline gap-2 mb-2">
              <span className="text-sm font-black text-white">{t.name}</span>
              <span className="text-[10px] text-slate-500">{t.target}</span>
            </div>
            <p className="text-slate-400 text-xs leading-relaxed mb-2">{t.desc}</p>
            <div className="text-[10px] font-bold" style={{ color: t.accent }}>{t.metric}</div>
          </motion.div>
        ))}
      </div>

      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.65 }}
        className="flex items-center gap-2 text-slate-600 text-[11px]">
        <DollarSign className="w-3 h-3" />
        <span>Free tier drives individual adoption. SDK licensing and enterprise drive revenue.</span>
      </motion.div>
    </div>
  );
}

/* ─── Slide 9 — Roadmap ─────────────────────────────────────────────── */

function SlideRoadmap() {
  const items = [
    { v: "V1", name: "Guardian",          date: "Apr 3",  desc: "Core screening, behavioral profiling, Telegram alerts. Live on BNB.", done: true  },
    { v: "V2", name: "Multiagent",        date: "Apr 17", desc: "Multiple specialized agents in concert. Expanded threat models.", done: false },
    { v: "V3", name: "Co-Signer for All", date: "May 1",  desc: "SDK release. Any Safe user can plug in Zhentan as a co-signer.", done: false },
    { v: "V4", name: "Autonomous Agent",  date: "May 15", desc: "Full autonomy — agent initiates, screens, and executes independently.", done: false },
  ];

  return (
    <div className="flex flex-col items-center justify-center h-full gap-7 px-8 max-w-3xl mx-auto w-full">
      <div className="text-center">
        <SlideMeta label="Roadmap" />
        <motion.h2 initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.08, type: "spring" }}
          className="text-3xl sm:text-4xl font-black tracking-tight">
          Building in <span className="gradient-text">Public</span>
        </motion.h2>
        <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.18 }}
          className="text-slate-500 text-xs mt-1">Every milestone announced as it ships. Q2 2026.</motion.p>
      </div>

      <div className="flex flex-col gap-3 w-full max-w-lg">
        {items.map((m, i) => (
          <motion.div key={m.v} initial={{ opacity: 0, x: -24 }} animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.18 + i * 0.11, type: "spring" }}
            className="relative flex items-center gap-4 rounded-2xl px-5 py-4 overflow-hidden"
            style={{
              background: m.done ? "rgba(229,168,50,0.08)" : "rgba(255,255,255,0.03)",
              border: m.done ? "1px solid rgba(229,168,50,0.30)" : "1px solid rgba(255,255,255,0.08)",
            }}>
            <div className="absolute top-0 left-0 right-0 h-px"
              style={{ background: m.done
                ? "linear-gradient(90deg, transparent, rgba(229,168,50,0.5), transparent)"
                : "linear-gradient(90deg, transparent, rgba(255,255,255,0.10), transparent)" }} />
            {/* Timeline dot */}
            <div className="shrink-0 text-center w-14">
              <div className={`text-[10px] font-black ${m.done ? "gradient-text" : "text-slate-500"}`}>{m.v}</div>
              <div className="text-[9px] text-slate-600 font-mono">{m.date}</div>
            </div>
            <div className="flex-1">
              <div className={`text-sm font-bold mb-0.5 ${m.done ? "text-white" : "text-slate-400"}`}>{m.name}</div>
              <p className="text-slate-500 text-xs leading-relaxed">{m.desc}</p>
            </div>
            {m.done && (
              <div className="shrink-0 w-5 h-5 rounded-full bg-gold/20 flex items-center justify-center">
                <span className="text-gold text-[10px]">✓</span>
              </div>
            )}
          </motion.div>
        ))}
      </div>

      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.65 }}
        className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-gold/10 border border-gold/20 text-[10px] font-semibold text-gold/70 uppercase tracking-widest">
        <TrendingUp className="w-3 h-3" />
        V1 already shipped · Q2 2026
      </motion.div>
    </div>
  );
}

/* ─── Slide 10 — Vision ─────────────────────────────────────────────── */

function SlideVision() {
  return (
    <div className="flex flex-col items-center justify-center text-center h-full gap-7 px-8 max-w-2xl mx-auto">
      <motion.div initial={{ opacity: 0, scale: 0.88 }} animate={{ opacity: 1, scale: 1 }}
        transition={{ delay: 0.1, type: "spring", bounce: 0.3 }}
        className="relative w-[200px] h-[80px] sm:w-[260px] sm:h-[104px]">
        <Image src="/cover.png" alt="Zhentan" fill className="object-contain drop-shadow-[0_0_50px_rgba(229,168,50,0.35)]" sizes="260px" />
      </motion.div>

      <div>
        <motion.h2 initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.22, type: "spring" }}
          className="text-2xl sm:text-4xl font-black leading-tight mb-4">
          The next era of onchain life won&apos;t be built around
          protocols or wallets.
        </motion.h2>

        <motion.p initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.36, type: "spring" }}
          className="text-slate-400 text-sm sm:text-base leading-relaxed max-w-lg mx-auto">
          It&apos;ll be built around <span className="text-white font-semibold">personal agents</span> that
          earn your trust and defend your autonomy.
          <br /><span className="gradient-text font-bold">Zhentan is building that future</span> — on BNB, for everyone.
        </motion.p>
      </div>

      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.52, type: "spring" }}
        className="flex flex-col sm:flex-row gap-3 items-center">
        <a href="https://zhentan.me" target="_blank" rel="noopener noreferrer"
          className="inline-flex items-center gap-2 px-6 py-3 rounded-full font-bold text-sm text-black transition-opacity hover:opacity-90"
          style={{ background: "linear-gradient(90deg, #F5D042, #e5a832)" }}>
          Try zhentan.me →
        </a>
      </motion.div>

      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.66 }}
        className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-gold/10 border border-gold/20 text-[10px] font-semibold text-gold/70 uppercase tracking-widest">
        <motion.span animate={{ opacity: [1, 0.3, 1] }} transition={{ repeat: Infinity, duration: 2.4 }}
          className="w-1.5 h-1.5 rounded-full bg-gold" />
        On BNB Chain · For Everyone
      </motion.div>
    </div>
  );
}

/* ─── Slide registry ────────────────────────────────────────────────── */

const SLIDES = [
  { id: "cover",      label: "Cover",      component: SlideTitle },
  { id: "problem",    label: "Problem",    component: SlideProblem },
  { id: "solution",   label: "Solution",   component: SlidePhilosophy },
  { id: "how",        label: "How",        component: SlideHowItWorks },
  { id: "product",    label: "Product",    component: SlideProduct },
  { id: "traction",   label: "Traction",   component: SlideTraction },
  { id: "market",     label: "Market",     component: SlideMarket },
  { id: "revenue",    label: "Revenue",    component: SlideRevenue },
  { id: "roadmap",    label: "Roadmap",    component: SlideRoadmap },
  { id: "vision",     label: "Vision",     component: SlideVision },
];

/* ─── Deck shell ────────────────────────────────────────────────────── */

export default function DeckPage() {
  const [current, setCurrent] = useState(0);
  const [direction, setDirection] = useState(1);
  const total = SLIDES.length;

  const go = useCallback((next: number) => {
    if (next < 0 || next >= total) return;
    setDirection(next > current ? 1 : -1);
    setCurrent(next);
  }, [current, total]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight" || e.key === "ArrowDown") go(current + 1);
      if (e.key === "ArrowLeft"  || e.key === "ArrowUp")   go(current - 1);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [current, go]);

  const Slide = SLIDES[current].component;

  const variants = {
    enter:  (dir: number) => ({ x: dir > 0 ? "100%" : "-100%", opacity: 0 }),
    center: { x: 0, opacity: 1 },
    exit:   (dir: number) => ({ x: dir > 0 ? "-100%" : "100%", opacity: 0 }),
  };

  return (
    <div className="hero-gradient min-h-screen text-white flex flex-col overflow-hidden">
      {/* Top bar */}
      <div className="flex items-center justify-between px-5 py-3 border-b border-white/[0.04] shrink-0">
        <Link href="/" className="text-[11px] text-slate-600 hover:text-slate-400 transition-colors font-medium tracking-wide">
          ← zhentan.me
        </Link>

        {/* Slide pills — hidden on mobile */}
        <div className="hidden sm:flex items-center gap-1">
          {SLIDES.map((s, i) => (
            <button key={s.id} onClick={() => go(i)}
              className={`px-2.5 py-1 rounded-full text-[9px] font-semibold uppercase tracking-widest transition-colors ${
                i === current ? "bg-gold/20 text-gold border border-gold/30" : "text-slate-600 hover:text-slate-400"
              }`}>
              {s.label}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-3">
          <span className="text-[11px] text-slate-600 font-mono tabular-nums">
            {String(current + 1).padStart(2, "0")} / {String(total).padStart(2, "0")}
          </span>
        </div>
      </div>

      {/* Slide area */}
      <div className="flex-1 relative overflow-hidden">
        <AnimatePresence mode="wait" custom={direction}>
          <motion.div key={current} custom={direction} variants={variants}
            initial="enter" animate="center" exit="exit"
            transition={{ duration: 0.36, ease: [0.32, 0, 0.2, 1] }}
            className="absolute inset-0 flex items-center justify-center py-4">
            <Slide />
          </motion.div>
        </AnimatePresence>
      </div>

      {/* Bottom navigation */}
      <div className="flex items-center justify-center gap-4 py-3 border-t border-white/[0.04] shrink-0">
        <button onClick={() => go(current - 1)} disabled={current === 0}
          className="w-9 h-9 rounded-full border border-white/[0.08] flex items-center justify-center text-slate-500 hover:text-white hover:border-gold/30 disabled:opacity-25 disabled:cursor-not-allowed transition-colors">
          <ChevronLeft className="w-4 h-4" />
        </button>

        <div className="flex items-center gap-1.5">
          {SLIDES.map((_, i) => (
            <button key={i} onClick={() => go(i)}
              className={`rounded-full transition-all duration-300 ${
                i === current ? "w-5 h-1.5 bg-gold" : "w-1.5 h-1.5 bg-white/20 hover:bg-white/40"
              }`} />
          ))}
        </div>

        <button onClick={() => go(current + 1)} disabled={current === total - 1}
          className="w-9 h-9 rounded-full border border-white/[0.08] flex items-center justify-center text-slate-500 hover:text-white hover:border-gold/30 disabled:opacity-25 disabled:cursor-not-allowed transition-colors">
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>

      <div className="text-center pb-2 text-[9px] text-slate-700 tracking-widest uppercase">
        ← → arrow keys to navigate
      </div>
    </div>
  );
}
