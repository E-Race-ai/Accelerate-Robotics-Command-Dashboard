const crypto = require('crypto');

// WHY: Seed uses fixed dates so the seed is deterministic in tests and matches the spec.
// Users can edit dates in the UI after load.
const SPRINT_START = '2026-04-22';
const SPRINT_END = '2026-05-13';

// WHY: People list from the spec §5.1. Initials are unique; full_name nullable for rows the user didn't specify.
const PEOPLE = [
  { initials: 'ER', full_name: 'Eric' },
  { initials: 'TR', full_name: 'Tyler' },
  { initials: 'MS', full_name: 'Matthias' },
  { initials: 'LG', full_name: 'Lydia' },
  { initials: 'CB', full_name: 'Corey' },
  { initials: 'JL', full_name: 'JB' },
  { initials: 'BN', full_name: 'Ben' },
  { initials: 'VH', full_name: 'Vicki' },
  { initials: 'KM', full_name: 'Kaylie' },
  { initials: 'CS', full_name: 'Celia' },
  { initials: 'DG', full_name: 'David' },
  { initials: 'RH', full_name: 'Richa' },
];

// WHY: Week anchor helpers — sprint runs 2026-04-22 (week 1 start) through 2026-05-13 (week 3 end).
// Using string dates directly avoids timezone gotchas with Date objects.
const WEEK1_START = '2026-04-22';
const WEEK2_START = '2026-04-29';
const WEEK2_END = '2026-05-05'; // WHY: End of week 2 so "Weeks 1-2" projects span ~14 days, not 7
const WEEK3_END = '2026-05-13';

// WHY: Project definitions from v2 doc, §5.3 of the design spec.
// Each `support` entry references initials (resolved to person ids at insert time).
const PROJECTS = [
  {
    name: 'Deploy',
    owner: 'ER',
    support: ['CB', 'TR', 'DG'],
    color: 'green',
    start: WEEK2_START,
    end: WEEK3_END,
    needs_verification: 1,
    verification_note: 'New workstream from expanded list. Likely overlaps with or replaces original "Operations / rollout."',
  },
  {
    name: 'Deal + Prospects',
    owner: 'LG',
    support: ['ER', 'TR', 'MS'],
    color: 'blue',
    start: WEEK1_START,
    end: WEEK3_END,
    needs_verification: 1,
    verification_note: 'Previously ER owned proposal gen/CRM. V1 launched today, V2 iteration ongoing.',
    milestones: [
      { name: 'V1 launched', date: WEEK1_START },
    ],
    tasks: [
      { name: 'V1 launch', owner: 'ER', start: WEEK1_START, end: WEEK1_START, is_milestone: 0, status: 'complete' },
      { name: 'V2 iteration & build-out', owner: 'ER', start: WEEK1_START, end: WEEK3_END },
    ],
  },
  {
    name: 'Assessments',
    owner: 'CB',
    support: ['CS', 'DG', 'ER'],
    color: 'teal',
    start: WEEK1_START,
    end: WEEK3_END,
    needs_verification: 1,
    verification_note: 'New workstream — likely onsite/property assessments for pilot candidates.',
  },
  {
    name: 'Robot command',
    owner: 'DG',
    support: ['KM', 'CS', 'ER'],
    color: 'purple',
    start: WEEK1_START,
    end: WEEK2_END,
    needs_verification: 1,
    verification_note: 'Replaces or refines original "Tech research → V1 orchestration layer." Richa (RH) may still be involved — confirm.',
  },
  {
    name: 'Service van',
    owner: 'CS',
    support: ['ER', 'TR', 'KM'],
    color: 'amber',
    start: WEEK2_START,
    end: WEEK3_END,
    needs_verification: 1,
    verification_note: 'New workstream — mobile service/support vehicle for deployed robots.',
  },
  {
    name: 'Elevator Sim',
    owner: 'ER',
    support: ['DG'],
    color: 'purple',
    start: WEEK1_START,
    end: WEEK2_END,
    needs_verification: 1,
    verification_note: 'Replaces original "Tech research → Elevator integration." Now framed as simulation work covering all elevator types/vendors. Co-owned by ER + DG.',
  },
  {
    name: 'Robot catalog',
    owner: 'LG',
    support: ['ER', 'TR', 'DG'],
    color: 'coral',
    start: WEEK1_START,
    end: WEEK3_END,
    needs_verification: 1,
    verification_note: 'New workstream — catalog of robot models/capabilities. May overlap with original "Tech research → Vendor matrix."',
  },
  {
    name: 'Investor + Financial',
    owner: 'ER',
    support: ['TR', 'MS'],
    color: 'pink',
    start: WEEK2_START,
    end: WEEK3_END,
    needs_verification: 1,
    verification_note: 'Merges original "Business model & pricing (ROI)," "Board / existing investor," and "Net new investor pitch." May want to split back out — confirm.',
  },
  {
    name: 'Robot Dossier',
    owner: 'ER',
    support: ['DG', 'TR'],
    color: 'coral',
    start: WEEK1_START,
    end: WEEK2_END,
    needs_verification: 1,
    verification_note: 'New workstream — per-robot detailed spec/capability dossiers.',
  },
  {
    name: 'Inquiries + Public website',
    owner: 'LG',
    support: ['CS'],
    color: 'amber',
    start: WEEK1_START,
    end: WEEK3_END,
    needs_verification: 1,
    verification_note: 'Likely replaces or expands original "Marketing brochures." Covers inbound inquiries + public-facing web presence.',
  },
];

