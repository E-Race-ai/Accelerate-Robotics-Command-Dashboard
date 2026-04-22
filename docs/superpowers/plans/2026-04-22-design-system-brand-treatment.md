# Design System + Brand Treatment — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Create a shared design system (CSS + JS) and apply consistent Accelerate Robotics branding across all admin and internal pages — branded nav bar, stat cards with animated counters + sparklines, deal cards with 3D tilt, badges, workflow steps with shimmer, glass cards, and confetti on deal close.

**Architecture:** Extract shared CSS custom properties, component styles, and animation keyframes into `public/css/brand.css`. Extract shared JS utilities (counter animation, confetti, reveal observer) into `public/js/brand.js`. Each page imports these shared files and replaces its current header with the branded nav HTML. Page-specific styles remain inline.

**Tech Stack:** Vanilla CSS + JS, Tailwind CDN (already loaded), Google Fonts (Inter + Space Grotesk, already loaded)

**Spec:** `docs/superpowers/specs/2026-04-22-dashboard-brand-overhaul-design.md`

**Scope:** This plan covers the design system and brand treatment only. The Deal Workspace (tabbed navigation in `admin-deal-detail.html`) is a separate plan that builds on top of this one.

---

### Task 1: Create `public/css/brand.css` — Shared Design System

**Files:**
- Create: `public/css/brand.css`

This is the foundation. Every subsequent task depends on this file.

- [ ] **Step 1: Create the CSS file with custom properties and nav styles**

