# ADR 0002 — No frontend build step

- **Status:** Accepted
- **Date:** 2025-12-18
- **Deciders:** Eric

## Context

The Accelerate Robotics web app is:

- A multi-page marketing site
- A simple admin dashboard (inquiries + recipients)
- A contact form
- A stocks widget

The total JavaScript footprint is a few hundred lines. We have no SPA routing, no complex state, no shared components across pages.

The question: should we add a build pipeline (Vite, webpack, esbuild) and a framework (React, Vue, Svelte) now or later?

## Options considered

### Option A: No build step — vanilla HTML, CSS, and JS served from `public/`

- **Pros:**
  - Nothing to build, nothing to watch, nothing to break
  - `npm run dev` is just the Node server
  - No `dist/` folder, no source-map debugging
  - Tailwind via CDN gives us the utility-class DX without a tool
  - Any editor and any deploy target works
- **Cons:**
  - Manual duplication across pages (header, footer)
  - No component isolation, no TypeScript
  - Tailwind CDN is larger than a purged production build
  - No hot module replacement

### Option B: Vite + React

- **Pros:**
  - Component reuse, TypeScript, HMR, purged CSS
  - Industry standard, easy to hire for
- **Cons:**
  - Adds a build step, a dev server, a `dist/` to deploy
  - Server has to either serve `dist/` or route differently in dev vs prod
  - SSR vs SPA tradeoffs, dead-code debate, SEO considerations
  - At our current scale, all of this is overhead for zero user-visible benefit

### Option C: Vite + Svelte (no React)

- **Pros:** Smaller runtime, nicer templating
- **Cons:** Same build-step overhead as B; smaller ecosystem

### Option D: Eleventy / Astro static generator

- **Pros:** Build-time component reuse without client-side JS weight
- **Cons:** Still a build step; still `dist/`; doesn't help the dynamic admin side

## Decision

**No build step.** Vanilla HTML + CSS + JS. Tailwind via CDN. The Node server (`src/server.js`) serves everything under `public/` directly.

## Consequences

- **Positive:**
  - `git clone && npm install && npm run dev` is the entire setup
  - Every HTML file is editable and previewable without tooling
  - Deploy is `railway up` — one command, one process
  - No frontend build to break CI
- **Negative:**
  - Header/footer duplication across HTML files — if this becomes painful, adopt a generator
  - No TypeScript on the client — discipline matters
  - Tailwind CDN includes unused classes — fine for our traffic
- **Neutral:**
  - Adding a build step later is a clean migration (move `public/` into `src/frontend/`, point the build at it)

## Follow-ups

- Revisit if the page count or JS complexity grows significantly
- Revisit if we hire a frontend engineer who expects TypeScript + components
- Watch Tailwind CDN performance if the site gets more traffic

## References

- `src/server.js` (static file serving)
- `public/` (all the frontend code)
- [`../frontend-architecture.md`](../frontend-architecture.md)
