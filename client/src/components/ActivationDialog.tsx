"use client";

import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { clsx } from "clsx";
import {
  CheckCircle2,
  Loader2,
  MessageCircle,
  Send,
  ShieldCheck,
  XIcon,
} from "lucide-react";
import { Dialog } from "./ui/Dialog";

type StepState = "idle" | "running" | "done";

interface ActivationDialogProps {
  open: boolean;
  onClose: () => void;
  telegramLinked: boolean;
  botConnected: boolean;
  linkingTelegram: boolean;
  botActivationInitiated: boolean;
  isCheckingBotConnection: boolean;
  tgDisplayName: string | null;
  onLinkTelegram: () => void;
  onStartBotActivation: () => void;
  onCheckBotConnection: () => void;
  onUnlinkTelegram: () => void;
}

function StepIndicator({ step, state }: { step: number; state: StepState }) {
  if (state === "done") {
    return (
      <motion.div
        key="done"
        initial={{ scale: 0, rotate: -30 }}
        animate={{ scale: 1, rotate: 0 }}
        transition={{ type: "spring", bounce: 0.5, duration: 0.5 }}
        className="w-10 h-10 rounded-2xl bg-emerald-400/15 flex items-center justify-center shrink-0"
      >
        <CheckCircle2 className="h-5 w-5 text-emerald-400" />
      </motion.div>
    );
  }

  if (state === "running") {
    return (
      <div className="relative w-10 h-10 shrink-0 flex items-center justify-center">
        <motion.div
          className="absolute inset-0 rounded-2xl border-2 border-blue-400/40"
          animate={{ scale: [1, 1.25], opacity: [0.6, 0] }}
          transition={{ duration: 1.4, repeat: Infinity, ease: "easeOut" }}
        />
        <div className="relative w-10 h-10 rounded-2xl bg-blue-400/10 flex items-center justify-center">
          <Loader2 className="h-5 w-5 animate-spin text-blue-400" />
        </div>
      </div>
    );
  }

  return (
    <div className="w-10 h-10 rounded-2xl bg-white/6 flex items-center justify-center shrink-0">
      <span className="text-sm font-semibold text-slate-400">{step}</span>
    </div>
  );
}

interface StepCardProps {
  step: number;
  state: StepState;
  title: string;
  idleDescription: string;
  runningDescription: React.ReactNode;
  doneDescription: React.ReactNode;
  actionLabel: string;
  actionLoading?: boolean;
  onAction: () => void;
  rightSlot?: React.ReactNode;
  disabled?: boolean;
  icon: React.ReactNode;
}

function StepCard({
  step,
  state,
  title,
  idleDescription,
  runningDescription,
  doneDescription,
  actionLabel,
  actionLoading,
  onAction,
  rightSlot,
  disabled,
  icon,
}: StepCardProps) {
  return (
    <div
      className={clsx(
        "p-4 rounded-2xl border transition-colors duration-300",
        state === "done" && "bg-emerald-400/5 border-emerald-400/20",
        state === "running" && "bg-blue-400/5 border-blue-400/20",
        state === "idle" && "bg-white/2 border-white/6",
        disabled && "opacity-40 pointer-events-none"
      )}
    >
      <div className="flex items-start gap-3">
        <StepIndicator step={step} state={state} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-slate-400 shrink-0">{icon}</span>
            <h4 className="text-sm font-semibold text-white truncate">{title}</h4>
          </div>
          <div className="text-[11px] text-slate-400 mt-1 leading-relaxed min-h-[1.5em]">
            {state === "done"
              ? doneDescription
              : state === "running"
              ? runningDescription
              : idleDescription}
          </div>
          {state !== "done" && (
            <button
              onClick={onAction}
              disabled={actionLoading || disabled}
              className="mt-3 px-3 py-1.5 text-[11px] font-medium rounded-lg bg-blue-400/10 text-blue-400 hover:bg-blue-400/15 transition-all disabled:opacity-50 cursor-pointer disabled:cursor-default inline-flex items-center gap-1.5"
            >
              {actionLoading && <Loader2 className="h-3 w-3 animate-spin" />}
              {actionLabel}
            </button>
          )}
        </div>
        {rightSlot && <div className="shrink-0">{rightSlot}</div>}
      </div>
    </div>
  );
}

