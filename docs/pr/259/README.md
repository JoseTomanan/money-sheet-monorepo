# Sync status modal evidence (#259)

`SyncStatus` now opens a bits-ui modal with a color-coded status heading,
readable details, and the existing recovery action. The floating dot keeps its
7px size, 44px target, and safe-area-aware placement, with saturated colors and
Tailwind `shadow-xs`.

## TDD and behavior checks

- RED: the component test could not find a named modal in the former popover.
  GREEN: the Dialog opens without reads; explicit Refresh uses the existing owner.
- RED: the rendered status failed the semantic saturation check. GREEN: local
  sync colors match the dot and exceed 4.5:1 text contrast in both themes.
- Browser checks cover touch/keyboard opening, contained Tab/Shift+Tab focus,
  Escape/close dismissal and focus restoration, reactive pending/acknowledged/
  failed/ready details, long error wrapping, busy-only shimmer, reduced motion,
  unchanged queued Mutation IDs, forced metadata refresh, Connection isolation,
  and truthful Demo/no-Connection behavior without network work.

Screenshots use intercepted fake HTTP data. The deliberately long failure token
exercises wrapping without abbreviating or hiding the actual error. No live
spreadsheet writes were used.

Validation passed: frontend `npm run check`, `npm run build`, `npm run test:run`
(1,001 passed; four opt-in live checks skipped), and `npm run test:e2e` (112 passed).
The separate intercepted-network Connection/metadata/sync suite covers 12 tests.

## Reviewed screenshots

| Width | Light ready | Dark ready | Light long error | Dark long error |
|---|---|---|---|---|
| 320px | [Ready](ready-light-320.png) | [Ready](ready-dark-320.png) | [Waiting](waiting-light-320.png) | [Waiting](waiting-dark-320.png) |
| 390px | [Ready](ready-light-390.png) | [Ready](ready-dark-390.png) | [Waiting](waiting-light-390.png) | [Waiting](waiting-dark-390.png) |
| 1440px | [Ready](ready-light-1440.png) | [Ready](ready-dark-1440.png) | [Waiting](waiting-light-1440.png) | [Waiting](waiting-dark-1440.png) |

The pre-existing Windows light-theme screenshot baselines also require the new
dot shadow. Their strict pixel assertions remain intact; all eight reviewed
baseline diffs are confined to `(14, 15)–(31, 32)` at both tested widths.

Regenerate modal screenshots with:

```powershell
cd frontend
npx playwright test --config=playwright.connection.config.ts sync-status.spec.ts
```
