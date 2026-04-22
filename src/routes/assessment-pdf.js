const express = require('express');
const PDFDocument = require('pdfkit');
const db = require('../db/database');
const { requireAuth } = require('../middleware/auth');

const router = express.Router({ mergeParams: true });

// ── Color palette ──────────────────────────────────────────────
// WHY: Matches the Accelerate Robotics brand — dark bg with amber/gold accent,
// consistent with the website's dark theme (#0a0a0f, #f59e0b, #00e676).
const COLORS = {
  darkBg: '#0a0a0f',
  accent: '#f59e0b',
  green: '#00e676',
  amber: '#f59e0b',
  red: '#ef4444',
  grey: '#6b7280',
  white: '#ffffff',
  lightGrey: '#f3f4f6',
  textDark: '#111827',
  textMuted: '#6b7280',
};

const READINESS_COLORS = {
  ready: '#00e676',
  minor_work: '#f59e0b',
  major_work: '#ef4444',
  not_feasible: '#6b7280',
};

const READINESS_LABELS = {
  ready: 'Ready',
  minor_work: 'Minor Work Needed',
  major_work: 'Major Work Needed',
  not_feasible: 'Not Feasible',
};

// ── Helpers ────────────────────────────────────────────────────

/**
 * Convert a hex color string to an RGB array [r, g, b].
 * WHY: PDFKit's fillColor() accepts strings like '#ffffff', but the doc.rect()
 * color helpers need the same. This helper is used for the dark cover background.
 */
function hexToRgb(hex) {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result
    ? [parseInt(result[1], 16), parseInt(result[2], 16), parseInt(result[3], 16)]
    : [0, 0, 0];
}

/**
 * Format a SQLite datetime string (e.g. "2024-04-21 10:30:00") to "April 21, 2024".
 * WHY: SQLite stores datetimes as ISO-ish strings without a timezone designator;
 * splitting on space and parsing the date part avoids TZ-shift issues.
 */
function formatDate(dateStr) {
  if (!dateStr) return 'N/A';
  try {
    const datePart = dateStr.split(' ')[0]; // "2024-04-21"
    const d = new Date(datePart + 'T00:00:00');
    return d.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
  } catch {
    return dateStr;
  }
}

/**
 * Draw a small filled circle at (x, y) with given radius and color.
 * WHY: PDFKit has no built-in "dot" helper — we use circle() + fill().
 */
function drawDot(doc, x, y, radius, color) {
  doc.save().circle(x, y, radius).fill(color).restore();
}

/**
 * Draw a two-column key-value table row.
 * Returns the new Y position after the row.
 */
function drawTableRow(doc, x, y, label, value, colWidth, rowHeight, isAlternate) {
  const bgColor = isAlternate ? '#f9fafb' : '#ffffff';
  // Light row background
  doc.save()
    .rect(x, y, colWidth * 2, rowHeight)
    .fill(bgColor)
    .restore();

  // Label
  doc.fillColor(COLORS.textMuted)
    .fontSize(9)
    .text(label, x + 6, y + (rowHeight - 9) / 2, { width: colWidth - 12, lineBreak: false });

  // Value
  doc.fillColor(COLORS.textDark)
    .fontSize(9)
    .text(value != null && value !== '' ? String(value) : '—', x + colWidth + 6, y + (rowHeight - 9) / 2, {
      width: colWidth - 12,
      lineBreak: false,
    });

  return y + rowHeight;
}

// ── Route ──────────────────────────────────────────────────────

/**
 * GET /api/assessments/:id/pdf
 * Generate and stream a PDF report for an assessment.
 * WHY: Mounted separately with mergeParams so :id comes from the parent router.
 */
