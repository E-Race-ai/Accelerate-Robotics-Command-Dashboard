"""Server-side PDF generation for the WiFi Audit report.

Reads the same data.js the on-screen report uses (window.SCAN = {...}),
renders a clean branded multi-page PDF via ReportLab. Pure Python,
no system deps — runs on any Mac the installer touches.

Public entry point: build_pdf(data_path: Path) -> bytes
"""
from __future__ import annotations

import io
import json
import re
from datetime import datetime
from pathlib import Path

from reportlab.lib import colors
from reportlab.lib.colors import HexColor
from reportlab.lib.enums import TA_CENTER, TA_LEFT, TA_RIGHT
from reportlab.lib.pagesizes import LETTER
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import inch
from reportlab.platypus import (
    KeepTogether,
    PageBreak,
    Paragraph,
    SimpleDocTemplate,
    Spacer,
    Table,
    TableStyle,
)


# ── Brand palette (mirrors the dashboard so the printed report reads as
#    the same product as the on-screen view) ──────────────────────────
BRAND_NAVY    = HexColor("#0a1126")
BRAND_INK     = HexColor("#1a1f36")
BRAND_DIM     = HexColor("#5a6580")
BRAND_FAINT   = HexColor("#8a96b3")
BRAND_LINE    = HexColor("#d7dfee")
BRAND_BG      = HexColor("#f4f6fb")
BRAND_TINT    = HexColor("#eef2fa")
BRAND_ACCENT  = HexColor("#0a82ff")
BRAND_ACCENT2 = HexColor("#6c3fc7")
SEV_HIGH      = HexColor("#cc2244")
SEV_HIGH_BG   = HexColor("#fce7ec")
SEV_MED       = HexColor("#b86e00")
SEV_MED_BG    = HexColor("#fdf3e0")
SEV_INFO      = HexColor("#6c3fc7")
SEV_INFO_BG   = HexColor("#eee8fb")
OK_GREEN      = HexColor("#0c8a4d")
OK_GREEN_BG   = HexColor("#e6f7ee")


def _hex(c) -> str:
    """ReportLab HexColor → '#rrggbb' string usable in <font color=…>."""
    h = c.hexval()  # '0xRRGGBBAA'
    return "#" + h[2:8]


