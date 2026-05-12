const express = require('express');
const PDFDocument = require('pdfkit');
const db = require('../db/database');
const { requireAuth } = require('../middleware/auth');

const router = express.Router({ mergeParams: true });

// ── Brand palette (from brand-components.jsx "Safe Palette") ──
// WHY: Cover uses the brand guidelines. Content pages use neutral tones.
const BRAND = {
  paper: '#F6F4EE',
  paper2: '#ECE8DB',
  primary: '#FF6A3D',
  ink: '#0E1420',
  ink2: '#3A4352',
};

const COLORS = {
  accent: '#FF6A3D',
  green: '#00e676',
  amber: '#f59e0b',
  red: '#ef4444',
  grey: '#6b7280',
  white: '#ffffff',
  textDark: '#111827',
  textMuted: '#6b7280',
  tableHeader: '#1f2937',
};

const READINESS_COLORS = { ready: '#00e676', minor_work: '#f59e0b', major_work: '#ef4444', not_feasible: '#6b7280' };
const READINESS_LABELS = { ready: 'Ready', minor_work: 'Minor Work Needed', major_work: 'Major Work Needed', not_feasible: 'Not Feasible' };

const DEPARTMENT_NAMES = {
  housekeeping: 'Housekeeping / EVS', fb: 'Food & Beverage', engineering: 'Engineering / Facilities',
  front_office: 'Front Office / Guest Services', laundry: 'Laundry / Linen',
  security: 'Security / Loss Prevention', events: 'Events / Conferences',
};

// ── Helpers ────────────────────────────────────────────────────

function formatDate(dateStr) {
  if (!dateStr) return 'N/A';
  try {
    const d = new Date(dateStr.split(' ')[0] + 'T00:00:00');
    return d.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
  } catch { return dateStr; }
}

function drawDot(doc, x, y, radius, color) {
  doc.save().circle(x, y, radius).fill(color).restore();
}

function safeJson(val) {
  if (!val) return {};
  if (typeof val === 'object') return val;
  try { return JSON.parse(val); } catch { return {}; }
}

function drawTableRow(doc, x, y, label, value, colW, rowH, alt) {
  doc.save().rect(x, y, colW * 2, rowH).fill(alt ? '#f9fafb' : '#ffffff').restore();
  doc.fillColor(COLORS.textMuted).fontSize(9).text(label, x + 6, y + (rowH - 9) / 2, { width: colW - 12, lineBreak: false });
  doc.fillColor(COLORS.textDark).fontSize(9).text(value != null && value !== '' ? String(value) : '—', x + colW + 6, y + (rowH - 9) / 2, { width: colW - 12, lineBreak: false });
  return y + rowH;
}

function drawTable(doc, rows, margin, y, colW, rowH, contentW) {
  doc.save().rect(margin, y, contentW, rowH).fill(COLORS.tableHeader).restore();
  doc.fillColor(COLORS.white).font('Helvetica-Bold').fontSize(9).text('Field', margin + 6, y + (rowH - 9) / 2, { width: colW - 12, lineBreak: false });
  doc.fillColor(COLORS.white).fontSize(9).text('Value', margin + colW + 6, y + (rowH - 9) / 2, { width: colW - 12, lineBreak: false });
  y += rowH;
  const startY = y;
  rows.forEach(([l, v], i) => { y = drawTableRow(doc, margin, y, l, v, colW, rowH, i % 2 === 1); });
  doc.save().rect(margin, startY - rowH, contentW, rows.length * rowH + rowH).strokeColor('#d1d5db').lineWidth(0.5).stroke().restore();
  return y;
}

function heading(doc, title, margin, y) {
  doc.fillColor(COLORS.textDark).font('Helvetica-Bold').fontSize(12).text(title, margin, y, { lineBreak: false });
  y += 18;
  doc.save().rect(margin, y - 6, 40, 2).fill(COLORS.accent).restore();
  return y + 6;
}

function pageBreak(doc, y, margin, need) {
  if (y + (need || 80) > doc.page.height - 60) { doc.addPage(); return margin; }
  return y;
}

