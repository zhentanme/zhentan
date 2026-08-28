"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronDown, ChevronUp, ShieldAlert } from "lucide-react";
import { riskSeverity } from "@/lib/format";
import { SEVERITY_CLASSES } from "./txPresentation";

const SEVERITY_LABEL = { safe: "Low", watch: "Medium", danger: "High" } as const;

/**
 * Expandable screening panel — the ONE risk treatment shared by the
 * transaction detail dialog and the request detail dialog, so a screened
 * item never changes look between the two (#142). Shows the structured
 * verdict enum + signal list when available; legacy request rows without
 * them fall back to the severity label and the flattened notes message.
 */
export function RiskSection({
  riskScore,
  riskVerdict,
  riskReasons,
  message,
  rejectReason,
}: {
  riskScore?: number;
  riskVerdict?: "APPROVE" | "REVIEW" | "BLOCK";
  riskReasons?: string[];
  /** Free-text agent message (tx reviewReason, or legacy request riskNotes). */
  message?: string;
  rejectReason?: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const sevTone = riskSeverity(riskScore);
  const sev = sevTone ? SEVERITY_CLASSES[sevTone] : null;

  return (
    <div className="rounded-md bg-foreground/6 overflow-hidden">
      <button
        type="button"
        onClick={() => setExpanded((e) => !e)}
        aria-expanded={expanded}
        className="w-full flex items-center gap-2 px-4 py-3 text-left hover:bg-foreground/6 transition-colors cursor-pointer"
      >
        <ShieldAlert className="h-4 w-4 text-watch/90 shrink-0" />
        <span className="text-sm font-medium text-foreground flex-1">Screening details</span>
        {sev && (
          <span className={`font-mono text-xs font-semibold ${sev.text}`}>
            {riskScore}
            <span className="text-muted-foreground/60">/100</span>
          </span>
        )}
        {expanded ? (
          <ChevronUp className="h-4 w-4 text-muted-foreground/80 shrink-0" />
        ) : (
          <ChevronDown className="h-4 w-4 text-muted-foreground/80 shrink-0" />
        )}
      </button>
      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="border-t border-foreground/10"
          >
            <div className="px-4 py-3.5 space-y-3.5 text-sm">
              {/* Risk score + bar */}
              {riskScore != null && sev && (
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-muted-foreground/80">Risk score</span>
                    <span className={`font-mono font-semibold ${sev.text}`}>
                      {riskScore}
                      <span className="text-muted-foreground/60">/100</span>
                    </span>
                  </div>
                  <div className="h-1.5 rounded-full bg-foreground/10 overflow-hidden">
                    <motion.span
                      className={`block h-full rounded-full ${sev.bg}`}
                      initial={{ width: 0 }}
                      animate={{ width: `${Math.min(100, Math.max(0, riskScore))}%` }}
                      transition={{ duration: 0.5, ease: "easeOut" }}
                    />
                  </div>
                </div>
              )}

              {/* Verdict — structured enum when present, severity label as legacy fallback */}
              {riskVerdict ? (
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground/80">Verdict</span>
                  <span
                    className={`font-mono uppercase tracking-wide text-xs font-semibold ${
                      riskVerdict === "APPROVE"
                        ? "text-safe"
                        : riskVerdict === "BLOCK"
                          ? "text-danger"
                          : "text-watch"
                    }`}
                  >
                    {riskVerdict}
                  </span>
                </div>
              ) : (
                sevTone &&
                sev && (
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground/80">Verdict</span>
                    <span
                      className={`font-mono uppercase tracking-wide text-xs font-semibold ${sev.text}`}
                    >
                      {SEVERITY_LABEL[sevTone]}
                    </span>
                  </div>
                )
              )}

              {/* Agent message */}
              {message && (
                <div>
                  <span className="text-muted-foreground/80 block mb-1">Message</span>
                  <p className="text-foreground/85 leading-relaxed">{message}</p>
                </div>
              )}

              {/* Rejection reason */}
              {rejectReason && (
                <div>
                  <span className="text-muted-foreground/80 block mb-1">Rejection reason</span>
                  <p className="text-danger leading-relaxed">{rejectReason}</p>
                </div>
              )}

              {/* Signals */}
              {riskReasons && riskReasons.length > 0 && (
                <div>
                  <span className="text-muted-foreground/80 block mb-1">Signals</span>
                  <ul className="list-disc list-inside space-y-0.5 text-foreground/80">
                    {riskReasons.map((r, i) => (
                      <li key={i}>{r}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
