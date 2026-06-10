"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import type { QueuedRequest } from "@/types";
import { RequestRow } from "./RequestRow";
import { RequestDetailDialog } from "./RequestDetailDialog";
import { Card } from "./ui/Card";
import { Skeleton } from "./ui/Skeleton";
import { Bell } from "lucide-react";

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.1,
    },
  },
};

const headerVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: {
    opacity: 1,
    y: 0,
    transition: {
      duration: 0.5,
      type: "spring" as const,
      bounce: 0.18,
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
    <Card className="p-6">
      <motion.div
        className="flex items-center gap-2 mb-4"
        initial="hidden"
        animate="visible"
        variants={headerVariants}
      >
        <Bell className="h-4 w-4 text-gold" />
        <h2 className="text-sm font-semibold text-white tracking-wide">
          <span className="text-gold">&rsaquo;</span> Requests
        </h2>
      </motion.div>

      {loading ? (
        <div className="space-y-1">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="flex items-center gap-4 px-4 py-3 rounded-2xl"
            >
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
          className="space-y-1"
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
    </Card>
  );
}
