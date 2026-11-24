# Money Sheet design

Use this guide before changing frontend UI. Match the existing surface, component, and interaction patterns in the view you are editing. For current token values and class definitions, consult [app.css](frontend/src/app.css). Styling and primitive policy live in [ADR-0006](docs/adr/0006-tailwind-css-usage-rules.md) and [ADR-0007](docs/adr/0007-prefer-shadcn-over-bespoke-components.md).

## Color and surfaces

Use semantic Tailwind utilities mapped by `@theme inline` in `app.css`. The same utilities follow the Light, Dark, and System preferences. The two dark activation paths, System dark and explicit `.theme-dark`, share the `--dark-*` token values. Category colors that are resolved in Svelte follow `darkMode.current`. Browser chrome colors have corresponding startup definitions in [index.html](frontend/index.html) and are updated by the [theme preference store](frontend/src/lib/darkMode.svelte.ts).

| Role | Current pattern |
| --- | --- |
| App and content surfaces | The body uses `--app-bg` with a subtle grain in light mode. Content uses `bg-background`, `bg-card`, or `bg-muted` with `text-foreground`, `text-card-foreground`, or `text-muted-foreground` as appropriate. Use `border-border` for neutral dividers. |
| Elevated surfaces | `bg-sheet`, `bg-dock`, and `bg-popover` follow their own roles. Use the existing card, sheet, dock, and FAB shadow tokens. The `card-hero` utility supplies the gradient and inset highlight for the ON HAND card and Settings gate. |
| Accent | The accent is teal in light mode and muted mint in dark mode. Use `text-accent` for accent text and `bg-accent-fill text-accent-foreground` for filled actions. Accent outlines are the common keyboard focus treatment. |
| Financial and destructive states | `text-positive` marks explicitly positive amounts or movement. `text-destructive` marks negative amounts and destructive actions where called for. Destructive fills and tints have their own tokens. Keep signs, labels, or accessible names with these states. |
| Local Entry and sync | `--local` provides the indigo Local Entry treatment. `--sync-ready`, `--sync-busy`, and `--sync-waiting` supply the sync dot colors. [SyncStatus](frontend/src/components/ui/SyncStatus.svelte) also exposes the state in text. |

Category identity has its own palette. Reuse `resolveCategoryStyle()` for label, marker, and tint colors in both themes. Unknown Categories use muted tokens. Outgoing row stripes, Incoming description bands, picker options, and budget markers use this palette alongside their text. [Category palette](frontend/src/lib/theme.ts)

## Typography and shape

| Role | Current pattern |
| --- | --- |
| Body, fields, and controls | Inter through `font-sans`. |
| Page titles and display labels | Manrope through `font-display`. `PageHeader` owns page title styling. `label-overline` supplies a small uppercase display label for settings fields and picker sections. |
| Amounts and aligned dates | Roboto Mono through `font-mono` with `tabular-nums`. Use `Money` for reusable currency display, configured currency, and amount emphasis. |
| Corners | `--radius-sm`, `--radius-md`, `--radius-lg`, and `--radius-xl` are 8, 14, 18, and 22 px. The standard `card` uses `lg`, `field-card` uses `md`, and badges use `--radius-pill`. The shared Sheet defines its own larger top corners. |

## Layout and controls

- Match the centered `--app-max-width` shell. Its cap is 480 px by default, then 720, 960, and 1120 px at viewport widths of 768, 1024, and 1280 px. Main views generally stack through tablet widths and switch composition at `lg` (1024 px). Main page gutters commonly use `px-4` and `lg:px-6`. [App shell](frontend/src/App.svelte) · [Home](frontend/src/routes/HomeScreen.svelte) · [Entries](frontend/src/routes/EntriesView.svelte) · [Summary](frontend/src/routes/SummaryView.svelte)
- The mobile dock owns Add and swaps it for Cancel during bulk selection. Selection actions sit above the dock. Desktop uses a fixed tab bar and a separate floating Add button. Keep fixed controls clear of safe-area insets and preserve room for the last scrollable item and actionable toasts. [TabBar](frontend/src/components/ui/TabBar.svelte) · [Fab](frontend/src/components/ui/Fab.svelte) · [App shell](frontend/src/App.svelte)
- Shared navigation and sheet controls commonly use `min-h-11` or `size-11` for 44 px touch targets, with denser desktop variants at `lg`. Preserve visible keyboard focus, accessible names on icon-only controls, and focus return when a sheet or dialog closes. [PageHeader](frontend/src/components/ui/PageHeader.svelte) · [Keyboard checks](frontend/e2e/keyboard.spec.ts)
- Reuse `press-feedback` with the existing press handler for controls that use pointer feedback. It scales enabled pressed controls and switches to opacity under reduced motion. Sheets and selection controls already have reduced-motion treatments. The mobile dock and Entries filters use opaque backgrounds with reduced transparency. [Global styles](frontend/src/app.css) · [Press handler](frontend/src/lib/pressFeedback.ts) · [Theme checks](frontend/e2e/theme.spec.ts)