```css
/* ═══════════════════════════════════════════════════════
   brand.css — Accelerate Robotics Design System
   Shared across all admin and pages/* HTML files.
   Import via: <link rel="stylesheet" href="/css/brand.css">
   (or relative path from pages/: ../public/css/brand.css)
   ═══════════════════════════════════════════════════════ */

/* ── Color Tokens ──────────────────────────────────────── */
:root {
  --blue: #0055ff;
  --cyan: #00c8ff;
  --purple: #7c3aed;
  --teal: #06b6d4;
  --amber: #f59e0b;
  --green: #16a34a;
  --bg: #f7f8fc;
  --surface: white;
  --border: #e5e7eb;
  --text: #0f172a;
  --text-dim: #64748b;
  --text-faint: #94a3b8;

  /* Badge background / text pairs */
  --badge-blue-bg: #eef2ff;
  --badge-cyan-bg: #ecfeff;
  --badge-purple-bg: #f5f3ff;
  --badge-green-bg: #f0fdf4;
  --badge-amber-bg: #fffbeb;
}

/* ── Typography ────────────────────────────────────────── */
.brand-body { font-family: 'Inter', system-ui, sans-serif; }
.brand-headline { font-family: 'Space Grotesk', 'Inter', sans-serif; }
.gradient-text {
  background: linear-gradient(135deg, var(--text), var(--blue));
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
}

/* ── Primary Nav Bar ───────────────────────────────────── */
.brand-nav {
  background: var(--surface);
  border-bottom: 1px solid var(--border);
  padding: 0 28px;
  display: flex;
  align-items: center;
  height: 56px;
  position: sticky;
  top: 0;
  z-index: 50;
}
/* WHY: Gradient underline is the primary brand signature on every page */
.brand-nav::after {
  content: '';
  position: absolute;
  bottom: -2px;
  left: 0; right: 0;
  height: 2px;
  background: linear-gradient(90deg, var(--blue), var(--cyan), var(--purple), transparent 80%);
}
.brand-nav-logo {
  width: 36px; height: 36px;
  border-radius: 10px;
  background: linear-gradient(135deg, var(--blue), var(--cyan));
  box-shadow: 0 4px 14px rgba(0, 85, 255, 0.25);
  display: flex; align-items: center; justify-content: center;
  flex-shrink: 0;
}
.brand-nav-identity {
  margin-left: 12px;
}
.brand-nav-name {
  font-family: 'Space Grotesk', sans-serif;
  font-size: 1.05rem;
  font-weight: 700;
  line-height: 1.1;
  color: var(--text);
}
.brand-nav-name span { color: var(--blue); }
.brand-nav-tagline {
  font-size: 0.58rem;
  color: var(--text-faint);
  text-transform: uppercase;
  letter-spacing: 0.14em;
  font-weight: 600;
}
.brand-nav-links {
  margin-left: auto;
  display: flex;
  gap: 2px;
  align-items: center;
}
.brand-nav-links a {
  font-size: 0.8rem;
  font-weight: 600;
  color: var(--text-dim);
  padding: 8px 14px;
  border-radius: 10px;
  text-decoration: none;
  transition: color 0.2s, background 0.2s;
  position: relative;
}
.brand-nav-links a:hover { color: var(--blue); background: #eef2ff; }
.brand-nav-links a.active { color: var(--blue); background: #eef2ff; }
.brand-nav-links a.active::after {
  content: '';
  position: absolute;
  bottom: -14px;
  left: 50%; transform: translateX(-50%);
  width: 20px; height: 2px;
  background: var(--blue);
  border-radius: 2px;
}

/* ── Stat Cards ────────────────────────────────────────── */
.brand-stat {
  background: var(--surface);
  border-radius: 16px;
  padding: 18px 20px;
  border: 1px solid var(--border);
  position: relative;
  overflow: hidden;
  transition: border-color 0.3s cubic-bezier(0.4,0,0.2,1),
              box-shadow 0.3s cubic-bezier(0.4,0,0.2,1),
              transform 0.3s cubic-bezier(0.4,0,0.2,1);
}
.brand-stat::before {
  content: '';
  position: absolute;
  top: 0; left: 0; right: 0;
  height: 3px;
  background: linear-gradient(90deg, var(--blue), var(--cyan));
  opacity: 0;
  transition: opacity 0.25s;
}
.brand-stat:hover {
  border-color: #c7d2fe;
  box-shadow: 0 8px 28px rgba(0, 85, 255, 0.08);
  transform: translateY(-2px);
}
.brand-stat:hover::before { opacity: 1; }
.brand-stat-val {
  font-family: 'Space Grotesk', sans-serif;
  font-size: 2rem;
  font-weight: 800;
  background: linear-gradient(135deg, var(--text), var(--blue));
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
  line-height: 1;
}
.brand-stat-lbl {
  font-size: 0.65rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--text-faint);
  margin-top: 5px;
}
.brand-stat-sparkline {
  display: flex;
  align-items: flex-end;
  gap: 2px;
  height: 24px;
  margin-top: 8px;
}
.brand-stat-sparkline .bar {
  width: 5px;
  border-radius: 2px;
  transform-origin: bottom;
  transform: scaleY(0);
  animation: brand-bar-grow 1.2s ease-out forwards;
}
.brand-stat-delta {
  position: absolute;
  top: 16px; right: 16px;
  font-size: 0.68rem;
  font-weight: 700;
  padding: 2px 8px;
  border-radius: 6px;
}
.brand-delta-up { color: var(--green); background: var(--badge-green-bg); }
.brand-delta-tag { color: var(--blue); background: var(--badge-blue-bg); }

/* ── Deal Cards ────────────────────────────────────────── */
.brand-deal-card {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 14px;
  padding: 16px 16px 16px 20px;
  position: relative;
  overflow: hidden;
  transition: transform 0.3s cubic-bezier(0.4,0,0.2,1),
              box-shadow 0.3s cubic-bezier(0.4,0,0.2,1),
              border-color 0.3s cubic-bezier(0.4,0,0.2,1);
  cursor: pointer;
}
.brand-deal-card:hover {
  transform: perspective(800px) rotateY(-1.5deg) rotateX(0.5deg) translateY(-3px);
  box-shadow: 0 12px 36px rgba(0, 85, 255, 0.08), 0 0 0 1px rgba(0, 85, 255, 0.06);
  border-color: #c7d2fe;
}
.brand-deal-stripe {
  position: absolute;
  top: 0; left: 0;
  width: 4px; height: 100%;
  border-radius: 14px 0 0 14px;
}
.brand-deal-name { font-weight: 700; font-size: 0.9rem; color: var(--text); }
.brand-deal-meta { font-size: 0.75rem; color: var(--text-dim); margin-top: 2px; }
.brand-deal-arr {
  font-family: 'Space Grotesk', sans-serif;
  font-size: 1.15rem;
  font-weight: 800;
  background: linear-gradient(135deg, var(--text), var(--blue));
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
  margin-top: 8px;
}
.brand-deal-badges { display: flex; gap: 5px; margin-top: 8px; flex-wrap: wrap; }

/* ── Badges ────────────────────────────────────────────── */
.brand-badge {
  font-size: 0.6rem;
  font-weight: 700;
  padding: 3px 8px;
  border-radius: 6px;
  display: inline-flex;
  align-items: center;
  gap: 3px;
}
.brand-badge-blue   { background: var(--badge-blue-bg);   color: var(--blue); }
.brand-badge-cyan   { background: var(--badge-cyan-bg);   color: var(--teal); }
.brand-badge-purple { background: var(--badge-purple-bg); color: var(--purple); }
.brand-badge-green  { background: var(--badge-green-bg);  color: var(--green); }
.brand-badge-amber  { background: var(--badge-amber-bg);  color: #d97706; }

/* ── Workflow Steps ────────────────────────────────────── */
.brand-wf-step {
  background: var(--surface);
  border: 1.5px solid var(--border);
  border-radius: 14px;
  padding: 14px 16px;
  position: relative;
  overflow: hidden;
  transition: border-color 0.2s, box-shadow 0.2s;
  cursor: pointer;
}
.brand-wf-step:hover {
  border-color: #c7d2fe;
  box-shadow: 0 4px 16px rgba(0, 85, 255, 0.06);
}
.brand-wf-step.active {
  border-color: var(--blue);
  background: linear-gradient(180deg, #eef2ff, white);
  box-shadow: 0 4px 20px rgba(0, 85, 255, 0.1);
}
.brand-wf-bar {
  position: absolute;
  top: 0; left: 0; right: 0;
  height: 3px;
  overflow: hidden;
}
.brand-wf-bar-fill {
  height: 100%;
  border-radius: 0 3px 3px 0;
  position: relative;
}
/* WHY: Shimmer conveys live momentum — the one allowed looping animation */
.brand-wf-bar-fill::after {
  content: '';
  position: absolute;
  inset: 0;
  background: linear-gradient(90deg, transparent, rgba(255,255,255,0.5), transparent);
  animation: brand-shimmer 3s ease-in-out infinite;
}
.brand-wf-num {
  font-family: 'Space Grotesk', sans-serif;
  font-size: 0.7rem;
  font-weight: 800;
  color: var(--blue);
}
.brand-wf-name { font-weight: 700; font-size: 0.82rem; color: var(--text); margin: 2px 0; }
.brand-wf-meta { font-size: 0.68rem; color: var(--text-faint); }

/* ── Glass Card ────────────────────────────────────────── */
.brand-glass {
  background: rgba(255, 255, 255, 0.8);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  border: 1px solid rgba(255, 255, 255, 0.9);
  border-radius: 16px;
  padding: 18px;
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.03);
}

/* ── Action Buttons ────────────────────────────────────── */
.brand-btn-primary {
  font-size: 0.78rem;
  font-weight: 700;
  padding: 8px 18px;
  border-radius: 10px;
  border: none;
  cursor: pointer;
  background: linear-gradient(135deg, var(--blue), var(--cyan));
  color: white;
  box-shadow: 0 4px 12px rgba(0, 85, 255, 0.2);
  transition: transform 0.2s, box-shadow 0.2s;
}
.brand-btn-primary:hover {
  transform: translateY(-1px);
  box-shadow: 0 6px 20px rgba(0, 85, 255, 0.3);
}
.brand-btn-secondary {
  font-size: 0.78rem;
  font-weight: 700;
  padding: 8px 18px;
  border-radius: 10px;
  border: none;
  cursor: pointer;
  background: var(--badge-blue-bg);
  color: var(--blue);
  transition: background 0.2s, transform 0.2s;
}
.brand-btn-secondary:hover {
  background: #e0e7ff;
  transform: translateY(-1px);
}

/* ── Animations ────────────────────────────────────────── */
@keyframes brand-bar-grow {
  to { transform: scaleY(1); }
}
@keyframes brand-shimmer {
  0% { transform: translateX(-100%); }
  100% { transform: translateX(200%); }
}
@keyframes brand-reveal-up {
  from { opacity: 0; transform: translateY(16px); }
  to   { opacity: 1; transform: translateY(0); }
}
.brand-reveal {
  opacity: 0;
  transform: translateY(16px);
  animation: brand-reveal-up 0.6s cubic-bezier(0.16, 1, 0.3, 1) forwards;
}

/* ── Print Overrides ───────────────────────────────────── */
@media print {
  *, *::before, *::after {
    animation: none !important;
    transition: none !important;
  }
  .brand-nav { position: static; box-shadow: none; }
  .brand-nav::after { display: none; }
  .brand-stat, .brand-deal-card, .brand-wf-step {
    box-shadow: none !important;
    transform: none !important;
    break-inside: avoid;
  }
  .brand-stat::before { display: none; }
  .brand-stat-val, .brand-deal-arr, .gradient-text {
    -webkit-text-fill-color: var(--text) !important;
    background: none !important;
  }
}
```

