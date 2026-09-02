"use client";

/**
 * Screening limits & thresholds (#144). PROPOSE-ONLY: saving never applies —
 * it files a policy-change proposal that the user confirms with their agent
 * on Telegram (the independent second channel). While one is pending the
 * card shows its expiry and polls for resolution.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { clsx } from "clsx";
import { SlidersHorizontal, Clock3 } from "lucide-react";
import { useApiClient } from "@/lib/api/client";
import type { PolicyProposal, LimitsProposalPatch } from "@/lib/api/settings";
import type { ScreeningLimits } from "@/types/index";
import { Dialog } from "@/components/ui/Dialog";
import { Button } from "@/components/ui/Button";
import { Pill } from "@/components/ui/Pill";
import { Switch } from "@/components/ui/Switch";
import { InlineError } from "@/components/ui/InlineError";
import { useToast } from "@/components/ui/Toast";

const THRESHOLD_PRESETS = [
  { key: "strict", label: "Strict", approve: 20, block: 50 },
  { key: "balanced", label: "Balanced", approve: 40, block: 70 },
  { key: "relaxed", label: "Relaxed", approve: 40, block: 85 },
] as const;

/** riskThresholdApprove server cap — mirrors RISK_THRESHOLD_APPROVE_CAP. */
const APPROVE_CAP = 40;
/** Handles keep 10 points apart so the review band never collapses. */
const BAND_GAP = 10;

/* Ceiling sliders snap to a 1/2.5/5 ladder; the stored value is spliced in
   so an untouched slider round-trips exactly and produces no patch entry. */
const SINGLE_STEPS = [100, 250, 500, 1000, 2500, 5000, 10000, 25000, 50000, 100000];
const HOURLY_STEPS = [250, 500, 1000, 2500, 5000, 10000, 25000, 50000, 100000, 250000];
const DAILY_STEPS = [500, 1000, 2500, 5000, 10000, 25000, 50000, 100000, 250000, 500000];
const WEEKLY_STEPS = [2500, 5000, 10000, 25000, 50000, 100000, 250000, 500000, 1000000, 2500000];

function withValue(steps: readonly number[], value: number): number[] {
  return steps.includes(value) ? [...steps] : [...steps, value].sort((a, b) => a - b);
}

function money(v: number): string {
  if (v >= 1_000_000) return `$${(v / 1_000_000).toLocaleString("en-US", { maximumFractionDigits: 1 })}m`;
  if (v >= 1000) return `$${(v / 1000).toLocaleString("en-US", { maximumFractionDigits: 1 })}k`;
  return `$${v}`;
}

