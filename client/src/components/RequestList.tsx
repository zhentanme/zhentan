"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import type { QueuedRequest } from "@/types";
import { RequestRow } from "./RequestRow";
import { RequestDetailDialog } from "./RequestDetailDialog";
import { Skeleton } from "./ui/Skeleton";

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.06,
    },
  },
};

interface RequestListProps {
  requests: QueuedRequest[];
  loading: boolean;
  onApprove?: (request: QueuedRequest) => Promise<{ txId: string }>;
  onReject?: (request: QueuedRequest, reason: string) => Promise<void>;
  onRefresh?: () => void;
}

export function RequestList({
  requests,
  loading,
  onApprove,
  onReject,
  onRefresh,
}: RequestListProps) {
  const [selectedRequest, setSelectedRequest] =
    useState<QueuedRequest | null>(null);

  if (!loading && requests.length === 0) return null;

  return (
    <>
      {loading ? (
        <div className="divide-y divide-border/60">
          {[1, 2, 3].map((i) => (
            <div key={i} className="flex items-center gap-4 px-2 sm:px-3 py-3.5">
              <Skeleton className="h-10 w-10 rounded-2xl shrink-0" />
              <div className="flex-1 min-w-0 space-y-2">
                <div className="flex items-center gap-2">
                  <Skeleton className="h-4 w-24" />
                  <Skeleton className="h-3 w-3 rounded-full" />
                  <Skeleton className="h-4 w-20" />
                </div>
                <Skeleton className="h-3 w-32" />
              </div>
              <Skeleton className="h-6 w-16 rounded-full shrink-0" />
            </div>
          ))}
        </div>
      ) : (
        <motion.div
          className="divide-y divide-border/60"
          initial="hidden"
          animate="visible"
          variants={containerVariants}
        >
          {requests.map((req, i) => (
            <RequestRow
              key={req.id}
              request={req}
              index={i}
              onClick={() => setSelectedRequest(req)}
            />
          ))}
        </motion.div>
      )}

      <RequestDetailDialog
        request={selectedRequest}
        open={selectedRequest !== null}
        onClose={() => setSelectedRequest(null)}
        onApprove={onApprove}
        onReject={onReject}
        onRefresh={onRefresh}
      />
    </>
  );
}