def _esc(s) -> str:
    return (str(s or "")
            .replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;"))


def _parse_data_js(path: Path) -> dict:
    text = path.read_text()
    body = re.sub(r"^\s*window\.SCAN\s*=\s*", "", text).rstrip().rstrip(";")
    return json.loads(body)


# ── Styles ────────────────────────────────────────────────────────────

def _styles():
    base = getSampleStyleSheet()
    return {
        "eyebrow": ParagraphStyle(
            "eyebrow", parent=base["Normal"],
            fontName="Helvetica-Bold", fontSize=9, leading=12,
            textColor=BRAND_DIM, spaceAfter=4,
        ),
        "title": ParagraphStyle(
            "title", parent=base["Normal"],
            fontName="Helvetica-Bold", fontSize=26, leading=30,
            textColor=BRAND_ACCENT, spaceAfter=2,
        ),
        "subtitle": ParagraphStyle(
            "subtitle", parent=base["Normal"],
            fontName="Helvetica", fontSize=12, leading=16,
            textColor=BRAND_DIM, spaceAfter=18,
        ),
        "h1": ParagraphStyle(
            "h1", parent=base["Normal"],
            fontName="Helvetica-Bold", fontSize=18, leading=22,
            textColor=BRAND_INK, spaceBefore=4, spaceAfter=10,
        ),
        "h1_underline": ParagraphStyle(
            "h1_u", parent=base["Normal"],
            fontName="Helvetica-Bold", fontSize=9, leading=12,
            textColor=BRAND_ACCENT, spaceAfter=14, spaceBefore=-6,
        ),
        "h2": ParagraphStyle(
            "h2", parent=base["Normal"],
            fontName="Helvetica-Bold", fontSize=12, leading=15,
            textColor=BRAND_INK, spaceBefore=8, spaceAfter=4,
        ),
        "body": ParagraphStyle(
            "body", parent=base["Normal"],
            fontName="Helvetica", fontSize=10.5, leading=14.5,
            textColor=BRAND_INK, spaceAfter=4,
        ),
        "dim": ParagraphStyle(
            "dim", parent=base["Normal"],
            fontName="Helvetica", fontSize=9.5, leading=12.5,
            textColor=BRAND_DIM,
        ),
        # Score block
        "score_label": ParagraphStyle(
            "score_label", parent=base["Normal"],
            fontName="Helvetica-Bold", fontSize=10, leading=13,
            textColor=BRAND_DIM, alignment=TA_CENTER, spaceAfter=2,
        ),
        "score_sublabel": ParagraphStyle(
            "score_sublabel", parent=base["Normal"],
            fontName="Helvetica", fontSize=9, leading=12,
            textColor=BRAND_FAINT, alignment=TA_CENTER, spaceAfter=8,
        ),
        # The big number needs leading >= fontSize or it gets clipped.
        "big_score": ParagraphStyle(
            "big_score", parent=base["Normal"],
            fontName="Helvetica-Bold", fontSize=72, leading=78,
            alignment=TA_CENTER,
        ),
        "score_of_100": ParagraphStyle(
            "score_of_100", parent=base["Normal"],
            fontName="Helvetica", fontSize=16, leading=20,
            textColor=BRAND_FAINT, alignment=TA_LEFT,
        ),
        "big_grade": ParagraphStyle(
            "big_grade", parent=base["Normal"],
            fontName="Helvetica-Bold", fontSize=60, leading=66,
            alignment=TA_CENTER,
        ),
        "grade_label": ParagraphStyle(
            "grade_label", parent=base["Normal"],
            fontName="Helvetica-Bold", fontSize=9, leading=12,
            textColor=BRAND_DIM, alignment=TA_CENTER,
        ),
        "verdict": ParagraphStyle(
            "verdict", parent=base["Normal"],
            fontName="Helvetica-Bold", fontSize=13, leading=18,
            textColor=BRAND_INK, alignment=TA_CENTER, spaceBefore=16, spaceAfter=4,
        ),
        # KPI cards
        "kpi_label": ParagraphStyle(
            "kpi_label", parent=base["Normal"],
            fontName="Helvetica-Bold", fontSize=9, leading=12,
            textColor=BRAND_DIM, spaceAfter=4,
        ),
        "kpi_value": ParagraphStyle(
            "kpi_value", parent=base["Normal"],
            fontName="Helvetica-Bold", fontSize=30, leading=34,
            spaceAfter=2,
        ),
        "kpi_sub": ParagraphStyle(
            "kpi_sub", parent=base["Normal"],
            fontName="Helvetica", fontSize=8.5, leading=11,
            textColor=BRAND_FAINT,
        ),
        # Findings
        "finding_title": ParagraphStyle(
            "finding_title", parent=base["Normal"],
            fontName="Helvetica-Bold", fontSize=11.5, leading=15,
            textColor=BRAND_INK, spaceAfter=1,
        ),
        "finding_meta": ParagraphStyle(
            "finding_meta", parent=base["Normal"],
            fontName="Helvetica", fontSize=9, leading=12,
            textColor=BRAND_DIM, spaceAfter=4,
        ),
        "finding_detail": ParagraphStyle(
            "finding_detail", parent=base["Normal"],
            fontName="Helvetica", fontSize=10, leading=13.5,
            textColor=BRAND_INK, spaceAfter=4,
        ),
        "fix_label": ParagraphStyle(
            "fix_label", parent=base["Normal"],
            fontName="Helvetica-Bold", fontSize=9, leading=12,
            textColor=OK_GREEN, spaceAfter=2,
        ),
        "fix_body": ParagraphStyle(
            "fix_body", parent=base["Normal"],
            fontName="Helvetica", fontSize=10, leading=13.5,
            textColor=BRAND_INK,
        ),
        # Recommendations
        "rec_priority": ParagraphStyle(
            "rec_pri", parent=base["Normal"],
            fontName="Helvetica-Bold", fontSize=18, leading=22,
            textColor=BRAND_ACCENT, alignment=TA_CENTER,
        ),
        "rec_title": ParagraphStyle(
            "rec_title", parent=base["Normal"],
            fontName="Helvetica-Bold", fontSize=11.5, leading=15,
            textColor=BRAND_INK, spaceAfter=4,
        ),
        "rec_body": ParagraphStyle(
            "rec_body", parent=base["Normal"],
            fontName="Helvetica", fontSize=10, leading=13.5,
            textColor=BRAND_INK,
        ),
    }


# ── Helpers for blocks ────────────────────────────────────────────────

def _sev_palette(sev: str):
    sev = (sev or "").upper()
    return {
        "HIGH":   (SEV_HIGH, SEV_HIGH_BG),
        "MED":    (SEV_MED,  SEV_MED_BG),
        "MEDIUM": (SEV_MED,  SEV_MED_BG),
        "INFO":   (SEV_INFO, SEV_INFO_BG),
    }.get(sev, (BRAND_DIM, BRAND_TINT))


def _score_palette(score: int):
    """0 = secure (green), 100 = critical (red). Continuous-ish 3-stop scale."""
    if score >= 60:  return SEV_HIGH
    if score >= 30:  return SEV_MED
    return OK_GREEN


def _build_score_card(score, grade, verdict, s):
    """Cover-page hero: composite risk score + grade + verdict.
    Uses real ParagraphStyles for the big numbers so line heights respect them."""
    score_color = _score_palette(int(score) if isinstance(score, (int, float)) else 0)
    grade_color = score_color

    score_style = ParagraphStyle("score_inline", parent=s["big_score"], textColor=score_color)
    grade_style = ParagraphStyle("grade_inline", parent=s["big_grade"], textColor=grade_color)

    label = Paragraph("COMPOSITE RISK SCORE", s["score_label"])
    sublabel = Paragraph("0 = secure &middot; 100 = critical exposure", s["score_sublabel"])

    score_cell = [
        Paragraph(f"{score}", score_style),
        Paragraph(f"/ 100", ParagraphStyle("of100", parent=s["score_of_100"], alignment=TA_CENTER)),
    ]
    grade_cell = [
        Paragraph(f"{grade}", grade_style),
        Paragraph("SECURITY GRADE", s["grade_label"]),
    ]

    inner = Table([[score_cell, grade_cell]], colWidths=[3.4 * inch, 2.5 * inch])
    inner.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 0),
        ("RIGHTPADDING", (0, 0), (-1, -1), 0),
        ("TOPPADDING", (0, 0), (-1, -1), 0),
    ]))

    verdict_p = Paragraph(_esc(verdict), s["verdict"])

    card = Table(
        [[label], [sublabel], [inner], [verdict_p]],
        colWidths=[5.9 * inch],
    )
    card.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), colors.white),
        ("BOX", (0, 0), (-1, -1), 1, BRAND_LINE),
        ("LEFTPADDING", (0, 0), (-1, -1), 20),
        ("RIGHTPADDING", (0, 0), (-1, -1), 20),
        ("TOPPADDING", (0, 0), (0, 0), 18),
        ("BOTTOMPADDING", (0, -1), (-1, -1), 18),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
    ]))
    return card