// WHY: Takes a libsql-style db handle ({ one, all, run, transaction }). Async.
async function seedTracker(db) {
  // Idempotent — bail if seed has already run.
  const row = await db.one(`SELECT COUNT(*) as c FROM tracker_sprints`);
  if (row && row.c > 0) return;

  await db.transaction(async (tx) => {
    // 1. People
    const personIdByInitials = new Map();
    for (const p of PEOPLE) {
      const info = await tx.run(
        `INSERT INTO tracker_people (initials, full_name) VALUES (?, ?)`,
        [p.initials, p.full_name]
      );
      personIdByInitials.set(p.initials, info.lastInsertRowid);
    }

    // 2. Sprint
    const sprintId = crypto.randomUUID();
    await tx.run(
      `INSERT INTO tracker_sprints (id, name, description, start_date, end_date) VALUES (?, ?, ?, ?, ?)`,
      [
        sprintId,
        'Hotel Bots - Sprint 1',
        'First sprint: 3-week workstreams leading to a go/no-go decision on the hotel robotics BU.',
        SPRINT_START,
        SPRINT_END,
      ]
    );

    // 3. Projects + their tasks + milestones
    for (let idx = 0; idx < PROJECTS.length; idx++) {
      const proj = PROJECTS[idx];
      const projectId = crypto.randomUUID();
      await tx.run(
        `INSERT INTO tracker_items
          (id, sprint_id, parent_id, level, name, description, owner_id, color,
           start_date, end_date, status, needs_verification, verification_note, is_milestone, sort_order)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          projectId,
          sprintId,
          null,
          'project',
          proj.name,
          null,
          personIdByInitials.get(proj.owner) || null,
          proj.color,
          proj.start,
          proj.end,
          'not_started',
          proj.needs_verification || 0,
          proj.verification_note || null,
          0,
          idx,
        ]
      );
      for (const initials of proj.support || []) {
        const pid = personIdByInitials.get(initials);
        if (pid) {
          await tx.run(
            `INSERT INTO tracker_item_support (item_id, person_id) VALUES (?, ?)`,
            [projectId, pid]
          );
        }
      }

      const tasks = proj.tasks || [];
      for (let tIdx = 0; tIdx < tasks.length; tIdx++) {
        const t = tasks[tIdx];
        await tx.run(
          `INSERT INTO tracker_items
            (id, sprint_id, parent_id, level, name, description, owner_id, color,
             start_date, end_date, status, needs_verification, verification_note, is_milestone, sort_order)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            crypto.randomUUID(),
            sprintId,
            projectId,
            'task',
            t.name,
            null,
            personIdByInitials.get(t.owner) || null,
            null,
            t.start,
            t.end,
            t.status || 'not_started',
            0,
            null,
            t.is_milestone || 0,
            tIdx,
          ]
        );
      }

      const milestones = proj.milestones || [];
      for (let mIdx = 0; mIdx < milestones.length; mIdx++) {
        const m = milestones[mIdx];
        await tx.run(
          `INSERT INTO tracker_items
            (id, sprint_id, parent_id, level, name, description, owner_id, color,
             start_date, end_date, status, needs_verification, verification_note, is_milestone, sort_order)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            crypto.randomUUID(),
            sprintId,
            projectId,
            'task',
            m.name,
            null,
            null,
            null,
            m.date,
            m.date,
            'complete',
            0,
            null,
            1,
            100 + mIdx, // push milestones to bottom of the project's task list
          ]
        );
      }
    }

    // 4. Go / no-go milestone — standalone project-level milestone at sprint end.
    await tx.run(
      `INSERT INTO tracker_items
        (id, sprint_id, parent_id, level, name, description, owner_id, color,
         start_date, end_date, status, needs_verification, verification_note, is_milestone, sort_order)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        crypto.randomUUID(),
        sprintId,
        null,
        'project',
        'Go / no-go decision',
        'Final gate at sprint end.',
        null,
        'red',
        SPRINT_END,
        SPRINT_END,
        'not_started',
        0,
        null,
        1,
        PROJECTS.length,
      ]
    );
  });
}

module.exports = { seedTracker };