function minutesLeft(expiresAt: string): number {
  return Math.max(0, Math.ceil((new Date(expiresAt).getTime() - Date.now()) / 60_000));
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

/** Track-relative pointer position in [0, 1]. */
function pctFrom(el: HTMLElement, clientX: number): number {
  const r = el.getBoundingClientRect();
  return clamp((clientX - r.left) / r.width, 0, 1);
}

/** Follow the pointer until release — pointerdown handlers hand off here. */
function trackPointer(apply: (clientX: number) => void, e: React.PointerEvent) {
  e.preventDefault();
  const move = (ev: PointerEvent) => apply(ev.clientX);
  const up = () => {
    window.removeEventListener("pointermove", move);
    window.removeEventListener("pointerup", up);
  };
  window.addEventListener("pointermove", move);
  window.addEventListener("pointerup", up);
  apply(e.clientX);
}

function SectionRule({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-3">
      <span className="eyebrow text-muted-foreground/70">{label}</span>
      <span className="h-px flex-1 bg-border" aria-hidden />
    </div>
  );
}

/** Single-thumb slider snapping to a step ladder, gold fill per the design. */
function StepSlider({
  label,
  steps,
  value,
  onChange,
}: {
  label: string;
  steps: number[];
  value: number;
  onChange: (v: number) => void;
}) {
  const trackRef = useRef<HTMLDivElement>(null);
  const idx = Math.max(0, steps.indexOf(value));
  const pct = (idx / (steps.length - 1)) * 100;

  const apply = (clientX: number) => {
    if (!trackRef.current) return;
    const p = pctFrom(trackRef.current, clientX);
    onChange(steps[Math.round(p * (steps.length - 1))]);
  };

  const nudge = (delta: number) => onChange(steps[clamp(idx + delta, 0, steps.length - 1)]);

  return (
    <div>
      <div className="flex items-baseline justify-between">
        <span className="text-[13.5px] font-medium text-foreground">{label}</span>
        <span className="font-mono text-[15px] text-gold-300">{money(value)}</span>
      </div>
      <div
        ref={trackRef}
        role="slider"
        tabIndex={0}
        aria-label={label}
        aria-valuemin={steps[0]}
        aria-valuemax={steps[steps.length - 1]}
        aria-valuenow={value}
        aria-valuetext={money(value)}
        onPointerDown={(e) => trackPointer(apply, e)}
        onKeyDown={(e) => {
          if (e.key === "ArrowLeft" || e.key === "ArrowDown") nudge(-1);
          else if (e.key === "ArrowRight" || e.key === "ArrowUp") nudge(1);
          else if (e.key === "Home") onChange(steps[0]);
          else if (e.key === "End") onChange(steps[steps.length - 1]);
          else return;
          e.preventDefault();
        }}
        className="relative h-[34px] mt-0.5 cursor-grab touch-none select-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold/30 rounded-md"
      >
        <div className="absolute left-0 right-0 top-[15px] h-1.5 rounded-full bg-foreground/[0.07]" />
        <div
          className="absolute left-0 top-[15px] h-1.5 rounded-full bg-gradient-to-r from-gold-600 to-gold-300"
          style={{ width: `${pct}%` }}
        />
        <div
          className="absolute top-1.5 -ml-3 w-6 h-6 rounded-full bg-gold-400 border-[3px] border-card shadow-[0_3px_10px_rgba(0,0,0,0.5)]"
          style={{ left: `${pct}%` }}
        />
      </div>
    </div>
  );
}

/**
 * Dual-handle risk band: green handle = auto-approve threshold, red handle =
 * block threshold. A press grabs whichever handle is nearer.
 */
function RiskBand({
  approve,
  block,
  onChange,
}: {
  approve: number;
  block: number;
  onChange: (patch: { approve?: number; block?: number }) => void;
}) {
  const trackRef = useRef<HTMLDivElement>(null);
  // Latest values for the drag closure — state is stale inside listeners.
  const live = useRef({ approve, block });
  live.current = { approve, block };

  const clampApprove = (v: number) => clamp(v, 5, Math.min(APPROVE_CAP, live.current.block - BAND_GAP));
  const clampBlock = (v: number) => clamp(v, live.current.approve + BAND_GAP, 95);

  const onDown = (e: React.PointerEvent) => {
    if (!trackRef.current) return;
    const first = Math.round(pctFrom(trackRef.current, e.clientX) * 100);
    const handle =
      Math.abs(first - live.current.approve) <= Math.abs(first - live.current.block) ? "approve" : "block";
    trackPointer((clientX) => {
      const v = Math.round(pctFrom(trackRef.current!, clientX) * 100);
      onChange(handle === "approve" ? { approve: clampApprove(v) } : { block: clampBlock(v) });
    }, e);
  };

  const handleKeys =
    (which: "approve" | "block") => (e: React.KeyboardEvent) => {
      const delta =
        e.key === "ArrowLeft" || e.key === "ArrowDown" ? -1 : e.key === "ArrowRight" || e.key === "ArrowUp" ? 1 : 0;
      if (!delta) return;
      e.preventDefault();
      onChange(
        which === "approve" ? { approve: clampApprove(approve + delta) } : { block: clampBlock(block + delta) }
      );
    };

  const notch = <span className="w-0.5 h-3.5 rounded-full bg-ink-900/40" aria-hidden />;

  return (
    <>
      <div
        ref={trackRef}
        onPointerDown={onDown}
        className="relative h-14 cursor-grab touch-none select-none"
      >
        <div className="absolute left-0 right-0 top-4 h-6 rounded-xl overflow-hidden bg-foreground/[0.05]">
          <div className="absolute left-0 top-0 bottom-0 bg-safe/25" style={{ width: `${approve}%` }} />
          <div
            className="absolute top-0 bottom-0 bg-gold/25"
            style={{ left: `${approve}%`, width: `${block - approve}%` }}
          />
          <div className="absolute top-0 bottom-0 right-0 bg-danger/25" style={{ left: `${block}%` }} />
        </div>
        <div
          role="slider"
          tabIndex={0}
          aria-label="Auto-approve below"
          aria-valuemin={5}
          aria-valuemax={APPROVE_CAP}
          aria-valuenow={approve}
          onKeyDown={handleKeys("approve")}
          className="absolute top-2 -ml-[9px] w-[18px] h-10 rounded-[9px] bg-safe shadow-[0_3px_10px_rgba(0,0,0,0.45)] flex items-center justify-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-safe/40"
          style={{ left: `${approve}%` }}
        >
          {notch}
        </div>
        <div
          role="slider"
          tabIndex={0}
          aria-label="Block at or above"
          aria-valuemin={BAND_GAP}
          aria-valuemax={95}
          aria-valuenow={block}
          onKeyDown={handleKeys("block")}
          className="absolute top-2 -ml-[9px] w-[18px] h-10 rounded-[9px] bg-danger shadow-[0_3px_10px_rgba(0,0,0,0.45)] flex items-center justify-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-danger/40"
          style={{ left: `${block}%` }}
        >
          {notch}
        </div>
      </div>
      <div className="flex gap-2 mt-1.5">
        <div className="flex-1 rounded-md bg-safe/[0.07] px-3 py-2.5">
          <div className="font-mono text-[10px] uppercase tracking-[0.1em] text-safe/85">Auto-approve</div>
          <div className="text-xs text-foreground/85 mt-1">risk under {approve}</div>
        </div>
        <div className="flex-1 rounded-md bg-gold/[0.07] px-3 py-2.5">
          <div className="font-mono text-[10px] uppercase tracking-[0.1em] text-gold-300/85">Ask me</div>
          <div className="text-xs text-foreground/85 mt-1">
            {approve} – {block}
          </div>
        </div>
        <div className="flex-1 rounded-md bg-danger/[0.07] px-3 py-2.5">
          <div className="font-mono text-[10px] uppercase tracking-[0.1em] text-danger/85">Block</div>
          <div className="text-xs text-foreground/85 mt-1">{block} and up</div>
        </div>
      </div>
    </>
  );
}

/** Compact mono value chip for the summary row ("tx $2.5k"). */
function ValueChip({ prefix, children, className }: { prefix?: string; children: React.ReactNode; className?: string }) {
  return (
    <span
      className={clsx(
        "inline-flex items-center gap-1.5 px-2 py-1 rounded-md font-mono text-[11px]",
        className ?? "bg-foreground/[0.045] text-foreground/80"
      )}
    >
      {prefix && <span className="text-muted-foreground/70">{prefix}</span>}
      {children}
    </span>
  );
}

const UNKNOWN_OPTIONS = [
  { key: "approve", label: "Let it through", note: "First-time recipients go straight through if they clear your risk band." },
  { key: "review", label: "Ask me", note: "A recipient you’ve never paid always waits for your yes." },
  { key: "block", label: "Block", note: "New recipients are refused until you add them from a request." },
] as const;

/** Editable fields, dialog-side shape. */
interface LimitsForm {
  single: number;
  hourly: number;
  daily: number;
  weekly: number;
  count: number;
  approve: number;
  block: number;
  unknown: ScreeningLimits["unknownRecipientAction"];
  learning: boolean;
  /** Allowed UTC hours/days — empty means "any". */
  hours: number[];
  days: number[];
}

function toForm(l: ScreeningLimits): LimitsForm {
  return {
    single: Number(l.maxSingleTx),
    hourly: Number(l.maxHourlyVolume),
    daily: Number(l.maxDailyVolume),
    weekly: Number(l.maxWeeklyVolume),
    count: l.maxDailyTxCount,
    approve: l.riskThresholdApprove,
    block: l.riskThresholdBlock,
    unknown: l.unknownRecipientAction,
    learning: l.learningEnabled,
    hours: [...l.allowedHoursUTC].sort((a, b) => a - b),
    days: [...l.allowedDaysUTC].sort((a, b) => a - b),
  };
}

/** Value equality for form fields or whole forms — hours/days are arrays, `!==` would flag every fresh instance. */
function sameField(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

function toggleIn(list: number[], v: number): number[] {
  return list.includes(v) ? list.filter((x) => x !== v) : [...list, v].sort((a, b) => a - b);
}

export function ScreeningLimitsCard({ safeAddress }: { safeAddress: string }) {
  const api = useApiClient();
  const toast = useToast();

  const [limits, setLimits] = useState<ScreeningLimits | null>(null);
  const [defaults, setDefaults] = useState<ScreeningLimits | null>(null);
  const [pending, setPending] = useState<PolicyProposal | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const hadPendingRef = useRef(false);

  const refresh = useCallback(async () => {
    try {
      const [status, proposal] = await Promise.all([
        api.status.get(safeAddress),
        api.settings.pending().catch(() => null),
      ]);
      setLimits(status.patterns?.globalLimits ?? null);
      setDefaults(status.defaultLimits ?? null);
      // Pending → gone means the agent resolved (or it expired): reload limits
      // next tick already covered by this same fetch; just tell the user once.
      if (hadPendingRef.current && !proposal) {
        toast("Settings change resolved — showing current limits", "neutral");
      }
      hadPendingRef.current = Boolean(proposal);
      setPending(proposal);
    } catch {
      /* silent — the card renders what it has */
    }
  }, [api, safeAddress, toast]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // Poll faster while a proposal is awaiting the Telegram confirmation.
  useEffect(() => {
    if (!pending) return;
    const t = setInterval(refresh, 15_000);
    return () => clearInterval(t);
  }, [pending, refresh]);

  const [form, setForm] = useState<LimitsForm | null>(null);
  const baseline = useMemo(() => (limits ? toForm(limits) : null), [limits]);

  const openEdit = () => {
    if (!limits || pending) return;
    setForm(toForm(limits));
    setError(null);
    setEditOpen(true);
  };

  const patch = (p: Partial<LimitsForm>) => setForm((f) => (f ? { ...f, ...p } : f));

  const steps = useMemo(() => {
    if (!baseline) return null;
    return {
      single: withValue(SINGLE_STEPS, baseline.single),
      hourly: withValue(HOURLY_STEPS, baseline.hourly),
      daily: withValue(DAILY_STEPS, baseline.daily),
      weekly: withValue(WEEKLY_STEPS, baseline.weekly),
    };
  }, [baseline]);

  const changed = useMemo(() => {
    if (!form || !baseline) return [];
    return (Object.keys(form) as (keyof LimitsForm)[]).filter((k) => !sameField(form[k], baseline[k]));
  }, [form, baseline]);

  const activePreset = form
    ? THRESHOLD_PRESETS.find((p) => p.approve === form.approve && p.block === form.block)?.key
    : undefined;

  const submit = async () => {
    if (!form || !baseline || changed.length === 0) return;
    const body: LimitsProposalPatch = {};
    if (form.single !== baseline.single) body.maxSingleTx = String(form.single);
    if (form.hourly !== baseline.hourly) body.maxHourlyVolume = String(form.hourly);
    if (form.daily !== baseline.daily) body.maxDailyVolume = String(form.daily);
    if (form.weekly !== baseline.weekly) body.maxWeeklyVolume = String(form.weekly);
    if (form.count !== baseline.count) body.maxDailyTxCount = form.count;
    if (form.approve !== baseline.approve) body.riskThresholdApprove = form.approve;
    if (form.block !== baseline.block) body.riskThresholdBlock = form.block;
    if (form.unknown !== baseline.unknown) body.unknownRecipientAction = form.unknown;
    if (form.learning !== baseline.learning) body.learningEnabled = form.learning;
    if (!sameField(form.hours, baseline.hours)) body.allowedHoursUTC = form.hours;
    if (!sameField(form.days, baseline.days)) body.allowedDaysUTC = form.days;

    setSaving(true);
    setError(null);
    try {
      const proposal = await api.settings.propose(safeAddress, body);
      setPending(proposal);
      hadPendingRef.current = true;
      setEditOpen(false);
      toast("Sent to your agent — confirm it in Telegram", "safe");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn’t propose the change");
    } finally {
      setSaving(false);
    }
  };

  if (!limits || !baseline) return null;

  // "How strict" chip derives from the saved thresholds (design mapping).
  const mode = baseline.approve <= 20 ? "Strict" : baseline.block >= 85 ? "Relaxed" : "Balanced";
  const modeChipClass = {
    Strict: "bg-safe/12 text-safe",
    Balanced: "bg-gold/12 text-gold-300",
    Relaxed: "bg-watch/10 text-watch/90",
  }[mode];

  const isDefault =
    defaults !== null &&
    (Object.keys(limits) as (keyof ScreeningLimits)[]).every(
      (k) => JSON.stringify(limits[k]) === JSON.stringify(defaults[k])
    );

  const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

  return (
    <div className="rounded-md bg-card overflow-hidden shadow-[0_20px_50px_-38px_rgba(0,0,0,0.7)]">
      {/* ── Summary row: chips instead of a value table, per the design ── */}
      <div className="flex items-center gap-3.5 p-4">
        <div className="w-9 h-9 rounded-md flex items-center justify-center shrink-0 bg-gold/10 text-gold">
          <SlidersHorizontal className="h-[17px] w-[17px]" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="text-sm font-semibold text-foreground">Screening limits</h3>
            {pending ? (
              <Pill tone="gold" size="sm" pulse>
                Awaiting Telegram
              </Pill>
            ) : (
              defaults && (
                <Pill tone="neutral" size="sm">
                  {isDefault ? "Default" : "Custom"}
                </Pill>
              )
            )}
          </div>
          <div className="flex items-center gap-1.5 flex-wrap mt-2">
            <ValueChip prefix="tx">{money(baseline.single)}</ValueChip>
            <ValueChip prefix="day">{money(baseline.daily)}</ValueChip>
            <ValueChip className={modeChipClass}>{mode}</ValueChip>
            {limits.allowedHoursUTC.length > 0 && (
              <ValueChip prefix="hrs">
                {Math.min(...limits.allowedHoursUTC)}:00–{Math.max(...limits.allowedHoursUTC)}:00 UTC
              </ValueChip>
            )}
            {limits.allowedDaysUTC.length > 0 && (
              <ValueChip prefix="days">{limits.allowedDaysUTC.map((d) => dayNames[d]).join(" ")}</ValueChip>
            )}
          </div>
        </div>
        <button
          type="button"
          onClick={openEdit}
          disabled={Boolean(pending)}
          className={clsx(
            "shrink-0 inline-flex items-center px-3.5 py-2 rounded-md border border-gold/30 text-gold text-xs font-semibold transition-colors",
            pending ? "opacity-45 cursor-default" : "hover:bg-gold/10 cursor-pointer"
          )}
        >
          {pending ? "Pending" : "Adjust"}
        </button>
      </div>

      {pending && (
        <div className="mx-4 mb-4 flex items-start gap-2.5 rounded-md bg-gold/[0.07] border border-gold/15 px-3.5 py-3">
          <Clock3 className="h-3.5 w-3.5 shrink-0 text-gold-300 mt-0.5" />
          <p className="text-xs text-gold-300/90 leading-relaxed">
            Waiting for you to confirm in Telegram — expires in {minutesLeft(pending.expiresAt)} min.
            The app alone can never loosen your screening.
          </p>
        </div>
      )}

      {/* ── Edit dialog: "Adjust your limits" ── */}
      <Dialog open={editOpen} onClose={() => setEditOpen(false)} className="sm:max-w-lg">
        {form && steps && (
          <div>
            {/* Custom header per the design; the Dialog's own X sits top-right */}
            <div className="-mt-8 pr-10 pointer-events-none">
              <h3 className="text-[17px] font-bold tracking-tight text-foreground">Adjust your limits</h3>
              <p className="text-xs text-muted-foreground/85 leading-relaxed mt-1.5">
                Drag to set. Nothing applies until you confirm it with your agent in Telegram.
              </p>
            </div>

            {/* Risk band */}
            <div className="mt-5">
              <div className="flex items-center gap-3">
                <span className="eyebrow text-muted-foreground/70 shrink-0">How strict</span>
                <span className="h-px flex-1 bg-border" aria-hidden />
                <div className="flex gap-1">
                  {THRESHOLD_PRESETS.map((p) => (
                    <button
                      key={p.key}
                      type="button"
                      onClick={() => patch({ approve: p.approve, block: p.block })}
                      className={clsx(
                        "px-2.5 py-1 rounded-md font-mono text-[10.5px] uppercase tracking-[0.06em] transition-colors cursor-pointer",
                        activePreset === p.key
                          ? "bg-gold/15 text-gold-300"
                          : "bg-foreground/[0.05] text-muted-foreground hover:bg-foreground/10"
                      )}
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
              </div>
              <div className="mt-3">
                <RiskBand
                  approve={form.approve}
                  block={form.block}
                  onChange={({ approve, block }) =>
                    patch({
                      ...(approve !== undefined && { approve }),
                      ...(block !== undefined && { block }),
                    })
                  }
                />
              </div>
            </div>

            {/* Ceilings */}
            <div className="mt-5 pt-5 border-t border-border space-y-4">
              <SectionRule label="Ceilings" />
              <StepSlider
                label="Largest single transaction"
                steps={steps.single}
                value={form.single}
                onChange={(v) => patch({ single: v })}
              />
              <StepSlider
                label="Hourly total"
                steps={steps.hourly}
                value={form.hourly}
                onChange={(v) => patch({ hourly: v })}
              />
              <StepSlider
                label="Daily total"
                steps={steps.daily}
                value={form.daily}
                onChange={(v) => patch({ daily: v })}
              />
              <StepSlider
                label="Weekly total"
                steps={steps.weekly}
                value={form.weekly}
                onChange={(v) => patch({ weekly: v })}
              />
              <p className="text-[11.5px] text-muted-foreground/70 leading-relaxed">
                Anything over a ceiling still reaches you — your agent holds it and asks;
                it’s never silently dropped.
              </p>
              <div className="flex items-center justify-between gap-3.5 pt-4 border-t border-border">
                <span className="text-[13.5px] font-medium text-foreground">Transactions per day</span>
                <div className="flex items-center gap-0.5 p-[3px] rounded-md bg-foreground/[0.05]">
                  <button
                    type="button"
                    aria-label="Fewer transactions per day"
                    onClick={() => patch({ count: Math.max(1, form.count - 1) })}
                    className="w-7 h-7 rounded-md text-foreground/80 hover:bg-foreground/10 cursor-pointer text-base leading-none"
                  >
                    −
                  </button>
                  <span className="min-w-[34px] text-center font-mono text-sm text-foreground">{form.count}</span>
                  <button
                    type="button"
                    aria-label="More transactions per day"
                    onClick={() => patch({ count: Math.min(Math.max(100, baseline.count), form.count + 1) })}
                    className="w-7 h-7 rounded-md text-foreground/80 hover:bg-foreground/10 cursor-pointer text-base leading-none"
                  >
                    +
                  </button>
                </div>
              </div>
            </div>

            {/* Active hours/days — empty selection = no restriction */}
            <div className="mt-5 pt-5 border-t border-border">
              <SectionRule label="Active hours" />
              <div className="flex gap-1.5 mt-3.5">
                {dayNames.map((name, day) => (
                  <button
                    key={name}
                    type="button"
                    aria-pressed={form.days.includes(day)}
                    onClick={() => patch({ days: toggleIn(form.days, day) })}
                    className={clsx(
                      "flex-1 py-1.5 rounded-md text-[11px] font-medium transition-colors cursor-pointer",
                      form.days.includes(day)
                        ? "bg-gold/[0.18] text-gold-400"
                        : "bg-foreground/[0.05] text-muted-foreground hover:text-foreground"
                    )}
                  >
                    {name}
                  </button>
                ))}
              </div>
              <div className="grid grid-cols-8 gap-1 mt-2">
                {Array.from({ length: 24 }, (_, hour) => (
                  <button
                    key={hour}
                    type="button"
                    aria-pressed={form.hours.includes(hour)}
                    aria-label={`${hour}:00 UTC`}
                    onClick={() => patch({ hours: toggleIn(form.hours, hour) })}
                    className={clsx(
                      "py-1 rounded-md font-mono text-[10.5px] transition-colors cursor-pointer",
                      form.hours.includes(hour)
                        ? "bg-gold/[0.18] text-gold-400"
                        : "bg-foreground/[0.05] text-muted-foreground/80 hover:text-foreground"
                    )}
                  >
                    {hour}
                  </button>
                ))}
              </div>
              <p className="text-[11.5px] text-muted-foreground/70 leading-relaxed mt-2.5">
                Transactions outside these UTC hours and days score extra risk.
                Nothing selected means any time is fine.
              </p>
            </div>

            {/* Unknown recipient + learning */}
            <div className="mt-5 pt-5 border-t border-border">
              <SectionRule label="Someone new" />
              <div className="grid grid-cols-3 gap-1.5 p-1 rounded-md bg-foreground/[0.04] mt-3.5">
                {UNKNOWN_OPTIONS.map((o) => (
                  <button
                    key={o.key}
                    type="button"
                    onClick={() => patch({ unknown: o.key })}
                    className={clsx(
                      "py-2 px-1.5 rounded-md text-xs font-medium transition-colors cursor-pointer",
                      form.unknown === o.key
                        ? "bg-gold/[0.18] text-gold-400"
                        : "text-muted-foreground hover:text-foreground"
                    )}
                  >
                    {o.label}
                  </button>
                ))}
              </div>
              <p className="text-[11.5px] text-muted-foreground/70 leading-relaxed mt-2.5">
                {UNKNOWN_OPTIONS.find((o) => o.key === form.unknown)?.note}
              </p>
              <div className="flex items-center gap-3.5 mt-4 pt-4 border-t border-border">
                <div className="flex-1 min-w-0">
                  <p className="text-[13.5px] font-medium text-foreground">Keep learning my habits</p>
                  <p className="text-[11.5px] text-muted-foreground/70 leading-relaxed mt-1">
                    Your agent gets quieter about the people and amounts you use often.
                  </p>
                </div>
                <Switch
                  checked={form.learning}
                  onChange={() => patch({ learning: !form.learning })}
                  label="Toggle pattern learning"
                />
              </div>
            </div>

            {error && (
              <div className="mt-4">
                <InlineError>{error}</InlineError>
              </div>
            )}

            {/* Sticky footer: diff summary · reset · send */}
            <div className="sticky bottom-0 -mx-4 sm:-mx-6 -mb-4 sm:-mb-6 mt-5 flex items-center gap-3 px-4 sm:px-6 py-3.5 border-t border-border bg-card/95 backdrop-blur-sm">
              <span
                className={clsx(
                  "flex-1 min-w-0 font-mono text-[11px]",
                  changed.length === 0 ? "text-muted-foreground/60" : "text-gold-300"
                )}
              >
                {changed.length === 0
                  ? "No changes yet"
                  : `${changed.length} ${changed.length === 1 ? "change" : "changes"} ready`}
              </span>
              {defaults && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setForm(toForm(defaults))}
                  disabled={saving || sameField(form, toForm(defaults))}
                  title="Fill every field with the recommended defaults — sent as a proposal like any other change"
                >
                  Defaults
                </Button>
              )}
              <Button
                variant="outline"
                size="sm"
                onClick={() => setForm(toForm(limits))}
                disabled={saving || changed.length === 0}
              >
                Reset
              </Button>
              <Button size="sm" onClick={submit} loading={saving} disabled={changed.length === 0}>
                Send to agent
              </Button>
            </div>
          </div>
        )}
      </Dialog>
    </div>
  );
}