def _build_kpi_grid(hosts, services, high_count, med_count, s):
    """2x2 grid of KPI tiles with brand-appropriate colors."""
    def card(label, value, sub, color):
        value_p = Paragraph(f"{value}", ParagraphStyle("kv", parent=s["kpi_value"], textColor=color))
        t = Table([
            [Paragraph(label.upper(), s["kpi_label"])],
            [value_p],
            [Paragraph(sub, s["kpi_sub"])],
        ], colWidths=[2.85 * inch])
        t.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (-1, -1), colors.white),
            ("BOX", (0, 0), (-1, -1), 0.75, BRAND_LINE),
            ("LEFTPADDING", (0, 0), (-1, -1), 14),
            ("RIGHTPADDING", (0, 0), (-1, -1), 14),
            ("TOPPADDING", (0, 0), (0, 0), 12),
            ("BOTTOMPADDING", (0, -1), (-1, -1), 12),
            ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ]))
        return t

    row1 = [card("Live hosts",      str(len(hosts)),  f"{len(hosts)} responding on the scanned subnets", BRAND_ACCENT),
            card("Services mapped", str(services),    "fingerprinted TCP services across all hosts",     BRAND_ACCENT2)]
    row2 = [card("Critical findings", str(high_count), "immediate action required", SEV_HIGH),
            card("Medium findings",   str(med_count),  "remediate this sprint",      SEV_MED)]

    grid = Table([row1, row2], colWidths=[2.85 * inch, 2.85 * inch])
    grid.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 0),
        ("RIGHTPADDING", (0, 0), (-1, -1), 0),
        ("TOPPADDING", (0, 0), (-1, 0), 0),
        ("BOTTOMPADDING", (0, 0), (-1, 0), 10),
        ("TOPPADDING", (0, 1), (-1, 1), 0),
        ("BOTTOMPADDING", (0, 1), (-1, 1), 0),
    ]))
    return grid


