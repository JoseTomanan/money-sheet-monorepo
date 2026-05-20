# money-sheet-monorepo

> **[Live demo →](#)** *(placeholder)*

A mobile-friendly personal finance tracker for people who already live in Google Sheets — built so you can log and review your finances from your phone without wrestling with the Sheets mobile app.

![Screenshot](docs/screenshot.png)
> *Screenshot coming soon*

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

Each package is independent with its own `package.json`. For full setup and development instructions, see [CLAUDE.md](CLAUDE.md).

## License

[MIT](LICENSE)