## Shared components

Prefer the repository-owned shadcn-svelte primitives and their Bits UI behavior where a matching primitive exists. Feature components compose these primitives with Money Sheet styling and behavior. [ADR-0007](docs/adr/0007-prefer-shadcn-over-bespoke-components.md)

| Use case | Reuse |
| --- | --- |
| Main-view headings and common controls | [PageHeader](frontend/src/components/ui/PageHeader.svelte) provides context, title, metadata, and action slots alongside sync, commands, keyboard help, and settings. [SectionHeader](frontend/src/components/ui/SectionHeader.svelte) provides compact section labels with optional trailing content. |
| Bottom drawers | [Sheet](frontend/src/lib/components/ui/sheet/sheet.svelte) supplies a Bits UI Dialog shell, overlay, bottom alignment, and motion hooks. Entry, Settings, and Fund Redistribution compose it. |
| Entry content and money | [EntryRow](frontend/src/components/entry/EntryRow.svelte) shares the date, marker, description, and amount across Home and Entries. The caller supplies the row wrapper and interaction. [Money](frontend/src/components/ui/Money.svelte) renders currency values. |
| Badges and Tag selection | [Badge](frontend/src/lib/components/ui/badge/badge.svelte) supplies the pill shape. [TagPill](frontend/src/components/category/TagPill.svelte) is available for standalone Tags with Category styling. [CategoryTagPicker](frontend/src/components/category/CategoryTagPicker.svelte) provides the shared Category and Subcategory choices. |
| Week selection | [WeekPicker](frontend/src/lib/components/ui/week-picker/WeekPicker.svelte) supplies the Entries week trigger and picker. |
| Notifications and sync | [Toast](frontend/src/lib/components/ui/toast/toast.svelte) renders transient notifications and follow-up actions. [App](frontend/src/App.svelte) places it above the fixed controls. [SyncStatus](frontend/src/components/ui/SyncStatus.svelte) provides persistent sync access and details. |

## Tailwind conventions

- Compose Tailwind v4 utilities in Svelte markup. Reuse `card`, `card-hero`, `field-card`, and `label-overline` where their roles fit. `app.css` also defines `btn-pill` for pill-shaped controls. Add local spacing at the call site. The current `card-hero` supplies gradient and shadow, with the caller setting the radius.
- Keep shared tokens, fonts, global resets, keyframes, and `@utility` definitions in `app.css`. ADR-0006 calls for extracting near-identical combinations of at least three classes used at least three times into shared `@utility` blocks. Keep scoped CSS for its documented exceptions, such as a selector tightly coupled to component state.
- Use `group-*` and `peer-*` for related hover, focus, or active states. Name groups when they nest. Use Svelte bindings for application state and the primitive's `data-*` hooks for its lifecycle states.
- Reserve inline styles for runtime values such as Category colors, gesture transforms, chart geometry, and `Money` props. Use static Tailwind classes, including arbitrary values and token references, for fixed values. Use `cn()` where a shared primitive merges defaults with caller classes. [ADR-0006](docs/adr/0006-tailwind-css-usage-rules.md) · [Class helper](frontend/src/lib/utils.ts)

## Design choices needing your input

- **Primary actions across sheets.** Entry uses Save and Fund Redistribution uses Redistribute as accent text actions in their sheet headers. Settings uses a filled Save button for connection settings. Should action styling continue to depend on the surface, or should sheet forms share a primary action style? [Entry](frontend/src/components/entry/EntrySheet.svelte) · [Fund Redistribution](frontend/src/components/category/RedistributeSheet.svelte) · [Settings](frontend/src/components/settings/Settings.svelte)
- **Compact label typography.** The `label-overline` utility uses 10 px Manrope, `SectionHeader` uses 11 px Inter, and `PageHeader` uses a 12 px Manrope context label. Which of these roles should share a style, and which should have their own? [Global styles](frontend/src/app.css) · [SectionHeader](frontend/src/components/ui/SectionHeader.svelte) · [PageHeader](frontend/src/components/ui/PageHeader.svelte)
- **How prominently Categories should appear.** Home budget chips use pastel fills in light mode and low-opacity tints in dark mode. Entry rows use stripes for Outgoing and tinted description bands for Incoming. Should Category color have a different visual weight in budgets and individual Entries, or should those treatments be closer? [Home](frontend/src/routes/HomeScreen.svelte) · [EntryRow](frontend/src/components/entry/EntryRow.svelte) · [EntryDescBand](frontend/src/components/entry/EntryDescBand.svelte)

## Verify UI changes

Review the affected view in light and dark at mobile and desktop widths. For shared controls, check keyboard focus and dismissal, touch targets, and reduced motion or transparency where applicable. The frontend Mock Mode browser suite covers these patterns. [Theme checks](frontend/e2e/theme.spec.ts) · [Responsive checks](frontend/e2e/responsive.spec.ts) · [Mobile dock checks](frontend/e2e/mobile-dock.spec.ts) · [Sheet motion checks](frontend/e2e/sheet-motion.spec.ts)
