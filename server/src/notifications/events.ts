import type { EventDefinition } from "./types.js";
import { buildEmailHtml } from "./email-html.js";

/**
 * Registry of notification events. To add a new event:
 *   1. Add a new entry keyed by a stable event name.
 *   2. Define telegram/email message builders for the channels that apply.
 *   3. Trigger it with `notify("event_name", user, payload)`.
 */

// ─── Helpers ──────────────────────────────────────────────────────────────────

const APP_URL = process.env.APP_URL ?? "https://app.zhentan.me";
const BSC_EXPLORER = "https://bscscan.com/tx";

function shortAddr(addr: string) {
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

/**
 * Settlement kind for notification copy (#142). Explicit marker first
 * (swap rows carry the buy-token address); the pair label ("USDC → WBNB")
 * is the server's own display contract for swap rows, so it is a safe
 * fallback for callers holding narrow row selections.
 */
export function settlementKind(tx: {
  toTokenAddress?: string | null;
  token?: string | null;
}): "transfer" | "swap" {
  return tx.toTokenAddress || tx.token?.includes("→") ? "swap" : "transfer";
}

// ─── Payloads ─────────────────────────────────────────────────────────────────

export interface OnboardingCompletedPayload {
  displayName?: string;
}

export interface TxSentPayload {
  txId: string;
  amount: string;
  /** For swaps this is the pair label, e.g. "USDC → WBNB". */
  token: string;
  /** Settlement kind — copy says Swapped/Router instead of Sent/To (#142). */
  kind?: "transfer" | "swap";
  tokenLogoUrl?: string;
  amountUsd?: string;
  toAddress: string;
  txHash: string;
  riskScore?: number;
  /** True when the tx was auto-approved (no Telegram review step). */
  autoApproved?: boolean;
}

export interface TxReviewNeededPayload {
  txId: string;
  amount: string;
  /** For swaps this is the pair label, e.g. "USDC → WBNB". */
  token: string;
  /** Settlement kind — copy says swap/Router instead of transfer/To (#142). */
  kind?: "transfer" | "swap";
  tokenLogoUrl?: string;
  amountUsd?: string;
  toAddress: string;
  riskScore: number;
  reasons: string[];
}

export interface TxBlockedPayload {
  txId: string;
  amount: string;
  /** For swaps this is the pair label, e.g. "USDC → WBNB". */
  token: string;
  /** Settlement kind — copy says swap/Router instead of transfer/To (#142). */
  kind?: "transfer" | "swap";
  tokenLogoUrl?: string;
  amountUsd?: string;
  toAddress: string;
  riskScore: number;
  reasons: string[];
}

export interface TxRejectedPayload {
  txId: string;
  amount: string;
  /** For swaps this is the pair label, e.g. "USDC → WBNB". */
  token: string;
  /** Settlement kind — copy says swap/Router instead of transfer/To (#142). */
  kind?: "transfer" | "swap";
  tokenLogoUrl?: string;
  amountUsd?: string;
  toAddress: string;
  rejectReason?: string;
}

export interface TelegramLinkedPayload {
  username?: string;
  name?: string;
}

export interface TelegramUnlinkedPayload {
  /** "unlinked" = explicit removal; "relinked" = the Telegram moved to another account. */
  reason: "unlinked" | "relinked";
}

export interface TxReceivedPayload {
  amount: string;
  token: string;
  tokenLogoUrl?: string;
  amountUsd?: string;
  fromAddress: string;
  txHash: string;
}

// ─── Event registry ───────────────────────────────────────────────────────────

const ONBOARDING_TEMPLATE_ID = process.env.RESEND_ONBOARDING_TEMPLATE_ID;

export const EVENTS = {
  onboarding_completed: {
    name: "onboarding_completed",

    telegram: (user, payload) => {
      const name = payload.displayName || user.name || user.username || "there";
      return {
        text:
          `👋 Welcome to *Zhentan*, ${name}!\n\n` +
          `Your AI-secured wallet is ready. I'll review every transaction and ping you here when something needs a second look.`,
      };
    },

    email: (user, payload) => {
      if (!ONBOARDING_TEMPLATE_ID) return null;
      const name = payload.displayName || user.name || user.username || "there";
      return {
        subject: "Welcome to Zhentan",
        templateId: ONBOARDING_TEMPLATE_ID,
        variables: {
          NAME: name,
          USER_NAME: user.username ?? "",
          SAFE_ADDRESS: user.safe_address,
        },
      };
    },
  } satisfies EventDefinition<OnboardingCompletedPayload>,

  tx_sent: {
    name: "tx_sent",

    telegram: (_user, payload) => {
      const swap = payload.kind === "swap";
      return {
        text:
          `✅ *${swap ? "Swapped" : "Sent"}* — ${payload.amount} ${payload.token}\n` +
          `${swap ? "Via router" : "To"}: \`${payload.toAddress}\`\n` +
          (payload.riskScore != null ? `Risk: ${payload.riskScore}/100\n` : "") +
          `[View on BSCScan](${BSC_EXPLORER}/${payload.txHash})`,
      };
    },

    email: (_user, payload) => ({
      subject:
        payload.kind === "swap"
          ? `✓ Swap executed — ${payload.amount} ${payload.token}`
          : `✓ Sent — ${payload.amount} ${payload.token} executed`,
      html: buildEmailHtml({
        variant: "gold",
        badgeText: payload.autoApproved ? "Auto-Approved" : "Executed",
        title: payload.kind === "swap" ? "Swap executed" : "Transaction executed",
        subtitle: payload.autoApproved
          ? "Auto-approved by your personal detective and sent on-chain."
          : "Approved by you and your agent co-signer, and sent on-chain.",
        amount: payload.amount,
        token: payload.token,
        tokenLogoUrl: payload.tokenLogoUrl,
        amountUsd: payload.amountUsd,
        amountNegative: true,
        amountGold: true,
        kvRows: [
          { key: "Action", value: payload.kind === "swap" ? "Swap" : "Transfer" },
          {
            key: payload.kind === "swap" ? "Router" : "To",
            value: shortAddr(payload.toAddress),
            mono: true,
          },
          ...(payload.riskScore != null
            ? [{ key: "Risk score", value: "", riskScore: payload.riskScore }]
            : []),
          { key: "Tx hash", value: shortAddr(payload.txHash), mono: true },
        ],
        buttons: [
          {
            text: "View on BscScan ↗",
            href: `${BSC_EXPLORER}/${payload.txHash}`,
            variant: "primary",
          },
          { text: "Open in Zhentan", href: APP_URL, variant: "ghost" },
        ],
        footerLinks: [
          { text: "Open Zhentan", href: APP_URL },
          { text: "Receipt history", href: `${APP_URL}` },
        ],
        footerFine:
          "Confirmation emails are sent for every executed transaction. Manage which events email you in settings.",
      }),
    }),
  } satisfies EventDefinition<TxSentPayload>,

  tx_review_needed: {
    name: "tx_review_needed",
    // TG handled by notifyTelegram in queue.ts (keyboard buttons + messageId tracking)

    email: (_user, payload) => ({
      subject: `⏱ Review needed — ${payload.kind === "swap" ? "swap" : "outbound transfer"} ${payload.amount} ${payload.token}`,
      html: buildEmailHtml({
        variant: "warn",
        badgeText: "Review Needed",
        title: payload.kind === "swap" ? "A swap needs your approval" : "A transaction needs your approval",
        subtitle: `Zhentan paused this ${payload.kind === "swap" ? "swap" : "transfer"} because it triggered policy review. Approve or reject from your Telegram bot or the app.`,
        amount: payload.amount,
        token: payload.token,
        tokenLogoUrl: payload.tokenLogoUrl,
        amountUsd: payload.amountUsd,
        amountNegative: true,
        kvRows: [
          { key: "Action", value: payload.kind === "swap" ? "Swap" : "Transfer" },
          {
            key: payload.kind === "swap" ? "Router" : "To",
            value: shortAddr(payload.toAddress),
            mono: true,
          },
          { key: "Risk score", value: "", riskScore: payload.riskScore },
          { key: "Status", value: "Review", colorVariant: "warn" },
        ],
        reasons: { items: payload.reasons },
        buttons: [
          { text: "Approve in App", href: `${APP_URL}/review`, variant: "primary" },
          { text: "Reject", href: `${APP_URL}/review`, variant: "danger" },
        ],
        helper:
          "Or open your Telegram bot to approve or reject using the buttons sent there. This request expires in <b>24 hours</b>.",
        footerLinks: [
          { text: "Open Zhentan", href: APP_URL },
          { text: "Policy settings", href: `${APP_URL}/settings` },
        ],
        footerFine:
          "If you didn’t initiate this transfer, reject immediately and review your delegated signers. Zhentan never moves funds without your approval.",
      }),
    }),
  } satisfies EventDefinition<TxReviewNeededPayload>,

  tx_blocked: {
    name: "tx_blocked",
    // TG handled by notifyTelegram in queue.ts (keyboard buttons + messageId tracking)

    email: (_user, payload) => ({
      subject: `✕ ${payload.kind === "swap" ? "Swap" : "Transaction"} blocked — ${payload.amount} ${payload.token} held`,
      html: buildEmailHtml({
        variant: "danger",
        badgeText: "Auto-Blocked",
        title: payload.kind === "swap" ? "Swap blocked" : "Transaction blocked",
        subtitle: `Zhentan blocked this ${payload.kind === "swap" ? "swap" : "transfer"}. Your funds did not move and are safe in your Safe.`,
        amount: payload.amount,
        token: payload.token,
        tokenLogoUrl: payload.tokenLogoUrl,
        amountUsd: payload.amountUsd,
        amountNegative: true,
        amountStrikethrough: true,
        kvRows: [
          { key: "Action", value: payload.kind === "swap" ? "Swap" : "Transfer" },
          {
            key: payload.kind === "swap" ? "Router" : "Attempted to",
            value: shortAddr(payload.toAddress),
            mono: true,
          },
          { key: "Risk score", value: "", riskScore: payload.riskScore },
          { key: "Policy", value: "Auto-block", colorVariant: "danger" },
        ],
        reasons: { label: "REASONS", items: payload.reasons },
        buttons: [
          { text: "View report", href: `${APP_URL}/transactions`, variant: "dark" },
          { text: "Adjust policy", href: `${APP_URL}/settings`, variant: "ghost" },
        ],
        helper:
          "If this was you and the block is wrong, <b>tune the relevant policy rule</b> in Zhentan before retrying. Never share your seed phrase — we will not ask for it.",
        footerLinks: [
          { text: "Open Zhentan", href: APP_URL },
          { text: "Get help", href: `${APP_URL}/support` },
        ],
        footerFine:
          "This block was made by your active policy. Zhentan stores the full decision trace; open the report for the raw signals and the rule that fired.",
      }),
    }),
  } satisfies EventDefinition<TxBlockedPayload>,

  tx_rejected: {
    name: "tx_rejected",
    // TG handled by notify-resolve editing the original review message

    email: (_user, payload) => ({
      subject: `✕ ${payload.kind === "swap" ? "Swap" : "Transfer"} rejected — ${payload.amount} ${payload.token} held`,
      html: buildEmailHtml({
        variant: "danger",
        badgeText: "Rejected",
        title: payload.kind === "swap" ? "Swap rejected" : "Transaction rejected",
        subtitle: `This ${payload.kind === "swap" ? "swap" : "transfer"} was rejected. Your funds did not move and are safe in your Safe.`,
        amount: payload.amount,
        token: payload.token,
        tokenLogoUrl: payload.tokenLogoUrl,
        amountUsd: payload.amountUsd,
        amountNegative: true,
        amountStrikethrough: true,
        kvRows: [
          { key: "Action", value: payload.kind === "swap" ? "Swap" : "Transfer" },
          {
            key: payload.kind === "swap" ? "Router" : "Attempted to",
            value: shortAddr(payload.toAddress),
            mono: true,
          },
          ...(payload.rejectReason
            ? [{ key: "Reason", value: payload.rejectReason }]
            : []),
        ],
        buttons: [{ text: "Open in Zhentan", href: APP_URL, variant: "dark" }],
        helper:
          "No funds were moved. You can re-initiate the transaction from the app at any time.",
        footerLinks: [
          { text: "Open Zhentan", href: APP_URL },
          { text: "Get help", href: `${APP_URL}/support` },
        ],
        footerFine:
          "Zhentan stores the full decision trace; open the report for the raw signals and the rule that fired.",
      }),
    }),
  } satisfies EventDefinition<TxRejectedPayload>,
  telegram_linked: {
    name: "telegram_linked",

    // Greeting into the freshly bound chat — confirms which account it now speaks for.
    telegram: (user, payload) => ({
      text:
        `🔗 *Connected!* This Telegram is now linked to the Zhentan account ` +
        `*${user.username ?? user.name ?? shortAddr(user.safe_address)}*.\n\n` +
        `You'll get transaction alerts here${payload.username ? ` (@${payload.username})` : ""} ` +
        `and can approve or reject reviews from this chat.`,
    }),

    // The actionable alert to the account's EXISTING channels: if the owner
    // didn't do this, the revoke path is one click away (#134 §4).
    email: (user, payload) => {
      const identity = payload.username
        ? `@${payload.username}${payload.name ? ` (${payload.name})` : ""}`
        : payload.name ?? "a Telegram account";
      return {
        subject: "New Telegram linked to your Zhentan account",
        html: buildEmailHtml({
          variant: "gold",
          badgeText: "Telegram Linked",
          title: "A Telegram account was just linked",
          subtitle:
            `${identity} can now receive transaction alerts and approve or reject ` +
            `reviews for your account.`,
          kvRows: [
            { key: "Telegram", value: identity },
            { key: "Account", value: shortAddr(user.safe_address), mono: true },
          ],
          buttons: [
            {
              text: "Not you? Revoke access",
              href: `${APP_URL}/settings?revoke-telegram=1`,
              variant: "danger",
            },
            { text: "Open Zhentan", href: APP_URL, variant: "ghost" },
          ],
          helper:
            "If you didn't link this Telegram, <b>revoke it now</b> — until then it can approve transactions under review.",
          footerLinks: [{ text: "Open Zhentan", href: APP_URL }],
          footerFine:
            "You receive this alert whenever a Telegram account is linked to your Zhentan account.",
        }),
      };
    },
  } satisfies EventDefinition<TelegramLinkedPayload>,

  telegram_unlinked: {
    name: "telegram_unlinked",
    // No Telegram message — the channel this event describes is gone by definition.

    email: (user, payload) => ({
      subject: "Telegram disconnected from your Zhentan account",
      html: buildEmailHtml({
        variant: "warn",
        badgeText: "Telegram Removed",
        title: "Telegram was disconnected",
        subtitle:
          payload.reason === "relinked"
            ? "Your Telegram was connected to a different Zhentan account, so it no longer receives alerts or approves reviews for this one."
            : "This account no longer has a Telegram channel for alerts and review approvals.",
        kvRows: [
          { key: "Account", value: shortAddr(user.safe_address), mono: true },
          { key: "Screening", value: "Set to manual", colorVariant: "warn" },
        ],
        buttons: [
          { text: "Reconnect Telegram", href: `${APP_URL}/settings`, variant: "primary" },
          { text: "Open Zhentan", href: APP_URL, variant: "ghost" },
        ],
        helper:
          "Pending reviews can still be approved or rejected from your <b>Zhentan dashboard</b> at any time.",
        footerLinks: [{ text: "Open Zhentan", href: APP_URL }],
        footerFine:
          payload.reason === "relinked"
            ? "If you didn't make this change, reconnect your Telegram from settings and review your account access."
            : "You receive this alert whenever the Telegram link is removed from your account.",
      }),
    }),
  } satisfies EventDefinition<TelegramUnlinkedPayload>,

  tx_received: {
    name: "tx_received",

    telegram: (_user, payload) => ({
      text:
        `💰 *Received* — +${payload.amount} ${payload.token}\n` +
        `From: \`${payload.fromAddress}\`\n` +
        `[View on BSCScan](${BSC_EXPLORER}/${payload.txHash})`,
    }),

    email: (_user, payload) => ({
      subject: `💰 ${payload.amount} ${payload.token} received`,
      html: buildEmailHtml({
        variant: "safe",
        badgeText: "Received",
        title: `You received ${payload.amount} ${payload.token}`,
        subtitle:
          "Funds have been credited to your Zhentan account.",
        amount: payload.amount,
        token: payload.token,
        tokenLogoUrl: payload.tokenLogoUrl,
        amountUsd: payload.amountUsd,
        amountPositive: true,
        kvRows: [
          { key: "From", value: shortAddr(payload.fromAddress), mono: true },
          { key: "Tx hash", value: shortAddr(payload.txHash), mono: true },
        ],
        buttons: [
          {
            text: "View on BscScan ↗",
            href: `${BSC_EXPLORER}/${payload.txHash}`,
            variant: "primary",
          },
          { text: "Open in Zhentan", href: APP_URL, variant: "ghost" },
        ],
        footerLinks: [
          { text: "Open Zhentan", href: APP_URL },
          { text: "Notification settings", href: `${APP_URL}/settings` },
        ],
        footerFine:
          "You're receiving this because confirmed receipts are enabled for this account.",
      }),
    }),
  } satisfies EventDefinition<TxReceivedPayload>,
} as const;

export type EventName = keyof typeof EVENTS;
export type EventPayload<E extends EventName> =
  (typeof EVENTS)[E] extends EventDefinition<infer P> ? P : never;
