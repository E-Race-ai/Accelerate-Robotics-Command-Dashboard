# Facility Configurator Enhancement — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add progressive-disclosure facility configuration (elevator specs, amenities, surface zones) to the Fleet Designer left panel, with fleet algorithm score multipliers and enhanced config.yml export.

**Architecture:** Single-file enhancement to `pages/fleet-designer.html`. A "Configure Facility Details" expand button reveals a detail card with three sub-groups (Elevator, Amenities, Surface Zones). Surface zones auto-derive the global `surfaces` array for backward compatibility. PIPELINE data model gains new fields; fleet scoring gets lightweight F&B and event-space multipliers.

**Tech Stack:** Vanilla HTML/CSS/JS in a self-contained HTML page. No build step, no dependencies.

**Spec:** `docs/superpowers/specs/2026-04-21-facility-configurator-design.md`

---

## File Structure

All changes are in a single file:

- **Modify:** `pages/fleet-designer.html`
  - CSS section (~line 464–499): Add styles for expand button, detail card, zone groups, amenity chips, elevator fields
  - HTML section (~line 1665–1691): Replace static surface grid with summary + expand button + detail card
  - JS PIPELINE constant (~line 1971–2053): Add new fields to all 9 properties
  - JS `initPropertySection()` (~line 2840–2907): Wire expand/collapse, auto-fill new fields on property change
  - JS `generateFleet()` (~line 2362–2458): Add F&B and event-space score multipliers
  - JS `downloadProposalConfig()` (~line 3040–3108): Add new YAML sections
  - JS new function `syncSurfacesFromZones()`: Derive global surfaces from zone union

---

### Task 1: Add CSS for the facility detail card

**Files:**
- Modify: `pages/fleet-designer.html` — CSS section, after `.surface-chip.checked` block (~line 499)

- [ ] **Step 1: Add CSS for expand button, detail card, sub-groups, zone chips, and amenity chips**

Insert these styles immediately after the `.surface-chip.checked` closing brace (after line 499, before the `/* ── Goal chips ── */` comment at line 501):

```css
/* ── Facility detail card ── */
.facility-expand-btn {
    width:100%;
    padding:8px 12px;
    border:1px dashed var(--blue);
    border-radius:8px;
    background:transparent;
    color:var(--blue);
    font-size:0.68rem;
    font-weight:600;
    font-family:'Inter',sans-serif;
    cursor:pointer;
    transition:all 0.15s;
    text-align:left;
}

.facility-expand-btn:hover {
    background:rgba(0,85,255,0.04);
    border-style:solid;
}

.facility-expand-btn .arrow { margin-right:4px; }

.facility-expand-btn .detail-count {
    color:var(--muted);
    font-weight:500;
    font-size:0.6rem;
}

.facility-detail-card {
    background:rgba(255,255,255,0.85);
    border:1px solid var(--border);
    border-radius:10px;
    padding:12px;
    display:flex;
    flex-direction:column;
    gap:10px;
}

.facility-detail-card.hidden { display:none; }

.fd-group-label {
    font-size:0.55rem;
    font-weight:700;
    color:var(--blue);
    text-transform:uppercase;
    letter-spacing:0.6px;
    margin-bottom:4px;
}

.fd-divider {
    height:1px;
    background:var(--border);
}

.fd-field-row {
    display:flex;
    gap:6px;
}

.fd-field-row .prop-metric { flex:1; }

.fd-elevator-make {
    width:100%;
    padding:7px 10px;
    border-radius:7px;
    border:1px solid var(--border);
    background:rgba(255,255,255,0.8);
    color:var(--text);
    font-size:0.82rem;
    font-family:'Inter',sans-serif;
    outline:none;
    transition:all 0.15s;
}

.fd-elevator-make:focus {
    border-color:var(--blue);
    background:rgba(255,255,255,0.95);
    box-shadow:0 0 0 3px rgba(0,85,255,0.08);
}

.fd-elevator-custom {
    margin-top:4px;
    width:100%;
    padding:7px 10px;
    border-radius:7px;
    border:1px solid var(--border);
    background:rgba(255,255,255,0.8);
    color:var(--text);
    font-size:0.82rem;
    font-family:'Inter',sans-serif;
    outline:none;
}

/* ── Amenity chips — same style as surface chips, blue accent ── */
.amenity-grid {
    display:flex;
    flex-wrap:wrap;
    gap:5px;
}

.amenity-chip {
    display:inline-flex;
    align-items:center;
    gap:4px;
    padding:5px 10px;
    border-radius:6px;
    border:1px solid var(--border);
    background:rgba(255,255,255,0.6);
    font-size:0.67rem;
    font-weight:600;
    color:var(--muted);
    cursor:pointer;
    user-select:none;
    transition:all 0.15s;
}

.amenity-chip input[type="checkbox"] { display:none; }

.amenity-chip:hover {
    background:rgba(0,85,255,0.06);
    border-color:rgba(0,85,255,0.3);
    color:var(--blue);
}

.amenity-chip.checked {
    background:rgba(0,85,255,0.09);
    border-color:var(--blue);
    color:var(--blue);
}

/* ── Surface zones ── */
.zone-group {
    margin-bottom:6px;
}

.zone-label {
    font-size:0.5rem;
    font-weight:700;
    color:var(--muted);
    text-transform:uppercase;
    letter-spacing:0.5px;
    margin-bottom:2px;
}

.zone-chips {
    display:flex;
    flex-wrap:wrap;
    gap:4px;
}

.zone-chip {
    display:inline-flex;
    align-items:center;
    padding:3px 8px;
    border-radius:5px;
    border:1px solid var(--border);
    background:rgba(255,255,255,0.6);
    font-size:0.58rem;
    font-weight:600;
    color:var(--muted);
    cursor:pointer;
    user-select:none;
    transition:all 0.15s;
}

.zone-chip:hover {
    background:rgba(22,163,74,0.06);
    border-color:rgba(22,163,74,0.3);
    color:var(--green);
}

.zone-chip.checked {
    background:rgba(22,163,74,0.09);
    border-color:var(--green);
    color:var(--green);
}

/* ── Surface summary line (shown when zones configured) ── */
.surface-summary {
    font-size:0.62rem;
    font-weight:500;
    color:var(--muted);
    padding:4px 0;
    font-style:italic;
}
```

