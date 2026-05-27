/**
 * Email HTML builder for Zhentan transaction notifications.
 * Implements the Zhentan Email Templates design.
 *
 * Light mode by default; dark mode via @media (prefers-color-scheme: dark)
 * with class-based overrides for clients that support it (Apple Mail, Outlook Mac, iOS).
 */

// ─── Design tokens ────────────────────────────────────────────────────────────
// All inlined as constants — email clients don't support CSS custom properties.

const GOLD = "#c49428";
const GOLD_2 = "#e8b93a";
const GOLD_3 = "#f5d060";
const GOLD_DEEP = "#8a6014";
const GOLD_SOFT = "#fdf6e3";

const SAFE_C = "#1f8a5b";
const SAFE_S = "#e6f4ed";
const WARN_C = "#c47410";
const WARN_S = "#fbeed3";
const DNGR_C = "#b3261e";
const DNGR_S = "#fbe9e7";
const INFO_C = "#5b3eb8";
const INFO_S = "#ece6fa";

const TEXT = "#1a1a1f";
const TEXT_2 = "#4d4a42";
const TEXT_DIM = "#8a8472";
const LINE = "#e6e3d9";

const FD = "'Space Grotesk',system-ui,-apple-system,Arial,sans-serif";
const FB = "'DM Sans',system-ui,-apple-system,Arial,sans-serif";
const FM = "'JetBrains Mono','Courier New',monospace";

// ─── Types ────────────────────────────────────────────────────────────────────

export type Variant = "safe" | "warn" | "danger" | "gold" | "info";
export type BtnVariant = "primary" | "dark" | "danger" | "ghost" | "safe";

export interface KvRow {
  key: string;
  /** Plain text value. If riskScore is set, a meter bar is rendered instead. */
  value: string;
  mono?: boolean;
  colorVariant?: "pos" | "warn" | "danger";
  /** When set, renders an inline risk meter bar instead of the value text. */
  riskScore?: number;
}

export interface EmailBtn {
  text: string;
  href: string;
  variant: BtnVariant;
}

export interface EmailOpts {
  variant: Variant;
  badgeText: string;
  title: string;
  subtitle: string;
  /** Amount hero — shown as a prominent number block. */
  amount: string;
  token: string;
  /** URL for the token logo (16px circle). Optional. */
  tokenLogoUrl?: string;
  /** USD equivalent, e.g. "$12.34". Shown below the amount when provided. */
  amountUsd?: string;
  /** Prepend "−" and show the amount as outgoing. */
  amountNegative?: boolean;
  /** Prepend "+" and show the amount as incoming (green). */
  amountPositive?: boolean;
  /** Strike through the amount in danger color (blocked / rejected). */
  amountStrikethrough?: boolean;
  /** Gold-tinted background for the amount block (executed tx). */
  amountGold?: boolean;
  kvRows: KvRow[];
  /** Reasons callout box (flagged / blocked). */
  reasons?: { label?: string; items: string[] };
  buttons: EmailBtn[];
  /** Small gray helper text below the buttons. Supports basic HTML (b, em). */
  helper?: string;
  footerLinks: Array<{ text: string; href: string }>;
  footerFine: string;
}

// ─── Variant maps ─────────────────────────────────────────────────────────────

const STRIP_BG: Record<Variant, string> = {
  safe: `linear-gradient(to right,${SAFE_C},#3ab981)`,
  warn: `linear-gradient(to right,${WARN_C},${GOLD_2})`,
  danger: `linear-gradient(to right,${DNGR_C},#e26a64)`,
  gold: `linear-gradient(to right,${GOLD},${GOLD_3},${GOLD_2})`,
  info: `linear-gradient(to right,${INFO_C},#9b7ee8)`,
};

const BADGE_BG: Record<Variant, string> = {
  safe: SAFE_S,
  warn: WARN_S,
  danger: DNGR_S,
  gold: GOLD_SOFT,
  info: INFO_S,
};

const BADGE_COLOR: Record<Variant, string> = {
  safe: SAFE_C,
  warn: WARN_C,
  danger: DNGR_C,
  gold: GOLD_DEEP,
  info: INFO_C,
};

