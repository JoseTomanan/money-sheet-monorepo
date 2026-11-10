# Home reference evidence (#248)

The [design system](../../design-system.md) records the shared roles, exact token
values, density, components, states and migration boundaries.

## Reviewed screenshots

Deterministic Windows Chromium; local fonts; Mock Mode or intercepted fake HTTP.
No live-sheet requests or writes. Home uses 1280px and 390px widths. Controls show
the existing Entry form with focus, selection, invalid expression and disabled
Save; form restructuring is a later stage.

| Reference | Light | Dark |
| --- | --- | --- |
| Desktop Home | [1280px](home-light-1280.png) | [1280px](home-dark-1280.png) |
| Mobile Home | [390px](home-light-390.png) | [390px](home-dark-390.png) |
| Existing controls and error | [Controls](controls-light.png) | [Controls](controls-dark.png) |

| State | Screenshot |
| --- | --- |
| Cold, before any confirmed values | [Cold](cold.png) |
| Empty Entries, huge/negative/zero amounts, long nickname/currency, missing Budgets | [Empty/unavailable](empty-unavailable.png) |
| Last-confirmed balance, local Entry and waiting status | [Stale/local dark](stale-local-dark.png) |

## TDD and checks

The initial Home test failed because financial sections had no accessible labels;
the next browser test failed because dates used monospace. Shared typography,
neutral sections, 44px targets and fixed density made those tests pass. A missing
Budget test exposed the old fabricated-zero fallback. Enlarged text then exposed
non-wrapping header controls; wrapping the group fixed it.

Regression coverage preserves cold placeholders, stale sheet balances, local-entry
meaning, configured currency, navigation, and shared semantic colors. Browser
checks include keyboard activation/focus, 320/390/1280px widths, 200% root text,
large/negative/zero amounts, both theme preferences, and reduced motion. Existing
financial, parity and interaction checks remain intact. Windows pixel baselines
are regenerated for the accepted shared palette/type changes with zero-difference
assertions retained.

The sync palette test waits for the newly rendered phase hue before measuring
contrast and dot parity; every existing color and contrast assertion remains.

Frontend validation: `npm run check` reports zero errors/warnings;
`npm run test:run` passes 1,041 tests (four opt-in live checks skipped), with the
37 affected component tests rerun after final polish; `npm run build` passes.
The existing `darkMode.svelte.ts` initial-state-reference build warning remains.
Mock Mode browser workflows pass all 134 tests. The intercepted Connection suite
passes all 23 tests.

Regenerate screenshots from `frontend/`:

```powershell
npm run test:e2e -- home-reference.spec.ts
npm run test:e2e:connection -- home-states.spec.ts
```

Results are in `frontend/test-results/mock/` and `frontend/test-results/connection/`;
copy the named images into this directory after visual review.
