/**
 * Shadow-screening divergence comparator (D2) — pure, env-free. The inline
 * decision (persisted on the transaction at proposal) is compared against
 * the runtime's shadow decision; anything but exact agreement is flagged
 * with its cause. Divergence ~zero over a representative window is the D3
 * cutover gate, so this must never paper over differences.
 */

export interface InlineDecision {
  riskScore: number | null;
  riskVerdict: string | null;
  riskReasons: string[] | null;
}

export interface ShadowDecision {
  riskScore: number;
  verdict: string;
  reasons: string[];
  triggeredRules?: string[];
}

export interface Comparison {
  agree: boolean;
  causes: string[];
}

export function compareScreenDecisions(
  inline: InlineDecision,
  shadow: ShadowDecision
): Comparison {
  const causes: string[] = [];

  if (inline.riskVerdict !== shadow.verdict) {
    causes.push(`verdict: inline=${inline.riskVerdict ?? "none"} shadow=${shadow.verdict}`);
  }
  if (inline.riskScore !== shadow.riskScore) {
    causes.push(`score: inline=${inline.riskScore ?? "none"} shadow=${shadow.riskScore}`);
  }

  const inlineReasons = inline.riskReasons ?? [];
  if (inlineReasons.length !== shadow.reasons.length) {
    causes.push(`reasons: count inline=${inlineReasons.length} shadow=${shadow.reasons.length}`);
  } else {
    for (let i = 0; i < inlineReasons.length; i++) {
      if (inlineReasons[i] !== shadow.reasons[i]) {
        causes.push(`reasons[${i}]: inline="${inlineReasons[i]}" shadow="${shadow.reasons[i]}"`);
      }
    }
  }

  return { agree: causes.length === 0, causes };
}
