"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";

import { Button } from "@/components/ui/Button";
import { TwinTick } from "@/components/BrandMark";
import type { TourDefinition } from "@/lib/tours";

/**
 * Guided-tour engine: a dimmed backdrop with a gold-ringed spotlight cutout
 * that springs between `data-tour` anchors, plus a step card — floating
 * beside the target on desktop, a top/bottom sheet on phones (top when the
 * spotlight is in the lower half, so it never covers its own target).
 *
 * Targets resolve at runtime: each step lists selectors in preference order
 * and the first VISIBLE one wins, which is how one step serves the desktop
 * sidebar and the mobile bottom nav. Unresolvable steps are skipped.
 */

interface Spot {
  x: number;
  y: number;
  w: number;
  h: number;
}

interface TourContextType {
  start: (def: TourDefinition) => void;
  active: boolean;
}

const TourContext = createContext<TourContextType | null>(null);

export function useTour(): TourContextType {
  const ctx = useContext(TourContext);
  if (!ctx) throw new Error("useTour must be used within TourProvider");
  return ctx;
}

const SPOT_PAD = 8;
const CARD_W = 340;
const CARD_MARGIN = 20;

function findVisibleTarget(selectors: string[]): { el: Element; index: number } | null {
  for (let i = 0; i < selectors.length; i++) {
    const candidates = document.querySelectorAll(selectors[i]);
    for (const el of Array.from(candidates)) {
      const rect = el.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) return { el, index: i };
    }
  }
  return null;
}