- [ ] **Step 2: Verify the page still renders**

Run: `python3 -c "import re; content=open('pages/fleet-designer.html').read(); scripts=re.findall(r'<script>(.*?)</script>', content, re.DOTALL); open('/tmp/fc.js','w').write('\n'.join(scripts))" && node --check /tmp/fc.js && echo "JS syntax OK"`

Expected: `JS syntax OK`

- [ ] **Step 3: Commit**

```bash
git add pages/fleet-designer.html
git commit -m "feat(fleet-designer): add CSS for facility detail card, zone chips, amenity chips

Problem: No styles exist for the new progressive-disclosure facility configurator
Solution: Add CSS for expand button, detail card, elevator fields, amenity chips, surface zone groups, and surface summary line"
```

---

### Task 2: Add HTML for the facility detail card

**Files:**
- Modify: `pages/fleet-designer.html` — HTML section, replacing lines ~1667–1691

- [ ] **Step 1: Replace the static surface grid with summary + expand button + detail card**

Find this block (the `<div class="field">` containing `Floor Surfaces` and the surface grid, ending with the closing `</div>` of the form-section):

```html
            <div class="field">
                <label>Floor Surfaces</label>
                <div class="surface-grid">
                    <label class="surface-chip" id="surface-carpet">
                        <input type="checkbox" value="carpet">
                        Carpet
                    </label>
                    <label class="surface-chip" id="surface-hardwood">
                        <input type="checkbox" value="hardwood">
                        Hardwood
                    </label>
                    <label class="surface-chip" id="surface-tile">
                        <input type="checkbox" value="tile">
                        Tile
                    </label>
                    <label class="surface-chip" id="surface-terrazzo">
                        <input type="checkbox" value="terrazzo">
                        Terrazzo
                    </label>
                    <label class="surface-chip" id="surface-outdoor">
                        <input type="checkbox" value="outdoor">
                        Outdoor
                    </label>
                </div>
            </div>
        </div>
```

Replace with:

```html
            <!-- Surface chips — legacy global control, hidden when zones are configured -->
            <div class="field" id="surface-global-wrap">
                <label>Floor Surfaces</label>
                <div class="surface-grid">
                    <label class="surface-chip" id="surface-carpet">
                        <input type="checkbox" value="carpet">
                        Carpet
                    </label>
                    <label class="surface-chip" id="surface-hardwood">
                        <input type="checkbox" value="hardwood">
                        Hardwood
                    </label>
                    <label class="surface-chip" id="surface-tile">
                        <input type="checkbox" value="tile">
                        Tile
                    </label>
                    <label class="surface-chip" id="surface-terrazzo">
                        <input type="checkbox" value="terrazzo">
                        Terrazzo
                    </label>
                    <label class="surface-chip" id="surface-outdoor">
                        <input type="checkbox" value="outdoor">
                        Outdoor
                    </label>
                </div>
            </div>

            <!-- Surface summary — shown when zones are configured, replaces global chips -->
            <div id="surface-summary-wrap" style="display:none">
                <label style="font-size:0.58rem;font-weight:600;color:var(--muted);text-transform:uppercase;letter-spacing:0.6px;">Floor Surfaces</label>
                <div class="surface-summary" id="surface-summary-text">--</div>
            </div>

            <!-- Facility detail expand/collapse -->
            <button class="facility-expand-btn" id="facility-expand-btn" type="button">
                <span class="arrow">▸</span> Configure Facility Details
            </button>

            <!-- Facility detail card — hidden by default -->
            <div class="facility-detail-card hidden" id="facility-detail-card">

                <!-- ── Elevator sub-group ── -->
                <div class="fd-group-label">Elevator</div>
                <div class="prop-metric">
                    <label for="fd-elevator-make">Make / Model</label>
                    <select class="fd-elevator-make" id="fd-elevator-make">
                        <option value="">-- Unknown --</option>
                        <option value="ThyssenKrupp">ThyssenKrupp</option>
                        <option value="Otis">Otis</option>
                        <option value="KONE">KONE</option>
                        <option value="Schindler">Schindler</option>
                        <option value="Mitsubishi">Mitsubishi</option>
                        <option value="Other">Other...</option>
                    </select>
                    <input type="text" class="fd-elevator-custom" id="fd-elevator-custom" placeholder="Enter make/model" style="display:none">
                </div>
                <div class="fd-field-row">
                    <div class="prop-metric">
                        <label for="fd-elevator-guest">Guest Elevators</label>
                        <input type="number" id="fd-elevator-guest" placeholder="1" min="0">
                    </div>
                    <div class="prop-metric">
                        <label for="fd-elevator-service">Service Elevators</label>
                        <input type="number" id="fd-elevator-service" placeholder="0" min="0">
                    </div>
                </div>

                <div class="fd-divider"></div>

                <!-- ── Amenities sub-group ── -->
                <div class="fd-group-label">Amenities</div>
                <div class="amenity-grid" id="amenity-grid">
                    <label class="amenity-chip" id="amenity-pool">
                        <input type="checkbox" value="pool"> Pool
                    </label>
                    <label class="amenity-chip" id="amenity-rooftop">
                        <input type="checkbox" value="rooftop"> Rooftop
                    </label>
                    <label class="amenity-chip" id="amenity-courtyard">
                        <input type="checkbox" value="courtyard"> Courtyard
                    </label>
                    <label class="amenity-chip" id="amenity-sports">
                        <input type="checkbox" value="sports"> Sport Courts
                    </label>
                    <label class="amenity-chip" id="amenity-garden">
                        <input type="checkbox" value="garden"> Garden / Grounds
                    </label>
                </div>
                <div class="fd-field-row" style="margin-top:6px">
                    <div class="prop-metric">
                        <label for="fd-fb-outlets">F&B Outlets</label>
                        <input type="number" id="fd-fb-outlets" placeholder="0" min="0" max="20">
                    </div>
                    <div class="prop-metric">
                        <label for="fd-event-sqft">Event Space (sq ft)</label>
                        <input type="number" id="fd-event-sqft" placeholder="0" min="0">
                    </div>
                </div>

                <div class="fd-divider"></div>

                <!-- ── Surface Zones sub-group ── -->
                <div class="fd-group-label">Surface Zones</div>

                <div class="zone-group" data-zone="corridors">
                    <div class="zone-label">Guest Corridors</div>
                    <div class="zone-chips">
                        <span class="zone-chip" data-surface="carpet">Carpet</span>
                        <span class="zone-chip" data-surface="hardwood">Hardwood</span>
                        <span class="zone-chip" data-surface="tile">Tile</span>
                        <span class="zone-chip" data-surface="terrazzo">Terrazzo</span>
                    </div>
                </div>
                <div class="zone-group" data-zone="lobby">
                    <div class="zone-label">Lobby / Public</div>
                    <div class="zone-chips">
                        <span class="zone-chip" data-surface="carpet">Carpet</span>
                        <span class="zone-chip" data-surface="hardwood">Hardwood</span>
                        <span class="zone-chip" data-surface="tile">Tile</span>
                        <span class="zone-chip" data-surface="terrazzo">Terrazzo</span>
                    </div>
                </div>
                <div class="zone-group" data-zone="fb">
                    <div class="zone-label">F&B Areas</div>
                    <div class="zone-chips">
                        <span class="zone-chip" data-surface="carpet">Carpet</span>
                        <span class="zone-chip" data-surface="hardwood">Hardwood</span>
                        <span class="zone-chip" data-surface="tile">Tile</span>
                        <span class="zone-chip" data-surface="terrazzo">Terrazzo</span>
                    </div>
                </div>
                <div class="zone-group" data-zone="boh">
                    <div class="zone-label">BOH / Service</div>
                    <div class="zone-chips">
                        <span class="zone-chip" data-surface="carpet">Carpet</span>
                        <span class="zone-chip" data-surface="hardwood">Hardwood</span>
                        <span class="zone-chip" data-surface="tile">Tile</span>
                        <span class="zone-chip" data-surface="terrazzo">Terrazzo</span>
                    </div>
                </div>
            </div>
        </div>
```