- [ ] **Step 2: Verify file created correctly**

Run: `wc -l public/css/brand.css && head -5 public/css/brand.css`
Expected: ~250 lines, starts with the comment block

- [ ] **Step 3: Commit**

```bash
git add public/css/brand.css
git commit -m "feat(design): create brand.css shared design system

Problem: Admin pages have inconsistent styling with no shared design tokens,
nav bar, or component styles.

Solution: Shared CSS with color tokens, branded nav bar, stat cards, deal
cards with 3D tilt, badges, workflow steps with shimmer, glass cards,
action buttons, reveal animations, and print overrides."
```

---

### Task 2: Create `public/js/brand.js` — Shared Animations + Utilities

**Files:**
- Create: `public/js/brand.js`

- [ ] **Step 1: Create the JS file with counter animation, confetti, and reveal observer**

```javascript
/* ═══════════════════════════════════════════════════════
   brand.js — Accelerate Robotics Shared Animations
   Import via: <script src="/js/brand.js"></script>
   ═══════════════════════════════════════════════════════ */

/**
 * Animate a number from 0 to target with easing.
 * @param {HTMLElement} el — element whose textContent gets updated
 * @param {number} target — final number
 * @param {string} prefix — e.g. '$'
 * @param {string} suffix — e.g. 'M' or 'K'
 * @param {number} duration — ms, default 1800
 */
function animateCounter(el, target, prefix, suffix, duration) {
  prefix = prefix || '';
  suffix = suffix || '';
  duration = duration || 1800;
  var start = performance.now();
  function update(now) {
    var t = Math.min((now - start) / duration, 1);
    /* WHY: Cubic ease-out for natural deceleration */
    var ease = 1 - Math.pow(1 - t, 3);
    var val = target * ease;
    if (suffix === 'M' || suffix === 'B') {
      el.textContent = prefix + val.toFixed(1) + suffix;
    } else if (suffix === 'K') {
      el.textContent = prefix + Math.round(val).toLocaleString() + suffix;
    } else {
      el.textContent = prefix + Math.round(val).toLocaleString();
    }
    if (t < 1) requestAnimationFrame(update);
  }
  requestAnimationFrame(update);
}

/**
 * Initialize all counters on the page.
 * Finds elements with [data-counter] and animates them.
 * Usage: <span class="brand-stat-val" data-counter="9">0</span>
 *        <span class="brand-stat-val" data-counter="2.4" data-prefix="$" data-suffix="M">$0</span>
 */
function initCounters() {
  document.querySelectorAll('[data-counter]').forEach(function(el) {
    var target = parseFloat(el.getAttribute('data-counter'));
    var prefix = el.getAttribute('data-prefix') || '';
    var suffix = el.getAttribute('data-suffix') || '';
    animateCounter(el, target, prefix, suffix);
  });
}

/**
 * Fire a confetti burst from a canvas element.
 * @param {HTMLCanvasElement} canvas
 */
function fireConfetti(canvas) {
  var ctx = canvas.getContext('2d');
  var parent = canvas.parentElement;
  canvas.width = parent.offsetWidth;
  canvas.height = parent.offsetHeight;

  /* WHY: Brand colors for on-brand celebration */
  var colors = ['#0055ff', '#00c8ff', '#7c3aed', '#06b6d4', '#f59e0b', '#22c55e', '#ec4899', '#ff6b6b'];
  var particles = [];

  for (var i = 0; i < 80; i++) {
    particles.push({
      x: canvas.width / 2,
      y: canvas.height / 2,
      vx: (Math.random() - 0.5) * 16,
      vy: (Math.random() - 0.7) * 14,
      w: Math.random() * 8 + 4,
      h: Math.random() * 6 + 3,
      color: colors[Math.floor(Math.random() * colors.length)],
      rotation: Math.random() * 360,
      rotSpeed: (Math.random() - 0.5) * 12,
      /* WHY: Slight gravity variance makes the burst feel organic */
      gravity: 0.25 + Math.random() * 0.15,
      life: 1
    });
  }

  function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    var alive = false;
    for (var j = 0; j < particles.length; j++) {
      var p = particles[j];
      if (p.life <= 0) continue;
      alive = true;
      p.x += p.vx;
      p.vy += p.gravity;
      p.y += p.vy;
      p.vx *= 0.98;
      p.rotation += p.rotSpeed;
      p.life -= 0.012;

      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rotation * Math.PI / 180);
      ctx.globalAlpha = Math.max(0, p.life);
      ctx.fillStyle = p.color;
      ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
      ctx.restore();
    }
    if (alive) requestAnimationFrame(draw);
  }
  draw();
}

/**
 * Set up IntersectionObserver for staggered reveal animations.
 * Elements with class 'brand-reveal' get animation-delay based on data-delay attribute.
 * Call once on DOMContentLoaded.
 */
function initRevealAnimations() {
  document.querySelectorAll('.brand-reveal').forEach(function(el) {
    var delay = el.getAttribute('data-delay') || '0';
    el.style.animationDelay = delay + 's';
  });
}

/**
 * Set the active nav link based on current page path.
 * Matches href against window.location.pathname.
 */
function initActiveNavLink() {
  var path = window.location.pathname;
  document.querySelectorAll('.brand-nav-links a').forEach(function(a) {
    var href = a.getAttribute('href');
    if (href && path.indexOf(href) !== -1) {
      a.classList.add('active');
    }
  });
}

/* Auto-initialize on DOM ready */
document.addEventListener('DOMContentLoaded', function() {
  initRevealAnimations();
  initActiveNavLink();
  /* WHY: 400ms delay lets the reveal animations settle before counters start rolling */
  setTimeout(initCounters, 400);
});
```

