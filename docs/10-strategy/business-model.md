# Business Model

Multiple revenue streams layered across hardware, software, services, and financing. The mix will evolve as the platform matures.

## Revenue streams

### Hardware

- **Robot sales** — direct sales of robot units (mostly Keenon to start, expanding to other vendors)
- **Distribution partnerships** — margin on robots we introduce into hospitals through our channel
- **Leasing** — multi-year leases for customers who don't want to capex robots
- **Robots-as-a-Service (RaaS)** — monthly subscription including robot, software, service, and replacement
- **Universal Button Emulator** — our first *own* hardware product (~$23/floor BOM); see [`../30-integrations/elevator/button-emulator.md`](../30-integrations/elevator/button-emulator.md)

### Operations & services

- **Deployment and installation** — site survey, mapping, commissioning, training
- **Service and repair** — scheduled maintenance and break-fix
- **Managed fleet operations** — we run the robot fleet for the hospital; they pay per-task or per-month
- **Outsourced robotics department** — full turnkey: we are the hospital's robotics team

### Software (the platform play)

- **Fleet management SaaS** — per-robot/month subscription
- **Workflow orchestration** — priced by task volume or number of workflows
- **Hospital robotics portal** — SaaS for system-level visibility across multiple hospitals
- **Predictive analytics** — AI-driven maintenance, utilization, and ROI reporting
- **Compliance and safety reporting** — auditable logs, incident tracking, regulatory reports
- **Elevator integration SaaS** — per-elevator/month subscription layered on top of our button emulator hardware

### Services layer

- **Human-in-the-loop operations team** — remote operators who supervise robots, handle exceptions, and train the system
- **Robotics-as-a-Department** — outsourced robotics team embedded at the hospital

### Financing

- **Partner bank leasing programs** — referral fees for financing robot deployments
- **RaaS financing** — we hold the hardware, bill monthly

### Other

- **Advertising on delivery robots** — pharma, medical devices, internal hospital campaigns
- **Data insights** — de-identified operational data sold to vendors, researchers, insurers
- **Cross-industry deployments** — hotels (Thesis Hotel), senior living, labs, LTC — same platform

## Pricing tiers (draft)

| Tier | What's included | Customer |
|---|---|---|
| **Self-serve SaaS** | Fleet management portal, basic task routing | Single-building hospital, <10 robots |
| **Managed** | SaaS + deployment + ops support | Multi-site healthcare system |
| **Enterprise** | Everything + custom integrations + dedicated CSM | Large IDN / government customer |
| **RaaS** | Hardware + software + service, one monthly fee | Any customer who wants opex-only |

## Customer economics

The hospital wants to see:

- **Labor offset** — hours of manual work displaced per month
- **Injury reduction** — work-comp claim avoidance
- **Clinical time returned** — more minutes at the bedside
- **Compliance wins** — HAPI rate, falls rate, turnover

Our pricing must land comfortably below the savings. For a typical 200-bed hospital, the target is to be net-positive within 12 months on labor and injury avoidance alone.

## Open questions

See [`../60-roadmap/open-questions.md`](../60-roadmap/open-questions.md) for unresolved strategic decisions, including:

- Do we manufacture robots or stay pure-platform?
- Which early workflows offer fastest ROI?
- Which robot vendors get preferred partnerships?
