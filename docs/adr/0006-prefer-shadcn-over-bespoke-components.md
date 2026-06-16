# ADR-0006: Prefer Shadcn Svelte Components Over Bespoke AI-Generated Ones

**Status:** Accepted

## Context

UI primitives like bottom sheets, dialogs, toasts, and badges can be built from scratch or sourced from a component library. When AI generates bespoke implementations it tends to produce code that works for the happy path but misses nuances that human-authored libraries handle deliberately: focus trapping, `aria-*` attributes, keyboard navigation (Escape to dismiss, Tab order), `data-[state]` animation hooks, pointer-capture for drag gestures, and cross-device scroll-locking.

The project already depends on `bits-ui`, which is the headless primitive layer Shadcn Svelte is built on. Shadcn Svelte components live in `src/lib/components/ui/` and are owned by the project — they can be edited freely.

The cost of a bespoke implementation is not just the initial lines; it is the subtle regressions that surface later (e.g., the backdrop not dismissing on Escape, or animations fighting the browser's native scroll on iOS).

## Decision

When a needed UI primitive is covered by an existing Shadcn Svelte component (or can be added via `npx shadcn-svelte@latest add <component>`), use it instead of generating a bespoke implementation.

Bespoke components remain appropriate when:
- The primitive does not exist in Shadcn Svelte (e.g., a carousel with custom snap points).
- The required behaviour diverges enough from the Shadcn API that wrapping it adds more complexity than it removes (e.g., a multi-snap-point bottom sheet where `Dialog` does not expose snap state).

In those cases the bespoke component should be kept minimal and the specific gap documented inline.

## Consequences

- Accessibility, keyboard navigation, and focus management are handled by bits-ui's well-tested primitives rather than rediscovered per-component.
- Less AI-generated animation/state boilerplate to maintain; the diff for the EntrySheet migration (ADR precedent) was −90 net lines.
- The Shadcn `Sheet` component is now the standard shell for bottom drawers; the Settings and EntrySheet panels both use it.
- Bespoke drag-gesture logic (`dragGesture.ts`) remains for the deferred drag-to-reveal delete button on the edit sheet, as `Dialog` has no snap-point API.
- When a new UI element is needed, the first question is: "does Shadcn Svelte have this?" before generating custom markup.