- [ ] **Step 2: Verify file created correctly**

Run: `wc -l public/js/brand.js && head -5 public/js/brand.js`
Expected: ~120 lines, starts with the comment block

- [ ] **Step 3: Commit**

```bash
git add public/js/brand.js
git commit -m "feat(design): create brand.js shared animation utilities

Problem: Counter animations, confetti, and reveal logic would be
duplicated across every page.

Solution: Shared JS with animateCounter (data-counter attribute driven),
fireConfetti (canvas-based burst), initRevealAnimations (staggered delays),
and initActiveNavLink (auto-highlights current page in nav)."
```

---

### Task 3: Brand the Command Center (`public/admin-command-center.html`)

**Files:**
- Modify: `public/admin-command-center.html`

This is the highest-impact page — the main dashboard. Apply the full design system.

- [ ] **Step 1: Add brand.css and brand.js imports**

Add these two lines inside `<head>`, after the Google Fonts link and before the `<style>` block:

```html
<link rel="stylesheet" href="/css/brand.css">
```

Add this line before the closing `</body>` tag:

```html
<script src="/js/brand.js"></script>
```

- [ ] **Step 2: Replace the header HTML**

Find the current header block (starts with `<header class="bg-white border-b border-gray-100 sticky top-0 z-40">` and ends with `</header>`) and replace it with:

