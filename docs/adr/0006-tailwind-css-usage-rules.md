# ADR-0006: Tailwind CSS Usage Rules

**Status:** Accepted

## Context

The frontend uses Tailwind v4 with Svelte 5. Without explicit rules, component files accumulate long, duplicated class strings; `@keyframes` and shared utilities end up scattered in component `<style>` blocks; and inline `style=` attributes are used inconsistently — sometimes correctly (runtime-computed values), sometimes for things Tailwind handles fine.

An audit of the codebase found the following patterns worth codifying:

- Repeated Tailwind class combos across 4–9 components (card containers, field cards, pill buttons, label overlines)
- Isolated `@keyframes` defined in component `<style>` blocks rather than `app.css`
- Inline `style=` for static values (e.g., `padding-bottom: 72px`) that Tailwind utilities can express
- Parent→child conditional styling done through Svelte reactive classes (correct) vs. opportunities for `group-*`/`peer-*`

## Decision

### 1. `app.css` is the home for all shared CSS

`app.css` contains:
- `@font-face` declarations
- `:root` design tokens (colors, shadows, radii, gradients)
- Global resets
- All `@keyframes` — even if currently only one component uses the animation
- All `@utility` blocks (Tailwind v4 custom utilities, defined via `@apply`)

Component `<style>` blocks are permitted **only** for styles that cannot be expressed any other way:
- `color-mix()` expressions
- Multi-property transitions with differing durations
- `::-webkit-scrollbar` and other pseudo-element rules
- SVG-specific properties (e.g., `stroke-dasharray` driven by JS)
- Scoped Svelte state class selectors (e.g., `.active-in`, `.delete-wrap-visible`) where the style is tightly coupled to component-local reactive state

A `<style>` block that is otherwise empty or near-empty is the expected state for most components.

### 2. Repeated Tailwind combos become `@utility` classes

When the same Tailwind class string (3+ classes, used 3+ times across the codebase) appears verbatim or near-verbatim, extract it into a `@utility` block in `app.css`:

```css
/* app.css */
@utility card {
  @apply bg-card rounded-[var(--radius-lg)] shadow-[var(--shadow-card)];
}

@utility field-card {
  @apply py-3 px-[18px] rounded-[var(--radius-md)] bg-card shadow-[var(--shadow-card)];
}

@utility label-overline {
  @apply text-[10px] font-display font-semibold tracking-[1px] uppercase text-muted-foreground;
}

@utility btn-pill {
  @apply py-[8px] px-[14px] rounded-pill border-0 cursor-pointer font-sans text-[13px] font-semibold;
}

@utility sheet-modal {
  @apply absolute bottom-0 left-1/2 w-full max-w-[var(--app-max-width)] max-h-[90dvh]
         bg-background rounded-tl-[28px] rounded-tr-[28px] shadow-[var(--shadow-sheet)]
         pb-8 overflow-y-auto overflow-x-clip;
}

@utility card-hero {
  background: var(--gradient-hero);
  box-shadow: var(--shadow-hero), var(--ring-inset);
  @apply rounded-[var(--radius-lg)];
}
```

Spacing or color variants on a utility are composed at the call site: `<div class="card mx-4 pt-5 px-[22px]">`. Don't parameterize the utility itself for minor per-site tweaks.

### 3. Use `group-*` / `peer-*` variants for parent→child state

When a parent element's hover/focus/active state should visually affect a descendant, use Tailwind's `group` and `group-*` variants rather than reactive JS variables or scoped CSS:

```html
<!-- preferred -->
<div class="group">
  <span class="text-muted-foreground group-hover:text-foreground">Label</span>
</div>

<!-- avoid -->
<div onmouseenter={() => hovered = true} onmouseleave={() => hovered = false}>
  <span class={hovered ? 'text-foreground' : 'text-muted-foreground'}>Label</span>
</div>
```

Named groups (`group/row`, `group/card`) are preferred when multiple nesting levels are involved to avoid ambiguity.

Svelte `class:` bindings remain correct for state that is **not** a CSS pseudo-class (e.g., a programmatically toggled selection state, a multi-step sheet animation phase).

### 4. Inline `style=` is permitted only for runtime-computed values

Permitted:
- Colors or gradients computed from data (category palettes, per-entry colors)
- Transform/transition values driven by Svelte animation state
- Chart element dimensions computed from data (bar heights, flex-grow proportions)
- `font-size`, `font-weight`, or `color` props passed into a display primitive component (e.g., `Money.svelte`)

Not permitted:
- Static pixel values: use `pb-[72px]`, `mt-[10px]`, etc.
- CSS variable references alone: use `bg-[var(--shadow-card)]` or the mapped Tailwind token
- Multi-value shadow combinations that never change: extract to `card-hero` utility or similar

## Considered Options

**No rules (status quo):** Repeated class strings accumulate and diverge. A design token change (e.g., a new shadow scale) requires grep-and-replace across component files rather than a single `:root` edit.

**Scoped CSS-first (no Tailwind utilities):** Contradicts the project's Tailwind-first approach (ADR-0003 / CLAUDE.md). Scoped styles lose access to responsive variants, dark mode, and Tailwind's just-in-time tree-shaking.

**CSS Modules:** Adds build configuration complexity for a single-package app with no shared component library boundary.

## Consequences

- `app.css` is the canonical source for all shareable visual patterns; code review can flag any new `<style>` block as requiring justification.
- Refactoring a design decision (radius, shadow, overline size) requires editing one `@utility` block and the `:root` token, not hunting class strings across a dozen files.
- The current codebase has several extraction opportunities (card, field-card, label-overline, btn-pill) that are not yet applied — those refactors are tracked as follow-on work and do not block this ADR.
- `group-*`/`peer-*` usage is now the explicit default for hover/state propagation; JS-reactive workarounds should be called out in review.