def _build_finding_block(v, s):
    """Single finding rendered as a card with severity-colored side bar + fix box."""
    sev = (v.get("severity") or "").upper()
    sev_color, sev_bg = _sev_palette(sev)
    title = _esc(v.get("title", "") or "(untitled finding)")
    ip    = _esc(v.get("ip", ""))
    detail = _esc(v.get("detail", "") or "")
    fix    = _esc(v.get("fix", "") or "")

    sev_pill = Paragraph(
        f'<font color="{_hex(sev_color)}"><b>{sev}</b></font>'
        f' &nbsp;<font color="{_hex(BRAND_DIM)}">{ip}</font>',
        ParagraphStyle("sev_pill", fontName="Helvetica-Bold", fontSize=10, leading=13),
    )
    title_p = Paragraph(title, s["finding_title"])
    detail_p = Paragraph(detail, s["finding_detail"]) if detail else None

    rows = [[sev_pill], [title_p]]
    if detail_p:
        rows.append([detail_p])
    if fix:
        fix_table = Table([
            [Paragraph("RECOMMENDED FIX", s["fix_label"])],
            [Paragraph(fix, s["fix_body"])],
        ], colWidths=[5.7 * inch])
        fix_table.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (-1, -1), OK_GREEN_BG),
            ("LINEABOVE", (0, 0), (-1, 0), 0, OK_GREEN_BG),
            ("LEFTPADDING", (0, 0), (-1, -1), 12),
            ("RIGHTPADDING", (0, 0), (-1, -1), 12),
            ("TOPPADDING", (0, 0), (-1, -1), 8),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 10),
        ]))
        rows.append([fix_table])

    block = Table(rows, colWidths=[6.0 * inch])
    block.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), colors.white),
        ("LINEBEFORE", (0, 0), (0, -1), 3, sev_color),
        ("BOX", (0, 0), (-1, -1), 0.5, BRAND_LINE),
        ("LEFTPADDING", (0, 0), (-1, -1), 14),
        ("RIGHTPADDING", (0, 0), (-1, -1), 14),
        ("TOPPADDING", (0, 0), (0, 0), 12),
        ("BOTTOMPADDING", (0, -1), (-1, -1), 12),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
    ]))
    return KeepTogether([block, Spacer(1, 0.12 * inch)])