```html
<nav class="brand-nav">
  <div class="brand-nav-logo">
    <svg width="19" height="19" viewBox="0 0 24 24" fill="none"><path d="M13 3L4 14h7l-1 7 9-11h-7l1-7z" fill="white" stroke="white" stroke-width="1.5"/></svg>
  </div>
  <div class="brand-nav-identity">
    <div class="brand-nav-name">Accelerate <span>Robotics</span></div>
    <div class="brand-nav-tagline">One Brain. Many Bots.</div>
  </div>
  <div class="brand-nav-links">
    <a href="/admin" class="active">Command Center</a>
    <a href="/admin/deals">Deals</a>
    <a href="/pages/pipeline-prospects.html">Prospects</a>
    <a href="/pages/robot-catalog.html">Catalog</a>
    <a href="/pages/fleet-designer.html">Fleet</a>
    <a href="/pages/national-rollout-strategy.html">Rollout</a>
  </div>
</nav>
```

- [ ] **Step 3: Add `data-counter` attributes to stat values**

Find each `.stat-pill .stat-val` element and add `data-counter` attributes. For example, the deals count stat should become:

```html
<div class="brand-stat-val" data-counter="9">0</div>
```

The pipeline value stat:

```html
<div class="brand-stat-val" data-counter="2.4" data-prefix="$" data-suffix="M">$0</div>
```

Update each stat pill to use the `brand-stat` class and add sparkline bars. Each stat gets a sparkline div after the label:

```html
<div class="brand-stat-sparkline">
  <div class="bar" style="height:8px; background:linear-gradient(180deg,var(--blue),var(--cyan)); animation-delay:0.4s;"></div>
  <div class="bar" style="height:14px; background:linear-gradient(180deg,var(--blue),var(--cyan)); animation-delay:0.5s;"></div>
  <div class="bar" style="height:10px; background:linear-gradient(180deg,var(--blue),var(--cyan)); animation-delay:0.6s;"></div>
  <div class="bar" style="height:18px; background:linear-gradient(180deg,var(--blue),var(--cyan)); animation-delay:0.7s;"></div>
  <div class="bar" style="height:12px; background:linear-gradient(180deg,var(--blue),var(--cyan)); animation-delay:0.8s;"></div>
  <div class="bar" style="height:22px; background:linear-gradient(180deg,var(--blue),var(--cyan)); animation-delay:0.9s;"></div>
</div>
```

- [ ] **Step 4: Update workflow steps to use brand classes**

Replace each `.wf-step-inner` with the `brand-wf-step` class and add the shimmer bar inside:

```html
<div class="brand-wf-step active">
  <div class="brand-wf-bar"><div class="brand-wf-bar-fill" style="width:75%;background:linear-gradient(90deg,var(--blue),var(--cyan));"></div></div>
  <div class="brand-wf-num">01</div>
  <div class="brand-wf-name">Property Assessment</div>
  <div class="brand-wf-meta">3 in progress</div>
</div>
```

- [ ] **Step 5: Add `brand-reveal` classes with staggered delays**

Add `class="brand-reveal"` and `data-delay="0.1"` (incrementing by 0.05 for each element) to the major sections: stats row, workflow row, deal list, map panel.

- [ ] **Step 6: Remove duplicate inline styles**

Remove any inline `<style>` rules that are now covered by `brand.css` — specifically: stat-pill styles, nav styles, and any duplicated color values. Keep page-specific styles (map, Leaflet overrides, tool cards) inline.

- [ ] **Step 7: Test in browser**

Run: `npm run dev` (if not running)
Open: `http://localhost:3000/admin`
Verify:
- Gradient underline appears under nav
- "One Brain. Many Bots." tagline visible
- Stat numbers animate from 0 on load
- Sparkline bars grow in with stagger
- Workflow steps show shimmer on progress bars
- Deal cards tilt on hover
- All nav links work
- Page feels settled within 1.5s

- [ ] **Step 8: Commit**