const REASONS_BG: Record<Variant, string> = {
  safe: "#f0faf5",
  warn: "#fdf8ec",
  danger: "#fdf2f0",
  gold: GOLD_SOFT,
  info: "#f0ecfa",
};

const BTN_STYLE: Record<BtnVariant, string> = {
  primary: `background:linear-gradient(135deg,${GOLD} 0%,${GOLD_2} 100%);color:#1a1300;`,
  dark: `background:#0c0a14;color:${GOLD_3};`,
  danger: `background:#ffffff;color:${DNGR_C};border:1px solid #ebd2cf;`,
  ghost: `background:#ffffff;color:${TEXT_2};border:1px solid ${LINE};`,
  safe: `background:${SAFE_C};color:#ffffff;`,
};

// ─── Dark mode CSS ────────────────────────────────────────────────────────────
// Applied via <style> in <head>. Supported by Apple Mail, Outlook (Mac/iOS),
// Fastmail, Superhuman. Gmail does its own inversion instead.

const DARK_CSS = `
@media (prefers-color-scheme: dark) {
  .z-wrap { background-color: #08070d !important; }
  .z-card { background-color: #13101c !important; box-shadow: 0 1px 0 rgba(196,148,40,.06), 0 18px 48px -16px rgba(0,0,0,.7) !important; }
  .z-body { background-color: #13101c !important; }
  .z-amt { background: linear-gradient(180deg,#1a1525 0%,#13101c 100%) !important; border-color: rgba(196,148,40,.18) !important; }
  .z-amt.gold { background: linear-gradient(180deg,#2a2010 0%,#1a1408 100%) !important; border-color: rgba(196,148,40,.32) !important; }
  .z-amt-num { color: #f0e8d0 !important; }
  .z-amt-tk { color: #a89d80 !important; }
  .z-title { color: #f0e8d0 !important; }
  .z-sub { color: #a89d80 !important; }
  .z-helper { color: #a89d80 !important; }
  .z-kv-row td { border-bottom-color: rgba(196,148,40,.12) !important; }
  .z-kv-k { color: #7a6a4a !important; }
  .z-kv-v { color: #f0e8d0 !important; }
  .z-rsn { background: rgba(196,148,40,.06) !important; border-color: rgba(196,148,40,.18) !important; }
  .z-rsn-item { color: #d6cdb0 !important; }
  .z-risk-track { background: rgba(255,255,255,.08) !important; }
  .z-risk-num { color: #f0e8d0 !important; }
  .z-btn-ghost { background: transparent !important; color: #a89d80 !important; border-color: rgba(196,148,40,.22) !important; }
  .z-btn-danger { background: transparent !important; color: #e26a64 !important; border-color: rgba(226,106,100,.32) !important; }
  .z-foot { background-color: #0c0a14 !important; border-top-color: rgba(196,148,40,.12) !important; }
  .z-foot-fine { color: #7a6a4a !important; }
  .z-foot-meta { color: #5a5448 !important; }
}`;

// ─── HTML helpers ─────────────────────────────────────────────────────────────

function riskMeter(score: number): string {
  const pct = Math.min(100, Math.max(0, score));
  const color = score < 40 ? SAFE_C : score < 70 ? WARN_C : DNGR_C;
  return (
    `<span style="display:inline-flex;align-items:center;gap:8px;vertical-align:middle;">` +
    `<span class="z-risk-track" style="display:inline-block;width:80px;height:5px;` +
    `background:#ebe7d8;border-radius:99px;overflow:hidden;vertical-align:middle;">` +
    `<span style="display:block;width:${pct}%;height:100%;background:${color};border-radius:99px;"></span>` +
    `</span>` +
    `<span class="z-risk-num" style="font-family:${FM};font-size:12.5px;` +
    `color:${color};font-weight:600;">${score}&thinsp;/&thinsp;100</span>` +
    `</span>`
  );
}