function zoneHasContent(z) {
  return !!(z.robot_readiness || z.pain_points || z.readiness_notes || z.notes
    || z.corridor_width_ft != null || z.ceiling_height_ft != null || z.wifi_strength
    || z.current_cleaning_method);
}

// ── Route ──────────────────────────────────────────────────────

router.get('/', requireAuth, async (req, res) => {
  const { id } = req.params;
  const mode = req.query.mode === 'summary' ? 'summary' : 'full';

  const assessment = await db.one('SELECT * FROM assessments WHERE id = ?', [id]);
  if (!assessment) return res.status(404).json({ error: 'Assessment not found' });

  const zones = await db.all('SELECT * FROM assessment_zones WHERE assessment_id = ? ORDER BY sort_order', [id]);
  const stakeholders = await db.all('SELECT * FROM assessment_stakeholders WHERE assessment_id = ? ORDER BY sort_order', [id]);

  // WHY: bufferPages REMOVED — it caused blank overflow pages when writing footers
  // via switchToPage(). Simple inline footers are more reliable.
  const doc = new PDFDocument({ size: 'letter', margin: 72 });

  const safeName = (assessment.property_name || 'assessment').replace(/[^a-z0-9_-]/gi, '-').toLowerCase();
  const fmtDate = formatDate(assessment.created_at);

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="assessment-${safeName}-${mode}.pdf"`);
  doc.pipe(res);

  const pageW = doc.page.width;
  const pageH = doc.page.height;
  const margin = 72;
  const contentW = pageW - margin * 2;
  const colW = contentW / 2;
  const rowH = 22;
  let y;

  // ══════════════════════════════════════════════════════════════
  // PAGE 1: COVER (Brand Guidelines — Safe Palette)
  // ══════════════════════════════════════════════════════════════
  doc.save().rect(0, 0, pageW, pageH).fill(BRAND.paper).restore();
  doc.save().rect(0, 0, pageW, 8).fill(BRAND.primary).restore();
  doc.save().rect(margin, 100, contentW, 2).fill(BRAND.primary).restore();

  doc.fillColor(BRAND.primary).font('Helvetica-Bold').fontSize(14)
    .text('ACCELERATE ROBOTICS', margin, 72, { align: 'center', characterSpacing: 3, lineBreak: false });

  doc.fillColor(BRAND.ink).font('Helvetica-Bold').fontSize(34)
    .text('Facility Assessment', margin, 140, { align: 'center', width: contentW, lineBreak: false });
  doc.fillColor(BRAND.ink).font('Helvetica-Bold').fontSize(34)
    .text('Report', margin, 180, { align: 'center', width: contentW, lineBreak: false });

  const subtitle = mode === 'summary' ? 'Executive Summary' : 'Comprehensive Report';
  doc.fillColor(BRAND.primary).font('Helvetica').fontSize(13)
    .text(subtitle, margin, 226, { align: 'center', width: contentW, lineBreak: false });

  doc.save().rect(pageW / 2 - 40, 254, 80, 2).fill(BRAND.primary).restore();

  doc.fillColor(BRAND.ink).font('Helvetica-Bold').fontSize(24)
    .text(assessment.property_name, margin, 276, { align: 'center', width: contentW, lineBreak: false });

  if (assessment.property_address) {
    doc.fillColor(BRAND.ink2).font('Helvetica').fontSize(12)
      .text(assessment.property_address, margin, 312, { align: 'center', width: contentW, lineBreak: false });
  }

  const metaY = assessment.property_address ? 350 : 330;
  doc.save().roundedRect(pageW / 2 - 120, metaY, 240, 60, 8).fill(BRAND.paper2).restore();
  doc.fillColor(BRAND.ink2).font('Helvetica').fontSize(11)
    .text(`Assessed by: ${assessment.assigned_to}`, pageW / 2 - 110, metaY + 16, { width: 220, align: 'center', lineBreak: false });
  doc.fillColor(BRAND.ink2).font('Helvetica').fontSize(11)
    .text(`Date: ${fmtDate}`, pageW / 2 - 110, metaY + 34, { width: 220, align: 'center', lineBreak: false });

  doc.fillColor(BRAND.ink2).font('Helvetica').fontSize(9)
    .text(`Confidential — Prepared for ${assessment.property_name}`, margin, pageH - 60, { align: 'center', width: contentW, lineBreak: false });
  doc.save().rect(0, pageH - 8, pageW, 8).fill(BRAND.primary).restore();

  // ══════════════════════════════════════════════════════════════
  // PAGE 2: EXECUTIVE SUMMARY
  // ══════════════════════════════════════════════════════════════
  doc.addPage();
  y = margin;

  doc.fillColor(COLORS.textDark).font('Helvetica-Bold').fontSize(20).text('Executive Summary', margin, y, { lineBreak: false });
  y += 32;
  doc.save().rect(margin, y - 8, 48, 3).fill(COLORS.accent).restore();

  doc.fillColor(COLORS.textDark).font('Helvetica-Bold').fontSize(12).text('Property Overview', margin, y + 4, { lineBreak: false });
  y += 24;

  const allOverviewRows = [
    ['Property Name', assessment.property_name],
    ['Property Type', assessment.property_type || assessment.facility_type || null],
    ['Brand / Flag', assessment.brand_flag],
    ['Management Company', assessment.management_company],
    ['Star Rating', assessment.star_rating ? `${assessment.star_rating} / 5` : null],
    ['Rooms', assessment.rooms],
    ['Floors', assessment.floors],
    ['Elevators', assessment.elevators],
    ['Total Sq Ft', assessment.total_sqft],
    ['Year Built', assessment.year_built],
    ['Last Renovation', assessment.last_renovation],
    ['F&B Outlets', assessment.fb_outlets],
    ['Event Space (sq ft)', assessment.event_space_sqft],
    ['Union Status', assessment.union_status ? assessment.union_status.replace('_', ' ').replace(/\b\w/g, c => c.toUpperCase()) : null],
  ];
  // WHY: Summary only shows filled rows; full shows all rows with "—" for empties
  const overviewRows = mode === 'summary'
    ? allOverviewRows.filter(([, v]) => v != null && v !== '')
    : allOverviewRows;

  y = drawTable(doc, overviewRows, margin, y, colW, rowH, contentW);
  y += 24;

  // Key Contacts
  const contacts = [];
  if (assessment.gm_name) contacts.push({ role: 'General Manager', name: assessment.gm_name, email: assessment.gm_email });
  if (assessment.engineering_contact) contacts.push({ role: 'Engineering', name: assessment.engineering_contact, email: assessment.engineering_email });
  if (assessment.fb_director) contacts.push({ role: 'F&B Director', name: assessment.fb_director });

  if (contacts.length > 0 || mode === 'full') {
    doc.fillColor(COLORS.textDark).font('Helvetica-Bold').fontSize(12).text('Key Contacts', margin, y, { lineBreak: false });
    y += 20;
    if (contacts.length > 0) {
      contacts.forEach((c, i) => {
        if (i % 2 === 1) doc.save().rect(margin, y, contentW, 18).fill('#f9fafb').restore();
        doc.fillColor(COLORS.textMuted).font('Helvetica').fontSize(9).text(c.role, margin + 6, y + 4, { width: colW - 12, lineBreak: false });
        doc.fillColor(COLORS.textDark).fontSize(9).text(c.email ? `${c.name} — ${c.email}` : c.name, margin + colW + 6, y + 4, { width: colW - 12, lineBreak: false });
        y += 18;
      });
    } else {
      doc.fillColor(COLORS.textMuted).font('Helvetica').fontSize(9).text('No contacts recorded', margin + 6, y, { lineBreak: false });
      y += 14;
    }
    y += 16;
  }

  // Robot Readiness Summary
  if (zones.length > 0) {
    doc.fillColor(COLORS.textDark).font('Helvetica-Bold').fontSize(12).text('Robot Readiness Summary', margin, y, { lineBreak: false });
    y += 20;
    const counts = { ready: 0, minor_work: 0, major_work: 0, not_feasible: 0, unknown: 0 };
    zones.forEach(z => { if (z.robot_readiness && counts[z.robot_readiness] !== undefined) counts[z.robot_readiness]++; else counts.unknown++; });

    [['ready', 'Ready'], ['minor_work', 'Minor Work Needed'], ['major_work', 'Major Work Needed'], ['not_feasible', 'Not Feasible']].forEach(([k, l]) => {
      if (counts[k] === 0 && mode === 'summary') return;
      drawDot(doc, margin + 8, y + 7, 5, READINESS_COLORS[k]);
      doc.fillColor(COLORS.textDark).font('Helvetica').fontSize(10).text(`${counts[k]} zone${counts[k] !== 1 ? 's' : ''} — ${l}`, margin + 20, y + 1, { lineBreak: false });
      y += 20;
    });
    if (counts.unknown > 0) {
      drawDot(doc, margin + 8, y + 7, 5, COLORS.grey);
      doc.fillColor(COLORS.textMuted).font('Helvetica').fontSize(10).text(`${counts.unknown} zone${counts.unknown !== 1 ? 's' : ''} — Not assessed`, margin + 20, y + 1, { lineBreak: false });
      y += 20;
    }
  }

  // ══════════════════════════════════════════════════════════════
  // SUMMARY MODE STOPS HERE — full mode continues below
  // ══════════════════════════════════════════════════════════════
  if (mode === 'full') {

    // ── Operations: F&B, Events, Departments ──────────────────
    const ops = safeJson(assessment.operations_data);
    const fbVenues = ops.fb_venues || [];
    const eventSpaces = ops.event_spaces || [];
    const departments = ops.departments || {};

    doc.addPage();
    y = margin;
    doc.fillColor(COLORS.textDark).font('Helvetica-Bold').fontSize(20).text('Operations', margin, y, { lineBreak: false });
    y += 32;
    doc.save().rect(margin, y - 8, 48, 3).fill(COLORS.accent).restore();

    // F&B Venues
    y = heading(doc, 'F&B Venues', margin, y, contentW);
    if (fbVenues.length > 0) {
      y = drawTable(doc, fbVenues.map(v => [v.name || v.type, `${v.sqft || '—'} sq ft  |  ${v.covers || '—'} covers`]), margin, y, colW, rowH, contentW);
    } else {
      doc.fillColor(COLORS.textMuted).font('Helvetica').fontSize(9).text('No F&B venues recorded', margin + 6, y, { lineBreak: false });
      y += 14;
    }
    y += 20;

    // Event Spaces
    y = pageBreak(doc, y, margin, 80);
    y = heading(doc, 'Event Spaces', margin, y, contentW);
    if (eventSpaces.length > 0) {
      y = drawTable(doc, eventSpaces.map(es => [es.name || es.type, `${es.sqft || '—'} sq ft  |  Cap: ${es.capacity || '—'}${es.divisible ? '  |  Divisible' : ''}`]), margin, y, colW, rowH, contentW);
    } else {
      doc.fillColor(COLORS.textMuted).font('Helvetica').fontSize(9).text('No event spaces recorded', margin + 6, y, { lineBreak: false });
      y += 14;
    }
    y += 20;

    // Department Assessments — ALL departments in full mode
    y = pageBreak(doc, y, margin, 100);
    y = heading(doc, 'Department Assessments', margin, y, contentW);

    const allDepts = Object.keys(DEPARTMENT_NAMES).map(id => [id, departments[id] || {}]);

    allDepts.forEach(([deptId, d]) => {
        y = pageBreak(doc, y, margin, 60);
        doc.fillColor(d.assessed ? COLORS.green : COLORS.textDark).font('Helvetica-Bold').fontSize(10)
          .text(`${DEPARTMENT_NAMES[deptId]}${d.assessed ? '  ✓' : ''}`, margin, y, { lineBreak: false });
        y += 16;

        // Field values
        const fields = [];
        for (const [k, v] of Object.entries(d)) {
          if (['assessed', '_expanded', 'challenges', 'opportunities', 'custom_challenges', 'notes'].includes(k)) continue;
          if (v != null && v !== '' && v !== 0) fields.push([k.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()), String(v)]);
        }
        if (fields.length > 0) { y = drawTable(doc, fields, margin, y, colW, rowH, contentW); y += 8; }

        if ((d.challenges || []).length > 0) {
          doc.fillColor('#ea580c').font('Helvetica-Bold').fontSize(9).text('Challenges:', margin, y, { lineBreak: false });
          y += 14;
          d.challenges.forEach(ch => {
            y = pageBreak(doc, y, margin, 14);
            doc.fillColor(COLORS.textDark).font('Helvetica').fontSize(9).text(`• ${ch}`, margin + 8, y, { width: contentW - 8 });
            y += doc.heightOfString(`• ${ch}`, { width: contentW - 8 }) + 3;
          });
          y += 4;
        }

        if ((d.opportunities || []).length > 0) {
          y = pageBreak(doc, y, margin, 30);
          doc.fillColor(COLORS.green).font('Helvetica-Bold').fontSize(9).text('Robot Opportunities:', margin, y, { lineBreak: false });
          y += 14;
          d.opportunities.forEach(opp => {
            y = pageBreak(doc, y, margin, 14);
            doc.fillColor(COLORS.textDark).font('Helvetica').fontSize(9).text(`• ${opp}`, margin + 8, y, { width: contentW - 8 });
            y += doc.heightOfString(`• ${opp}`, { width: contentW - 8 }) + 3;
          });
          y += 4;
        }

        if (d.notes) {
          doc.fillColor(COLORS.textMuted).font('Helvetica').fontSize(9).text(`Notes: ${d.notes}`, margin + 8, y, { width: contentW - 8 });
          y += doc.heightOfString(`Notes: ${d.notes}`, { width: contentW - 8 }) + 4;
        }
        y += 10;
      });

    // ── Infrastructure (always shown in full mode) ──────────────
    const infra = safeJson(assessment.infrastructure_data);
    const wifi = infra.wifi || {};
    const elevators = infra.elevators || [];

    doc.addPage();
    y = margin;
    doc.fillColor(COLORS.textDark).font('Helvetica-Bold').fontSize(20).text('Infrastructure', margin, y, { lineBreak: false });
    y += 32;
    doc.save().rect(margin, y - 8, 48, 3).fill(COLORS.accent).restore();

    // WiFi — show all fields with "—" for empties
    y = heading(doc, 'WiFi & Connectivity', margin, y, contentW);
    const wifiRows = [
      ['Overall Coverage', wifi.coverage], ['Network (SSID)', wifi.network], ['Bandwidth', wifi.bandwidth],
      ['ISP / Provider', wifi.isp],
      ['Download (Mbps)', wifi.speed_down != null ? String(wifi.speed_down) : null],
      ['Upload (Mbps)', wifi.speed_up != null ? String(wifi.speed_up) : null],
      ['Ping (ms)', wifi.ping != null ? String(wifi.ping) : null],
      ['Cellular Signal', wifi.cellular], ['IT Contact', wifi.it_contact], ['IT Email', wifi.it_email],
    ];
    y = drawTable(doc, wifiRows, margin, y, colW, rowH, contentW);
    y += 20;

    // Elevator Inventory
    y = pageBreak(doc, y, margin, 80);
    y = heading(doc, 'Elevator Inventory', margin, y, contentW);
    if (elevators.length > 0) {
      if (infra.elevator_company) {
        doc.fillColor(COLORS.textMuted).font('Helvetica').fontSize(9).text(`Service Company: ${infra.elevator_company}`, margin, y, { lineBreak: false });
        y += 14;
      }
      const accessLabels = { api: 'API Ready', relay: 'Relay Parallel', none: 'None / Unknown' };
      elevators.forEach((el, i) => {
        y = pageBreak(doc, y, margin, 80);
        doc.fillColor(COLORS.textDark).font('Helvetica-Bold').fontSize(10).text(`Elevator ${i + 1}`, margin, y, { lineBreak: false });
        y += 16;
        const elRows = [
          ['Make', el.make], ['Model', el.model], ['Floors Served', el.floors_served],
          ['Age', el.age != null ? `${el.age} years` : null],
          ['Dispatch', el.dispatch ? el.dispatch.charAt(0).toUpperCase() + el.dispatch.slice(1) : null],
          ['Robot Integration', accessLabels[el.robot_access] || el.robot_access],
        ];
        y = drawTable(doc, elRows, margin, y, colW, rowH, contentW);
        y += 12;
      });
    } else {
      doc.fillColor(COLORS.textMuted).font('Helvetica').fontSize(9).text('No elevator data recorded', margin + 6, y, { lineBreak: false });
      y += 14;
    }

    // Additional infrastructure notes
    y += 8;
    y = pageBreak(doc, y, margin, 60);
    y = heading(doc, 'Additional Notes', margin, y, contentW);
    [['Power / Electrical', infra.power_notes], ['Storage / Staging', infra.storage_notes], ['Network / Cabling', infra.network_notes]].forEach(([label, value]) => {
      y = pageBreak(doc, y, margin, 30);
      doc.fillColor(COLORS.textMuted).font('Helvetica-Bold').fontSize(9).text(label, margin, y, { lineBreak: false });
      y += 14;
      doc.fillColor(COLORS.textDark).font('Helvetica').fontSize(9).text(value || '—', margin + 8, y, { width: contentW - 8 });
      y += doc.heightOfString(value || '—', { width: contentW - 8 }) + 10;
    });

    // ── Zone Pages (all zones in full mode) ─────────────────────
    zones.forEach(zone => {
      doc.addPage();
      y = margin;

      doc.fillColor(COLORS.textDark).font('Helvetica-Bold').fontSize(18).text(zone.zone_name, margin, y, { width: contentW - 120 });
      const typeLabel = (zone.zone_type || 'other').replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
      doc.fillColor(COLORS.grey).font('Helvetica').fontSize(10).text(typeLabel, margin, y + 22, { lineBreak: false });
      y += 38;
      doc.save().rect(margin, y, contentW, 2).fill(COLORS.accent).restore();
      y += 14;

      if (zone.robot_readiness) {
        drawDot(doc, margin + 8, y + 8, 6, READINESS_COLORS[zone.robot_readiness] || COLORS.grey);
        doc.fillColor(COLORS.textDark).font('Helvetica-Bold').fontSize(11)
          .text(READINESS_LABELS[zone.robot_readiness] || zone.robot_readiness, margin + 22, y + 2, { lineBreak: false });
        y += 26;
      } else {
        drawDot(doc, margin + 8, y + 8, 6, COLORS.grey);
        doc.fillColor(COLORS.textMuted).font('Helvetica').fontSize(11).text('Not assessed', margin + 22, y + 2, { lineBreak: false });
        y += 26;
      }

      // Zone metrics — show ALL fields with "—" for empties
      let surfaces = [];
      try { surfaces = typeof zone.floor_surfaces === 'string' ? JSON.parse(zone.floor_surfaces) : (zone.floor_surfaces || []); } catch { surfaces = []; }

      const metrics = [
        ['Floor Surfaces', surfaces.length > 0 ? surfaces.join(', ') : null],
        ['Corridor Width', zone.corridor_width_ft != null ? `${zone.corridor_width_ft} ft` : null],
        ['Ceiling Height', zone.ceiling_height_ft != null ? `${zone.ceiling_height_ft} ft` : null],
        ['Min Door Width', zone.door_width_min_ft != null ? `${zone.door_width_min_ft} ft` : null],
        ['WiFi Strength', zone.wifi_strength ? zone.wifi_strength.replace(/\b\w/g, c => c.toUpperCase()) : null],
        ['WiFi Network', zone.wifi_network],
        ['Lighting', zone.lighting ? zone.lighting.replace(/\b\w/g, c => c.toUpperCase()) : null],
        ['Foot Traffic', zone.foot_traffic ? zone.foot_traffic.replace(/\b\w/g, c => c.toUpperCase()) : null],
        ['Cleaning Method', zone.current_cleaning_method],
        ['Cleaning Frequency', zone.cleaning_frequency],
        ['Cleaning Contractor', zone.cleaning_contractor],
        ['Delivery Method', zone.delivery_method],
      ];

      doc.fillColor(COLORS.textDark).font('Helvetica-Bold').fontSize(11).text('Zone Metrics', margin, y, { lineBreak: false });
      y += 18;
      y = drawTable(doc, metrics, margin, y, colW, rowH, contentW);
      y += 16;

      if (zone.pain_points) {
        doc.fillColor(COLORS.textDark).font('Helvetica-Bold').fontSize(11).text('Pain Points', margin, y, { lineBreak: false });
        y += 16;
        doc.fillColor(COLORS.textDark).font('Helvetica').fontSize(10).text(zone.pain_points, margin, y, { width: contentW });
        y += doc.heightOfString(zone.pain_points, { width: contentW }) + 16;
      }

      if (zone.readiness_notes) {
        doc.fillColor(COLORS.textDark).font('Helvetica-Bold').fontSize(11).text('Readiness Notes', margin, y, { lineBreak: false });
        y += 16;
        doc.fillColor(COLORS.textDark).font('Helvetica').fontSize(10).text(zone.readiness_notes, margin, y, { width: contentW });
        y += doc.heightOfString(zone.readiness_notes, { width: contentW }) + 16;
      }

      if (zone.notes) {
        doc.fillColor(COLORS.textDark).font('Helvetica-Bold').fontSize(11).text('Assessor Notes', margin, y, { lineBreak: false });
        y += 16;
        doc.fillColor(COLORS.textMuted).font('Helvetica').fontSize(10).text(zone.notes, margin, y, { width: contentW });
      }
    });

    // ── Recommendations (only if zones have readiness data) ───
    const readyZ = zones.filter(z => z.robot_readiness === 'ready');
    const minorZ = zones.filter(z => z.robot_readiness === 'minor_work');
    const majorZ = zones.filter(z => z.robot_readiness === 'major_work');
    const noGoZ = zones.filter(z => z.robot_readiness === 'not_feasible');

    {
      doc.addPage();
      y = margin;
      doc.fillColor(COLORS.textDark).font('Helvetica-Bold').fontSize(20).text('Recommendations', margin, y, { lineBreak: false });
      y += 32;
      doc.save().rect(margin, y - 8, 48, 3).fill(COLORS.accent).restore();

      if (readyZ.length) {
        doc.fillColor(COLORS.green).font('Helvetica-Bold').fontSize(13).text('Deployment-Ready Zones', margin, y + 4, { lineBreak: false });
        y += 26;
        readyZ.forEach(z => { drawDot(doc, margin + 8, y + 5, 4, COLORS.green); doc.fillColor(COLORS.textDark).font('Helvetica').fontSize(10).text(z.zone_name, margin + 20, y, { lineBreak: false }); y += 18; });
        y += 10;
      }

      const prepZ = [...minorZ, ...majorZ];
      if (prepZ.length) {
        doc.fillColor(COLORS.amber).font('Helvetica-Bold').fontSize(13).text('Zones Needing Prep Work', margin, y, { lineBreak: false });
        y += 26;
        prepZ.forEach(z => {
          drawDot(doc, margin + 8, y + 5, 4, COLORS.amber);
          const txt = z.readiness_notes ? `${z.zone_name} — ${z.readiness_notes}` : z.zone_name;
          doc.fillColor(COLORS.textDark).font('Helvetica').fontSize(10).text(txt, margin + 20, y, { width: contentW - 20 });
          y += doc.heightOfString(txt, { width: contentW - 20 }) + 8;
        });
        y += 6;
      }

      if (noGoZ.length) {
        doc.fillColor(COLORS.red).font('Helvetica-Bold').fontSize(13).text('Not Feasible', margin, y, { lineBreak: false });
        y += 26;
        noGoZ.forEach(z => { drawDot(doc, margin + 8, y + 5, 4, COLORS.red); doc.fillColor(COLORS.textDark).font('Helvetica').fontSize(10).text(z.zone_name, margin + 20, y, { lineBreak: false }); y += 18; });
      }

      if (readyZ.length) {
        y += 20;
        doc.save().rect(margin, y, contentW, 50).fill('#fffbeb').restore();
        doc.save().rect(margin, y, 4, 50).fill(COLORS.accent).restore();
        doc.fillColor(COLORS.textDark).font('Helvetica-Bold').fontSize(11).text('Suggested Pilot Zone', margin + 16, y + 10, { lineBreak: false });
        doc.fillColor(COLORS.textDark).font('Helvetica').fontSize(10).text(readyZ[0].zone_name, margin + 16, y + 28, { lineBreak: false });
      }
    }
  } // end full mode

  doc.end();
});

module.exports = router;