```bash
git add public/admin-command-center.html
git commit -m "feat(design): brand Command Center with design system

Problem: Command Center had generic white-card layout with no brand identity.

Solution: Branded nav with gradient underline and tagline, stat cards with
animated counters and sparklines, workflow steps with shimmer, deal cards
with 3D tilt hover, staggered reveal animations on page load."
```

---

### Task 4: Brand the Deals Pipeline (`public/admin-deals.html`)

**Files:**
- Modify: `public/admin-deals.html`

- [ ] **Step 1: Add brand.css and brand.js imports**

Add in `<head>` after Google Fonts link:
```html
<link rel="stylesheet" href="/css/brand.css">
```
Add before `</body>`:
```html
<script src="/js/brand.js"></script>
```

- [ ] **Step 2: Replace header with branded nav**

Replace the current `<header>` block with the same branded nav HTML from Task 3, Step 2, but set the active link to Deals:

```html
<a href="/admin/deals" class="active">Deals</a>
```

- [ ] **Step 3: Update stat elements to brand classes**

Replace `.stat` with `brand-stat`, `.stat-value` with `brand-stat-val` (adding `data-counter` attributes), `.stat-label` with `brand-stat-lbl`.

- [ ] **Step 4: Update kanban deal cards**

Add `brand-deal-card` class to each deal card in the kanban. Add `brand-deal-stripe` div as the first child with appropriate gradient color based on deal. Add `brand-badge` classes to stage badges.

- [ ] **Step 5: Add confetti canvas for "Closed Won"**

Add a canvas element positioned over the kanban area:
```html
<canvas id="confettiCanvas" style="position:fixed;inset:0;pointer-events:none;z-index:9999;"></canvas>
```

In the deal stage update handler (in `deals.js`), after successfully moving a deal to "Closed Won" stage, add:
```javascript
fireConfetti(document.getElementById('confettiCanvas'));
```

- [ ] **Step 6: Add reveal animations**

Add `brand-reveal` class with staggered `data-delay` to stat row, kanban columns.

- [ ] **Step 7: Remove duplicate inline styles covered by brand.css**

- [ ] **Step 8: Test in browser**

Open: `http://localhost:3000/admin/deals`
Verify:
- Branded nav with "Deals" active
- Stat numbers animate
- Deal cards have colored stripes and tilt on hover
- Kanban layout unchanged
- (Manual test) Moving a deal to Closed Won fires confetti

- [ ] **Step 9: Commit**

```bash
git add public/admin-deals.html public/js/deals.js
git commit -m "feat(design): brand Deals Pipeline with design system + confetti

Problem: Deals page had no brand identity, deal cards were plain white.

Solution: Branded nav, stat cards with animated counters, deal cards with
colored stripes and 3D tilt, branded badges, confetti burst on Closed Won."
```

---

### Task 5: Brand the Prospect Pipeline (`pages/pipeline-prospects.html`)

**Files:**
- Modify: `pages/pipeline-prospects.html`

- [ ] **Step 1: Add brand.css and brand.js imports**

Since this file is in `pages/`, use relative path:
```html
<link rel="stylesheet" href="../public/css/brand.css">
```
Before `</body>`:
```html
<script src="../public/js/brand.js"></script>
```

- [ ] **Step 2: Replace header with branded nav**

Replace the current `<header>` with branded nav HTML. Set active link:
```html
<a href="/pages/pipeline-prospects.html" class="active">Prospects</a>
```

Adjust nav link paths to use relative paths from `pages/`:
```html
<a href="../public/admin-command-center.html">Command Center</a>
```

- [ ] **Step 3: Update stat pills to brand-stat classes**

Replace `.stat-pill` with `brand-stat`, `.stat-val` with `brand-stat-val` (add `data-counter`), `.stat-lbl` with `brand-stat-lbl`.

- [ ] **Step 4: Add stripe colors to prospect cards**

In the JS that renders prospect cards, add a stripe based on brand class:
- Luxury properties: `background: linear-gradient(180deg, #f59e0b, #fbbf24)` (amber)
- Soft brand: `background: linear-gradient(180deg, var(--teal), #67e8f9)` (teal)
- Chain: `background: linear-gradient(180deg, var(--blue), var(--cyan))` (blue)
- Independent: `background: linear-gradient(180deg, var(--purple), #a78bfa)` (purple)

- [ ] **Step 5: Update "Convert to Deal" modal button**

Change the submit button in the modal to use `brand-btn-primary` class.

- [ ] **Step 6: Add brand-reveal animations to card grid**

- [ ] **Step 7: Remove duplicate inline styles**

- [ ] **Step 8: Test in browser**

Open: `file:///Users/ericrace/Code/accelerate-robotics/pages/pipeline-prospects.html`
Verify:
- Branded nav with "Prospects" active
- Stat counters animate
- Prospect cards have colored left stripes by brand class
- Search, sort, filters still work
- Convert to Deal modal has gradient button
- Card/table view toggle works

