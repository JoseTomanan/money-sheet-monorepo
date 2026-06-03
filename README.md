# money-sheet-monorepo

> **[Live app →](https://josecomanan.github.io/money-sheet-monorepo/)** *(replace with your GitHub Pages URL)*

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

Open the [Google Sheet template](https://docs.google.com/spreadsheets/d/TEMPLATE_ID/template/preview) and click **Use Template**. This creates your own copy with all three sheets pre-configured (INCOMING/OUTGOING, MASTER, Categories) and the GAS script already attached.

### 2. Generate your API secret

In your new sheet, open **Extensions → Apps Script**, select the `setup` function, and click **Run**. It generates a random API secret, saves it to Script Properties, and shows it in an alert — copy it now.

### 3. Deploy the web app

In Apps Script, click **Deploy → New deployment**. Set:
- **Execute as**: Me
- **Who has access**: Anyone

Click **Deploy** and copy the web app URL.

### 4. Configure the app

Open the Money Sheet app (your GitHub Pages URL). On first launch you'll see a setup screen — paste your web app URL and API secret into the fields and click **Save**.

That's it. The app is connected to your spreadsheet.

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

## License

[MIT](LICENSE)
