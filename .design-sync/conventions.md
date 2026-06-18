# Zhentan UI — how to build with it

Zhentan is a **dark-canonical, gold + ink** design system. Styling is **Tailwind utility classes backed by CSS variables** — there are no CSS-module class maps and no style props; you compose layout with the utility classes below and the components carry their own look.

## Setup (required)
- **Wrap your app/screen root in `className="dark"`.** The components read ink + gold tokens from the `.dark` scope; the bare `:root` is a light parchment fallback, so without `dark` everything renders washed out. No React provider/context is needed.
- Put `bg-background` + `text-foreground` on that root for the canonical ink canvas.
- Render `<BrandMarkSprite />` once near the root if you use `<TwinTick />` — it injects the gold gradient the mark fills with.

## The styling idiom (real class vocabulary)
- **Surfaces:** `bg-background` (ink-900 canvas), `bg-card` (ink-800 panel), subtle overlays `bg-foreground/[0.04]` … `bg-foreground/8`.
- **Text:** `text-foreground`, `text-muted-foreground` (secondary), `text-foreground/80` (dim).
- **Brand accent — gold, use sparingly:** `text-gold`, `bg-gold`, `border-gold/25`, and `gradient-text` (gold gradient, for hero numbers/wordmark). Gold = brand only.
- **Transaction state — NOT brand:** `text-safe`/`bg-safe` (green = pass/executed), `text-watch`/`bg-watch` (amber = review/pending), `text-danger`/`bg-danger` (red = block/rejected).
- **Borders:** `border-border` (faint neutral hairline), `border-gold/25` for an accent edge.
- **Radii:** `rounded-md` (14, buttons/inputs/cards) · `rounded-lg` (22, big panels) · `rounded-pill` (badges, dots, avatars).
- **Type:** `font-sans` = Manrope (default UI), `font-mono` = JetBrains Mono (addresses, hashes, amounts, status labels — pair with `tabular-nums`). `eyebrow` = a mono, uppercase, letter-spaced section label.

## Components
- **Controls:** `Button` (`variant="primary|secondary|ghost"`, `loading`), `Input` (`label`, `suffix`), `Dialog` (`open`, `onClose`, `title`; bottom-sheet on mobile).
- **Surfaces / feedback:** `Card`, `Skeleton`, `Spinner`, `StatusBadge` (`status="pending|in_review|executed|rejected"`).
- **Brand / motion:** `TwinTick` (+ `BrandMarkSprite`), and the transaction-state animations `ExecutedAnimation`, `ReviewAnimation`, `RejectedAnimation` (`size`, `loop`).

## Where the truth lives
The bound stylesheet (`styles.css` and its `@import`s) defines every token and utility; read it before inventing class names. Per-component API + usage is in each `components/<group>/<Name>/<Name>.prompt.md`.

## One idiomatic snippet
```tsx
import { Card, Button, StatusBadge } from "zhentan-client";

<div className="dark bg-background p-6 font-sans">
  <Card className="p-5">
    <p className="eyebrow text-muted-foreground">Payment</p>
    <p className="mt-2 text-3xl font-mono font-semibold gradient-text tabular-nums">$120.00</p>
    <div className="mt-4 flex items-center justify-between gap-3">
      <StatusBadge status="in_review" />
      <Button variant="primary">Approve</Button>
    </div>
  </Card>
</div>
```
