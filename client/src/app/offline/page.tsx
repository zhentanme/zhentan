"use client";

import { BrandMark } from "@/components/BrandMark";
import { Button } from "@/components/ui/Button";

export default function OfflinePage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background px-6 text-center">
      <BrandMark size="xl" className="mb-6 gap-3" />
      <h1 className="mb-2 text-2xl font-semibold text-foreground">
        You&apos;re offline
      </h1>
      <p className="mb-8 text-muted-foreground">
        Zhentan needs a connection to read onchain data.
      </p>
      <Button onClick={() => window.location.reload()}>Try again</Button>
    </div>
  );
}
