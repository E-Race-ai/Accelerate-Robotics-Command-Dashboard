# Toolkit Team View — Tetris Layout

**Date**: 2026-04-27
**Page**: `public/admin-command-center.html`
**Status**: Spec
**Author**: Eric + Claude

## Why

Today's toolkit grid sorts cards into Small / Medium / Large buckets. Visually it reads as 20+ independent floating tiles. The metaphor is wrong: it makes the org look like silos, when in fact every department is part of one team and the board *is* the team's collective focus.

Eric's brief: "make it feel like teamwork — like Tetris blocks fitting together." Each week brings a different mix of work; the board should naturally reshape itself to reflect that mix without anyone hand-tuning the layout.

## What

A new default view of the toolkit grid where each department's cards form a single rectangular Tetris-style block, and all department blocks pack together into one tight canvas with no gaps between teams.

The Tetris metaphor is preserved through:
- **Canonical Tetris colors** per department (red, blue, cyan, yellow, green, orange, purple)
- **Sharp blocky corners** — no border-radius on the block container
- **Zero gap inside a block** so the dept reads as one piece; **4px gutter between blocks** so pieces are distinguishable but interlocked
- **Dense packing** so the canvas has no empty cells (or as few as possible)

## Block shape selection

Every card is one cell, all cells the same size. Given N cards in a department, the block dimensions are:

| N | Shape | Tetris analogue |
|---|---|---|
| 1 | 1×1 | (single block) |
| 2 | 1×2 | domino |
| 3 | 1×3 | I-tromino |
| 4 | 2×2 | **O-piece** |
| 5 | 1×5 | long bar |
| 6 | 2×3 | rectangle |
| 7 | 1×7 | long bar |
| 8 | 2×4 | rectangle |
| 9 | 3×3 | square |
| 10 | 2×5 | rectangle |
| 12 | 3×4 | rectangle |

**Rule**: prefer the most-square rectangle that exactly equals N cells. Primes >3 stay as 1×N strips (clean and unambiguous). Numbers > 12 fall back to ⌈√N⌉ × ⌈N/⌈√N⌉⌉ and accept up to one trailing empty cell at the bottom-right of that block (filled with a faint placeholder cell that matches the dept tint).

## Department colors (Tetris palette)

Mapped from canonical Tetris piece colors. Each block paints all its cells with this color at low saturation, plus a 3px solid color band on top.

| Department | Color | Hex |
|---|---|---|
| Sales | Tetris red (Z) | `#ef4444` |
| Operations | Tetris orange (L) | `#f97316` |
| Engineering | Tetris cyan (I) | `#06b6d4` |
| Product | Tetris purple (T) | `#a855f7` |
| Finance | Tetris green (S) | `#22c55e` |
| Strategy | Tetris blue (J) | `#3b82f6` |
| Marketing | Tetris yellow (O) | `#eab308` |
| Other | Slate | `#64748b` |

These override the per-card `--ql-accent` color *only inside Team view*; other sort modes still use the existing per-card colors.

## Block treatment

Each `.dept-block` contains:
- **Header band** (3px tall, full block width, dept color, no text inside the band itself)
- **Block label** above the band: `Engineering · 5` (dept name + active card count)
- **Cells** (the existing `.ql-card` markup, unchanged) tiled inside via CSS Grid

Inside the block, cells touch — no gutter. Outside the block, a 4px gutter separates adjacent blocks. Block container has `border-radius: 0` to keep the Tetris piece feel; cards inside keep their existing rounded corners (subtle contrast with the sharp outer block).

## Packing

The container is a CSS Grid with a fixed column count (`grid-template-columns: repeat(8, 1fr)` to start; tunable). Blocks are placed using `grid-column: span W; grid-row: span H` based on the dimensions table above.

`grid-auto-flow: dense` lets the browser pack later blocks into earlier gaps when possible. Department order = the existing curated order (`TOOLKIT_DEPT_ORDER`): Sales → Ops → Engineering → Product → Finance → Strategy → Marketing → Other.

If a row ends with empty cells, the next dept block flows into that gap if it fits; otherwise the gap is left empty (acceptable but rare with `grid-auto-flow: dense`).

## Sort bar behavior