- [ ] **Step 2: Verify JS syntax**

Run: `python3 -c "import re; content=open('pages/fleet-designer.html').read(); scripts=re.findall(r'<script>(.*?)</script>', content, re.DOTALL); open('/tmp/fc.js','w').write('\n'.join(scripts))" && node --check /tmp/fc.js && echo "JS syntax OK"`

Expected: `JS syntax OK`

- [ ] **Step 3: Commit**

```bash
git add pages/fleet-designer.html
git commit -m "feat(fleet-designer): add HTML for facility detail card

Problem: No UI exists for entering detailed facility specs (elevator, amenities, surface zones)
Solution: Add progressive-disclosure card with expand button, elevator make/split fields, outdoor amenity chips, F&B/event inputs, and four surface zone groups"
```

---

### Task 3: Add new fields to the PIPELINE constant

**Files:**
- Modify: `pages/fleet-designer.html` — JS PIPELINE constant (~lines 1971–2053)

- [ ] **Step 1: Add facility detail fields to all 9 PIPELINE entries**

Replace the entire PIPELINE constant (from `const PIPELINE = {` through the closing `};`) with:

```js
const PIPELINE = {
    'thesis-hotel': {
        name: 'Thesis Hotel',
        type: 'hotel',
        rooms: 245, floors: 10, guestFloors: '4-10', elevators: 2,
        surfaces: ['carpet', 'tile', 'hardwood', 'outdoor'],
        market: 'Miami',
        proposalUrl: '/accelerate-thesis-hotel/pages/proposal-interactive.html',
        siteProfileUrl: '/accelerate-thesis-hotel/pages/site-profile.html',
        // WHY: ThyssenKrupp TAC32T confirmed during site walk
        elevatorMake: 'ThyssenKrupp',
        elevatorGuestCount: 1,
        elevatorServiceCount: 1,
        outdoorAmenities: ['pool', 'rooftop'],
        fbOutlets: 3, // WHY: lobby restaurant + rooftop bar + pool bar
        eventSpaceSqFt: 5000, // WHY: ground-floor event spaces, approximate
        surfaceZones: {
            corridors: ['carpet'],
            lobby: ['tile', 'hardwood'],
            fb: ['hardwood'],
            boh: ['tile']
        }
    },
    'moore-miami': {
        name: 'The Moore Miami',
        type: 'hotel', // WHY: members' club, but "hotel" type closest match for fleet sizing
        rooms: 13, floors: 4, guestFloors: '2-4', elevators: 2,
        surfaces: ['hardwood', 'tile'],
        market: 'Miami',
        proposalUrl: '/accelerate-moore-miami/pages/proposal-interactive.html',
        siteProfileUrl: '/accelerate-moore-miami/pages/site-profile.html',
        elevatorMake: null, // WHY: not yet confirmed
        elevatorGuestCount: 1,
        elevatorServiceCount: 1,
        outdoorAmenities: ['rooftop', 'courtyard'],
        fbOutlets: 5, // WHY: ultra-premium F&B, multiple dining concepts + bars
        eventSpaceSqFt: 3000, // WHY: members' club event space, approximate
        surfaceZones: {
            corridors: ['hardwood'],
            lobby: ['hardwood', 'tile'],
            fb: ['hardwood'],
            boh: ['tile']
        }
    },
    'art-ovation': {
        name: 'Art Ovation Hotel',
        type: 'hotel',
        rooms: 162, floors: 6, guestFloors: '3-6', elevators: 3,
        surfaces: ['carpet', 'tile', 'hardwood'],
        market: 'Sarasota',
        proposalUrl: '/accelerate-art-ovation/pages/proposal-interactive.html',
        siteProfileUrl: '/accelerate-art-ovation/pages/site-profile.html',
        elevatorMake: null,
        elevatorGuestCount: 2,
        elevatorServiceCount: 1,
        outdoorAmenities: ['pool'],
        fbOutlets: 2, // WHY: restaurant + bar
        eventSpaceSqFt: 8000, // WHY: arts hotel has significant event/gallery space
        surfaceZones: {
            corridors: ['carpet'],
            lobby: ['tile', 'hardwood'],
            fb: ['hardwood'],
            boh: ['tile']
        }
    },
    'san-ramon-marriott': {
        name: 'San Ramon Marriott',
        type: 'hotel',
        rooms: 368, floors: 6, guestFloors: '2-6', elevators: 4,
        surfaces: ['carpet', 'tile'],
        market: 'East Bay, CA',
        proposalUrl: null,
        siteProfileUrl: null,
        elevatorMake: null,
        elevatorGuestCount: 3,
        elevatorServiceCount: 1,
        outdoorAmenities: ['pool', 'courtyard'],
        fbOutlets: 2, // WHY: typical full-service Marriott with restaurant + bar
        eventSpaceSqFt: 18000, // WHY: 18K sq ft meetings per prospect notes
        surfaceZones: {
            corridors: ['carpet'],
            lobby: ['tile'],
            fb: ['carpet', 'tile'],
            boh: ['tile']
        }
    },
    'lafayette-park': {
        name: 'Lafayette Park Hotel & Spa',
        type: 'hotel',
        rooms: 136, floors: 4, guestFloors: '2-4', elevators: 2,
        surfaces: ['carpet', 'hardwood'],
        market: 'East Bay, CA',
        proposalUrl: null,
        siteProfileUrl: null,
        elevatorMake: null,
        elevatorGuestCount: 1,
        elevatorServiceCount: 1,
        outdoorAmenities: ['garden', 'courtyard'],
        fbOutlets: 1, // WHY: one main restaurant
        eventSpaceSqFt: 5000, // WHY: boutique with modest event capability
        surfaceZones: {
            corridors: ['carpet'],
            lobby: ['hardwood'],
            fb: ['hardwood'],
            boh: ['tile']
        }
    },
    'claremont-resort': {
        name: 'Claremont Resort & Club',
        type: 'resort',
        rooms: 276, floors: 10, guestFloors: '2-10', elevators: 4,
        surfaces: ['carpet', 'hardwood', 'tile', 'outdoor'],
        market: 'East Bay, CA',
        proposalUrl: null,
        siteProfileUrl: null,
        elevatorMake: null,
        elevatorGuestCount: 3,
        elevatorServiceCount: 1,
        outdoorAmenities: ['pool', 'sports', 'garden'],
        fbOutlets: 3, // WHY: resort with multiple dining venues
        eventSpaceSqFt: 20000, // WHY: large resort conference and event facilities
        surfaceZones: {
            corridors: ['carpet'],
            lobby: ['hardwood', 'tile'],
            fb: ['hardwood'],
            boh: ['tile']
        }
    },
    'kimpton-sawyer': {
        name: 'Kimpton Sawyer',
        type: 'hotel',
        rooms: 250, floors: 16, guestFloors: '4-16', elevators: 4,
        surfaces: ['carpet', 'tile', 'hardwood'],
        market: 'Sacramento',
        proposalUrl: null,
        siteProfileUrl: null,
        elevatorMake: null,
        elevatorGuestCount: 3,
        elevatorServiceCount: 1,
        outdoorAmenities: ['pool', 'rooftop'],
        fbOutlets: 3, // WHY: Kimpton typically has restaurant + bar + rooftop
        eventSpaceSqFt: 10000, // WHY: convention-adjacent, significant meeting space
        surfaceZones: {
            corridors: ['carpet'],
            lobby: ['tile', 'hardwood'],
            fb: ['hardwood'],
            boh: ['tile']
        }
    },
    'citizen-hotel': {
        name: 'The Citizen Hotel',
        type: 'hotel',
        rooms: 196, floors: 14, guestFloors: '3-14', elevators: 3,
        surfaces: ['carpet', 'hardwood', 'tile'],
        market: 'Sacramento',
        proposalUrl: null,
        siteProfileUrl: null,
        elevatorMake: null,
        elevatorGuestCount: 2,
        elevatorServiceCount: 1,
        outdoorAmenities: [],
        fbOutlets: 2, // WHY: restaurant + bar typical for a boutique
        eventSpaceSqFt: 6000, // WHY: historic hotel with event capability
        surfaceZones: {
            corridors: ['carpet'],
            lobby: ['hardwood', 'tile'],
            fb: ['hardwood'],
            boh: ['tile']
        }
    },
    'westin-riverfront': {
        name: 'Westin Riverfront',
        type: 'hotel',
        rooms: 101, floors: 3, guestFloors: '1-3', elevators: 2,
        surfaces: ['carpet', 'tile'],
        market: 'Sacramento',
        proposalUrl: null,
        siteProfileUrl: null,
        elevatorMake: null,
        elevatorGuestCount: 1,
        elevatorServiceCount: 1,
        outdoorAmenities: ['courtyard'],
        fbOutlets: 1, // WHY: small Westin with one restaurant
        eventSpaceSqFt: 3000, // WHY: modest meeting space
        surfaceZones: {
            corridors: ['carpet'],
            lobby: ['tile'],
            fb: ['tile'],
            boh: ['tile']
        }
    }
};
```

