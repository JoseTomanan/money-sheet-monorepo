# money-sheet-monorepo

> **[Live app →](https://josetomanan.github.io/money-sheet-monorepo/)**

A mobile-friendly personal finance tracker for people who already live in Google Sheets — built so you can log and review your finances from your phone without wrestling with the Sheets mobile app.

---

## The problem

Google Sheets is great for personal finance tracking on a desktop. On mobile, it's painful. This app puts a fast, phone-native interface in front of your existing spreadsheet so day-to-day logging stays frictionless.

## Features

- Log incoming and outgoing transactions in seconds from your phone
- Budget tracking per category, rolling all-time
- Per-subcategory spend breakdown
- Add, edit, and delete entries
- Live sync — all data lives in your Google Sheet

## How it works

Google Sheets acts as the database. A Google Apps Script web app is deployed as an HTTP API over the spreadsheet — reads are unauthenticated, writes require a shared secret. The Svelte 5 frontend calls that API directly from the browser and is deployed as a static site to GitHub Pages. No traditional backend server, no infrastructure to maintain.

## Setup

### 1. Copy the template

Open the [Google Sheet template](https://docs.google.com/spreadsheets/d/1dW0X378z9MXCqZ9YK2oxCqk3FjX6TUP2h7yLSdjmd6g/template/preview) and click **Use Template**. This creates your own copy with INCOMING/OUTGOING, MASTER, Categories, Config, and STATS pre-configured and the GAS script already attached.

### 2. Copy the API secret

Opening the copied sheet automatically provisions a unique API secret for that copy. Open **Connection → Show connection details**, then click **Copy secret**. The secret stays the same whenever you reopen this spreadsheet.

Keep the secret private. If it is compromised, use **Connection → Rotate API secret** and update every saved app Connection; rotation immediately invalidates the previous secret.

### 3. Deploy the web app

In Apps Script, click **Deploy → New deployment**. Set:
- **Execute as**: Me
- **Who has access**: Anyone

Click **Deploy** and copy the web app URL.

### 4. Configure the app

Open the Money Sheet app (your GitHub Pages URL). On first launch the app opens in **Mock mode** — a demo populated with sample data so you can look around before connecting anything. Nothing you enter in Mock mode is saved to a spreadsheet.

When you're ready to connect, click **Exit** in the `Mock mode` banner across the top. The **Connect your spreadsheet** screen then appears — paste your web app URL and API secret into the fields and click **Save**.

That's it. The app is connected to your spreadsheet.

Pending saves and cached data belong to the exact web app URL. Changing URLs keeps the previous destination's work recoverable; return to that URL to sync it. Updating only its API secret preserves pending saves.

If the app reports older pending saves with no known destination, open Settings, save their original web app URL and secret, then choose **Confirm original destination and recover**. Confirm only when that URL is their original destination. Sync any newer pending work on that Connection first. Older work stays on the device until associated; it is never delivered automatically to a newly configured URL.

### Customizing the currency symbol

Open the **Config** sheet in your spreadsheet and change the value in the `currency` row to your currency symbol (e.g. `$`, `€`, `£`). The app picks it up automatically on next load.

### Adding or removing subcategories

Edit the **Categories** sheet directly — add a row under the relevant category heading or delete an existing subcategory row. Changes are picked up automatically; no app restart needed.

### Keyboard shortcuts

Use the visible **?** button in a page header, Entry sheet, or Settings for contextual help.

| Shortcut | Action |
|---|---|
| Tab / Shift+Tab | Next / previous field or control |
| Shift+N | Open Add Entry and focus Amount, when Add is available |
| Ctrl+K (Cmd+K on Mac) | Open the searchable command menu from a main view |
| Ctrl+Enter (Cmd+Enter on Mac) | Save the active Add/Edit sheet, including all split legs and unblurred arithmetic |
| Left / Right | Focus Category or optional Subcategory choices; Enter / Space activates |
| Up / Down in Entries | Focus previous / next visible Entry; Enter edits an available Entry |
| Enter / Space in bulk selection | Toggle an eligible focused Entry |
| Ctrl+A (Cmd+A on Mac) in bulk selection | Select all eligible Entries in the filtered week |
| Delete in bulk selection | Open the existing confirmation for selected Entries |
| Esc | Close the innermost popup, then cancel the sheet; exit bulk selection after popups close |
| G then H / E / S | Go to Home / Entries / Summary within one second |
| ? | Show shortcuts for the current page or sheet |

Entry focus starts at Amount. Each Category/Subcategory group has one Tab stop;
arrows move focus without changing the Tag. An Outgoing Entry may use a bare
Category without a Subcategory. Add leg, Remove, direction, Save, and Cancel remain
keyboard-accessible. Page shortcuts pause while typing, composing text, or using
another popup. Browser shortcuts and text selection retain their usual behavior.

In **Settings → Keyboard**, turn off **Enable character shortcuts** to disable
Shift+N, ?, and G sequences together. This browser/device preference persists under
`ms_character_shortcuts`, independently of your Connection or spreadsheet. The
visible help button, Tab, arrows, and Ctrl/Cmd shortcuts remain available. The same
preference is also reachable from the help dialog.

Use the **Open command menu** button (magnifying glass) in any main-view header,
including Deeper statistics, for the same menu by touch or keyboard. Search actions,
navigation, and the current sync/recovery action; Up/Down navigates and Enter chooses.
Unavailable commands show why, including Fund Redistribution outside Entries.
Escape, Close, or clicking outside returns focus to the opener. Commands that open a
sheet hand focus to that sheet. The menu pauses in editable fields and existing
popups to protect drafts, and is unavailable at the no-Connection Settings gate.
Ctrl/Cmd+K and the visible button work with character shortcuts disabled. Opening,
searching, and dismissing the menu do not refresh data; choose the displayed Sync
action explicitly to retry queued work or refresh through the existing sync owner.

---

## Stack

| Layer | Tech |
|---|---|
| Database | Google Sheets |
| Backend | Google Apps Script (TypeScript via clasp) |
| Frontend | Svelte 5 + Vite + Tailwind v4 |
| Hosting | GitHub Pages |
| CI/CD | GitHub Actions |

## Repo structure

```
money-sheet-monorepo/
├── clasp/      # GAS TypeScript source
├── frontend/   # Svelte 5 SPA
├── docs/adr/   # Architecture decision records
└── CONTEXT.md  # Domain glossary
```

Each package is independent with its own `package.json`. For development instructions, see [CLAUDE.md](CLAUDE.md).

From `frontend/`, run `npm run check`, `npm run test:run`, and `npm run build`.
The PR browser gate runs `npm run test:e2e`, then
`npm run test:e2e:connection`. Install Chromium
first with `npx playwright install chromium`. Both suites own port 1111 and must
run sequentially with the dev server stopped. They clear Vite Connection
credentials, block unhandled external HTTP, and exclude the optional live API
spec. The second suite intercepts fake HTTP destinations; neither requires a real
spreadsheet. Failure traces and screenshots are uploaded as `browser-evidence`
in CI; routine screenshots stay in `frontend/test-results/`.

The behavior baseline for the redesign includes admission/refusal and deferred
delivery, atomic Redistribution, picker reset, semantic focus, keyboard row
activation, Connection validation, responsive lifetime ownership, and canonical
route/week/scroll behavior. These checks do not certify the installed-iPhone
report in #242. See [CONTEXT.md](CONTEXT.md) for the behavior owners.

## License

[MIT](LICENSE)