export function TourProvider({ children }: { children: ReactNode }) {
  const router = useRouter();

  const [def, setDef] = useState<TourDefinition | null>(null);
  const [stepIndex, setStepIndex] = useState(0);
  const [spot, setSpot] = useState<Spot | null>(null);
  const [usedFallback, setUsedFallback] = useState(false);
  const [isPhone, setIsPhone] = useState(false);
  const targetRef = useRef<Element | null>(null);
  const defRef = useRef<TourDefinition | null>(null);
  defRef.current = def;

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 639px)");
    const update = () => setIsPhone(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);

  const start = useCallback((next: TourDefinition) => {
    if (defRef.current) return; // one tour at a time
    setStepIndex(0);
    setSpot(null);
    setUsedFallback(false);
    setDef(next);
  }, []);

  const end = useCallback(() => {
    const current = defRef.current;
    setDef(null);
    setSpot(null);
    targetRef.current = null;
    current?.onClose?.();
  }, []);

  const goTo = useCallback(
    (index: number) => {
      const current = defRef.current;
      if (!current) return;
      if (index >= current.steps.length) end();
      else setStepIndex(Math.max(0, index));
    },
    [end]
  );

  const measure = useCallback(() => {
    const el = targetRef.current;
    if (!el || !el.isConnected) return;
    const rect = el.getBoundingClientRect();
    setSpot({
      x: rect.left - SPOT_PAD,
      y: rect.top - SPOT_PAD,
      w: rect.width + SPOT_PAD * 2,
      h: rect.height + SPOT_PAD * 2,
    });
  }, []);

  // Resolve the current step's target: navigate if needed, poll for a
  // visible anchor, scroll it into view, then measure. Steps whose anchors
  // never appear are skipped so a missing surface can't strand the tour.
  useEffect(() => {
    if (!def) return;
    const step = def.steps[stepIndex];
    let cancelled = false;

    (async () => {
      const needsRoute = step.route && window.location.pathname !== step.route;
      if (needsRoute) router.push(step.route!);

      if (!step.targets?.length) {
        targetRef.current = null;
        setSpot(null);
        setUsedFallback(false);
        return;
      }

      const deadline = Date.now() + (needsRoute ? 5000 : 2000);
      let found: { el: Element; index: number } | null = null;
      while (!cancelled && Date.now() < deadline) {
        found = findVisibleTarget(step.targets);
        if (found) break;
        await new Promise((r) => setTimeout(r, 120));
      }
      if (cancelled) return;
      if (!found) {
        goTo(stepIndex + 1);
        return;
      }

      targetRef.current = found.el;
      setUsedFallback(found.index > 0);
      found.el.scrollIntoView({ block: "center", behavior: "smooth", inline: "nearest" });
      await new Promise((r) => setTimeout(r, 350));
      if (!cancelled) measure();
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [def, stepIndex]);

  // Keep the spotlight glued to its target through scrolls and resizes.
  useEffect(() => {
    if (!def) return;
    let raf = 0;
    const onMove = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(measure);
    };
    window.addEventListener("resize", onMove);
    window.addEventListener("scroll", onMove, true);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", onMove);
      window.removeEventListener("scroll", onMove, true);
    };
  }, [def, measure]);

  // Keyboard: Escape skips, arrows navigate.
  useEffect(() => {
    if (!def) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") end();
      else if (e.key === "ArrowRight" || e.key === "Enter") goTo(stepIndex + 1);
      else if (e.key === "ArrowLeft") goTo(stepIndex - 1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [def, stepIndex, end, goTo]);

  const value = useMemo(() => ({ start, active: !!def }), [start, def]);

  const step = def?.steps[stepIndex];
  const total = def?.steps.length ?? 0;
  const isLast = stepIndex === total - 1;
  const body = usedFallback && step?.fallbackBody ? step.fallbackBody : step?.body;

  // Desktop card placement: beside the spotlight when there's room, else
  // below/above it — always clamped to the viewport.
  const cardStyle: CSSProperties = useMemo(() => {
    if (isPhone || !step) return {};
    const vw = typeof window !== "undefined" ? window.innerWidth : 1280;
    const vh = typeof window !== "undefined" ? window.innerHeight : 800;
    if (!spot) {
      return { left: "50%", top: "50%", transform: "translate(-50%, -50%)", width: CARD_W };
    }
    const estH = 240;
    if (spot.x + spot.w + CARD_MARGIN + CARD_W < vw) {
      return {
        left: spot.x + spot.w + CARD_MARGIN,
        top: Math.min(Math.max(spot.y, 24), vh - estH - 24),
        width: CARD_W,
      };
    }
    if (spot.x - CARD_MARGIN - CARD_W > 0) {
      return {
        left: spot.x - CARD_MARGIN - CARD_W,
        top: Math.min(Math.max(spot.y, 24), vh - estH - 24),
        width: CARD_W,
      };
    }
    const below = spot.y + spot.h + CARD_MARGIN + estH < vh;
    return {
      left: Math.min(Math.max(spot.x, 24), vw - CARD_W - 24),
      top: below ? spot.y + spot.h + CARD_MARGIN : Math.max(spot.y - estH - CARD_MARGIN, 24),
      width: CARD_W,
    };
  }, [isPhone, step, spot]);

  // Phone: sheet at the bottom, unless the spotlight lives in the lower half
  // (e.g. the bottom nav) — then it flips to the top so it can't cover it.
  const sheetOnTop =
    isPhone && spot != null && spot.y + spot.h / 2 > (typeof window !== "undefined" ? window.innerHeight : 800) / 2;

  const cardInner = step && (
    <motion.div
      key={stepIndex}
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -6 }}
      transition={{ duration: 0.35, type: "spring", bounce: 0.15 }}
      className="rounded-2xl bg-card border border-gold/25 shadow-[0_24px_60px_-24px_rgba(0,0,0,0.8)] p-5"
    >
      {step.brand && (
        <div className="flex justify-center mb-3">
          <TwinTick size={36} halo="none" />
        </div>
      )}
      <span className="eyebrow text-muted-foreground">
        Tour · {stepIndex + 1} of {total}
      </span>
      <h3 className={`mt-2 text-base font-semibold text-foreground tracking-tight ${step.brand ? "text-center" : ""}`}>
        {step.title}
      </h3>
      <p className={`mt-1.5 text-sm text-muted-foreground leading-relaxed ${step.brand ? "text-center" : ""}`}>
        {body}
      </p>
      <div className="mt-5 flex items-center justify-between gap-3">
        {isLast ? (
          <span className="w-12" aria-hidden />
        ) : (
          <button
            type="button"
            onClick={end}
            className="text-xs font-medium text-muted-foreground/70 hover:text-foreground transition-colors cursor-pointer"
          >
            Skip tour
          </button>
        )}
        <div className="flex items-center gap-1.5" aria-hidden>
          {def?.steps.map((s, i) => (
            <button
              key={s.id}
              type="button"
              onClick={() => goTo(i)}
              className={`h-1.5 rounded-pill transition-all cursor-pointer ${
                i === stepIndex ? "w-4 bg-gold" : "w-1.5 bg-foreground/20 hover:bg-foreground/40"
              }`}
            />
          ))}
        </div>
        <Button
          type="button"
          onClick={() => goTo(stepIndex + 1)}
          className="!px-4 !py-2 !min-h-0 !text-sm"
        >
          {isLast ? def?.finishLabel ?? "Done" : "Next"}
        </Button>
      </div>
    </motion.div>
  );

  return (
    <TourContext.Provider value={value}>
      {children}
      <AnimatePresence>
        {def && step && (
          <motion.div
            key="tour-overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.25 }}
            className="fixed inset-0 z-[90] touch-none"
          >
            {/* Dim + spotlight. The cutout div is transparent; its massive
                box-shadow does the dimming, so the target shows through. */}
            {spot ? (
              <motion.div
                initial={false}
                animate={{ left: spot.x, top: spot.y, width: spot.w, height: spot.h }}
                transition={{ type: "spring", bounce: 0.18, duration: 0.55 }}
                className="absolute rounded-xl border-2 border-gold/60 pointer-events-none"
                style={{
                  boxShadow:
                    "0 0 0 9999px rgba(10,13,14,0.8), 0 0 0 1px rgba(196,148,40,0.25), 0 0 32px rgba(196,148,40,0.3)",
                }}
              />
            ) : (
              <div className="absolute inset-0 bg-[rgba(10,13,14,0.85)]" />
            )}

            {/* Step card: floating on desktop, sheet on phones. */}
            {isPhone ? (
              <div
                className={`absolute inset-x-0 px-4 ${
                  sheetOnTop
                    ? "top-0 pt-[max(1rem,env(safe-area-inset-top))]"
                    : "bottom-0 pb-[max(1rem,env(safe-area-inset-bottom))]"
                }`}
              >
                {cardInner}
              </div>
            ) : (
              <div className="absolute" style={cardStyle}>
                {cardInner}
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </TourContext.Provider>
  );
}