- "Default" pill is replaced with **"Team"** — this becomes the default view.
- Other sort buttons (A–Z, Owner, Department, Topic, Size) work as today and revert to the uniform tile grid.
- The up/down direction toggle hides when "Team" is active (it's a layout, not a sort).

## Architecture

**Markup** (rendered by JS at sort-apply time):

```html
<div class="toolkit-tetris">
  <div class="dept-block" data-dept="sales" style="--block-w:3; --block-h:1; --dept-color:#ef4444">
    <div class="dept-block-label">Sales · 3</div>
    <div class="dept-block-band"></div>
    <div class="dept-block-cells">
      <a class="ql-card" ...>...</a>
      <a class="ql-card" ...>...</a>
      <a class="ql-card" ...>...</a>
    </div>
  </div>
  <div class="dept-block" data-dept="ops" ...>...</div>
  ...
</div>
```

**CSS** (new block, scoped to `.toolkit-tetris`):

- `.toolkit-tetris` — `display: grid; grid-template-columns: repeat(8, minmax(0, 1fr)); gap: 4px; grid-auto-flow: dense;`
- `.dept-block` — `grid-column: span var(--block-w); grid-row: span var(--block-h); background: color-mix(in srgb, var(--dept-color) 8%, transparent); border-radius: 0;`
- `.dept-block-label` — small text above the band, dept color, weight 600
- `.dept-block-band` — `height: 3px; background: var(--dept-color);`
- `.dept-block-cells` — inner CSS Grid that lays out N cards into the W×H shape, zero gap

**JS** (new function `applyTeamLayout()` in the existing `<script>` block):

- Read all `.ql-card` from the grid; group by `data-dept`
- For each dept (in `TOOLKIT_DEPT_ORDER`): pick W,H from the dimensions table for N cards, build a `.dept-block` wrapper, move cards inside
- Replace the grid contents with the new block-wrapped structure
- Add a class `toolkit-tetris` to the grid; remove it when switching to other sorts

**Sort bar wiring**: when sort = "team" (renamed from "default"), call `applyTeamLayout()`. For any other sort, strip the team layout (unwrap blocks) and call `applyToolkitSort()` as today.

## Motion — the board is alive

The shapes must feel like they're constantly evolving and shifting to respond to the org's changing needs. Static layout = static org. Motion is core to the metaphor, not polish.

**Drop-in on load**: when Team view first renders (or when toggled on), each dept block falls into place from above, one after another, like Tetris pieces dropping. Stagger ~80ms between blocks. Use `transform: translateY(-200%)` → `0` with `cubic-bezier(0.34, 1.56, 0.64, 1)` (slight overshoot bounce for the "settle"). Total animation under 1 second.

**Reflow on data change**: when a dept's card count changes (add/remove/reassign), the affected block resizes and neighbors slide to accommodate. Use a FLIP-style technique:
1. Capture each block's bounding rect *before* the change (`getBoundingClientRect()`)
2. Apply the data change and let the grid relayout
3. Capture the *after* rect; compute delta
4. Apply an inverse `transform: translate()` to each block, then animate to `translate(0, 0)` with a 250ms ease-out

**Manual reshuffle**: a small "↻ Reshuffle" affordance next to the sort pills replays the drop-in animation. Use this when previewing a different week's mix or just to feel the metaphor.

**Reduced motion**: respect `prefers-reduced-motion: reduce` — skip the drop-in and reflow animations, swap content in place.

## Out of scope (v1)

- Drag-to-rearrange between blocks
- Weekly filter ("show only items active this week" — for now the board *is* the active set)
- Mobile/narrow-viewport behavior beyond what CSS Grid auto-flow gives us
- Dept-color customization or a legend
- Real-time push: data changes are picked up on page load / manual refresh, not via websocket

## Wiring checklist

- [ ] New CSS block in the page's `<style>` section, scoped to `.toolkit-tetris`
- [ ] New JS function `applyTeamLayout()` and an unwrap function for switching back
- [ ] Drop-in animation on first render of Team view (staggered, with overshoot)
- [ ] FLIP reflow animation when card data changes
- [ ] Reshuffle button replays the drop-in
- [ ] `prefers-reduced-motion: reduce` skips animations
- [ ] Sort bar HTML: rename "Default" pill to "Team"
- [ ] Sort key handling: `'team'` is the new default, replaces `'default'`
- [ ] Up/down direction toggle hidden when sort = "team"
- [ ] All existing sort modes (A–Z, Owner, Department, Topic, Size) continue to work after switching away from Team
- [ ] Visual smoke test: with current 20+ cards, the Tetris layout has zero (or ≤1) empty cells

## Test plan

- **Manual**: open `/admin/command-center`, confirm Team view renders blocks per dept with correct counts and colors. Switch to A–Z and back. Confirm no console errors.
- **Edge cases**: dept with 1 card (1×1), dept with prime count (e.g., 5 → 1×5), dept with 12 cards (3×4).
- **Regression**: existing sort modes still work and the cards reach their correct destinations.

## Open question deferred

If the trailing empty cell on >12-card rectangles ever shows up in real data, we'll decide then whether to: (a) accept the placeholder, (b) split the dept into two stacked rectangles, or (c) absorb the gap into a neighbor's block. Don't pre-solve.