function buildKvRows(rows: KvRow[]): string {
  return rows
    .map((row) => {
      const cellVal =
        row.riskScore != null ? riskMeter(row.riskScore) : row.value;

      let valColor = TEXT;
      let valFont = FB;
      let valSize = "13.5px";
      if (row.mono) {
        valFont = FM;
        valSize = "12.5px";
      }
      if (row.colorVariant === "pos") valColor = SAFE_C;
      if (row.colorVariant === "warn") valColor = WARN_C;
      if (row.colorVariant === "danger") valColor = DNGR_C;

      return (
        `<tr class="z-kv-row">` +
        `<td class="z-kv-k" style="padding:11px 0;color:${TEXT_DIM};` +
        `font-family:${FB};font-size:13.5px;width:140px;` +
        `vertical-align:top;border-bottom:1px solid ${LINE};">${row.key}</td>` +
        `<td class="z-kv-v" style="padding:11px 0;color:${valColor};` +
        `font-family:${valFont};font-size:${valSize};text-align:right;` +
        `word-break:break-word;border-bottom:1px solid ${LINE};">${cellVal}</td>` +
        `</tr>`
      );
    })
    .join("");
}

function buildReasons(
  reasons: { label?: string; items: string[] },
  variant: Variant
): string {
  const borderColor = BADGE_COLOR[variant];
  const bg = REASONS_BG[variant];
  const label =
    reasons.label ??
    (variant === "danger" ? "REASONS" : "WHY THIS WAS FLAGGED");

  const items = reasons.items
    .map(
      (item) =>
        `<tr><td class="z-rsn-item" style="padding:3px 0;font-size:13px;` +
        `color:${TEXT};line-height:1.5;font-family:${FB};">` +
        `<span style="display:inline-block;width:4px;height:4px;border-radius:50%;` +
        `background:${TEXT_DIM};margin-right:9px;vertical-align:middle;margin-bottom:1px;"></span>` +
        `${item}</td></tr>`
    )
    .join("");

  return (
    `<table width="100%" cellpadding="0" cellspacing="0" class="z-rsn"` +
    ` style="background:${bg};border:1px solid ${LINE};border-left:3px solid ${borderColor};` +
    `border-radius:6px;margin-bottom:22px;border-collapse:separate;">` +
    `<tr><td style="padding:12px 14px;">` +
    `<div style="font-family:${FM};font-size:9.5px;color:${TEXT_DIM};` +
    `letter-spacing:.14em;text-transform:uppercase;margin-bottom:7px;">${label}</div>` +
    `<table cellpadding="0" cellspacing="0" width="100%">${items}</table>` +
    `</td></tr></table>`
  );
}

function buildButtons(buttons: EmailBtn[]): string {
  if (buttons.length === 0) return "";

  const btnEl = (b: EmailBtn, extraStyle = "") =>
    `<a href="${b.href}" class="z-btn-${b.variant}"` +
    ` style="display:block;padding:13px 18px;border-radius:8px;` +
    `font-family:${FD};font-weight:700;font-size:13.5px;letter-spacing:.01em;` +
    `text-align:center;text-decoration:none;box-sizing:border-box;` +
    `${BTN_STYLE[b.variant]}${extraStyle}">${b.text}</a>`;

  if (buttons.length === 1) {
    return (
      `<table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:22px;">` +
      `<tr><td>${btnEl(buttons[0])}</td></tr></table>`
    );
  }

  return (
    `<table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:22px;">` +
    `<tr>` +
    `<td style="width:50%;padding-right:5px;">${btnEl(buttons[0])}</td>` +
    `<td style="width:50%;padding-left:5px;">${btnEl(buttons[1])}</td>` +
    `</tr></table>`
  );
}

// ─── Main builder ─────────────────────────────────────────────────────────────