def _build_hosts_table(hosts, s):
    rows = [["IP", "Category", "Vendor", "Open ports"]]
    for h in sorted(hosts, key=lambda x: tuple(int(o) for o in (x.get("ip", "0.0.0.0").split("."))) if x.get("ip") else (0,0,0,0)):
        ports = sorted({int(p["port"]) for p in (h.get("ports") or []) if isinstance(p, dict)})
        rows.append([
            _esc(h.get("ip", "")),
            _esc(h.get("category", "") or "—"),
            _esc((h.get("vendor") or "")[:32]),
            ", ".join(str(p) for p in ports) or "—",
        ])
    t = Table(rows, colWidths=[1.1 * inch, 1.5 * inch, 1.9 * inch, 2.4 * inch], repeatRows=1)
    t.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), BRAND_NAVY),
        ("TEXTCOLOR",  (0, 0), (-1, 0), colors.white),
        ("FONTNAME",   (0, 0), (-1, 0), "Helvetica-Bold"),
        ("FONTSIZE",   (0, 0), (-1, -1), 9),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, BRAND_TINT]),
        ("LINEBELOW", (0, 0), (-1, 0), 0.5, BRAND_LINE),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 7),
        ("RIGHTPADDING", (0, 0), (-1, -1), 7),
        ("TOPPADDING", (0, 0), (-1, -1), 6),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
    ]))
    return t


def _build_rec_block(rec, s):
    """Numbered recommendation card with priority + title + impact + effort."""
    priority = rec.get("priority", "")
    title  = _esc(rec.get("title", "") or "(untitled)")
    impact = _esc(rec.get("impact", "") or "")
    effort = _esc(rec.get("effort", "") or "")
    description = _esc(rec.get("description") or rec.get("body") or "")

    pri_cell = Paragraph(f"#{priority}", s["rec_priority"])
    rows = [[pri_cell, Paragraph(title, s["rec_title"])]]
    extras = []
    if description:
        extras.append(Paragraph(description, s["rec_body"]))
    if impact:
        extras.append(Paragraph(f'<b><font color="{_hex(OK_GREEN)}">IMPACT:</font></b> {impact}', s["rec_body"]))
    if effort:
        extras.append(Paragraph(f'<b><font color="{_hex(BRAND_ACCENT)}">EFFORT:</font></b> {effort}', s["rec_body"]))
    if extras:
        rows.append(["", extras])

    block = Table(rows, colWidths=[0.7 * inch, 5.3 * inch])
    block.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("BACKGROUND", (0, 0), (-1, -1), colors.white),
        ("BOX", (0, 0), (-1, -1), 0.5, BRAND_LINE),
        ("LEFTPADDING", (0, 0), (-1, -1), 10),
        ("RIGHTPADDING", (0, 0), (-1, -1), 10),
        ("TOPPADDING", (0, 0), (-1, -1), 10),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 10),
    ]))
    return KeepTogether([block, Spacer(1, 0.1 * inch)])


def _build_methodology_table(methodology, s):
    """Methodology phases: phase #, name, tool, hosts probed, result."""
    rows = [["#", "Phase", "Tool", "Hosts", "Result"]]
    for m in methodology:
        rows.append([
            _esc(m.get("phase", "")),
            _esc(m.get("name", "")),
            _esc(m.get("tool", "")),
            _esc(m.get("hosts", "")),
            _esc(m.get("result", "")),
        ])
    t = Table(rows, colWidths=[0.35 * inch, 1.5 * inch, 2.4 * inch, 0.6 * inch, 1.6 * inch], repeatRows=1)
    t.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), BRAND_NAVY),
        ("TEXTCOLOR",  (0, 0), (-1, 0), colors.white),
        ("FONTNAME",   (0, 0), (-1, 0), "Helvetica-Bold"),
        ("FONTSIZE",   (0, 0), (-1, -1), 9),
        ("FONTNAME",   (2, 1), (2, -1), "Courier"),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, BRAND_TINT]),
        ("LINEBELOW", (0, 0), (-1, 0), 0.5, BRAND_LINE),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 6),
        ("RIGHTPADDING", (0, 0), (-1, -1), 6),
        ("TOPPADDING", (0, 0), (-1, -1), 5),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
    ]))
    return t


