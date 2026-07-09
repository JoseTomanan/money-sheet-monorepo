# Domain Glossary

## Entry
A single financial transaction. One row in the INCOMING/OUTGOING sheet. Fields: date, tag, main category (formula-resolved), description, direction, amount, entry ID. The unit of all reads and writes via the GAS API. Amount is normally positive; a negative amount is valid only on an Incoming Entry and indicates a redistribution drain (see Fund Redistribution).

## Split Entry
A user-initiated group of Entries that share the same date and description, each with a different Tag and amount. Structurally identical to a series of independent single Entries — no special field or ID distinguishes them in the sheet. The first leg carries the real description; subsequent legs use `^^` as their description (a human-readable ditto marker). The app groups legs by a leading `^^` (prefix match, not exact equality), so a ditto leg's description may also continue past the marker, e.g. `^^ extra detail`. All legs are submitted together as one atomic `addEntries` batch (see ADR-0008) — either every leg lands or none does; the main leg is guaranteed the lowest Entry ID in the run.

## Category
One of seven top-level budget buckets: **HOUSING, FOOD, TRANSIT, HEALTH, FINANCE, LIFESTYLE, MISC**. Always written in ALL CAPS. A Category is the coarsest grouping; Budgets are computed per Category.

## Subcategory
A named expense type that belongs to exactly one Category (e.g., `Dining → FOOD`, `Uniform → MISC`). Written in Title Case. Defined in the Categories sheet. New subcategories can be added there at any time; formulas update automatically.

Default subcategories by category:
- **HOUSING**: Rent, Utilities, Maintenance
- **FOOD**: Groceries, Dining
- **TRANSIT**: Commute Fare, Auto Maintenance, Fuel, Parking
- **HEALTH**: Consultation Fee, Pharmacy, Fitness, Insurance
- **FINANCE**: Tax, Debt, Investment, Savings
- **LIFESTYLE**: Leisure, Entertainment, Subscription, Grooming, Clothing, Gifts
- **MISC**: Career, Uniform, Tools

## Tag
The value in column C of INCOMING/OUTGOING. Tag is **polymorphic based on Direction**:
- On an **Incoming** Entry: Tag is a Category (e.g., `HOUSING`)
- On an **Outgoing** Entry: Tag is a Subcategory (e.g., `Dining`)

A Category-level Tag is never valid on an Outgoing Entry; a Subcategory-level Tag is never valid on an Incoming Entry.

## Direction
Whether an Entry is **Incoming** (`I`) or **Outgoing** (`O`). Stored in column F of INCOMING/OUTGOING. Determines the valid domain of Tag.

## Entry ID
A stable, auto-incrementing integer stored in column H of INCOMING/OUTGOING. Written by GAS when the row is first created; never changes. Used to identify a specific Entry for edit and delete operations. Values are never reused after deletion.

## Main Category
Column D of INCOMING/OUTGOING. A VLOOKUP formula that resolves any Tag (Category or Subcategory) to its parent Category. Formula-driven; GAS never writes to it. Used by MASTER sheet SUMIF formulas to aggregate Outgoing Entries by Category.

## Budget
The net balance for a Category. Computed as: sum of all Incoming Entries whose Tag equals that Category, minus sum of all Outgoing Entries whose Main Category resolves to it. Rolling all-time (no period resets). A Budget can go negative.

## Fund Redistribution
A user-initiated reallocation of a fixed amount from one Category's Budget to another. ON HAND is unchanged by a redistribution. Modeled as a pair of Incoming Entries written together: a negative-amount Entry draining the source Category's Budget and a positive-amount Entry crediting the target Category's Budget. Only Incoming Entries may carry a negative amount. Like a Split Entry, both legs are submitted as one atomic `addEntries` batch (ADR-0008).

## ON HAND
The sum of all Category Budgets. Represents total money currently available across all categories. Displayed in the MASTER sheet. Derived entirely from spreadsheet formulas; GAS never writes to it.

## Connection
The user-provided configuration required to reach their spreadsheet: a GAS web app URL and an API secret. Stored in the browser's localStorage, scoped to the device. Without a Connection, the app cannot make any API calls. A user configures their Connection once per device via the Settings screen; it can be changed at any time. Structurally: `{ gasUrl: string, apiSecret: string }`.

## Mock Mode
A runtime demo state in which the app runs entirely on in-memory fixture data (see `mock.ts`) rather than a real spreadsheet. Mock Mode activates automatically for first-time visitors who have no Connection saved — serving as a portfolio showcase. It is suppressed permanently once the user opts out (see Mock Dismissal). All CRUD operations work in Mock Mode but mutations are ephemeral: they live only for the current page session and are discarded on exit or reload.

