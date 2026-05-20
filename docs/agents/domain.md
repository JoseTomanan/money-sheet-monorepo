# Domain Docs

How the engineering skills should consume this repo's domain documentation when exploring the codebase.

## Before exploring, read these

- **`CONTEXT.md`** at the repo root — canonical term definitions for Entry, Category, Subcategory, Tag, Direction, Entry ID, Budget, ON HAND, and the three sheets.
- **`docs/adr/`** — read ADRs that touch the area you're about to work in. If the directory doesn't exist yet, proceed silently.

If any of these files don't exist, **proceed silently**. Don't flag their absence; don't suggest creating them upfront. The producer skill (`/grill-with-docs`) creates them lazily when terms or decisions actually get resolved.

## File structure

Single-context repo:

```
/
├── CONTEXT.md
├── docs/adr/
│   ├── 0001-unified-incoming-outgoing-sheet.md
│   ├── 0002-gas-http-api-shared-secret.md
│   └── 0003-plain-svelte5-no-sveltekit.md
├── clasp/
└── frontend/
```

## Use the glossary's vocabulary

When your output names a domain concept (in an issue title, a refactor proposal, a hypothesis, a test name), use the term as defined in `CONTEXT.md`. Don't drift to synonyms the glossary explicitly avoids.

Key terms: Entry, Category, Subcategory, Tag (polymorphic — Category on Incoming, Subcategory on Outgoing), Direction, Entry ID, Main Category, Budget, ON HAND.

If the concept you need isn't in the glossary yet, that's a signal — either you're inventing language the project doesn't use (reconsider) or there's a real gap (note it for `/grill-with-docs`).

## Flag ADR conflicts

If your output contradicts an existing ADR, surface it explicitly rather than silently overriding:

> _Contradicts ADR-0002 (GAS HTTP API + shared-secret write auth) — but worth reopening because…_
