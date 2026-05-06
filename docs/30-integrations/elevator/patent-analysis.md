# Patent Analysis — Elevator Integration

A quick scan of the IP landscape around robot-elevator integration, with focus on the relay-parallel button emulation approach.

## TL;DR

- **The key Otis patent on robot-summoned elevator integration (US8253548B2) expired October 2020.**
- No active patents found on the specific relay-parallel-to-buttons approach as we've designed it.
- Keenon's E-Box patents (if any) appear to be implementation-specific — master/slave protocol, RFID floor detection details — and don't cover the general relay-parallel technique.
- **Disclaimer:** this is a non-attorney research summary. Before commercial deployment, get a formal freedom-to-operate opinion from a patent attorney.

## Key expired patent

### Otis US8253548B2

- **Title:** "System and method for controlling automatic service for elevator car dispatching" (approximate)
- **Assignee:** Otis Elevator Company
- **Expired:** October 2020
- **Relevance:** Broadly covered automated elevator call integration. Its expiration opened the door (so to speak) for third-party integration products.

## Active patent areas to watch

### Shaft communication (LoRa, RFID, wireless)

Keenon and others likely have implementation patents on specific LoRa protocols and RFID tag placement schemes. **Our approach avoids the shaft entirely** — BLE from cabin or floor, no shaft antenna — which sidesteps most of these.

### Destination dispatch integration

KONE, Schindler, and Otis all have extensive patents on destination dispatch API integration. **Our emulator doesn't talk destination dispatch** — it talks to individual push buttons — so these don't apply.

### Mechanical button pressing (Savioke style)

Savioke filed patents on using a mechanical finger to push buttons. **Our approach is electrical, not mechanical**, so no overlap.

### OEM firmware modification

Many patents exist on modifications to elevator controller firmware. **We never touch firmware.** This is a design constraint, not just a legal one — touching firmware would void the elevator's certification.

## Our design specifically avoids

- Modifying controller firmware
- Tapping into the safety string
- Using destination dispatch protocols
- Using OEM cloud APIs (by default — we can layer these on later)
- Mechanical button actuators
- Shaft-mounted antennas or cabin-top RFID (E-Box-style)

## Freedom-to-operate checklist (pre-commercial)

Before we sell the button emulator commercially:

- [ ] Professional prior-art search by a patent attorney
- [ ] FTO opinion letter covering US, EU, and key Asian markets
- [ ] Review of any Keenon patents Eric has visibility into through the Atlas/Arjo/Keenon relationships
- [ ] Review of KONE, Otis, Schindler, ThyssenKrupp published applications from the last 5 years
- [ ] Trademark search for "button emulator" and related marketing names

## Our own IP strategy

Consider filing:

- **Utility patent** on the specific integration technique (if novel enough)
- **Design patent** on the enclosure form factor (quick, cheap, defensive)
- **Provisional patent** early, before public disclosure of the BOM and technique

## Related

- [`button-emulator.md`](button-emulator.md) — the product we're protecting
- [`../../60-roadmap/open-questions.md`](../../60-roadmap/open-questions.md) — IP strategy is an open decision