- [ ] **Step 9: Commit**

```bash
git add pages/pipeline-prospects.html
git commit -m "feat(design): brand Prospect Pipeline with design system

Problem: Prospect page had generic white cards with no brand identity.

Solution: Branded nav, animated stat counters, prospect cards with
tier-colored stripes (amber=luxury, teal=soft, blue=chain, purple=independent),
branded modal button, staggered card reveals."
```

---

### Task 6: Brand the Investor CRM (`pages/investor-crm.html`)

**Files:**
- Modify: `pages/investor-crm.html`

- [ ] **Step 1: Add brand.css and brand.js imports** (relative paths from `pages/`)

- [ ] **Step 2: Replace custom header with branded nav**

The investor CRM has a unique header with round info pills. Replace the entire `.header` div with branded nav. Move the round info (Target, SAFE Note, Committed) into a sub-header row below the nav:

```html
<div style="max-width:1400px;margin:0 auto;padding:16px 28px 0;display:flex;gap:8px;flex-wrap:wrap;">
  <span class="brand-badge brand-badge-blue">Target: $500K – $6M</span>
  <span class="brand-badge brand-badge-purple">SAFE Note (Rolling Close)</span>
  <span class="brand-badge brand-badge-green">Committed: $0</span>
</div>
```

Set active nav link:
```html
<a href="/pages/investor-crm.html" class="active">Investors</a>
```

- [ ] **Step 3: Apply purple theme to investor cards**

Add `brand-deal-stripe` with purple gradient to each investor card. Use `brand-badge-purple` for status badges.

- [ ] **Step 4: Apply gradient text to fund size numbers**

Add `gradient-text` class (from brand.css) to dollar amounts.

- [ ] **Step 5: Remove duplicate inline styles, add reveals**

- [ ] **Step 6: Test in browser, commit**

```bash
git add pages/investor-crm.html
git commit -m "feat(design): brand Investor CRM with design system

Problem: Investor CRM had custom header disconnected from admin navigation.

Solution: Branded nav with Investors link, round info as branded badges,
investor cards with purple stripes, gradient text on fund sizes."
```

---

### Task 7: Brand the Robot Catalog (`pages/robot-catalog.html`)

**Files:**
- Modify: `pages/robot-catalog.html`

- [ ] **Step 1: Add brand.css and brand.js imports**

- [ ] **Step 2: Replace hero section with branded nav**

The robot catalog has a large hero banner. Replace it with the branded nav and a compact page header:

```html
<!-- After branded nav -->
<div style="max-width:1400px;margin:0 auto;padding:24px 28px 0;">
  <h1 class="brand-headline" style="font-size:1.6rem;font-weight:800;">Robot Intelligence Platform</h1>
  <p style="color:var(--text-dim);font-size:0.88rem;">222 robots across 18 companies — live database</p>
</div>
```

Set active nav link to "Catalog".

- [ ] **Step 3: Apply brand styling to robot cards**

Add category-colored stripes to robot cards (cleaning=teal, delivery=blue, humanoid=purple, quadruped=amber, security=green, etc.).

- [ ] **Step 4: Apply glass-card treatment to filter sidebar**

Add `brand-glass` class to the filter panel.

- [ ] **Step 5: Update spec values to Space Grotesk**

Add `brand-headline` class to payload, speed, runtime values in robot cards.

- [ ] **Step 6: Remove duplicate styles, add reveals, test, commit**

```bash
git add pages/robot-catalog.html
git commit -m "feat(design): brand Robot Catalog with design system

Problem: Robot catalog had standalone hero section disconnected from admin nav.

Solution: Branded nav with Catalog link, compact page header, category-colored
robot card stripes, glass-card filter sidebar, Space Grotesk spec values."
```

---

### Task 8: Brand the Fleet Designer (`pages/fleet-designer.html`)

**Files:**
- Modify: `pages/fleet-designer.html`

- [ ] **Step 1: Add brand.css and brand.js imports**

- [ ] **Step 2: Replace `.topbar` header with branded nav**

Set active nav link to "Fleet".

- [ ] **Step 3: Apply glass-card treatment to recommendation cards**

Add `brand-glass` class. Add hover glow via inline style or additional class.

- [ ] **Step 4: Update export button to `brand-btn-primary`**

- [ ] **Step 5: Apply gradient text to cost summary values**

Add `gradient-text` class to total cost, monthly cost, ARR numbers.

- [ ] **Step 6: Remove duplicate styles, add reveals, test, commit**

```bash
git add pages/fleet-designer.html
git commit -m "feat(design): brand Fleet Designer with design system

Problem: Fleet designer had custom topbar disconnected from admin navigation.

Solution: Branded nav with Fleet link, glass-card recommendation panels,
gradient primary export button, gradient text on cost values."
```

---

### Task 9: Brand the National Rollout Strategy (`pages/national-rollout-strategy.html`)