export function buildEmailHtml(opts: EmailOpts): string {
  const appUrl = process.env.APP_URL ?? "https://app.zhentan.me";
  const iconUrl = `${appUrl}/logo.png`;
  const vc = BADGE_COLOR[opts.variant];

  // Amount number style
  let amtNumColor = TEXT;
  let amtNumExtra = "";
  if (opts.amountPositive) {
    amtNumColor = SAFE_C;
  }
  if (opts.amountStrikethrough) {
    amtNumColor = DNGR_C;
    amtNumExtra =
      "text-decoration:line-through;" +
      "text-decoration-color:rgba(179,38,30,.42);" +
      "text-decoration-thickness:2px;";
  }
  const amtPrefix = opts.amountPositive ? "+" : opts.amountNegative ? "−" : "";
  const amtBlockBg = opts.amountGold
    ? "linear-gradient(180deg,#fdf6e3 0%,#f8edc7 100%)"
    : "linear-gradient(180deg,#fbf9f1 0%,#f5f3ea 100%)";
  const amtBlockBorder = opts.amountGold ? "#ecdca6" : LINE;
  const amtGoldClass = opts.amountGold ? " gold" : "";

  // KV section
  const kvSection =
    opts.kvRows.length > 0
      ? `<table width="100%" cellpadding="0" cellspacing="0"` +
        ` style="border-top:1px solid ${LINE};margin-bottom:22px;">` +
        buildKvRows(opts.kvRows) +
        `</table>`
      : "";

  // Reasons section
  const reasonsSection = opts.reasons
    ? buildReasons(opts.reasons, opts.variant)
    : "";

  // Helper text
  const helperSection = opts.helper
    ? `<p class="z-helper" style="font-size:12.5px;color:${TEXT_2};` +
      `line-height:1.55;margin:0 0 18px;">${opts.helper}</p>`
    : "";

  // Footer links
  const footerLinks = opts.footerLinks
    .map(
      (l) =>
        `<a href="${l.href}" style="font-family:${FD};font-size:12px;` +
        `font-weight:600;color:${GOLD};text-decoration:none;">${l.text}</a>`
    )
    .join(
      `<span style="color:${TEXT_DIM};margin:0 7px;opacity:.6;">&middot;</span>`
    );

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light dark">
<meta name="supported-color-schemes" content="light dark">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@700;800&family=DM+Sans:wght@400;500&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">
<style>${DARK_CSS}</style>
</head>
<body style="margin:0;padding:0;background:#eef0ee;font-family:${FB};">

<!-- Outer wrapper -->
<table class="z-wrap" width="100%" cellpadding="0" cellspacing="0" border="0"
  style="background:#eef0ee;padding:32px 16px 40px;">
<tr><td align="center">

<!-- Mail card -->
<table class="z-card" width="600" cellpadding="0" cellspacing="0" border="0"
  style="max-width:600px;background:#ffffff;border-radius:14px;
  overflow:hidden;border-collapse:separate;
  box-shadow:0 1px 0 rgba(0,0,0,.04),0 18px 48px -16px rgba(20,18,10,.18),0 4px 12px -2px rgba(20,18,10,.06);">

  <!-- ── Header ── -->
  <tr>
    <td style="background:linear-gradient(135deg,#0c0a14 0%,#14101c 55%,#1a1322 100%);
      padding:20px 28px 22px;border-bottom:1px solid #1f1a2a;">
      <table cellpadding="0" cellspacing="0" border="0" width="100%">
        <tr>
          <td style="vertical-align:middle;width:44px;">
            <img src="${iconUrl}" width="44" height="44" alt="Zhentan"
              style="display:block;border-radius:10px;border:0;
              filter:drop-shadow(0 0 10px rgba(245,208,96,.35)) drop-shadow(0 2px 4px rgba(0,0,0,.4));">
          </td>
          <td style="vertical-align:middle;padding-left:12px;">
            <div style="font-family:${FD};font-weight:800;font-size:19px;
              letter-spacing:-.01em;line-height:1;color:${GOLD};">Zhentan</div>
            <div style="font-family:${FM};font-size:9px;color:#a89d80;
              letter-spacing:.22em;text-transform:uppercase;margin-top:3px;">You personal detective</div>
          </td>
          <td style="vertical-align:middle;text-align:right;">
            <span style="display:inline-block;font-family:${FM};font-size:9.5px;
              color:#a89d80;letter-spacing:.16em;text-transform:uppercase;
              padding:5px 10px;border:1px solid rgba(196,148,40,.22);border-radius:99px;">
              <span style="display:inline-block;width:5px;height:5px;border-radius:50%;
                background:${GOLD_2};box-shadow:0 0 6px ${GOLD_2};
                vertical-align:middle;margin-right:5px;margin-bottom:1px;"></span><span style="vertical-align:middle;">BNB&nbsp;Chain</span>
            </span>
          </td>
        </tr>
      </table>
    </td>
  </tr>

  <!-- ── Status strip ── -->
  <tr>
    <td height="3" style="height:3px;font-size:0;line-height:0;
      background:${STRIP_BG[opts.variant]};mso-line-height-rule:exactly;">&nbsp;</td>
  </tr>

  <!-- ── Body ── -->
  <tr>
    <td class="z-body" style="padding:28px 28px 26px;background:#ffffff;">

      <!-- Badge -->
      <span style="display:inline-block;padding:6px 12px 6px 10px;border-radius:6px;
        background:${BADGE_BG[opts.variant]};color:${vc};
        font-family:${FD};font-size:11px;font-weight:700;
        letter-spacing:.14em;text-transform:uppercase;">
        <span style="display:inline-block;width:7px;height:7px;border-radius:50%;
          background:${vc};vertical-align:middle;margin-right:7px;margin-bottom:1px;"></span><span style="vertical-align:middle;">${opts.badgeText}</span>
      </span>

      <!-- Title -->
      <h1 class="z-title" style="font-family:${FD};font-size:24px;font-weight:700;
        letter-spacing:-.02em;line-height:1.18;color:${TEXT};margin:16px 0 4px;">
        ${opts.title}
      </h1>

      <!-- Subtitle -->
      <p class="z-sub" style="font-size:13.5px;color:${TEXT_2};
        line-height:1.55;margin:0 0 22px;">${opts.subtitle}</p>

      <!-- Amount block -->
      <table class="z-amt${amtGoldClass}" width="100%" cellpadding="0" cellspacing="0"
        style="background:${amtBlockBg};border:1px solid ${amtBlockBorder};
        border-radius:10px;margin-bottom:22px;border-collapse:separate;">
        <tr>
          <td style="padding:18px 20px;">
            <table width="100%" cellpadding="0" cellspacing="0">
              <tr>
                <td>
                  <span class="z-amt-num" style="font-family:${FD};font-weight:800;
                    font-size:34px;letter-spacing:-.025em;line-height:1;
                    color:${amtNumColor};${amtNumExtra}">
                    ${amtPrefix}${opts.amount}</span>
                  ${opts.tokenLogoUrl
                    ? `<img src="${opts.tokenLogoUrl}" width="18" height="18" alt="${opts.token}"
                        style="display:inline-block;width:18px;height:18px;border-radius:50%;
                        vertical-align:middle;margin-left:10px;margin-bottom:2px;border:0;">`
                    : ""}
                  <span class="z-amt-tk" style="font-family:${FM};font-size:13px;
                    color:${TEXT_2};letter-spacing:.04em;font-weight:500;
                    margin-left:${opts.tokenLogoUrl ? "5px" : "10px"};">${opts.token}</span>
                </td>
              </tr>
              ${opts.amountUsd
                ? `<tr><td style="padding-top:5px;">
                    <span style="font-family:${FB};font-size:12.5px;color:${TEXT_DIM};">
                      ${opts.amountUsd}
                    </span>
                  </td></tr>`
                : ""}
            </table>
          </td>
        </tr>
      </table>

      ${kvSection}
      ${reasonsSection}
      ${buildButtons(opts.buttons)}
      ${helperSection}

    </td>
  </tr>

  <!-- ── Footer ── -->
  <tr>
    <td class="z-foot" style="padding:18px 28px 22px;background:#fafaf6;
      border-top:1px solid ${LINE};">
      <table width="100%" cellpadding="0" cellspacing="0">
        <tr>
          <td>${footerLinks}</td>
          <td style="text-align:right;">
            <span class="z-foot-meta" style="font-family:${FM};font-size:10px;
              color:${TEXT_DIM};letter-spacing:.06em;">
              Secured by Safe&thinsp;&middot;&thinsp;BNB Chain
            </span>
          </td>
        </tr>
        <tr>
          <td colspan="2" style="padding-top:10px;">
            <p class="z-foot-fine" style="font-size:11px;color:${TEXT_DIM};
              line-height:1.5;margin:0;">${opts.footerFine}</p>
          </td>
        </tr>
      </table>
    </td>
  </tr>

</table>
<!-- End mail card -->

</td></tr>
</table>

</body>
</html>`;
}
