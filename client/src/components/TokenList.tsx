"use client";

import { motion } from "framer-motion";
import { Skeleton } from "./ui/Skeleton";
import { TokenRow } from "./TokenRow";
import { Coins } from "lucide-react";
import type { TokenPosition } from "@/types";

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.06 },
  },
};

interface TokenListProps {
  tokens: TokenPosition[];
  loading: boolean;
  embedded?: boolean;
}

export function TokenList({ tokens, loading, embedded }: TokenListProps) {
  const content = (
    <>
      {loading ? (
        <div className="space-y-0.5">
          {[1, 2, 3, 4, 5].map((i) => (
            <div
              key={i}
              className="flex items-center gap-3 px-4 py-3.5"
            >
              <Skeleton className="h-10 w-10 rounded-xl shrink-0" />
              <div className="flex-1 min-w-0 space-y-2">
                <Skeleton className="h-4 w-20" />
                <Skeleton className="h-3 w-28" />
              </div>
              <div className="space-y-2 flex flex-col items-end">
                <Skeleton className="h-4 w-16" />
                <Skeleton className="h-3 w-12" />
              </div>
            </div>
          ))}
        </div>
      ) : tokens.length === 0 ? (
        <motion.div
          className="flex flex-col items-center justify-center text-center py-16"
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2, duration: 0.35 }}
        >
          <div className="mb-4 w-12 h-12 rounded-2xl bg-white/6 flex items-center justify-center text-slate-500">
            <Coins className="h-6 w-6" />
          </div>
          <p className="text-sm font-medium text-slate-400">No tokens yet</p>
          <p className="mt-1 text-xs text-slate-600">
            Deposit assets on BNB Chain to get started
          </p>
        </motion.div>
      ) : (
        <motion.div
          className="divide-y divide-white/[0.04]"
          initial="hidden"
          animate="visible"
          variants={containerVariants}
        >
          {tokens.map((token, i) => (
            <TokenRow key={token.id} token={token} index={i} />
          ))}
        </motion.div>
      )}
    </>
  );

  return embedded ? (
    <div className="py-1">{content}</div>
  ) : (
    <div className="glass-card py-1">{content}</div>
  );
}