# ── Page decorations ──────────────────────────────────────────────────

def _page_decorate(canv, doc):
    """Header strip + footer page numbers on every page."""
    canv.saveState()
    w, h = LETTER
    # Top brand strip
    canv.setFillColor(BRAND_NAVY)
    canv.rect(0, h - 0.3 * inch, w, 0.3 * inch, fill=1, stroke=0)
    canv.setFillColor(colors.white)
    canv.setFont("Helvetica-Bold", 8)
    canv.drawString(0.7 * inch, h - 0.2 * inch, "WIFI VISION EXTREME  ·  ACCELERATE ROBOTICS")
    canv.setFont("Helvetica", 8)
    canv.setFillColor(HexColor("#a8b3cc"))
    canv.drawRightString(w - 0.7 * inch, h - 0.2 * inch, "Internal Network Assessment")
    # Footer
    canv.setFont("Helvetica", 8)
    canv.setFillColor(BRAND_DIM)
    canv.drawString(0.7 * inch, 0.45 * inch, f"Generated {datetime.now().strftime('%Y-%m-%d %H:%M')}")
    canv.drawRightString(w - 0.7 * inch, 0.45 * inch, f"Page {doc.page}")
    canv.setStrokeColor(BRAND_LINE)
    canv.line(0.7 * inch, 0.6 * inch, w - 0.7 * inch, 0.6 * inch)
    canv.restoreState()


# ── Main entry ────────────────────────────────────────────────────────