router.get('/', requireAuth, (req, res) => {
  const { id } = req.params;

  // ── Load data ──────────────────────────────────────────────
  const assessment = db.prepare('SELECT * FROM assessments WHERE id = ?').get(id);
  if (!assessment) {
    return res.status(404).json({ error: 'Assessment not found' });
  }

  const zones = db.prepare(
    'SELECT * FROM assessment_zones WHERE assessment_id = ? ORDER BY sort_order'
  ).all(id);

  const stakeholders = db.prepare(
    'SELECT * FROM assessment_stakeholders WHERE assessment_id = ? ORDER BY sort_order'
  ).all(id);

  // ── Setup PDF ──────────────────────────────────────────────
  // WHY: bufferPages: true lets us go back and add page numbers/footers
  // after all content is written, using doc.bufferedPageRange().
  const doc = new PDFDocument({ size: 'letter', margin: 72, bufferPages: true });

  const safeFilename = (assessment.property_name || 'assessment')
    .replace(/[^a-z0-9_-]/gi, '-')
    .toLowerCase();
  const formattedDate = formatDate(assessment.created_at);

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader(
    'Content-Disposition',
    `attachment; filename="assessment-${safeFilename}.pdf"`
  );

  doc.pipe(res);

  // ── PAGE 1: Cover ──────────────────────────────────────────
  const pageW = doc.page.width;
  const pageH = doc.page.height;

  // Dark background fills the whole page
  const [r, g, b] = hexToRgb(COLORS.darkBg);
  doc.save().rect(0, 0, pageW, pageH).fill(`rgb(${r},${g},${b})`).restore();

  // Accent line at top
  doc.save().rect(0, 0, pageW, 6).fill(COLORS.accent).restore();

  // Company name
  doc.fillColor(COLORS.amber)
    .font('Helvetica-Bold')
    .fontSize(13)
    .text('ACCELERATE ROBOTICS', 72, 120, { align: 'center' });

  // Report title
  doc.fillColor(COLORS.white)
    .font('Helvetica-Bold')
    .fontSize(32)
    .text('Facility Assessment Report', 72, 148, { align: 'center', width: pageW - 144 });

  // Divider line
  doc.save()
    .moveTo(72, 210)
    .lineTo(pageW - 72, 210)
    .strokeColor(COLORS.amber)
    .lineWidth(1)
    .stroke()
    .restore();

  // Property name
  doc.fillColor(COLORS.white)
    .font('Helvetica-Bold')
    .fontSize(22)
    .text(assessment.property_name, 72, 228, { align: 'center', width: pageW - 144 });

  // Property address (if present)
  if (assessment.property_address) {
    doc.fillColor(COLORS.grey)
      .font('Helvetica')
      .fontSize(12)
      .text(assessment.property_address, 72, 262, { align: 'center', width: pageW - 144 });
  }

  // Meta block: assessor and date
  const metaY = assessment.property_address ? 306 : 278;
  doc.fillColor(COLORS.grey)
    .font('Helvetica')
    .fontSize(11)
    .text(`Assessed by: ${assessment.assigned_to}`, 72, metaY, { align: 'center', width: pageW - 144 });

  doc.fillColor(COLORS.grey)
    .font('Helvetica')
    .fontSize(11)
    .text(`Date: ${formattedDate}`, 72, metaY + 20, { align: 'center', width: pageW - 144 });

  // Cover page footer
  doc.fillColor(COLORS.grey)
    .font('Helvetica')
    .fontSize(9)
    .text(
      `Confidential — Prepared for ${assessment.property_name}`,
      72,
      pageH - 80,
      { align: 'center', width: pageW - 144 }
    );

  // ── PAGE 2: Executive Summary ──────────────────────────────
  doc.addPage();
  const margin = 72;
  const contentW = pageW - margin * 2;
  let y = margin;

  // Section heading
  doc.fillColor(COLORS.textDark)
    .font('Helvetica-Bold')
    .fontSize(20)
    .text('Executive Summary', margin, y);

  y += 32;

  // Accent underline
  doc.save()
    .rect(margin, y - 8, 48, 3)
    .fill(COLORS.accent)
    .restore();

  // ── Property Overview Table ────────────────────────────────
  doc.fillColor(COLORS.textDark)
    .font('Helvetica-Bold')
    .fontSize(12)
    .text('Property Overview', margin, y + 4);

  y += 24;

  const tableRows = [
    ['Property Name', assessment.property_name],
    ['Property Type', assessment.property_type || assessment.facility_type || '—'],
    ['Rooms', assessment.rooms],
    ['Floors', assessment.floors],
    ['Elevators', assessment.elevators],
    ['F&B Outlets', assessment.fb_outlets],
    ['Event Space (sq ft)', assessment.event_space_sqft],
    ['Union Status', assessment.union_status
      ? assessment.union_status.replace('_', ' ').replace(/\b\w/g, c => c.toUpperCase())
      : null],
  ].filter(([, v]) => v != null && v !== '');

  const colW = contentW / 2;
  const rowH = 22;

  // Table header
  doc.save().rect(margin, y, contentW, rowH).fill('#1f2937').restore();
  doc.fillColor(COLORS.white)
    .font('Helvetica-Bold')
    .fontSize(9)
    .text('Field', margin + 6, y + (rowH - 9) / 2, { width: colW - 12, lineBreak: false });
  doc.fillColor(COLORS.white)
    .fontSize(9)
    .text('Value', margin + colW + 6, y + (rowH - 9) / 2, { width: colW - 12, lineBreak: false });
  y += rowH;

  tableRows.forEach(([label, value], idx) => {
    y = drawTableRow(doc, margin, y, label, value, colW, rowH, idx % 2 === 1);
  });

  // Table border
  doc.save()
    .rect(margin, y - tableRows.length * rowH - rowH, contentW, tableRows.length * rowH + rowH)
    .strokeColor('#d1d5db')
    .lineWidth(0.5)
    .stroke()
    .restore();

  y += 24;

  // ── Key Contacts ───────────────────────────────────────────
  const contacts = [];
  if (assessment.gm_name) contacts.push({ role: 'General Manager', name: assessment.gm_name, email: assessment.gm_email });
  if (assessment.engineering_contact) contacts.push({ role: 'Engineering', name: assessment.engineering_contact, email: assessment.engineering_email });
  if (assessment.fb_director) contacts.push({ role: 'F&B Director', name: assessment.fb_director });

  if (contacts.length > 0) {
    doc.fillColor(COLORS.textDark)
      .font('Helvetica-Bold')
      .fontSize(12)
      .text('Key Contacts', margin, y);

    y += 20;

    contacts.forEach((contact, idx) => {
      const contactY = y;
      // Light background for alternating rows
      if (idx % 2 === 1) {
        doc.save().rect(margin, contactY, contentW, 18).fill('#f9fafb').restore();
      }
      doc.fillColor(COLORS.textMuted)
        .font('Helvetica')
        .fontSize(9)
        .text(contact.role, margin + 6, contactY + 4, { width: colW - 12, lineBreak: false });
      const contactDetail = contact.email
        ? `${contact.name} — ${contact.email}`
        : contact.name;
      doc.fillColor(COLORS.textDark)
        .fontSize(9)
        .text(contactDetail, margin + colW + 6, contactY + 4, { width: colW - 12, lineBreak: false });
      y += 18;
    });

    y += 16;
  }

  // ── Robot Readiness Summary ────────────────────────────────
  if (zones.length > 0) {
    doc.fillColor(COLORS.textDark)
      .font('Helvetica-Bold')
      .fontSize(12)
      .text('Robot Readiness Summary', margin, y);

    y += 20;

    // Count zones by readiness level
    const counts = { ready: 0, minor_work: 0, major_work: 0, not_feasible: 0, unknown: 0 };
    zones.forEach(z => {
      if (z.robot_readiness && counts[z.robot_readiness] !== undefined) {
        counts[z.robot_readiness]++;
      } else {
        counts.unknown++;
      }
    });

    const readinessEntries = [
      ['ready', 'Ready'],
      ['minor_work', 'Minor Work Needed'],
      ['major_work', 'Major Work Needed'],
      ['not_feasible', 'Not Feasible'],
    ];

    readinessEntries.forEach(([key, label]) => {
      if (counts[key] === 0) return;
      const color = READINESS_COLORS[key];
      drawDot(doc, margin + 8, y + 7, 5, color);
      doc.fillColor(COLORS.textDark)
        .font('Helvetica')
        .fontSize(10)
        .text(`${counts[key]} zone${counts[key] !== 1 ? 's' : ''} — ${label}`, margin + 20, y + 1);
      y += 20;
    });

    if (counts.unknown > 0) {
      drawDot(doc, margin + 8, y + 7, 5, COLORS.grey);
      doc.fillColor(COLORS.textMuted)
        .font('Helvetica')
        .fontSize(10)
        .text(`${counts.unknown} zone${counts.unknown !== 1 ? 's' : ''} — Not assessed`, margin + 20, y + 1);
      y += 20;
    }
  }

  // ── PAGES 3+: Zone Pages ───────────────────────────────────
  zones.forEach(zone => {
    doc.addPage();
    y = margin;

    // Zone header with amber accent line
    doc.fillColor(COLORS.textDark)
      .font('Helvetica-Bold')
      .fontSize(18)
      .text(zone.zone_name, margin, y, { width: contentW - 120 });

    // Zone type badge
    const zoneTypeLabel = (zone.zone_type || 'other')
      .replace(/_/g, ' ')
      .replace(/\b\w/g, c => c.toUpperCase());

    doc.fillColor(COLORS.grey)
      .font('Helvetica')
      .fontSize(10)
      .text(zoneTypeLabel, margin, y + 22, { width: contentW });

    // Amber accent line below heading
    y += 38;
    doc.save()
      .rect(margin, y, contentW, 2)
      .fill(COLORS.amber)
      .restore();

    y += 14;

    // Robot readiness indicator
    if (zone.robot_readiness) {
      const readinessColor = READINESS_COLORS[zone.robot_readiness] || COLORS.grey;
      const readinessLabel = READINESS_LABELS[zone.robot_readiness] || zone.robot_readiness;

      drawDot(doc, margin + 8, y + 8, 6, readinessColor);
      doc.fillColor(COLORS.textDark)
        .font('Helvetica-Bold')
        .fontSize(11)
        .text(readinessLabel, margin + 22, y + 2);

      y += 26;
    }

    // ── Zone Metrics Table ─────────────────────────────────
    // Build the metrics list, filtering out null/empty values
    let surfaces = [];
    if (zone.floor_surfaces) {
      try {
        surfaces = JSON.parse(zone.floor_surfaces);
      } catch {
        // WHY: Malformed JSON in floor_surfaces shouldn't crash PDF generation
        surfaces = [];
      }
    }

    const metrics = [
      ['Floor Surfaces', surfaces.length > 0 ? surfaces.join(', ') : null],
      ['Corridor Width', zone.corridor_width_ft != null ? `${zone.corridor_width_ft} ft` : null],
      ['Ceiling Height', zone.ceiling_height_ft != null ? `${zone.ceiling_height_ft} ft` : null],
      ['Min Door Width', zone.door_width_min_ft != null ? `${zone.door_width_min_ft} ft` : null],
      ['WiFi Strength', zone.wifi_strength
        ? zone.wifi_strength.replace(/\b\w/g, c => c.toUpperCase())
        : null],
      ['WiFi Network', zone.wifi_network],
      ['Lighting', zone.lighting ? zone.lighting.replace(/\b\w/g, c => c.toUpperCase()) : null],
      ['Foot Traffic', zone.foot_traffic ? zone.foot_traffic.replace(/\b\w/g, c => c.toUpperCase()) : null],
      ['Cleaning Method', zone.current_cleaning_method],
      ['Cleaning Frequency', zone.cleaning_frequency],
      ['Cleaning Contractor', zone.cleaning_contractor],
      ['Cleaning Shift', zone.cleaning_shift],
      ['Delivery Method', zone.delivery_method],
    ].filter(([, v]) => v != null && v !== '');

    if (metrics.length > 0) {
      doc.fillColor(COLORS.textDark)
        .font('Helvetica-Bold')
        .fontSize(11)
        .text('Zone Metrics', margin, y);

      y += 18;

      // Table header
      doc.save().rect(margin, y, contentW, rowH).fill('#1f2937').restore();
      doc.fillColor(COLORS.white)
        .font('Helvetica-Bold')
        .fontSize(9)
        .text('Metric', margin + 6, y + (rowH - 9) / 2, { width: colW - 12, lineBreak: false });
      doc.fillColor(COLORS.white)
        .fontSize(9)
        .text('Value', margin + colW + 6, y + (rowH - 9) / 2, { width: colW - 12, lineBreak: false });
      y += rowH;

      const metricsTableStartY = y;
      metrics.forEach(([label, value], idx) => {
        y = drawTableRow(doc, margin, y, label, value, colW, rowH, idx % 2 === 1);
      });

      // Table border
      doc.save()
        .rect(margin, metricsTableStartY - rowH, contentW, metrics.length * rowH + rowH)
        .strokeColor('#d1d5db')
        .lineWidth(0.5)
        .stroke()
        .restore();

      y += 16;
    }

    // ── Pain Points ────────────────────────────────────────
    if (zone.pain_points) {
      doc.fillColor(COLORS.textDark)
        .font('Helvetica-Bold')
        .fontSize(11)
        .text('Pain Points', margin, y);
      y += 16;

      doc.fillColor(COLORS.textDark)
        .font('Helvetica')
        .fontSize(10)
        .text(zone.pain_points, margin, y, { width: contentW });

      y += doc.heightOfString(zone.pain_points, { width: contentW }) + 16;
    }

    // ── Readiness Notes ────────────────────────────────────
    if (zone.readiness_notes) {
      doc.fillColor(COLORS.textDark)
        .font('Helvetica-Bold')
        .fontSize(11)
        .text('Readiness Notes', margin, y);
      y += 16;

      doc.fillColor(COLORS.textDark)
        .font('Helvetica')
        .fontSize(10)
        .text(zone.readiness_notes, margin, y, { width: contentW });

      y += doc.heightOfString(zone.readiness_notes, { width: contentW }) + 16;
    }

    // ── Assessor Notes ─────────────────────────────────────
    if (zone.notes) {
      doc.fillColor(COLORS.textDark)
        .font('Helvetica-Bold')
        .fontSize(11)
        .text('Assessor Notes', margin, y);
      y += 16;

      doc.fillColor(COLORS.textMuted)
        .font('Helvetica')
        .fontSize(10)
        .text(zone.notes, margin, y, { width: contentW });
    }
  });

  // ── Recommendations Page ───────────────────────────────────
  doc.addPage();
  y = margin;

  doc.fillColor(COLORS.textDark)
    .font('Helvetica-Bold')
    .fontSize(20)
    .text('Recommendations', margin, y);

  y += 32;
  doc.save().rect(margin, y - 8, 48, 3).fill(COLORS.accent).restore();

  // Categorize zones
  const readyZones = zones.filter(z => z.robot_readiness === 'ready');
  const minorWorkZones = zones.filter(z => z.robot_readiness === 'minor_work');
  const majorWorkZones = zones.filter(z => z.robot_readiness === 'major_work');
  const notFeasibleZones = zones.filter(z => z.robot_readiness === 'not_feasible');

  // Deployment-ready zones
  if (readyZones.length > 0) {
    doc.fillColor(COLORS.green)
      .font('Helvetica-Bold')
      .fontSize(13)
      .text('Deployment-Ready Zones', margin, y + 4);

    y += 26;

    readyZones.forEach(zone => {
      drawDot(doc, margin + 8, y + 5, 4, COLORS.green);
      doc.fillColor(COLORS.textDark)
        .font('Helvetica')
        .fontSize(10)
        .text(zone.zone_name, margin + 20, y);
      y += 18;
    });

    y += 10;
  }

  // Zones needing prep work (minor + major combined)
  const prepZones = [...minorWorkZones, ...majorWorkZones];
  if (prepZones.length > 0) {
    doc.fillColor(COLORS.amber)
      .font('Helvetica-Bold')
      .fontSize(13)
      .text('Zones Needing Prep Work', margin, y);

    y += 26;

    prepZones.forEach(zone => {
      drawDot(doc, margin + 8, y + 5, 4, COLORS.amber);

      const notesText = zone.readiness_notes ? ` — ${zone.readiness_notes}` : '';
      const fullText = `${zone.zone_name}${notesText}`;

      doc.fillColor(COLORS.textDark)
        .font('Helvetica')
        .fontSize(10)
        .text(fullText, margin + 20, y, { width: contentW - 20 });

      y += doc.heightOfString(fullText, { width: contentW - 20 }) + 8;
    });

    y += 6;
  }

  // Not feasible / major work zones
  if (notFeasibleZones.length > 0) {
    doc.fillColor(COLORS.red)
      .font('Helvetica-Bold')
      .fontSize(13)
      .text('Not Feasible / Major Work Required', margin, y);

    y += 26;

    notFeasibleZones.forEach(zone => {
      drawDot(doc, margin + 8, y + 5, 4, COLORS.red);
      doc.fillColor(COLORS.textDark)
        .font('Helvetica')
        .fontSize(10)
        .text(zone.zone_name, margin + 20, y);
      y += 18;
    });

    y += 10;
  }

  // Suggested pilot zone (first ready zone)
  if (readyZones.length > 0) {
    y += 10;

    // Highlighted box for pilot suggestion
    doc.save()
      .rect(margin, y, contentW, 50)
      .fill('#fffbeb')
      .restore();
    doc.save()
      .rect(margin, y, 4, 50)
      .fill(COLORS.amber)
      .restore();

    doc.fillColor(COLORS.textDark)
      .font('Helvetica-Bold')
      .fontSize(11)
      .text('Suggested Pilot Zone', margin + 16, y + 10);

    doc.fillColor(COLORS.textDark)
      .font('Helvetica')
      .fontSize(10)
      .text(readyZones[0].zone_name, margin + 16, y + 28);
  }

  // ── Add footers to every non-cover page ────────────────────
  // WHY: bufferPages: true means all pages are in memory now, so we can
  // iterate over them and inject footers before finalizing the stream.
  const range = doc.bufferedPageRange();
  // range.start is always 0; range.count is total pages
  const totalPages = range.count;
  const footerY = pageH - 40;

  // WHY: Skip page 0 (the cover) — cover has its own footer baked in above
  for (let i = 1; i < totalPages; i++) {
    doc.switchToPage(i);

    // Footer divider line
    doc.save()
      .moveTo(margin, footerY - 8)
      .lineTo(pageW - margin, footerY - 8)
      .strokeColor('#d1d5db')
      .lineWidth(0.5)
      .stroke()
      .restore();

    // Left: confidential label
    doc.fillColor(COLORS.textMuted)
      .font('Helvetica')
      .fontSize(8)
      .text(
        `Confidential — ${assessment.property_name} — ${formattedDate}`,
        margin,
        footerY,
        { width: contentW / 2 }
      );

    // Right: page number
    doc.fillColor(COLORS.textMuted)
      .font('Helvetica')
      .fontSize(8)
      .text(
        `Page ${i + 1} of ${totalPages}`,
        margin + contentW / 2,
        footerY,
        { width: contentW / 2, align: 'right' }
      );
  }

  doc.end();
});

module.exports = router;