- [ ] **Step 2: Verify JS syntax**

Run: `python3 -c "import re; content=open('pages/fleet-designer.html').read(); scripts=re.findall(r'<script>(.*?)</script>', content, re.DOTALL); open('/tmp/fc.js','w').write('\n'.join(scripts))" && node --check /tmp/fc.js && echo "JS syntax OK"`

Expected: `JS syntax OK`

- [ ] **Step 3: Commit**

```bash
git add pages/fleet-designer.html
git commit -m "feat(fleet-designer): add facility detail fields to PIPELINE constant

Problem: PIPELINE entries only had basic metrics (rooms, floors, elevators, surfaces)
Solution: Add elevatorMake, elevatorGuestCount, elevatorServiceCount, outdoorAmenities, fbOutlets, eventSpaceSqFt, and surfaceZones to all 9 pipeline properties"
```

---

### Task 4: Wire expand/collapse, amenity chips, zone chips, and elevator make toggle

**Files:**
- Modify: `pages/fleet-designer.html` — JS section, inside `initPropertySection()` and new helper functions

- [ ] **Step 1: Add `syncSurfacesFromZones()` helper and `countFacilityDetails()` helper**

Insert these functions immediately before the `function updateProposalButton()` line (~line 2984 before task 2 edits, use current line after prior tasks):

