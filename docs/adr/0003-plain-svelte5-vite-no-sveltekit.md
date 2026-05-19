# ADR-0003: Plain Svelte 5 + Vite, No SvelteKit

**Status:** Accepted

## Context

The frontend needs to display a financial dashboard and call a GAS HTTP API. SvelteKit is the canonical Svelte meta-framework and provides file-based routing and SSR. However, the data source is GAS (not a Node server), so all fetching happens client-side regardless.

## Decision

Use plain Svelte 5 with Vite. No SvelteKit. Deployed as a static site to GitHub Pages.

## Consequences

- No SSR; all data fetching is client-side via `fetch()` to the GAS web app URL.
- No file-based routing; view switching handled with a simple component switcher if multi-view is needed.
- Build output is a static `dist/` folder, trivially deployable to GitHub Pages via GitHub Actions.
- If true server-side rendering or API routes become necessary (e.g., to proxy the GAS secret), migrating to SvelteKit is the upgrade path.
