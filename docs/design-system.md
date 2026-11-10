# Neutral visual reference

Issue #248 establishes Home as the reference for the design agreed in #246.
`frontend/src/app.css` owns the tokens and shared Tailwind utilities (ADR-0006).
Use existing Shadcn/Bits primitives for controls and overlays (ADR-0007).
Later stages can implement directly from this reference.

## Palette and roles

| Role / CSS token | Light | Dark |
| --- | --- | --- |
| Page, canvas / `background`, `app-bg` | `#ffffff` | `#1c1c1c` |
| Overlay or existing card / `card`, `popover` | `#ffffff` | `#232323` |
| Hover, neutral selection / `muted` | `#f0f0f1` | `#2b2b2b` |
| Primary text / `foreground` | `#18181b` | `#f1f1f1` |
| Secondary text / `muted-foreground` | `#666666` | `#a3a3a3` |
| Divider / `border`, `input` | `#e5e5e5` | `#393939` |
| Neutral action / `accent` | `#404040` | `#d4d4d8` |
| Solid action / `accent-fill` | `#404040` | `#52525b` |
| Focus / `ring` | `#2563eb` | `#2563eb` |
| Negative, error / `destructive-rgb` | `193 74 50` | `220 139 125` |
| Incoming, positive / `positive-rgb` | `26 138 63` | `115 174 131` |
| Local Entry / `local-rgb` | `99 102 241` | `153 158 205` |
| Sync ready / busy / waiting | `#15803d` / `#2563eb` / `#b91c1c` | `#4ade80` / `#60a5fa` / `#f87171` |

Dark semantic foregrounds retain 90% alpha; surfaces and borders use independent
alphas. Category colors retain their sources in `frontend/src/lib/theme.ts`.
On Home, Category color appears in the small dot; Budget labels and positive/zero
balances use neutral text. Negative Budgets retain both their minus sign and
destructive color. Never use color alone for state. Shadcn `primary` aliases
`accent`; `secondary` aliases `muted`; popover and foreground aliases remain intact.

## Type, density, and interaction

| Role | Token / value |
| --- | --- |
| UI, headings, dates, ordinary labels | `font-sans`: system UI stack |
| Money and amount inputs | `font-mono`: locally hosted Roboto Mono, tabular numerals |
| Secondary labels | `text-secondary`: 12px |
| Body and Budget/Entry amounts | `text-body`: 14px |
| Default editable field text | `text-field`: 16px; amount editors may use larger money text |
| Page title | `text-title`: 28px, semibold |
| Primary balance | `text-balance`: 36px, medium |
| Spacing | `space-1/2/3/4/6/8`: 4 / 8 / 12 / 16 / 24 / 32px |
| Control target | `control-size`: at least 44 × 44px |
| Focus | `focus-width`: 2px outline, 2px offset |
| Radii | `radius-sm/md/lg/xl`: 4 / 6 / 8 / 12px; `radius-pill` for existing pills |
| Elevation | `shadow-card`: none; `shadow-sheet`: modest 32px overlay shadow |

Keep the root rem size at the browser default. Body text uses 14px without
shrinking rem-based touch targets. Home uses 12px vertical row padding, 16px outer
gutters (24px wide-screen gutters), and 32px section/column gaps. These sizes do
not change with width. At 1024px the balance and Latest entries occupy the primary
3fr column; Category budgets occupy the adjacent 2fr column. Narrow screens stack
the same sections and show every Category in a vertical list. Wrap long names and
large monetary values; never shrink the text to fit.

`control-link` supplies neutral hover and visible focus on a 44px target.
`SectionHeader` uses sentence-case system text; `flush` aligns Home headings with
their section edges. The page header wraps controls when text grows. Reduced
motion stops repeated shimmer and overlay/interaction animation. The existing
shimmer remains the cold-loading treatment at normal motion settings.

## Component and state reference

| Consumer / state | Presentation and meaning |
| --- | --- |
| Home ready | Plain left-aligned On hand; secondary date, greeting and update time; flat Latest entries and Category budgets with dividers |
| `Money` | Configured currency, tabular digits, direct value without count-up; wraps long values; negative sign preserved |
| `EntryRow` | System-text date, Category stripe and existing split grouping, description, aligned Money; Incoming sign/color and local marker preserved |
| Empty Entries | “No entries yet.”; navigation remains available |
| Cold / no confirmed snapshot | Existing shimmer; no financial zero or speculative balance is substituted |
| Missing Category budget | “Unavailable”; a confirmed zero remains a formatted zero |
| Last-confirmed / stale | Existing value stays at normal contrast with “Balances awaiting sync” |
| Local Entry | Entry remains visible with “Not yet synced” marker; balances remain sheet-sourced |
| Failed initial read | Existing app error/recovery controls plus cold placeholders until a confirmed snapshot exists |
| Controls | Neutral hover/selected surfaces, visible focus, disabled state, semantic errors; existing Bits focus management retained |

See the [reviewed screenshots and validation](pr/248/README.md).

## Migration boundaries

`font-display` remains a compatibility alias to system sans. Old shared card and
hero roles remain available with flat surfaces. Money/EntryRow consumers in
Entries, Summary and Statistics retain their data, signs and interactions.
Category pickers and Incoming split bands retain semantic tinting for their own
stage. Existing form-specific field sizes are also migrated by that stage.

Home does not change latest-entry selection, routing, sheet order, calendar rules,
financial derivation, queue ownership or ADR-0018 status meaning. Navigation shell,
Add placement and overlay geometry belong to #249; Entries browsing to #250;
editing-form structure belongs to its subsequent stage. Their current geometry
appears in the screenshots as migration context.