function SuccessSplash({ onDone }: { onDone: () => void }) {
  return (
    <motion.div
      key="success"
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.95 }}
      transition={{ duration: 0.3 }}
      className="flex flex-col items-center py-6"
    >
      <div className="relative w-20 h-20 flex items-center justify-center mb-4">
        <motion.div
          className="absolute inset-0 rounded-full border-2 border-emerald-400/60"
          animate={{ scale: [1, 1.5], opacity: [0.6, 0] }}
          transition={{ duration: 1.5, repeat: Infinity, ease: "easeOut" }}
        />
        <motion.div
          className="absolute inset-2 rounded-full border-2 border-emerald-400/40"
          animate={{ scale: [1, 1.4], opacity: [0.5, 0] }}
          transition={{ duration: 1.5, repeat: Infinity, ease: "easeOut", delay: 0.3 }}
        />
        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ type: "spring", bounce: 0.5, duration: 0.6 }}
          className="relative w-16 h-16 rounded-full bg-emerald-400/15 flex items-center justify-center"
        >
          <ShieldCheck className="h-8 w-8 text-emerald-400" />
        </motion.div>
      </div>
      <h3 className="text-lg font-semibold text-white">Zhentan Activated</h3>
      <p className="text-xs text-slate-400 mt-1.5 text-center">
        Your AI agent is ready to screen transactions
      </p>
      <button
        onClick={onDone}
        className="mt-6 px-5 py-2 text-xs font-semibold rounded-xl bg-emerald-400/15 text-emerald-400 hover:bg-emerald-400/20 transition-all cursor-pointer"
      >
        Done
      </button>
    </motion.div>
  );
}

export function ActivationDialog({
  open,
  onClose,
  telegramLinked,
  botConnected,
  linkingTelegram,
  botActivationInitiated,
  isCheckingBotConnection,
  tgDisplayName,
  onLinkTelegram,
  onStartBotActivation,
  onCheckBotConnection,
  onUnlinkTelegram,
}: ActivationDialogProps) {
  const wasInitiallyCompleteRef = useRef(false);
  const [showSuccess, setShowSuccess] = useState(false);

  useEffect(() => {
    if (open) {
      wasInitiallyCompleteRef.current = telegramLinked && botConnected;
      setShowSuccess(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (!open) return;
    if (telegramLinked && botConnected && !wasInitiallyCompleteRef.current) {
      setShowSuccess(true);
    }
  }, [open, telegramLinked, botConnected]);

  const step1State: StepState = telegramLinked
    ? "done"
    : linkingTelegram
    ? "running"
    : "idle";

  const step2State: StepState = botConnected
    ? "done"
    : botActivationInitiated
    ? "running"
    : "idle";

  const step2Disabled = !telegramLinked;

  return (
    <Dialog open={open} onClose={onClose} title="Activate Zhentan">
      <AnimatePresence mode="wait">
        {showSuccess ? (
          <SuccessSplash onDone={onClose} />
        ) : (
          <motion.div
            key="steps"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="space-y-3"
          >
            <p className="text-xs text-slate-400 leading-relaxed -mt-1 mb-1">
              Complete these 2 steps so your AI agent can notify you about
              transactions that need review.
            </p>

            <StepCard
              step={1}
              state={step1State}
              icon={<MessageCircle className="h-3.5 w-3.5" />}
              title="Link Telegram"
              idleDescription="Connect your Telegram account to receive notifications."
              runningDescription="Waiting for you to finish linking in the Privy popup…"
              doneDescription={
                <span className="text-emerald-400/90">
                  Linked{tgDisplayName ? ` as ${tgDisplayName}` : ""}
                </span>
              }
              actionLabel="Link Telegram"
              actionLoading={linkingTelegram}
              onAction={onLinkTelegram}
              rightSlot={
                telegramLinked ? (
                  <button
                    onClick={onUnlinkTelegram}
                    className="px-2 py-1 text-[11px] font-medium rounded-lg bg-white/6 text-red-400 hover:bg-white/10 transition-all cursor-pointer flex items-center gap-1"
                  >
                    <XIcon className="h-3 w-3" />
                    Unlink
                  </button>
                ) : undefined
              }
            />

            <StepCard
              step={2}
              state={step2State}
              icon={<Send className="h-3.5 w-3.5" />}
              title="Link the Agent"
              idleDescription='Open @zhentanme_bot and send a "Connect to Zhentan" message.'
              runningDescription={
                <>
                  Listening for your message ("Connect to Zhentan") to{" "}
                  <a
                    href="https://t.me/zhentanme_bot"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-400/90 hover:text-blue-400 transition-colors"
                  >
                    @zhentanme_bot
                  </a>
                  …
                </>
              }
              doneDescription={
                <span className="text-emerald-400/90">Bot connected</span>
              }
              actionLabel={botActivationInitiated ? "Check again" : "Open @zhentanme_bot"}
              actionLoading={isCheckingBotConnection}
              onAction={
                botActivationInitiated ? onCheckBotConnection : onStartBotActivation
              }
              disabled={step2Disabled}
            />

            {telegramLinked && botConnected && (
              <motion.div
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex items-center gap-2 px-3 py-2 rounded-xl bg-emerald-400/5 border border-emerald-400/15 text-[11px] text-emerald-400/90"
              >
                <ShieldCheck className="h-3.5 w-3.5" />
                Zhentan is fully activated.
              </motion.div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </Dialog>
  );
}
