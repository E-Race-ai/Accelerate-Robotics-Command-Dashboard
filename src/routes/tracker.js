const express = require('express');
const defaultDb = require('../db/database');
const { requireAuth } = require('../middleware/auth');
const { generateId } = require('../services/id-generator');
const {
  isValidDateRange,
  isValidLevel,
  isValidStatus,
  validateParentForLevel,
  trimBounded,
} = require('../services/tracker-validation');

const NAME_MAX = 200;
const TEXT_MAX = 5000;

// WHY: Factory pattern lets us inject a test DB — every handler reads from the `db` closure.
// `db` must expose the libsql-style async API: { one, all, run, transaction }.
// Exported as __testHandlers so integration tests can wrap a better-sqlite3 in-memory DB
// via wrapAsLibsqlHelper (see tests/helpers/setup.js).
function makeHandlers(db) {
  // ── People ─────────────────────────────────────────────────────
  async function listPeople(req, res) {
    const rows = await db.all(
      `SELECT * FROM tracker_people WHERE active = 1 ORDER BY initials`
    );
    res.json(rows);
  }

  async function createPerson(req, res) {
    const initials = trimBounded(req.body?.initials, 20);
    const fullName = trimBounded(req.body?.full_name, NAME_MAX);
    const notes = trimBounded(req.body?.notes, TEXT_MAX);
    if (!initials) return res.status(400).json({ error: 'initials is required' });
    if (fullName === false) return res.status(400).json({ error: `full_name exceeds ${NAME_MAX} chars` });
    if (notes === false) return res.status(400).json({ error: `notes exceeds ${TEXT_MAX} chars` });

    const info = await db.run(
      `INSERT INTO tracker_people (initials, full_name, notes) VALUES (?, ?, ?)`,
      [initials, fullName, notes]
    );
    const row = await db.one(`SELECT * FROM tracker_people WHERE id = ?`, [info.lastInsertRowid]);
    res.status(201).json(row);
  }

  async function updatePerson(req, res) {
    const existing = await db.one(`SELECT * FROM tracker_people WHERE id = ?`, [req.params.id]);
    if (!existing) return res.status(404).json({ error: 'Person not found' });

    const updates = {};
    if (req.body?.initials !== undefined) {
      const v = trimBounded(req.body.initials, 20);
      if (!v) return res.status(400).json({ error: 'initials cannot be empty' });
      updates.initials = v;
    }
    if (req.body?.full_name !== undefined) {
      const v = trimBounded(req.body.full_name, NAME_MAX);
      if (v === false) return res.status(400).json({ error: `full_name exceeds ${NAME_MAX} chars` });
      updates.full_name = v;
    }
    if (req.body?.notes !== undefined) {
      const v = trimBounded(req.body.notes, TEXT_MAX);
      if (v === false) return res.status(400).json({ error: `notes exceeds ${TEXT_MAX} chars` });
      updates.notes = v;
    }
    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }
    const setClauses = Object.keys(updates).map(k => `${k} = ?`).join(', ');
    await db.run(
      `UPDATE tracker_people SET ${setClauses} WHERE id = ?`,
      [...Object.values(updates), req.params.id]
    );
    const row = await db.one(`SELECT * FROM tracker_people WHERE id = ?`, [req.params.id]);
    res.json(row);
  }

  async function deletePerson(req, res) {
    const existing = await db.one(`SELECT id FROM tracker_people WHERE id = ?`, [req.params.id]);
    if (!existing) return res.status(404).json({ error: 'Person not found' });
    await db.run(`UPDATE tracker_people SET active = 0 WHERE id = ?`, [req.params.id]);
    res.json({ ok: true });
  }

  // ── Sprints ────────────────────────────────────────────────────
  async function listSprints(req, res) {
    const rows = await db.all(
      `SELECT id, name, description, start_date, end_date, created_at, updated_at
       FROM tracker_sprints
       ORDER BY start_date DESC`
    );
    res.json(rows);
  }

  async function createSprint(req, res) {
    const name = trimBounded(req.body?.name, NAME_MAX);
    const description = trimBounded(req.body?.description, TEXT_MAX);
    const { start_date, end_date } = req.body || {};
    if (!name) return res.status(400).json({ error: 'name is required' });
    if (description === false) return res.status(400).json({ error: `description exceeds ${TEXT_MAX} chars` });
    if (!start_date || !end_date) return res.status(400).json({ error: 'start_date and end_date are required (YYYY-MM-DD)' });
    if (!isValidDateRange(start_date, end_date)) return res.status(400).json({ error: 'start_date must be <= end_date and both in YYYY-MM-DD' });

    const id = generateId();
    await db.run(
      `INSERT INTO tracker_sprints (id, name, description, start_date, end_date) VALUES (?, ?, ?, ?, ?)`,
      [id, name, description, start_date, end_date]
    );
    const row = await db.one(`SELECT * FROM tracker_sprints WHERE id = ?`, [id]);
    res.status(201).json(row);
  }

  async function updateSprint(req, res) {
    const existing = await db.one(`SELECT * FROM tracker_sprints WHERE id = ?`, [req.params.id]);
    if (!existing) return res.status(404).json({ error: 'Sprint not found' });

    const updates = {};
    if (req.body?.name !== undefined) {
      const v = trimBounded(req.body.name, NAME_MAX);
      if (!v) return res.status(400).json({ error: 'name cannot be empty' });
      updates.name = v;
    }
    if (req.body?.description !== undefined) {
      const v = trimBounded(req.body.description, TEXT_MAX);
      if (v === false) return res.status(400).json({ error: `description exceeds ${TEXT_MAX} chars` });
      updates.description = v;
    }
    if (req.body?.start_date !== undefined) updates.start_date = req.body.start_date;
    if (req.body?.end_date !== undefined) updates.end_date = req.body.end_date;

    const finalStart = updates.start_date ?? existing.start_date;
    const finalEnd = updates.end_date ?? existing.end_date;
    if (!isValidDateRange(finalStart, finalEnd)) {
      return res.status(400).json({ error: 'start_date must be <= end_date and both in YYYY-MM-DD' });
    }

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }
    updates.updated_at = new Date().toISOString();

    const setClauses = Object.keys(updates).map(k => `${k} = ?`).join(', ');
    await db.run(
      `UPDATE tracker_sprints SET ${setClauses} WHERE id = ?`,
      [...Object.values(updates), req.params.id]
    );
    const row = await db.one(`SELECT * FROM tracker_sprints WHERE id = ?`, [req.params.id]);
    res.json(row);
  }

  async function getSprint(req, res) {
    const sprint = await db.one(`SELECT * FROM tracker_sprints WHERE id = ?`, [req.params.id]);
    if (!sprint) return res.status(404).json({ error: 'Sprint not found' });

    const items = await db.all(
      `SELECT * FROM tracker_items WHERE sprint_id = ? ORDER BY sort_order, created_at`,
      [req.params.id]
    );

    const supportRows = await db.all(
      `SELECT item_id, person_id FROM tracker_item_support
       WHERE item_id IN (SELECT id FROM tracker_items WHERE sprint_id = ?)
       ORDER BY person_id`,
      [req.params.id]
    );
    const supportByItem = new Map();
    for (const r of supportRows) {
      if (!supportByItem.has(r.item_id)) supportByItem.set(r.item_id, []);
      supportByItem.get(r.item_id).push(r.person_id);
    }

    const people = await db.all(
      `SELECT * FROM tracker_people WHERE active = 1 ORDER BY initials`
    );

    // WHY: Build the nested tree in one pass — O(N) with map lookups instead of per-row queries.
    const itemById = new Map();
    for (const it of items) {
      itemById.set(it.id, {
        ...it,
        support_ids: supportByItem.get(it.id) || [],
        tasks: [],       // populated for projects
        subtasks: [],    // populated for tasks
      });
    }
    const projects = [];
    for (const it of items) {
      const node = itemById.get(it.id);
      if (it.level === 'project') {
        projects.push(node);
      } else if (it.level === 'task') {
        const parent = itemById.get(it.parent_id);
        if (parent) parent.tasks.push(node);
      } else if (it.level === 'subtask') {
        const parent = itemById.get(it.parent_id);
        if (parent) parent.subtasks.push(node);
      }
    }

    res.json({ ...sprint, projects, people });
  }

  async function deleteSprint(req, res) {
    const existing = await db.one(`SELECT id FROM tracker_sprints WHERE id = ?`, [req.params.id]);
    if (!existing) return res.status(404).json({ error: 'Sprint not found' });
    await db.run(`DELETE FROM tracker_sprints WHERE id = ?`, [req.params.id]);
    res.json({ ok: true });
  }

  // ── Items (project/task/subtask) ───────────────────────────────

  // WHY: Small helper to hydrate a single item with its support list — used across create/update.
  async function hydrateItem(id) {
    const row = await db.one(`SELECT * FROM tracker_items WHERE id = ?`, [id]);
    if (!row) return null;
    const support = (await db.all(
      `SELECT person_id FROM tracker_item_support WHERE item_id = ? ORDER BY person_id`,
      [id]
    )).map(r => r.person_id);
    return { ...row, support_ids: support };
  }

  async function createItem(req, res) {
    const b = req.body || {};
    const name = trimBounded(b.name, NAME_MAX);
    const description = trimBounded(b.description, TEXT_MAX);
    const verification_note = trimBounded(b.verification_note, TEXT_MAX);

    if (!name) return res.status(400).json({ error: 'name is required' });
    if (description === false) return res.status(400).json({ error: `description exceeds ${TEXT_MAX} chars` });
    if (verification_note === false) return res.status(400).json({ error: `verification_note exceeds ${TEXT_MAX} chars` });
    if (!b.sprint_id) return res.status(400).json({ error: 'sprint_id is required' });
    if (!isValidLevel(b.level)) return res.status(400).json({ error: "level must be 'project', 'task', or 'subtask'" });
    if (!b.start_date || !b.end_date) return res.status(400).json({ error: 'start_date and end_date are required' });
    if (!isValidDateRange(b.start_date, b.end_date)) return res.status(400).json({ error: 'start_date must be <= end_date (YYYY-MM-DD)' });
    if (b.status !== undefined && !isValidStatus(b.status)) {
      return res.status(400).json({ error: "status must be one of not_started, in_progress, blocked, complete" });
    }

    const sprint = await db.one(`SELECT id FROM tracker_sprints WHERE id = ?`, [b.sprint_id]);
    if (!sprint) return res.status(400).json({ error: 'sprint_id does not exist' });

    let parentRow = null;
    if (b.parent_id) {
      parentRow = await db.one(`SELECT id, level, sprint_id FROM tracker_items WHERE id = ?`, [b.parent_id]);
      if (!parentRow) return res.status(400).json({ error: 'parent_id does not exist' });
      if (parentRow.sprint_id !== b.sprint_id) {
        return res.status(400).json({ error: 'parent_id belongs to a different sprint' });
      }
    }
    const parentCheck = validateParentForLevel(b.level, parentRow);
    if (!parentCheck.ok) return res.status(400).json({ error: parentCheck.reason });

    if (b.owner_id !== undefined && b.owner_id !== null) {
      const owner = await db.one(`SELECT id FROM tracker_people WHERE id = ?`, [b.owner_id]);
      if (!owner) return res.status(400).json({ error: 'owner_id does not exist' });
    }

    const id = generateId();
    await db.run(
      `INSERT INTO tracker_items
        (id, sprint_id, parent_id, level, name, description, owner_id, color,
         start_date, end_date, status, needs_verification, verification_note,
         is_milestone, sort_order)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        b.sprint_id,
        b.parent_id || null,
        b.level,
        name,
        description,
        b.owner_id || null,
        b.color || null,
        b.start_date,
        b.end_date,
        b.status || 'not_started',
        b.needs_verification ? 1 : 0,
        verification_note,
        b.is_milestone ? 1 : 0,
        Number.isInteger(b.sort_order) ? b.sort_order : 0,
      ]
    );

    res.status(201).json(await hydrateItem(id));
  }

  async function updateItem(req, res) {
    const existing = await db.one(`SELECT * FROM tracker_items WHERE id = ?`, [req.params.id]);
    if (!existing) return res.status(404).json({ error: 'Item not found' });

    const b = req.body || {};
    if ('sprint_id' in b || 'level' in b) {
      return res.status(400).json({ error: 'sprint_id and level are immutable; delete and recreate instead' });
    }
    if ('parent_id' in b) {
      return res.status(400).json({ error: 'parent_id is immutable in MVP; delete and recreate instead' });
    }

    const updates = {};

    if (b.name !== undefined) {
      const v = trimBounded(b.name, NAME_MAX);
      if (!v) return res.status(400).json({ error: 'name cannot be empty' });
      updates.name = v;
    }
    if (b.description !== undefined) {
      const v = trimBounded(b.description, TEXT_MAX);
      if (v === false) return res.status(400).json({ error: `description exceeds ${TEXT_MAX} chars` });
      updates.description = v;
    }
    if (b.verification_note !== undefined) {
      const v = trimBounded(b.verification_note, TEXT_MAX);
      if (v === false) return res.status(400).json({ error: `verification_note exceeds ${TEXT_MAX} chars` });
      updates.verification_note = v;
    }
    if (b.owner_id !== undefined) {
      if (b.owner_id !== null) {
        const owner = await db.one(`SELECT id FROM tracker_people WHERE id = ?`, [b.owner_id]);
        if (!owner) return res.status(400).json({ error: 'owner_id does not exist' });
      }
      updates.owner_id = b.owner_id;
    }
    if (b.color !== undefined) updates.color = b.color;
    if (b.start_date !== undefined) updates.start_date = b.start_date;
    if (b.end_date !== undefined) updates.end_date = b.end_date;
    if (b.status !== undefined) {
      if (!isValidStatus(b.status)) return res.status(400).json({ error: 'status invalid' });
      updates.status = b.status;
    }
    if (b.needs_verification !== undefined) updates.needs_verification = b.needs_verification ? 1 : 0;
    if (b.is_milestone !== undefined) updates.is_milestone = b.is_milestone ? 1 : 0;
    if (b.sort_order !== undefined && Number.isInteger(b.sort_order)) updates.sort_order = b.sort_order;

    const finalStart = updates.start_date ?? existing.start_date;
    const finalEnd = updates.end_date ?? existing.end_date;
    if (!isValidDateRange(finalStart, finalEnd)) {
      return res.status(400).json({ error: 'start_date must be <= end_date (YYYY-MM-DD)' });
    }

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }
    updates.updated_at = new Date().toISOString();

    const setClauses = Object.keys(updates).map(k => `${k} = ?`).join(', ');
    await db.run(
      `UPDATE tracker_items SET ${setClauses} WHERE id = ?`,
      [...Object.values(updates), req.params.id]
    );
    res.json(await hydrateItem(req.params.id));
  }

  async function deleteItem(req, res) {
    const existing = await db.one(`SELECT id FROM tracker_items WHERE id = ?`, [req.params.id]);
    if (!existing) return res.status(404).json({ error: 'Item not found' });
    await db.run(`DELETE FROM tracker_items WHERE id = ?`, [req.params.id]);
    res.json({ ok: true });
  }

  async function setSupport(req, res) {
    const item = await db.one(`SELECT id FROM tracker_items WHERE id = ?`, [req.params.id]);
    if (!item) return res.status(404).json({ error: 'Item not found' });

    const ids = req.body?.person_ids;
    if (!Array.isArray(ids)) return res.status(400).json({ error: 'person_ids must be an array' });
    if (!ids.every(n => Number.isInteger(n) && n > 0)) {
      return res.status(400).json({ error: 'person_ids must be positive integers' });
    }

    if (new Set(ids).size !== ids.length) {
      return res.status(400).json({ error: 'person_ids must not contain duplicates' });
    }

    // WHY: Validate all person_ids exist before mutating — avoids partial writes on error.
    if (ids.length > 0) {
      const placeholders = ids.map(() => '?').join(',');
      const found = await db.all(
        `SELECT id FROM tracker_people WHERE id IN (${placeholders})`,
        ids
      );
      if (found.length !== new Set(ids).size) {
        return res.status(400).json({ error: 'one or more person_ids do not exist' });
      }
    }

    // WHY: Transaction so "replace" is atomic — observers never see a half-empty list.
    await db.transaction(async (tx) => {
      await tx.run(`DELETE FROM tracker_item_support WHERE item_id = ?`, [req.params.id]);
      for (const pid of ids) {
        await tx.run(
          `INSERT INTO tracker_item_support (item_id, person_id) VALUES (?, ?)`,
          [req.params.id, pid]
        );
      }
    });

    const support = (await db.all(
      `SELECT person_id FROM tracker_item_support WHERE item_id = ? ORDER BY person_id`,
      [req.params.id]
    )).map(r => r.person_id);
    res.json({ id: req.params.id, support_ids: support });
  }

  // ── Reorder (same-parent only) ─────────────────────────────────
  // WHY: Drag-to-reorder sends the full new order of a set of siblings.
  //      We assign sort_order = index within a transaction. Siblings only —
  //      cross-parent moves would require lifting the parent_id immutability.
  async function reorderItems(req, res) {
    const ids = req.body?.ordered_ids;
    if (!Array.isArray(ids)) return res.status(400).json({ error: 'ordered_ids must be an array' });
    if (ids.length === 0) return res.status(400).json({ error: 'ordered_ids cannot be empty' });
    if (new Set(ids).size !== ids.length) {
      return res.status(400).json({ error: 'ordered_ids must not contain duplicates' });
    }

    // Fetch all rows and verify they exist + share the same parent.
    const placeholders = ids.map(() => '?').join(',');
    const rows = await db.all(
      `SELECT id, parent_id, sprint_id FROM tracker_items WHERE id IN (${placeholders})`,
      ids
    );
    if (rows.length !== ids.length) {
      return res.status(400).json({ error: 'one or more ordered_ids do not exist' });
    }
    // WHY: coerce null to a sentinel string so Set can distinguish "no parent" from UUIDs
    const parentKey = (p) => p === null ? '__root__' : p;
    const parentKeys = new Set(rows.map(r => parentKey(r.parent_id)));
    if (parentKeys.size > 1) {
      return res.status(400).json({ error: 'ordered_ids must all be siblings (same parent)' });
    }
    const sprintKeys = new Set(rows.map(r => r.sprint_id));
    if (sprintKeys.size > 1) {
      return res.status(400).json({ error: 'ordered_ids must all belong to the same sprint' });
    }

    const now = new Date().toISOString();
    await db.transaction(async (tx) => {
      for (let idx = 0; idx < ids.length; idx++) {
        await tx.run(
          `UPDATE tracker_items SET sort_order = ?, updated_at = ? WHERE id = ?`,
          [idx, now, ids[idx]]
        );
      }
    });

    res.json({ ok: true, count: ids.length });
  }

  return {
    listPeople, createPerson, updatePerson, deletePerson,
    listSprints, getSprint, createSprint, updateSprint, deleteSprint,
    createItem, updateItem, deleteItem,
    setSupport, reorderItems,
  };
}

const handlers = makeHandlers(defaultDb);

const router = express.Router();
router.use(requireAuth);

router.get('/people', handlers.listPeople);
router.post('/people', handlers.createPerson);
router.patch('/people/:id', handlers.updatePerson);
router.delete('/people/:id', handlers.deletePerson);

router.get('/sprints', handlers.listSprints);
router.get('/sprints/:id', handlers.getSprint);
router.post('/sprints', handlers.createSprint);
router.patch('/sprints/:id', handlers.updateSprint);
router.delete('/sprints/:id', handlers.deleteSprint);

router.post('/items', handlers.createItem);
router.patch('/items/:id', handlers.updateItem);
router.delete('/items/:id', handlers.deleteItem);
router.put('/items/:id/support', handlers.setSupport);
router.post('/items/reorder', handlers.reorderItems);

module.exports = router;
module.exports.__testHandlers = makeHandlers;
