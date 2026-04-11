# ThyssenKrupp TAC32T

The ThyssenKrupp TAC32T is the elevator control system installed at the Thesis Hotel. Understanding it matters because Phase 2 of that deployment wires our E-Box/button emulator into a TAC32T cabinet.

## Source documents

- **Inspector Guide:** `/Users/ericrace/Downloads/ThyssenkruppTAC32TInspectorGuide.pdf` (manual #44129 v.1.4, March 2014)
- **Copy in repo:** [`../../assets/elevator/thyssenkrupp-tac32t-guide.pdf`](../../assets/elevator/thyssenkrupp-tac32t-guide.pdf) *(move binary here when ready)*

## System overview

- **Type:** TAC32 Traction Elevator System
- **Configuration:** Conventional traction, Machine-Room-Less (MRL) capable
- **Safety rating:** SIL-rated E/E/PE (electrical/electronic/programmable electronic)

## Key control components

| Component | Purpose |
|---|---|
| **CPUA Card** | Main CPU. Hosts the User Interface Tool (UIT) — 2-line display + 4 buttons used by field service technicians. |
| **IOE Card** | Input/Output expansion card — where our integration interfaces physically connect. |
| **FWIA Card** | Field-wiring interface card — the termination point for safety string inputs and hall/car call outputs. |

## UIT access procedure

1. Press `ENTER`
2. Enter PIN (technician-specific, varies by building)
3. `Block Select` menu appears
4. Choose `Inspector Tests`

## Inspector Tests menu (what each does)

| Code | Meaning |
|---|---|
| FLT | Show faults |
| RFL | Clear faults |
| TFR | Reset faults |
| SCCB | Bottom terminal car call (send cab to lowest floor) |
| SCC2 | Floor 2 car call |
| SCCT | Top terminal car call (send cab to highest floor) |
| TST1 | NTSD — Normal Terminal Slowdown test |
| TST2 | ETSX — Emergency Terminal Slowdown test |
| TST3 | Buffer test |
| TST4 | Overspeed test |
| TST5 | UIM — Unintended Motion test |
| TST7 | Overspeed (alternate) |
| TST9 | FTSD — Final Terminal Slowdown |
| TST10 | Load test |
| — | Encoder test |
| — | Leveling test |
| SBM | Traction test |

## Safety string inputs (critical — never override)

The TAC32T safety string is a hardwired chain that must be intact for the elevator to move. Our integration **must not** interfere with any of these:

| Signal | Meaning |
|---|---|
| `SAFC` | Cab safety |
| `CST` | Car stop |
| `SAFGR` | Safety gear |
| `FTSD` | Final terminal slowdown |
| `SAFCAR` | Car safety |
| `SAFMR` | Machine room safety |
| `SAFHW` | Hoistway safety |
| `SAFPLD` | Platform landing door |
| `SAFSP` | Speed |
| `NOPROG` | No program |
| `SAF3` | Safety 3 (vendor-specific) |

**Absolute rule:** no integration, no matter how clever, ever opens or bridges any of these circuits. Our button emulator sits at the signal fixture level, parallel to the existing relay, on the *call* side. It never touches the safety string.

## Car call commands (what we emulate)

Our integration sends the moral equivalent of:

- `SCCB` — bottom terminal call (go to the lobby)
- `SCC2` — floor 2 call
- `SCCT` — top terminal call (go to the top floor)
- `SCC3...SCCn` — any intermediate floor

At the signal fixture level, we do this by closing a dry contact in parallel with the existing car-call button. The button's relay sees the request as if a passenger pressed it.

## Integration hardware at this site

See [`keenon-ebox.md`](keenon-ebox.md) for the Keenon E-Box wiring that has been designed for this building. See [`../../40-deployments/thesis-hotel/phase-2-elevator.md`](../../40-deployments/thesis-hotel/phase-2-elevator.md) for the installation plan.

## Related

- [`keenon-ebox.md`](keenon-ebox.md) — E-Box hardware that bridges robot to TAC32T
- [`button-emulator.md`](button-emulator.md) — our own universal button emulator concept
- [`patent-analysis.md`](patent-analysis.md) — IP around relay-parallel integration