def build_pdf(data_path: Path) -> bytes:
    if not data_path.exists():
        raise FileNotFoundError(f"data.js not found at {data_path}")
    data  = _parse_data_js(data_path)
    s     = _styles()
    meta  = data.get("meta", {}) or {}
    risk  = data.get("risk", {}) or {}
    hosts = data.get("hosts", []) or []
    vulns = data.get("vulns", []) or []
    recs  = data.get("recommendations", []) or []
    methodology = data.get("methodology", []) or []

    high_count = sum(1 for v in vulns if (v.get("severity") or "").upper() == "HIGH")
    med_count  = sum(1 for v in vulns if (v.get("severity") or "").upper() in ("MED", "MEDIUM"))
    services   = sum(len(h.get("ports", []) or []) for h in hosts)

    buf = io.BytesIO()
    doc = SimpleDocTemplate(
        buf, pagesize=LETTER,
        leftMargin=0.7 * inch, rightMargin=0.7 * inch,
        topMargin=0.85 * inch, bottomMargin=0.85 * inch,
        title="WiFi Audit Report", author="Accelerate Robotics",
    )

    story = []

    # ── Cover ──────────────────────────────────────────────────────────
    story.append(Paragraph("INTERNAL NETWORK ASSESSMENT", s["eyebrow"]))
    story.append(Paragraph("WiFi Audit Command Center", s["title"]))
    story.append(Paragraph(
        "Findings, recommended fixes, and host inventory from the most recent scan.",
        s["subtitle"],
    ))

    # Metadata table
    meta_rows = []
    subnets = "  ·  ".join(meta.get("subnets", []) or [])
    if subnets: meta_rows.append(("Networks scanned", subnets))
    if meta.get("scanner"):    meta_rows.append(("Scanner host", str(meta["scanner"])))
    if meta.get("date"):       meta_rows.append(("Scan date", str(meta["date"])))
    meta_rows.append(("Report generated", datetime.now().strftime("%Y-%m-%d %H:%M")))
    mt = Table(
        [[Paragraph(f'<b>{_esc(k)}</b>', s["dim"]), Paragraph(_esc(v), s["body"])] for k, v in meta_rows],
        colWidths=[1.8 * inch, 4.3 * inch],
    )
    mt.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
        ("TOPPADDING", (0, 0), (-1, -1), 2),
    ]))
    story.append(mt)
    story.append(Spacer(1, 0.35 * inch))

    # Score card (centered, big numbers properly sized)
    score_card = _build_score_card(risk.get("score", 0), risk.get("grade", "—"),
                                   risk.get("verdict", ""), s)
    story.append(score_card)

    story.append(PageBreak())

    # ── Executive summary + KPIs ───────────────────────────────────────
    story.append(Paragraph("Executive summary", s["h1"]))
    story.append(Paragraph(
        f"This audit assessed <b>{len(hosts)}</b> live hosts on "
        f"{_esc(subnets or 'the scanned subnets')}. "
        f"<b>{services}</b> TCP services were fingerprinted across them. "
        f"The composite risk score is <b><font color=\"{_hex(_score_palette(risk.get('score', 0)))}\">"
        f"{risk.get('score', 0)} / 100</font></b> "
        f"(grade <b>{_esc(risk.get('grade', '—'))}</b>) — "
        f"{_esc(risk.get('verdict', ''))}.",
        s["body"],
    ))
    if high_count or med_count:
        story.append(Paragraph(
            f"<b>{high_count}</b> critical and <b>{med_count}</b> medium findings are detailed below, "
            f"each with a recommended fix. The full host inventory and a numbered list of "
            f"prioritized recommendations follow.",
            s["body"],
        ))
    story.append(Spacer(1, 0.2 * inch))
    story.append(_build_kpi_grid(hosts, services, high_count, med_count, s))
    story.append(PageBreak())

    # ── Findings ───────────────────────────────────────────────────────
    story.append(Paragraph("Findings", s["h1"]))
    if not vulns:
        story.append(Paragraph("No findings recorded.", s["dim"]))
    else:
        order = {"HIGH": 0, "MED": 1, "MEDIUM": 1, "INFO": 2}
        sorted_v = sorted(vulns, key=lambda v: order.get((v.get("severity") or "").upper(), 9))
        for v in sorted_v:
            story.append(_build_finding_block(v, s))

    # ── Hosts ──────────────────────────────────────────────────────────
    story.append(PageBreak())
    story.append(Paragraph(f"Hosts discovered ({len(hosts)})", s["h1"]))
    story.append(Paragraph(
        "Every device the discovery sweep reached on the scanned subnets, "
        "with classification, vendor (when MAC vendor-ID resolved), and the "
        "TCP ports observed open during service fingerprinting.",
        s["dim"],
    ))
    story.append(Spacer(1, 0.15 * inch))
    if hosts:
        story.append(_build_hosts_table(hosts, s))
    else:
        story.append(Paragraph("No hosts captured.", s["dim"]))

    # ── Recommendations ────────────────────────────────────────────────
    if recs:
        story.append(PageBreak())
        story.append(Paragraph("Recommendations", s["h1"]))
        story.append(Paragraph(
            "Prioritized actions to close the findings above. "
            "Each entry calls out the security impact of completing it and the effort to do so.",
            s["dim"],
        ))
        story.append(Spacer(1, 0.15 * inch))
        for r in sorted(recs, key=lambda x: x.get("priority", 99) if isinstance(x, dict) else 99):
            if isinstance(r, dict):
                story.append(_build_rec_block(r, s))

    # ── Methodology ────────────────────────────────────────────────────
    if methodology:
        story.append(PageBreak())
        story.append(Paragraph("Methodology", s["h1"]))
        story.append(Paragraph(
            "How this report was produced. Each phase scans a narrower target set "
            "than the previous one — live hosts → services → vulnerability scripts → focused follow-up.",
            s["dim"],
        ))
        story.append(Spacer(1, 0.15 * inch))
        story.append(_build_methodology_table(methodology, s))

    doc.build(story, onFirstPage=_page_decorate, onLaterPages=_page_decorate)
    return buf.getvalue()
