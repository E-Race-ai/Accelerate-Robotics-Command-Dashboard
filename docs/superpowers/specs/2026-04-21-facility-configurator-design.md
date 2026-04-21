# Fleet Designer — Enhanced Facility Configurator

## Goal

Add detailed facility configuration to the Fleet Designer's left panel so fleet recommendations and proposal exports reflect the actual property — elevator specs, amenities, F&B outlets, event space, and zone-based surface mapping — without overwhelming the default experience.

## Scope

**In scope (option B — fleet-affecting details):**
- Elevator make/model + guest/service split
- Outdoor amenity chips (pool, rooftop, courtyard, sport courts, garden/grounds)
- F&B outlet count
- Meeting/event space sq ft
- Zone-based surface mapping (corridors, lobby, F&B, BOH)

**Out of scope (deferred to option C — floor-by-floor configurator):**
- Per-floor use map
- Accommodation/room type breakdown
- Staffing & operations baseline
- Network & power details
- Full elevator physical specs (cab dimensions, door opening, capacity)
- Persistent storage of detail fields for prospects

## UI Layout: Progressive Disclosure

The current Property section remains unchanged. Below the auto-computed profile summary, a single **"Configure Facility Details"** button expands a detail card. Default state: collapsed.

### Always visible (unchanged)
- Property type buttons (Hotel / Resort / Hospital / Senior Living)
- Property dropdown (9 pipeline + 66 prospects + custom)
- Research bar + Add Prospect form
- Metric fields: Rooms, Floors, Guest Floors, Elevators
- Profile summary: Scale, Vertical, Elevator ratio
- Global surface chips (replaced with a summary line when zones are configured)

### Expand button states
- `"▸ Configure Facility Details"` — collapsed, no data configured
- `"▸ Configure Facility Details · N details set"` — collapsed, has data
- `"▾ Facility Details"` — expanded

### Detail card (when expanded)

Three sub-groups separated by dividers:

**1. Elevator**
- Make/Model: dropdown — ThyssenKrupp, Otis, KONE, Schindler, Mitsubishi, Other (shows a text input below when Other selected; the custom value replaces "Other" in the data model and config.yml export)
- Guest elevators: number input (default: total elevator count)
- Service elevators: number input (default: 0)

**2. Amenities**
- Outdoor amenity chip grid: Pool, Rooftop, Courtyard, Sport Courts, Garden/Grounds (toggle on/off)
- F&B Outlets: number input (0–20)
- Event Space: number input (sq ft, 0 = none)

**3. Surface Zones**
Four zone groups, each with the same surface chip set (Carpet, Hardwood, Tile, Terrazzo, Outdoor):
- Guest Corridors
- Lobby / Public
- F&B Areas
- BOH / Service

Selecting any surface in any zone auto-updates the legacy global `surfaces` array (union of all zone selections). This maintains backward compatibility with the fleet algorithm.

When zones are configured, the old global surface chip grid is replaced with a summary line showing the union (e.g., "Surfaces: Carpet, Tile, Hardwood") to avoid confusion from two surface controls.

## Data Model

### PIPELINE constant — new fields

```js
{
    // existing
    name: 'Thesis Hotel', type: 'hotel',
    rooms: 245, floors: 10, guestFloors: '4-10', elevators: 2,
    surfaces: ['carpet', 'tile'],
    market: 'Miami', proposalUrl: '...', siteProfileUrl: '...',

    // new
    elevatorMake: 'ThyssenKrupp',      // string or null
    elevatorGuestCount: 1,              // number
    elevatorServiceCount: 1,            // number
    outdoorAmenities: ['pool', 'rooftop'],  // subset of: pool, rooftop, courtyard, sports, garden
    fbOutlets: 3,                       // number (0-20)
    eventSpaceSqFt: 5000,               // number (0 = none)
    surfaceZones: {                     // object or null
        corridors: ['carpet'],
        lobby: ['tile'],
        fb: ['hardwood'],
        boh: ['tile']
    }
}
```

### PROSPECTS constant and custom prospects

All new fields default to `null` / empty. Users fill them via the configurator. Values are session-only — not persisted to localStorage. Persistence is deferred.

### Backward compatibility

The `surfaces` array is auto-derived as the union of all `surfaceZones` values. The fleet algorithm continues reading `surfaces` with no changes. If no zones are configured, the global surface chips work as before.

## Auto-Fill Behavior

| Property source | New fields behavior |
|---|---|
| Pipeline (9 active) | Auto-fill from PIPELINE constant. Expand button shows "N details set". |
| Prospect (66 researched) | Fields are null. Button shows "No facility details — click to configure". |
| Custom (localStorage) | Same as prospects — no new fields stored. |
| Switching properties | Resets all detail fields to match new selection. Manual edits for previous property are lost. |

## Fleet Algorithm Impact

Minimal changes — capture data now, use it smarter later.

- **Surface zones**: No scoring change. Algorithm reads global `surfaces` (auto-derived from zone union).
- **Outdoor amenities**: If any outdoor amenity checked → `outdoor` added to global surfaces. Existing outdoor-capable robot scoring handles it.
- **F&B outlets**: Delivery goals (room service, linen/supply) get a 10% score bonus when `fbOutlets >= 3`. Applied as a multiplier on the final slot score.
- **Event space**: Linen/supply goal gets a 10% score bonus when `eventSpaceSqFt > 0`. Same multiplier approach.
- **Elevator make/model + split**: No algorithm change. Documentation only — feeds into config.yml export and site profiles.

## Config.yml Export

`downloadProposalConfig()` gains new YAML sections:

```yaml
elevator:
  count: 2
  make: "ThyssenKrupp"
  guest_elevators: 1
  service_elevators: 1

amenities:
  outdoor: ["pool", "rooftop"]
  fb_outlets: 3
  event_space_sqft: 5000

surface_zones:
  corridors: ["carpet"]
  lobby: ["tile"]
  fb: ["hardwood"]
  boh: ["tile"]
```

## CSS Approach

All new styles follow the existing Fleet Designer light theme:
- `--bg: #f7f8fc`, `--blue: #0055ff`, `--cyan: #00c8ff`
- Inter / Space Grotesk / JetBrains Mono fonts
- Same chip, metric, and section patterns already in the file

The expand button uses a dashed border style (matching the existing "+ Add Prospect" aesthetic). The detail card uses a white background with a subtle border, consistent with the profile summary card.

## File Changes

All changes are in `pages/fleet-designer.html` — single self-contained file, no build step.

1. **HTML**: Add expand button + detail card markup after the surface grid
2. **CSS**: Add styles for expand button, detail card, zone groups, elevator fields, amenity chips
3. **JS — PIPELINE constant**: Add new fields to all 9 properties
4. **JS — initPropertySection()**: Wire expand/collapse toggle, auto-fill new fields on property change
5. **JS — generateFleet()**: Add F&B and event space score multipliers
6. **JS — downloadProposalConfig()**: Add new YAML sections
7. **JS — surface zone logic**: Derive global `surfaces` from zone union, toggle surface summary vs chip grid