## Mock Dismissal
The permanent opt-out from Mock Mode. Recorded as a truthy value under the `ms_mock_dismissed` key in localStorage. Once set, Mock Mode never activates again — even if the Connection is later cleared. Set explicitly when the user clicks "Exit" on the Mock Banner, or implicitly on first boot when a Connection is already present (migration path for existing users).

## Local Entry
An Entry that is visible in the app's UI but has not yet been confirmed written to the spreadsheet. Holds a temporary negative integer ID until it syncs and receives a real Entry ID from GAS. Displayed with a visual indicator to distinguish it from confirmed entries. A Local Entry exists because its originating mutation was queued in the Offline Queue rather than successfully sent.

## Offline Queue
The ordered list of pending mutations (addEntry, addEntries, updateEntry, deleteEntry) that failed to reach GAS. Persisted in localStorage (`ms_queue`) so it survives page reloads. Drained in order when connectivity is restored — either automatically on the browser `online` event, or manually via a "Sync now" trigger. Coalescing rules apply: a later operation on the same logical entry merges into or cancels the earlier one rather than appending a new queue item. A failed Split Entry / Fund Redistribution batch queues as a single self-contained `addBatch` item rather than one item per leg; its legs are **frozen** (read-only) until the batch syncs — editing or deleting one is blocked, not coalesced (see ADR-0004's amendment).

## Sheets

### INCOMING/OUTGOING sheet
The single transaction log. One row per Entry. Column layout:
`B=DATE | C=TAG | D=[VLOOKUP] MAIN CATEGORY | E=DESCRIPTION | F=I/O | G=AMOUNT | H=ENTRY ID`

### MASTER sheet
A single summary row. Shows ON HAND plus the Budget for each Category. Entirely formula-driven; GAS only reads it, never writes to it.

### Categories sheet
The Subcategory-to-Category mapping table. Column B = Subcategory name, Column C = parent Category (merged cell spanning all subcategories of that Category). Adding a subcategory here automatically propagates to VLOOKUP formulas in INCOMING/OUTGOING.

### Config sheet
A 2-column key-value sheet (Column A = key, Column B = value). Holds user-configurable app settings that are spreadsheet-scoped rather than device-scoped. Read by the `getConfig` GAS action and surfaced to the frontend as a flat `Record<string, string>`. Known keys: `currency` (currency symbol, default `₱`), `nickname` (display name, default empty), `week_start` (first day of the week, `"Sunday"` or `"Monday"`, default `"Sunday"`). Constrained-choice keys use Google Sheets dropdown chip validation on the value cell. The frontend falls back to defaults when a key is absent or the sheet doesn't exist (legacy spreadsheets). New spreadsheets get the Config sheet pre-seeded by `ensureConfigSheet` during setup.

## Canonical Week-Start Definition

**Week start = the Sunday on or before the Entry's calendar date**, derived purely from the `YYYY-MM-DD` date string's year/month/day components with no host-timezone or browser-timezone dependence.

Both packages implement this identically:

```
// Given dateStr = "YYYY-MM-DD"
const [y, m, d] = dateStr.split("-").map(Number);
const date = new Date(Date.UTC(y, m - 1, d));   // always UTC, never local
date.setUTCDate(date.getUTCDate() - date.getUTCDay()); // rewind to Sunday
return date.toISOString().slice(0, 10);           // "YYYY-MM-DD" of week start
```

- **clasp**: `weekStartOfStr(dateStr)` in `clasp/src/lib/weeks.ts`
- **frontend**: `weekStartOf(dateStr)` in `frontend/src/lib/groupEntries.ts`

Both functions produce identical output for the same input. Tests covering Dec 31 / Jan 1 crossings, all seven weekdays, and a multi-year range live in the corresponding `*.test.ts` files.

**Week label format** (used in the frontend UI week picker and — via `weekLabelFromStr` — in clasp's spreadsheet separator rows):
- Same month: `"Mon D – D, YYYY"` (e.g. `"May 11 – 17, 2025"`)
- Cross-month: `"Mon D – Mon D, YYYY"` (e.g. `"Apr 27 – May 3, 2025"`)
- Year is always the year of the Saturday (end of week)

**Note for #87 implementer**: When adding configurable first-day-of-week, update `weekStartOf` (frontend) and `weekStartOfStr` (clasp) in tandem — both are the single-responsibility implementations of this calculation.
