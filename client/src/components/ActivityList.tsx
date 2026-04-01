"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import type { TransactionWithStatus } from "@/types";
import { TransactionRow } from "./TransactionRow";
import { TransactionDetailDialog } from "./TransactionDetailDialog";
import { Skeleton } from "./ui/Skeleton";
import { Activity } from "lucide-react";

function groupByDate(txs: TransactionWithStatus[]): { dateLabel: string; items: TransactionWithStatus[] }[] {
  const map = new Map<string, TransactionWithStatus[]>();
  for (const tx of txs) {
    const label = new Date(tx.proposedAt).toLocaleDateString("en-US", {
      year: "numeric", month: "long", day: "numeric",
    });
    if (!map.has(label)) map.set(label, []);
    map.get(label)!.push(tx);
  }
  return Array.from(map.entries()).map(([dateLabel, items]) => ({ dateLabel, items }));
}

interface ActivityListProps {
  transactions: TransactionWithStatus[];
  loading: boolean;
  embedded?: boolean;
}

export function ActivityList({ transactions, loading, embedded }: ActivityListProps) {
  const [selectedTx, setSelectedTx] = useState<TransactionWithStatus | null>(null);

  const groups = groupByDate(transactions);

  // Running index across all groups for stagger animation
  let rowIndex = 0;

  const content = (
    <>
      {loading ? (
        <div className="space-y-0.5">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="flex items-center gap-3 px-4 py-3">
              <Skeleton className="h-10 w-10 rounded-full shrink-0" />
              <div className="flex-1 min-w-0 space-y-2">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-3 w-32" />
              </div>
              <div className="space-y-1.5 flex flex-col items-end">
                <Skeleton className="h-4 w-20" />
                <Skeleton className="h-3 w-12" />
              </div>
            </div>
          ))}
        </div>
      ) : transactions.length === 0 ? (
        <motion.div
          className="flex flex-col items-center justify-center text-center py-16"
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2, duration: 0.35 }}
        >
          <div className="mb-4 w-12 h-12 rounded-2xl bg-white/6 flex items-center justify-center text-slate-500">
            <Activity className="h-6 w-6" />
          </div>
          <p className="text-sm font-medium text-slate-400">No activity yet</p>
          <p className="mt-1 text-xs text-slate-600">Transfers will appear here</p>
        </motion.div>
      ) : (
        <div>
          {groups.map(({ dateLabel, items }) => (
            <div key={dateLabel}>
              {/* Date header */}
              <p className="px-4 pt-4 pb-1.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">
                {dateLabel}
              </p>
              {/* Rows for this date */}
              <div className="divide-y divide-white/[0.04]">
                {items.map((tx) => {
                  const idx = rowIndex++;
                  return (
                    <TransactionRow
                      key={tx.id}
                      tx={tx}
                      index={idx}
                      onClick={() => setSelectedTx(tx)}
                    />
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      <TransactionDetailDialog
        tx={selectedTx}
        open={selectedTx !== null}
        onClose={() => setSelectedTx(null)}
      />
    </>
  );

  return embedded ? (
    <div className="py-1">{content}</div>
  ) : (
    <div className="glass-card py-1">{content}</div>
  );
}
