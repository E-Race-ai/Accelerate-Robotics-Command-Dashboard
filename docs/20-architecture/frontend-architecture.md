# Frontend Architecture

Zero-build vanilla HTML + CSS + JavaScript, served statically from `public/`. No bundler, no framework, no transpiler. This is deliberate — see [`adr/0002-no-frontend-build-step.md`](adr/0002-no-frontend-build-step.md).

## Layout

```
public/
├── index.html                           ← main marketing site
├── architecture.html                    ← platform architecture visual
├── deployment-playbook.html             ← Thesis Hotel deployment story
├── deployment-playbook-print.html       ← printable version
├── elevator-integration.html            ← elevator integration story
├── elevator-install-guide.html          ← install guide
├── elevator-button-emulator.html        ← button emulator product page
├── elevator-embed.html                  ← embed iframe (used inside other pages)
├── pricing-model.html                   ← pricing calculator / model
├── robot-preview.html                   ← robot fleet preview
├── thesis-hotel-agenda.html             ← meeting agenda
├── thesis-hotel-onepager.html           ← one-pager
├── thesis-hotel-robot-solutions.html    ← robot solution narrative
├── admin.html                           ← admin dashboard (inquiries + recipients)
├── admin-login.html                     ← admin login form
├── js/
│   ├── admin-auth.js                    ← checkAuth() + logout()
│   ├── admin.js                         ← dashboard logic
│   └── inquiry-form.js                  ← public inquiry form
├── assets/                              ← images and static assets
└── logos/                               ← partner logos
```

## Styling

- **Tailwind CSS** via CDN (`cdn.tailwindcss.com`) — loaded with a `<script>` tag
- **Google Fonts** via `fonts.googleapis.com` + `fonts.gstatic.com`
- Custom styles inline or in `<style>` blocks inside each HTML file

No build step means no purge — the full Tailwind runtime is downloaded on each visit. Fine for our traffic; revisit if we ever need to optimize bundle size.

## JavaScript conventions

- ES2017+ features, no transpilation (modern browsers only)
- `fetch` for all API calls, `credentials: 'include'` so cookies go along
- DOM manipulation via `querySelector` / `textContent` — never `innerHTML` with user data
- No framework — write vanilla JS and keep it readable

## The three client modules

### `public/js/admin-auth.js`

Handles auth lifecycle for the admin UI.

- `checkAuth()` — calls `GET /api/auth/me`; redirects to `/admin-login` on 401
- `logout()` — calls `POST /api/auth/logout`; redirects to login

Every admin page calls `checkAuth()` on load.

### `public/js/admin.js`

The admin dashboard. Fetches inquiries and recipients, renders tables, handles status updates, add/remove recipients.

- `loadInquiries()` — `GET /api/inquiries`, optionally filtered by status
- `updateInquiry(id, status)` — `PATCH /api/inquiries/:id`
- `loadRecipients()` / `addRecipient()` / `removeRecipient()`

### `public/js/inquiry-form.js`

Public contact form on `index.html`. POSTs to `/api/inquiries`, shows success or error state, respects the rate limit.

## Routing

There is no client-side router. Every HTML page is a full page load. The server maps `/admin` and `/admin-login` to their HTML files explicitly (`src/server.js`) and otherwise serves any file under `public/` directly.

## Forms and data flow

```
User submits inquiry form
  ↓
inquiry-form.js → POST /api/inquiries
  ↓
routes/inquiries.js validates + inserts
  ↓
services/email.js sends notification to all active recipients (fire-and-forget)
  ↓
Admin sees it in admin.html on next load (or refresh)
```

## Trust boundaries (frontend specifically)

- The frontend trusts the server's JSON responses (they originate from our own DB)
- The frontend never stores credentials in `localStorage` — auth is cookie-only
- Any rendering of inquiry content uses `textContent`, not `innerHTML`

## Accessibility

- Semantic HTML elements preferred (`<nav>`, `<main>`, `<section>`)
- Form labels associated via `for`/`id`
- Keyboard navigable — tab order makes sense on every page
- Not yet audited with a tool — track in open questions

## Why no React / Vue / Svelte?

See [`adr/0002-no-frontend-build-step.md`](adr/0002-no-frontend-build-step.md). Short version: the site is mostly marketing + a simple admin dashboard. A build step would add complexity without benefit at this scale.

## Related

- [`api-reference.md`](api-reference.md) — endpoints the frontend calls
- [`security-model.md`](security-model.md) — CSP, XSS protections
- [`adr/0002-no-frontend-build-step.md`](adr/0002-no-frontend-build-step.md)