**Files:**
- Modify: `pages/national-rollout-strategy.html`

- [ ] **Step 1: Add brand.css and brand.js imports**

- [ ] **Step 2: Add branded nav before the hero section**

This page has a dark hero — keep it, but add the branded nav above it. Set active link to "Rollout".

- [ ] **Step 3: Apply gradient text to TAM values**

Add `gradient-text` class to dollar amounts ($468M+ TAM, market sizes).

- [ ] **Step 4: Apply region-colored stripes to market cards**

- [ ] **Step 5: Add hover elevation to chain logos**

- [ ] **Step 6: Remove duplicate styles where applicable, test, commit**

```bash
git add pages/national-rollout-strategy.html
git commit -m "feat(design): brand National Rollout Strategy with design system

Problem: National rollout page had no admin navigation.

Solution: Branded nav with Rollout link, gradient text on TAM values,
region-colored market card stripes, hover elevation on chain logos."
```

---

### Task 10: Brand remaining pages (Deal Detail, Assessment, Login)

**Files:**
- Modify: `public/admin-deal-detail.html`
- Modify: `pages/assessment.html`
- Modify: `pages/assessments.html`
- Modify: `public/admin-login.html`

- [ ] **Step 1: Brand `admin-deal-detail.html`**

Add brand.css/brand.js imports. Replace header with branded nav (active: "Deals"). Apply `gradient-text` to ARR value. Apply `brand-glass` to contact cards. Apply `brand-badge` classes to stage badges.

- [ ] **Step 2: Brand `assessment.html`**

Add brand.css import. Replace custom `.header` with branded nav. Add blue focus ring to form inputs:
```css
input:focus, select:focus, textarea:focus {
  border-color: var(--blue);
  box-shadow: 0 0 0 3px rgba(0, 85, 255, 0.08);
  outline: none;
}
```

- [ ] **Step 3: Brand `assessments.html`**

Add brand.css/brand.js imports. Replace header with branded nav.

- [ ] **Step 4: Brand `admin-login.html`**

Add brand.css import. Update the login button to `brand-btn-primary` class. Update the logo gradient to match brand tokens.

- [ ] **Step 5: Test all four pages in browser**

Verify:
- Deal detail: branded nav, gradient ARR, glass contacts
- Assessment: branded nav, blue focus rings on inputs
- Assessments list: branded nav
- Login: gradient button matches brand

- [ ] **Step 6: Commit**

```bash
git add public/admin-deal-detail.html pages/assessment.html pages/assessments.html public/admin-login.html
git commit -m "feat(design): brand Deal Detail, Assessment, and Login pages

Problem: Remaining admin pages had inconsistent headers and no brand styling.

Solution: Branded nav on all four pages, gradient ARR on deal detail,
blue focus rings on assessment form, gradient login button."
```

---

### Task 11: Update CSP to allow brand.css and brand.js

**Files:**
- Modify: `src/server.js` (if needed)

- [ ] **Step 1: Check if CSP blocks the new CSS/JS files**

Run the dev server, open the browser console, check for CSP violations when loading brand.css and brand.js. Since these are self-hosted static files under `public/`, they should be allowed by default ('self' directive). If not:

- [ ] **Step 2: No CSP change needed (verify only)**

Static files in `public/` are served by Express static middleware and fall under the `'self'` CSP directive. No change needed unless the console shows violations.

- [ ] **Step 3: Commit (only if changes were needed)**

---

### Task 12: Final visual QA pass

**Files:** None (verification only)

- [ ] **Step 1: Open each page and verify branded nav**

Open each of these URLs and verify the branded nav appears with correct active link:

1. `http://localhost:3000/admin` — Command Center (active)
2. `http://localhost:3000/admin/deals` — Deals (active)
3. `http://localhost:3000/admin/deals/1` — Deals (active), deal detail
4. `file:///...pages/pipeline-prospects.html` — Prospects (active)
5. `file:///...pages/investor-crm.html` — Investors (active)
6. `file:///...pages/robot-catalog.html` — Catalog (active)
7. `file:///...pages/fleet-designer.html` — Fleet (active)
8. `file:///...pages/national-rollout-strategy.html` — Rollout (active)
9. `file:///...pages/assessment.html` — nav present
10. `http://localhost:3000/admin-login.html` — gradient button

- [ ] **Step 2: Verify animations on Command Center**

- Counters roll up from 0
- Sparkline bars grow in with stagger
- Workflow shimmer is visible
- Deal cards tilt on hover
- Cards fade in with stagger on load

- [ ] **Step 3: Verify print mode**

Open Command Center, press Cmd+P. Verify:
- No animation artifacts
- Gradient text falls back to solid color
- Cards have no box-shadow
- Nav is static (not sticky)

- [ ] **Step 4: Commit any fixes found during QA**

```bash
git add -A
git commit -m "fix(design): QA fixes from visual review pass"
```
