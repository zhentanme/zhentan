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
import { Input } from "@/components/ui/Input";
import { Pill } from "@/components/ui/Pill";
import { InlineError } from "@/components/ui/InlineError";
import { useToast } from "@/components/ui/Toast";

const THRESHOLD_PRESETS = [
  { key: "strict", label: "Strict", approve: 20, block: 50 },
  { key: "balanced", label: "Balanced", approve: 40, block: 70 },
  { key: "relaxed", label: "Relaxed", approve: 40, block: 85 },
] as const;

/** riskThresholdApprove server cap — mirrors RISK_THRESHOLD_APPROVE_CAP. */
const APPROVE_CAP = 40;

function LimitRow({
  label,
  value,
  isDefault,
}: {
  label: string;
  value: string;
  isDefault: boolean;
}) {
  return (
    <div className="flex items-center justify-between py-2 text-sm">
      <span className="text-muted-foreground/85">{label}</span>
      <span className="flex items-center gap-2 font-medium text-foreground">
        {value}
        {!isDefault && (
          <Pill tone="neutral" size="sm">
            Custom
          </Pill>
        )}
      </span>
    </div>
  );
}

function minutesLeft(expiresAt: string): number {
  return Math.max(0, Math.ceil((new Date(expiresAt).getTime() - Date.now()) / 60_000));
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

  // ── Edit dialog state (strings so fields can be cleared while typing) ──
  const [form, setForm] = useState<Record<string, string>>({});
  const [learningEnabled, setLearningEnabled] = useState(true);
  const [unknownAction, setUnknownAction] = useState<ScreeningLimits["unknownRecipientAction"]>("review");

  const openEdit = () => {
    if (!limits) return;
    setForm({
      maxSingleTx: limits.maxSingleTx,
      maxHourlyVolume: limits.maxHourlyVolume,
      maxDailyVolume: limits.maxDailyVolume,
      maxWeeklyVolume: limits.maxWeeklyVolume,
      maxDailyTxCount: String(limits.maxDailyTxCount),
      riskThresholdApprove: String(limits.riskThresholdApprove),
      riskThresholdBlock: String(limits.riskThresholdBlock),
    });
    setLearningEnabled(limits.learningEnabled);
    setUnknownAction(limits.unknownRecipientAction);
    setError(null);
    setEditOpen(true);
  };

  const set = (key: string) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [key]: e.target.value }));

  const activePreset = THRESHOLD_PRESETS.find(
    (p) =>
      String(p.approve) === form.riskThresholdApprove &&
      String(p.block) === form.riskThresholdBlock
  )?.key;

  const buildPatch = (): LimitsProposalPatch => {
    if (!limits) return {};
    const patch: LimitsProposalPatch = {};
    if (form.maxSingleTx !== limits.maxSingleTx) patch.maxSingleTx = form.maxSingleTx;
    if (form.maxHourlyVolume !== limits.maxHourlyVolume) patch.maxHourlyVolume = form.maxHourlyVolume;
    if (form.maxDailyVolume !== limits.maxDailyVolume) patch.maxDailyVolume = form.maxDailyVolume;
    if (form.maxWeeklyVolume !== limits.maxWeeklyVolume) patch.maxWeeklyVolume = form.maxWeeklyVolume;
    if (form.maxDailyTxCount !== String(limits.maxDailyTxCount))
      patch.maxDailyTxCount = Number(form.maxDailyTxCount);
    if (form.riskThresholdApprove !== String(limits.riskThresholdApprove))
      patch.riskThresholdApprove = Number(form.riskThresholdApprove);
    if (form.riskThresholdBlock !== String(limits.riskThresholdBlock))
      patch.riskThresholdBlock = Number(form.riskThresholdBlock);
    if (unknownAction !== limits.unknownRecipientAction) patch.unknownRecipientAction = unknownAction;
    if (learningEnabled !== limits.learningEnabled) patch.learningEnabled = learningEnabled;
    return patch;
  };

  const submit = async () => {
    const patch = buildPatch();
    if (Object.keys(patch).length === 0) {
      setError("Nothing changed");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const proposal = await api.settings.propose(safeAddress, patch);
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

  const rows = useMemo(() => {
    if (!limits) return [];
    const d = defaults;
    return [
      { label: "Single transaction", value: `$${limits.maxSingleTx}`, def: d?.maxSingleTx === limits.maxSingleTx },
      { label: "Hourly volume", value: `$${limits.maxHourlyVolume}`, def: d?.maxHourlyVolume === limits.maxHourlyVolume },
      { label: "Daily volume", value: `$${limits.maxDailyVolume}`, def: d?.maxDailyVolume === limits.maxDailyVolume },
      { label: "Weekly volume", value: `$${limits.maxWeeklyVolume}`, def: d?.maxWeeklyVolume === limits.maxWeeklyVolume },
      { label: "Daily tx count", value: String(limits.maxDailyTxCount), def: d?.maxDailyTxCount === limits.maxDailyTxCount },
      {
        label: "Risk thresholds",
        value: `approve < ${limits.riskThresholdApprove} · block ≥ ${limits.riskThresholdBlock}`,
        def:
          d?.riskThresholdApprove === limits.riskThresholdApprove &&
          d?.riskThresholdBlock === limits.riskThresholdBlock,
      },
      { label: "Unknown recipient", value: limits.unknownRecipientAction, def: d?.unknownRecipientAction === limits.unknownRecipientAction },
      {
        // Hour/day windows are display-only here — editing arrays is a chat
        // ask ("only allow weekday business hours"); the agent applies it.
        label: "Allowed hours (UTC)",
        value: limits.allowedHoursUTC.length === 0 ? "any" : `${Math.min(...limits.allowedHoursUTC)}:00–${Math.max(...limits.allowedHoursUTC)}:00`,
        def: JSON.stringify(d?.allowedHoursUTC) === JSON.stringify(limits.allowedHoursUTC),
      },
      {
        label: "Allowed days",
        value:
          limits.allowedDaysUTC.length === 0
            ? "any"
            : limits.allowedDaysUTC.map((day) => ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][day]).join(", "),
        def: JSON.stringify(d?.allowedDaysUTC) === JSON.stringify(limits.allowedDaysUTC),
      },
      { label: "Pattern learning", value: limits.learningEnabled ? "on" : "off", def: d?.learningEnabled === limits.learningEnabled },
    ];
  }, [limits, defaults]);

  if (!limits) return null;

  return (
    <div className="rounded-md bg-card overflow-hidden shadow-[0_20px_50px_-38px_rgba(0,0,0,0.7)]">
      <div className="flex items-center gap-3.5 p-4">
        <div className="w-9 h-9 rounded-md flex items-center justify-center shrink-0 bg-foreground/6 text-muted-foreground/80">
          <SlidersHorizontal className="h-[17px] w-[17px]" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
            <h3 className="text-sm font-semibold">Screening limits</h3>
            {pending && (
              <Pill tone="neutral" size="sm" pulse>
                Awaiting Telegram
              </Pill>
            )}
          </div>
          <div className="text-xs text-muted-foreground/85 mt-1 leading-relaxed">
            Changes are proposed here and confirmed with your agent in Telegram —
            the app alone can never loosen your screening.
          </div>
        </div>
        <Button variant="secondary" size="sm" onClick={openEdit} disabled={Boolean(pending)}>
          Edit
        </Button>
      </div>

      <div className="px-4 pb-4 divide-y divide-border/60">
        {rows.map((r) => (
          <LimitRow key={r.label} label={r.label} value={r.value} isDefault={Boolean(r.def)} />
        ))}
      </div>

      {pending && (
        <div className="mx-4 mb-4 flex items-start gap-2.5 rounded-md bg-gold/8 px-3.5 py-3 text-xs text-muted-foreground leading-relaxed">
          <Clock3 className="h-4 w-4 shrink-0 text-gold mt-0.5" />
          <span>
            A settings change is awaiting confirmation in Telegram — expires in{" "}
            {minutesLeft(pending.expiresAt)} min. Ask your agent to confirm or reject it.
          </span>
        </div>
      )}

      <Dialog open={editOpen} onClose={() => setEditOpen(false)} title="Propose settings change">
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <Input label="Single tx" suffix="$" inputMode="decimal" value={form.maxSingleTx ?? ""} onChange={set("maxSingleTx")} />
            <Input label="Hourly volume" suffix="$" inputMode="decimal" value={form.maxHourlyVolume ?? ""} onChange={set("maxHourlyVolume")} />
            <Input label="Daily volume" suffix="$" inputMode="decimal" value={form.maxDailyVolume ?? ""} onChange={set("maxDailyVolume")} />
            <Input label="Weekly volume" suffix="$" inputMode="decimal" value={form.maxWeeklyVolume ?? ""} onChange={set("maxWeeklyVolume")} />
          </div>
          <Input label="Daily transaction count" inputMode="numeric" value={form.maxDailyTxCount ?? ""} onChange={set("maxDailyTxCount")} />

          <div className="space-y-1.5">
            <label className="text-sm font-medium text-muted-foreground">Risk thresholds</label>
            <div className="flex gap-2">
              {THRESHOLD_PRESETS.map((p) => (
                <button
                  key={p.key}
                  type="button"
                  onClick={() =>
                    setForm((f) => ({
                      ...f,
                      riskThresholdApprove: String(p.approve),
                      riskThresholdBlock: String(p.block),
                    }))
                  }
                  className={clsx(
                    "rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
                    activePreset === p.key
                      ? "bg-gold/15 text-gold"
                      : "bg-foreground/6 text-muted-foreground hover:bg-foreground/10"
                  )}
                >
                  {p.label}
                </button>
              ))}
            </div>
            <div className="grid grid-cols-2 gap-3 pt-1">
              <Input
                label={`Auto-approve below (max ${APPROVE_CAP})`}
                inputMode="numeric"
                value={form.riskThresholdApprove ?? ""}
                onChange={set("riskThresholdApprove")}
              />
              <Input
                label="Block at or above"
                inputMode="numeric"
                value={form.riskThresholdBlock ?? ""}
                onChange={set("riskThresholdBlock")}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium text-muted-foreground">Unknown recipient</label>
            <div className="flex gap-2">
              {(["approve", "review", "block"] as const).map((action) => (
                <button
                  key={action}
                  type="button"
                  onClick={() => setUnknownAction(action)}
                  className={clsx(
                    "rounded-md px-3 py-1.5 text-xs font-medium capitalize transition-colors",
                    unknownAction === action
                      ? "bg-gold/15 text-gold"
                      : "bg-foreground/6 text-muted-foreground hover:bg-foreground/10"
                  )}
                >
                  {action}
                </button>
              ))}
            </div>
          </div>

          <label className="flex items-center justify-between text-sm text-muted-foreground">
            Pattern learning
            <input
              type="checkbox"
              checked={learningEnabled}
              onChange={(e) => setLearningEnabled(e.target.checked)}
              className="h-4 w-4 accent-current"
            />
          </label>

          {error && <InlineError>{error}</InlineError>}

          <div className="flex justify-end gap-2 pt-1">
            <Button variant="secondary" onClick={() => setEditOpen(false)} disabled={saving}>
              Cancel
            </Button>
            <Button onClick={submit} loading={saving}>
              Send to agent
            </Button>
          </div>
        </div>
      </Dialog>
    </div>
  );
}