```js
// ─────────────────────────────────────────────────────────────
// syncSurfacesFromZones — derive global surfaces from zone selections
// WHY: the fleet algorithm reads the legacy surface checkboxes;
// zone-based surfaces auto-sync to keep backward compatibility
// ─────────────────────────────────────────────────────────────
function syncSurfacesFromZones() {
    const allSurfaces = ['carpet', 'hardwood', 'tile', 'terrazzo', 'outdoor'];
    const zoneChips = document.querySelectorAll('.zone-chip.checked');
    const activeSurfaces = new Set();

    zoneChips.forEach(chip => activeSurfaces.add(chip.dataset.surface));

    // WHY: if any outdoor amenity is checked, add 'outdoor' to global surfaces
    const anyOutdoor = document.querySelectorAll('#amenity-grid .amenity-chip.checked').length > 0;
    if (anyOutdoor) activeSurfaces.add('outdoor');

    // Sync legacy global surface checkboxes
    allSurfaces.forEach(s => {
        const chip = document.getElementById('surface-' + s);
        if (!chip) return;
        const cb = chip.querySelector('input[type="checkbox"]');
        const shouldBeChecked = activeSurfaces.has(s);
        cb.checked = shouldBeChecked;
        chip.classList.toggle('checked', shouldBeChecked);
    });

    // Toggle global chips vs summary
    const hasZones = zoneChips.length > 0;
    document.getElementById('surface-global-wrap').style.display = hasZones ? 'none' : '';
    const summaryWrap = document.getElementById('surface-summary-wrap');
    summaryWrap.style.display = hasZones ? '' : 'none';
    if (hasZones) {
        const names = [...activeSurfaces].map(s => s.charAt(0).toUpperCase() + s.slice(1));
        document.getElementById('surface-summary-text').textContent = names.join(', ') || 'None selected';
    }
}

// ─────────────────────────────────────────────────────────────
// countFacilityDetails — count how many detail fields are set
// WHY: shown on the expand button as "N details set" indicator
// ─────────────────────────────────────────────────────────────
function countFacilityDetails() {
    let count = 0;
    if (document.getElementById('fd-elevator-make').value) count++;
    if (parseInt(document.getElementById('fd-elevator-guest').value, 10) > 0) count++;
    if (parseInt(document.getElementById('fd-elevator-service').value, 10) > 0) count++;
    if (document.querySelectorAll('#amenity-grid .amenity-chip.checked').length > 0) count++;
    if (parseInt(document.getElementById('fd-fb-outlets').value, 10) > 0) count++;
    if (parseInt(document.getElementById('fd-event-sqft').value, 10) > 0) count++;
    if (document.querySelectorAll('.zone-chip.checked').length > 0) count++;
    return count;
}

// ─────────────────────────────────────────────────────────────
// updateExpandButton — refresh the expand button label
// ─────────────────────────────────────────────────────────────
function updateExpandButton() {
    const btn = document.getElementById('facility-expand-btn');
    const card = document.getElementById('facility-detail-card');
    const isExpanded = !card.classList.contains('hidden');
    const count = countFacilityDetails();

    if (isExpanded) {
        btn.innerHTML = '<span class="arrow">▾</span> Facility Details';
    } else if (count > 0) {
        btn.innerHTML = '<span class="arrow">▸</span> Configure Facility Details <span class="detail-count">· ' + count + ' detail' + (count === 1 ? '' : 's') + ' set</span>';
    } else {
        btn.innerHTML = '<span class="arrow">▸</span> Configure Facility Details';
    }
}
```

- [ ] **Step 2: Add facility detail initialization inside `initPropertySection()`**

Find the closing of the surface-setting code block inside the `propSelect.addEventListener('change', ...)` handler. After the line `updateResearchLinks();` (and before the `});` that closes the event listener), add:

```js
        // Fill facility detail fields
        fillFacilityDetails(p);
```

Then, immediately after the line `['prop-rooms', 'prop-floors', 'prop-elevators'].forEach(id => {` block (after the `});` that closes that forEach), add all the facility detail wiring code:

```js
    // ── Facility detail expand/collapse ──────────────────────
    const expandBtn = document.getElementById('facility-expand-btn');
    const detailCard = document.getElementById('facility-detail-card');

    expandBtn.addEventListener('click', () => {
        detailCard.classList.toggle('hidden');
        updateExpandButton();
    });

    // ── Elevator make — show custom text input when "Other" selected ──
    const elevMakeSelect = document.getElementById('fd-elevator-make');
    const elevCustomInput = document.getElementById('fd-elevator-custom');

    elevMakeSelect.addEventListener('change', () => {
        elevCustomInput.style.display = elevMakeSelect.value === 'Other' ? '' : 'none';
        updateExpandButton();
    });

    elevCustomInput.addEventListener('input', updateExpandButton);
    document.getElementById('fd-elevator-guest').addEventListener('input', updateExpandButton);
    document.getElementById('fd-elevator-service').addEventListener('input', updateExpandButton);
    document.getElementById('fd-fb-outlets').addEventListener('input', updateExpandButton);
    document.getElementById('fd-event-sqft').addEventListener('input', updateExpandButton);

    // ── Amenity chips — toggle checked class ──
    document.querySelectorAll('.amenity-chip').forEach(chip => {
        chip.addEventListener('click', () => {
            const cb = chip.querySelector('input[type="checkbox"]');
            cb.checked = !cb.checked;
            chip.classList.toggle('checked', cb.checked);
            syncSurfacesFromZones();
            updateExpandButton();
        });
    });

    // ── Zone chips — toggle checked class + sync global surfaces ──
    document.querySelectorAll('.zone-chip').forEach(chip => {
        chip.addEventListener('click', () => {
            chip.classList.toggle('checked');
            syncSurfacesFromZones();
            updateExpandButton();
        });
    });
```

- [ ] **Step 3: Add the `fillFacilityDetails()` function**

Insert this function immediately before `syncSurfacesFromZones()`:

```js
// ─────────────────────────────────────────────────────────────
// fillFacilityDetails — populate facility detail card from property data
// WHY: auto-fills elevator, amenities, and surface zones when
// a pipeline property is selected from the dropdown
// ─────────────────────────────────────────────────────────────
function fillFacilityDetails(p) {
    // Elevator
    const makeSelect = document.getElementById('fd-elevator-make');
    const customInput = document.getElementById('fd-elevator-custom');
    const makeValue = p.elevatorMake || '';

    // WHY: check if value matches a dropdown option; if not, select "Other" and fill custom input
    const knownMakes = ['ThyssenKrupp', 'Otis', 'KONE', 'Schindler', 'Mitsubishi'];
    if (makeValue && !knownMakes.includes(makeValue)) {
        makeSelect.value = 'Other';
        customInput.value = makeValue;
        customInput.style.display = '';
    } else {
        makeSelect.value = makeValue;
        customInput.value = '';
        customInput.style.display = 'none';
    }

    document.getElementById('fd-elevator-guest').value = p.elevatorGuestCount || '';
    document.getElementById('fd-elevator-service').value = p.elevatorServiceCount || '';

    // Amenities
    const allAmenities = ['pool', 'rooftop', 'courtyard', 'sports', 'garden'];
    const activeAmenities = p.outdoorAmenities || [];
    allAmenities.forEach(a => {
        const chip = document.getElementById('amenity-' + a);
        if (!chip) return;
        const cb = chip.querySelector('input[type="checkbox"]');
        const isActive = activeAmenities.includes(a);
        cb.checked = isActive;
        chip.classList.toggle('checked', isActive);
    });

    document.getElementById('fd-fb-outlets').value = p.fbOutlets || '';
    document.getElementById('fd-event-sqft').value = p.eventSpaceSqFt || '';

    // Surface zones
    const zones = p.surfaceZones || { corridors: [], lobby: [], fb: [], boh: [] };
    document.querySelectorAll('.zone-group').forEach(group => {
        const zoneKey = group.dataset.zone;
        const activeSurfaces = zones[zoneKey] || [];
        group.querySelectorAll('.zone-chip').forEach(chip => {
            chip.classList.toggle('checked', activeSurfaces.includes(chip.dataset.surface));
        });
    });

    // Sync global surfaces from zones
    syncSurfacesFromZones();
    updateExpandButton();
}
```

- [ ] **Step 4: Verify JS syntax**

Run: `python3 -c "import re; content=open('pages/fleet-designer.html').read(); scripts=re.findall(r'<script>(.*?)</script>', content, re.DOTALL); open('/tmp/fc.js','w').write('\n'.join(scripts))" && node --check /tmp/fc.js && echo "JS syntax OK"`

Expected: `JS syntax OK`

- [ ] **Step 5: Test in browser**

1. Start the server: `python3 -m http.server 8901 --directory ~/Code/`
2. Open `http://localhost:8901/accelerate-robotics/pages/fleet-designer.html`
3. Select "Thesis Hotel" from dropdown — verify elevator make shows "ThyssenKrupp", guest/service shows 1/1, pool + rooftop chips are checked, F&B shows 3, event shows 5000, surface zones are filled
4. Click "Configure Facility Details" button — verify card expands. Click again — verify it collapses.
5. Select a prospect hotel — verify all detail fields reset to empty
6. Manually check some zone chips — verify the global surface summary updates
7. Check an outdoor amenity — verify "outdoor" appears in the surface summary

- [ ] **Step 6: Commit**

```bash
git add pages/fleet-designer.html
git commit -m "feat(fleet-designer): wire facility detail expand/collapse, auto-fill, and surface zone sync

Problem: Facility detail card HTML existed but had no interactivity
Solution: Add fillFacilityDetails() for auto-fill on property select, syncSurfacesFromZones() for backward-compat surface derivation, expand/collapse toggle, amenity chip click handlers, zone chip click handlers, and elevator make Other toggle"
```

---

### Task 5: Add F&B and event-space score multipliers to fleet algorithm

**Files:**
- Modify: `pages/fleet-designer.html` — JS `generateFleet()` function

- [ ] **Step 1: Read F&B and event-space values at the top of `generateFleet()`**

Inside `generateFleet(robots)`, after the line:

```js
    const budgetPerSlot = activeGoals.length > 0 ? budgetMax / activeGoals.length : budgetMax;
```

Add:

```js
    // WHY: F&B-heavy and event-capable properties benefit more from delivery/logistics robots
    const fbOutlets = parseInt(document.getElementById('fd-fb-outlets').value, 10) || 0;
    const eventSqFt = parseInt(document.getElementById('fd-event-sqft').value, 10) || 0;
```

- [ ] **Step 2: Apply multiplier after scoring each candidate**

Inside the `for (const goalId of activeGoals)` loop, find the scoring block:

```js
        const scored = candidates.map(robot => {
            const result = scoreRobot(robot, goal, budgetPerSlot);
            return { robot, ...result };
        });
```

Replace it with:

```js
        const scored = candidates.map(robot => {
            const result = scoreRobot(robot, goal, budgetPerSlot);
            let adjustedScore = result.score;

            // WHY: 10% boost for delivery/logistics goals when property has 3+ F&B outlets —
            // more F&B = more delivery traffic = higher value from delivery robots
            if (fbOutlets >= 3 && (goal.type === 'delivery' || goal.type === 'logistics')) {
                adjustedScore = Math.min(100, Math.round(adjustedScore * 1.10));
            }

            // WHY: 10% boost for logistics goals when property has event space —
            // events mean linen/supply surge, logistics robots earn their keep faster
            if (eventSqFt > 0 && goal.type === 'logistics') {
                adjustedScore = Math.min(100, Math.round(adjustedScore * 1.10));
            }

            return { robot, ...result, score: adjustedScore };
        });
```

- [ ] **Step 3: Verify JS syntax**

Run: `python3 -c "import re; content=open('pages/fleet-designer.html').read(); scripts=re.findall(r'<script>(.*?)</script>', content, re.DOTALL); open('/tmp/fc.js','w').write('\n'.join(scripts))" && node --check /tmp/fc.js && echo "JS syntax OK"`

Expected: `JS syntax OK`

- [ ] **Step 4: Commit**

```bash
git add pages/fleet-designer.html
git commit -m "feat(fleet-designer): add F&B and event-space score multipliers

Problem: Fleet algorithm didn't account for F&B density or event space when scoring robots
Solution: 10% score boost for delivery/logistics goals when fbOutlets >= 3, and 10% boost for logistics goals when eventSpaceSqFt > 0"
```

---

### Task 6: Enhance config.yml export with facility details

**Files:**
- Modify: `pages/fleet-designer.html` — JS `downloadProposalConfig()` function

- [ ] **Step 1: Add facility detail gathering and YAML sections**

Find the `downloadProposalConfig()` function. Replace the entire function with:

```js
function downloadProposalConfig() {
    const propSelect = document.getElementById('prop-name');
    const propKey = propSelect.value;
    const p = PIPELINE[propKey];
    const name = p ? p.name : (propSelect.options[propSelect.selectedIndex]?.text || 'New Property');
    const rooms = document.getElementById('prop-rooms').value || '0';
    const floors = document.getElementById('prop-floors').value || '1';
    const guestFloors = document.getElementById('prop-guest-floors').value || '';
    const elevators = document.getElementById('prop-elevators').value || '0';

    // Gather active type
    const activeType = document.querySelector('.prop-type.active');
    const propType = activeType ? activeType.dataset.type : 'hotel';

    // Gather surfaces (global, derived from zones or manual)
    const surfaces = [];
    document.querySelectorAll('.surface-chip input:checked').forEach(cb => surfaces.push(cb.value));

    // Gather elevator details
    const elevMakeSelect = document.getElementById('fd-elevator-make');
    const elevCustom = document.getElementById('fd-elevator-custom');
    let elevMake = elevMakeSelect.value;
    if (elevMake === 'Other' && elevCustom.value.trim()) {
        elevMake = elevCustom.value.trim();
    }
    const elevGuest = document.getElementById('fd-elevator-guest').value || '0';
    const elevService = document.getElementById('fd-elevator-service').value || '0';

    // Gather amenities
    const outdoorAmenities = [];
    document.querySelectorAll('#amenity-grid .amenity-chip input:checked').forEach(cb => outdoorAmenities.push(cb.value));
    const fbOutlets = document.getElementById('fd-fb-outlets').value || '0';
    const eventSqFt = document.getElementById('fd-event-sqft').value || '0';

    // Gather surface zones
    const surfaceZones = {};
    document.querySelectorAll('.zone-group').forEach(group => {
        const zoneKey = group.dataset.zone;
        const checked = [];
        group.querySelectorAll('.zone-chip.checked').forEach(chip => checked.push(chip.dataset.surface));
        if (checked.length > 0) surfaceZones[zoneKey] = checked;
    });

    // Gather fleet
    const activeSlots = currentSlots.filter(s => s.selected);
    const totalCost = activeSlots.reduce((sum, s) => sum + s.selected.monthlyEstimate, 0);

    let fleetLines = '';
    activeSlots.forEach((slot, i) => {
        const r = slot.selected.robot;
        fleetLines += `  # ${slot.label} — Score: ${slot.selected.score}\n`;
        fleetLines += `  - model: "${r.model_name}"\n`;
        fleetLines += `    company: "${r.company}"\n`;
        fleetLines += `    category: "${r.primary_category}"\n`;
        fleetLines += `    monthly_raas: ${slot.selected.monthlyEstimate}\n`;
        fleetLines += `    role: "${slot.serviceLine}"\n\n`;
    });

    // Build surface_zones YAML
    let zoneLines = '';
    for (const [zone, surfs] of Object.entries(surfaceZones)) {
        zoneLines += `  ${zone}: [${surfs.map(s => '"' + s + '"').join(', ')}]\n`;
    }

    const yaml = `# Accelerate Robotics — Proposal Config
# Generated by Fleet Designer on ${new Date().toISOString().slice(0, 10)}
# Use with accelerate-hotel-template to generate a full proposal.

hotel:
  full_name: "${name}"
  short_name: "${name.split(' ')[0]}"
  property_type: "${propType}"

property:
  floor_count: ${floors}
  room_count: ${rooms}
  guest_floors: "${guestFloors}"
  floor_surfaces: "${surfaces.join(', ')}"

elevator:
  count: ${elevators}
  make: "${elevMake || 'Unknown'}"
  guest_elevators: ${elevGuest}
  service_elevators: ${elevService}

amenities:
  outdoor: [${outdoorAmenities.map(a => '"' + a + '"').join(', ')}]
  fb_outlets: ${fbOutlets}
  event_space_sqft: ${eventSqFt}

${zoneLines ? 'surface_zones:\n' + zoneLines : '# surface_zones: (not configured)'}

fleet_counts:
  total: ${activeSlots.length}

pricing:
  raas_rate_usd: ${activeSlots.length > 0 ? Math.round(totalCost / activeSlots.length) : 2850}
  total_monthly_usd: ${totalCost}

fleet:
${fleetLines}`;

    const blob = new Blob([yaml], { type: 'text/yaml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = (name.toLowerCase().replace(/[^a-z0-9]+/g, '-')) + '-config.yml';
    a.click();
    URL.revokeObjectURL(url);
}
```

- [ ] **Step 2: Verify JS syntax**

Run: `python3 -c "import re; content=open('pages/fleet-designer.html').read(); scripts=re.findall(r'<script>(.*?)</script>', content, re.DOTALL); open('/tmp/fc.js','w').write('\n'.join(scripts))" && node --check /tmp/fc.js && echo "JS syntax OK"`

Expected: `JS syntax OK`

- [ ] **Step 3: Test in browser**

1. Open Fleet Designer, select Thesis Hotel, pick Room Service + Corridor Cleaning goals, click Design My Fleet
2. Click "Export Fleet" and download the config.yml
3. Open the config.yml and verify it contains:
   - `elevator.make: "ThyssenKrupp"`, `elevator.guest_elevators: 1`, `elevator.service_elevators: 1`
   - `amenities.outdoor: ["pool", "rooftop"]`, `amenities.fb_outlets: 3`, `amenities.event_space_sqft: 5000`
   - `surface_zones.corridors: ["carpet"]`, `surface_zones.lobby: ["tile", "hardwood"]`, etc.

- [ ] **Step 4: Commit**

```bash
git add pages/fleet-designer.html
git commit -m "feat(fleet-designer): enhance config.yml export with facility details

Problem: Exported config.yml only had basic elevator count and global surfaces
Solution: Add elevator make/guest/service split, outdoor amenities, F&B outlets, event space, and surface zones to the YAML export"
```

---

### Task 7: Handle edge case — reset facility details when switching property to blank

**Files:**
- Modify: `pages/fleet-designer.html` — JS `initPropertySection()` change handler

- [ ] **Step 1: Add facility detail reset when no property is selected**

In the `propSelect.addEventListener('change', ...)` handler, find the early-return block:

```js
        if (!p) {
            updateProposalButton();
            updateResearchLinks();
            return;
        }
```

Replace it with:

```js
        if (!p) {
            // Reset facility details to empty
            fillFacilityDetails({
                elevatorMake: null, elevatorGuestCount: 0, elevatorServiceCount: 0,
                outdoorAmenities: [], fbOutlets: 0, eventSpaceSqFt: 0,
                surfaceZones: { corridors: [], lobby: [], fb: [], boh: [] }
            });
            updateProposalButton();
            updateResearchLinks();
            return;
        }
```

- [ ] **Step 2: Verify JS syntax**

Run: `python3 -c "import re; content=open('pages/fleet-designer.html').read(); scripts=re.findall(r'<script>(.*?)</script>', content, re.DOTALL); open('/tmp/fc.js','w').write('\n'.join(scripts))" && node --check /tmp/fc.js && echo "JS syntax OK"`

Expected: `JS syntax OK`

- [ ] **Step 3: Test in browser**

1. Select Thesis Hotel — verify fields fill
2. Switch to "-- Select a property --" — verify all facility fields reset to empty/unchecked
3. Switch to a prospect hotel — verify fields reset (prospects have no facility details)
4. Manually configure some facility details for the prospect, then switch to Thesis Hotel — verify Thesis Hotel's data overwrites

- [ ] **Step 4: Commit**

```bash
git add pages/fleet-designer.html
git commit -m "fix(fleet-designer): reset facility details when switching to blank or prospect property

Problem: Switching from a pipeline property to blank or prospect left stale facility data
Solution: Call fillFacilityDetails() with empty defaults on the no-property and prospect code paths"
```

---

## Self-Review Checklist

**Spec coverage:**
- ✅ Elevator make/model + guest/service split → Task 2 (HTML), Task 3 (data), Task 4 (JS)
- ✅ Outdoor amenity chips → Task 2 (HTML), Task 3 (data), Task 4 (JS)
- ✅ F&B outlet count → Task 2 (HTML), Task 3 (data), Task 5 (scoring)
- ✅ Event space sq ft → Task 2 (HTML), Task 3 (data), Task 5 (scoring)
- ✅ Surface zones → Task 2 (HTML), Task 3 (data), Task 4 (sync logic)
- ✅ Progressive disclosure UI → Task 1 (CSS), Task 2 (HTML), Task 4 (expand/collapse)
- ✅ Auto-fill from PIPELINE → Task 3 (data), Task 4 (fillFacilityDetails)
- ✅ Expand button states → Task 4 (updateExpandButton)
- ✅ Surface summary vs global chips → Task 4 (syncSurfacesFromZones)
- ✅ F&B/event score multipliers → Task 5
- ✅ Config.yml export → Task 6
- ✅ Property switch reset → Task 7
- ✅ Outdoor amenities → outdoor surface auto-add → Task 4 (syncSurfacesFromZones)

**Placeholder scan:** No TBD/TODO/placeholders found. All code blocks are complete.

**Type consistency:**
- `elevatorMake`, `elevatorGuestCount`, `elevatorServiceCount`, `outdoorAmenities`, `fbOutlets`, `eventSpaceSqFt`, `surfaceZones` — used consistently across PIPELINE (Task 3), fillFacilityDetails (Task 4), and downloadProposalConfig (Task 6)
- `syncSurfacesFromZones()`, `countFacilityDetails()`, `updateExpandButton()`, `fillFacilityDetails()` — defined in Task 4, called in Tasks 4 and 7
