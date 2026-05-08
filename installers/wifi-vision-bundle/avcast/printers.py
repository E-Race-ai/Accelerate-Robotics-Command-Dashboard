"""Konica Minolta bizhub printer control.

Status comes from SNMP (UDP 161) — gives toner CMYK, drums, developers, fuser,
ITB, transfer roller, all staples (incl. saddle), trays, page counts.

Print job submission goes via IPP (port 631) or IPPS (TLS) for the C650i.
Booklet imposition is done client-side with pypdf (saddle-stitch signature),
then sent to the printer with finishings=saddle-stitch.
"""
from __future__ import annotations

import asyncio
import io
import re
import time
from dataclasses import dataclass, field, asdict
from typing import Any, Iterable

# ---------- SNMP status (read-only) ----------

PRINTER_OIDS = {
    "sysDescr":           "1.3.6.1.2.1.1.1.0",
    "sysLocation":        "1.3.6.1.2.1.1.6.0",
    "sysUpTime":          "1.3.6.1.2.1.1.3.0",
    "hrDeviceDescr":      "1.3.6.1.2.1.25.3.2.1.3.1",
    "prtSerial":          "1.3.6.1.2.1.43.5.1.1.17.1",
}

WALK_OIDS = {
    "supply_desc":     "1.3.6.1.2.1.43.11.1.1.6",   # supply name
    "supply_max":      "1.3.6.1.2.1.43.11.1.1.8",   # max units (-2 = no info, -3 = unknown)
    "supply_level":    "1.3.6.1.2.1.43.11.1.1.9",   # current level
    "supply_color":    "1.3.6.1.2.1.43.12.1.1.4",   # color name
    "tray_name":       "1.3.6.1.2.1.43.8.2.1.13",
    "tray_max":        "1.3.6.1.2.1.43.8.2.1.9",
    "tray_level":      "1.3.6.1.2.1.43.8.2.1.10",
    "tray_media":      "1.3.6.1.2.1.43.8.2.1.12",   # paper size description
    "alert_severity":  "1.3.6.1.2.1.43.18.1.1.2",
    "alert_desc":      "1.3.6.1.2.1.43.18.1.1.8",
}

# Konica private MIB — page counters (these vary by model; the bizhub C458 set):
KM_OIDS = {
    "total_count":     "1.3.6.1.4.1.18334.1.1.1.5.7.2.1.5.1.1",
    "color_count":     "1.3.6.1.4.1.18334.1.1.1.5.7.2.1.5.1.2",
    "mono_count":      "1.3.6.1.4.1.18334.1.1.1.5.7.2.1.5.1.3",
}


# Shared SnmpEngine — creating one per call leaks heavy resources and pegs CPU.
_snmp_engine = None
def _get_engine():
    global _snmp_engine
    if _snmp_engine is None:
        from pysnmp.hlapi.v3arch.asyncio import SnmpEngine
        _snmp_engine = SnmpEngine()
    return _snmp_engine


async def _snmp_get(host: str, oid: str, community: str = "public", timeout: int = 2) -> str | None:
    from pysnmp.hlapi.v3arch.asyncio import (
        CommunityData, UdpTransportTarget, ContextData,
        ObjectType, ObjectIdentity, get_cmd,
    )
    try:
        target = await UdpTransportTarget.create((host, 161), timeout=timeout, retries=0)
        err_ind, err_st, err_idx, var_binds = await get_cmd(
            _get_engine(), CommunityData(community, mpModel=1), target, ContextData(),
            ObjectType(ObjectIdentity(oid)),
        )
        if err_ind or err_st:
            return None
        for vb in var_binds:
            return str(vb[1])
    except Exception:
        return None
    return None


async def _snmp_walk(host: str, base_oid: str, community: str = "public",
                     timeout: int = 2, max_rows: int = 40) -> list[tuple[str, str]]:
    from pysnmp.hlapi.v3arch.asyncio import (
        CommunityData, UdpTransportTarget, ContextData,
        ObjectType, ObjectIdentity, walk_cmd,
    )
    out: list[tuple[str, str]] = []
    try:
        target = await UdpTransportTarget.create((host, 161), timeout=timeout, retries=0)
        async for err_ind, err_st, err_idx, var_binds in walk_cmd(
            _get_engine(), CommunityData(community, mpModel=1), target, ContextData(),
            ObjectType(ObjectIdentity(base_oid)), lexicographicMode=False,
        ):
            if err_ind or err_st: break
            for vb in var_binds:
                out.append((str(vb[0]), str(vb[1])))
                if len(out) >= max_rows: return out
    except Exception:
        pass
    return out


def _classify_supply(name: str) -> dict:
    """Return {category, color, kind} for a supply description."""
    n = (name or "").lower()
    color = None
    if "cyan" in n: color = "cyan"
    elif "magenta" in n: color = "magenta"
    elif "yellow" in n: color = "yellow"
    elif "black" in n: color = "black"

    if "toner" in n and color:
        return {"category": "toner", "color": color, "kind": "toner"}
    if "drum" in n:
        return {"category": "drum", "color": color, "kind": "drum"}
    if "develop" in n:
        return {"category": "developer", "color": color, "kind": "developer"}
    if "fus" in n:
        return {"category": "service", "color": None, "kind": "fuser"}
    if "transfer belt" in n or "image transfer" in n or "itb" in n:
        return {"category": "service", "color": None, "kind": "itb"}
    if "transfer roller" in n:
        return {"category": "service", "color": None, "kind": "transfer-roller"}
    if "toner filter" in n:
        return {"category": "service", "color": None, "kind": "toner-filter"}
    if "waste toner" in n:
        return {"category": "waste", "color": None, "kind": "waste-toner"}
    if "saddle" in n and "staple" in n:
        return {"category": "finisher", "color": None, "kind": "saddle-staple"}
    if "staple" in n:
        return {"category": "finisher", "color": None, "kind": "staple"}
    if "hole" in n and "punch" in n:
        return {"category": "finisher", "color": None, "kind": "hole-punch-scrap"}
    return {"category": "other", "color": color, "kind": "other"}


async def get_status(host: str) -> dict:
    """Return a unified status dict for a printer."""
    sys_descr, sys_loc, prt_serial, hr_descr = await asyncio.gather(
        _snmp_get(host, PRINTER_OIDS["sysDescr"]),
        _snmp_get(host, PRINTER_OIDS["sysLocation"]),
        _snmp_get(host, PRINTER_OIDS["prtSerial"]),
        _snmp_get(host, PRINTER_OIDS["hrDeviceDescr"]),
    )
    if not sys_descr:
        return {"host": host, "online": False, "error": "SNMP no response"}

    descs, maxes, levels = await asyncio.gather(
        _snmp_walk(host, WALK_OIDS["supply_desc"]),
        _snmp_walk(host, WALK_OIDS["supply_max"]),
        _snmp_walk(host, WALK_OIDS["supply_level"]),
    )
    tray_names, tray_maxes, tray_levels, tray_media = await asyncio.gather(
        _snmp_walk(host, WALK_OIDS["tray_name"]),
        _snmp_walk(host, WALK_OIDS["tray_max"]),
        _snmp_walk(host, WALK_OIDS["tray_level"]),
        _snmp_walk(host, WALK_OIDS["tray_media"]),
    )
    page_total, page_color, page_mono = await asyncio.gather(
        _snmp_get(host, KM_OIDS["total_count"]),
        _snmp_get(host, KM_OIDS["color_count"]),
        _snmp_get(host, KM_OIDS["mono_count"]),
    )

    # Index supplies by row index
    def _idx(rows: list[tuple[str, str]]) -> dict[str, str]:
        return {oid.split(".")[-1]: val for oid, val in rows}
    desc_by_idx, max_by_idx, lvl_by_idx = _idx(descs), _idx(maxes), _idx(levels)
    tn_by_idx, tm_by_idx, tl_by_idx, tmd_by_idx = _idx(tray_names), _idx(tray_maxes), _idx(tray_levels), _idx(tray_media)

    supplies = []
    for idx, name in desc_by_idx.items():
        try:
            mx = int(max_by_idx.get(idx, "0"))
            lvl = int(lvl_by_idx.get(idx, "0"))
        except ValueError:
            mx, lvl = 0, 0
        info = _classify_supply(name)
        # Special encoding per RFC: -2 means "no info available", -3 means "unknown"
        present = mx != 0
        pct = None
        if mx > 0 and lvl >= 0:
            pct = round((lvl / mx) * 100)
        supplies.append({
            "idx": int(idx) if idx.isdigit() else idx,
            "name": name,
            "max": mx, "level": lvl, "pct": pct,
            "present": present,
            **info,
        })

    trays = []
    for idx, name in tn_by_idx.items():
        try:
            mx = int(tm_by_idx.get(idx, "0"))
            lvl = int(tl_by_idx.get(idx, "0"))
        except ValueError:
            mx, lvl = 0, 0
        media = tmd_by_idx.get(idx, "")
        pct = round((lvl / mx) * 100) if mx > 0 and lvl >= 0 else None
        trays.append({
            "idx": int(idx) if idx.isdigit() else idx,
            "name": name, "max": mx, "level": lvl, "pct": pct, "media": media,
        })

    has_saddle = any(s.get("kind") == "saddle-staple" for s in supplies)
    has_staple = any(s.get("kind") in ("staple", "saddle-staple") for s in supplies)
    has_punch = any(s.get("kind") == "hole-punch-scrap" for s in supplies)

    def _pc(s: str | None) -> int | None:
        try: return int(s) if s and s != "None" else None
        except (ValueError, TypeError): return None

    return {
        "host": host,
        "online": True,
        "model": sys_descr or hr_descr,
        "location": sys_loc,
        "serial": prt_serial,
        "supplies": supplies,
        "trays": trays,
        "page_counts": {
            "total": _pc(page_total),
            "color": _pc(page_color),
            "mono":  _pc(page_mono),
        },
        "capabilities": {
            "saddle_stitch": has_saddle,
            "staple": has_staple,
            "punch": has_punch,
            "duplex": True,  # all bizhub C-series support duplex
            "color":  True,
        },
        "fetched_at": time.time(),
    }


# ---------- IPP print submission ----------

# IPP "finishings" enum values (RFC 8011 + PWG 5100.1):
FINISHINGS = {
    "none": 3,
    "staple": 4,
    "punch": 5,
    "saddle-stitch": 8,
    "edge-stitch": 9,
    "fold": 10,
    "trim": 11,
    "staple-top-left": 20,
    "staple-bottom-left": 21,
    "staple-top-right": 22,
    "staple-bottom-right": 23,
    "edge-stitch-left": 24,
    "edge-stitch-top": 25,
    "edge-stitch-right": 26,
    "edge-stitch-bottom": 27,
    "staple-dual-left": 28,
    "staple-dual-top": 29,
    "staple-dual-right": 30,
    "staple-dual-bottom": 31,
    "fold-half": 76,
    "fold-z": 73,
    "fold-engineering-z": 74,
    "punch-2-hole": 70,  # Konica accepts these PWG values
    "punch-3-hole": 71,
}

SIDES_MAP = {
    "one-sided": "one-sided",
    "duplex-long": "two-sided-long-edge",
    "duplex-short": "two-sided-short-edge",
}

MEDIA_MAP = {
    "letter":  "na_letter_8.5x11in",
    "legal":   "na_legal_8.5x14in",
    "tabloid": "na_ledger_11x17in",
    "a4":      "iso_a4_210x297mm",
    "a3":      "iso_a3_297x420mm",
}


def _ipp_attr(tag: int, name: str, value) -> bytes:
    """Encode one IPP attribute (raw binary)."""
    import struct
    name_b = name.encode("ascii")
    if isinstance(value, int):
        val_b = struct.pack(">i", value)
    elif isinstance(value, bytes):
        val_b = value
    else:
        val_b = str(value).encode("utf-8")
    return struct.pack(">B", tag) + struct.pack(">H", len(name_b)) + name_b + struct.pack(">H", len(val_b)) + val_b


async def submit_print_job(host: str, pdf_bytes: bytes, *,
                           job_name: str = "AVCast Print",
                           copies: int = 1,
                           sides: str = "one-sided",
                           media: str = "letter",
                           color: bool = True,
                           finishings=None,
                           use_tls: bool = False) -> dict:
    """Submit a PDF via raw IPP (bypasses pyipp's response parser, which is broken
    against Konica's response format). Returns {ok, job_id, error}."""
    import struct, requests

    fin_values: list[int] = [FINISHINGS["none"]]
    if finishings:
        fin_values = [FINISHINGS[f] for f in finishings if f in FINISHINGS]
        if not fin_values:
            fin_values = [FINISHINGS["none"]]

    sides_v = SIDES_MAP.get(sides, "one-sided")
    media_v = MEDIA_MAP.get(media.lower(), media)
    color_v = "color" if color else "monochrome"

    proto = "https" if use_tls else "http"
    port = 443 if use_tls else 631
    url = f"{proto}://{host}:{port}/ipp/print"
    printer_uri = f"ipp{'s' if use_tls else ''}://{host}:{port}/ipp/print"

    # Build IPP Print-Job request
    msg = struct.pack(">BBH I", 2, 0, 0x0002, 1)  # ver 2.0, op Print-Job, req-id 1
    msg += b"\x01"  # operation-attributes-tag
    msg += _ipp_attr(0x47, "attributes-charset", "utf-8")
    msg += _ipp_attr(0x48, "attributes-natural-language", "en-us")
    msg += _ipp_attr(0x45, "printer-uri", printer_uri)
    msg += _ipp_attr(0x42, "requesting-user-name", "avcast")
    msg += _ipp_attr(0x42, "job-name", job_name)
    msg += _ipp_attr(0x49, "document-format", "application/pdf")
    msg += b"\x02"  # job-attributes-tag
    msg += _ipp_attr(0x21, "copies", int(copies))
    msg += _ipp_attr(0x44, "sides", sides_v)
    msg += _ipp_attr(0x44, "media", media_v)
    msg += _ipp_attr(0x44, "print-color-mode", color_v)
    # finishings — repeat the attribute name with 1AddtnlValue separator (0x00 nameLen)
    # for multiple values. For a single value:
    if len(fin_values) == 1:
        msg += _ipp_attr(0x23, "finishings", fin_values[0])
    else:
        # First value with the name; subsequent with empty name.
        msg += _ipp_attr(0x23, "finishings", fin_values[0])
        for v in fin_values[1:]:
            msg += struct.pack(">B H H i", 0x23, 0, 4, v)
    msg += b"\x03"  # end-of-attributes-tag
    msg += pdf_bytes

    try:
        r = await asyncio.get_event_loop().run_in_executor(
            None, lambda: requests.post(url, data=msg,
                                         headers={"Content-Type": "application/ipp"},
                                         timeout=30, verify=False),
        )
    except Exception as e:
        return {"ok": False, "error": f"http error: {e}"}

    if r.status_code != 200:
        return {"ok": False, "error": f"HTTP {r.status_code}", "body": r.content[:200].decode("ascii", "replace")}

    body = r.content
    if len(body) < 8:
        return {"ok": False, "error": "IPP response too short"}
    status_code = struct.unpack(">H", body[2:4])[0]
    if status_code != 0x0000:
        # Look up some common ones
        codes = {
            0x0400: "client-error-bad-request",
            0x0401: "client-error-forbidden",
            0x0402: "client-error-not-authenticated",
            0x0403: "client-error-not-authorized",
            0x0405: "client-error-not-possible",
            0x0408: "client-error-request-value-too-long",
            0x040A: "client-error-document-format-not-supported",
            0x040B: "client-error-attributes-or-values-not-supported",
            0x0500: "server-error-internal-error",
            0x0501: "server-error-operation-not-supported",
            0x050A: "server-error-temporary-error",
        }
        return {"ok": False, "error": f"IPP {codes.get(status_code, hex(status_code))}",
                "ipp_status": hex(status_code)}

    # Try to extract job-id from the response (look for "job-id" attribute)
    job_id = None
    job_state = None
    try:
        # Parse a bit of the response to find job-id (integer attr after job-attributes group)
        idx = 8  # skip header
        # Walk attributes — looking for value-tag 0x21 (integer) named "job-id"
        while idx < len(body) - 1:
            tag = body[idx]
            if tag in (0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08):  # group tag
                idx += 1; continue
            if tag == 0x03:
                break
            if idx + 3 > len(body): break
            name_len = struct.unpack(">H", body[idx+1:idx+3])[0]
            name = body[idx+3:idx+3+name_len].decode("ascii", "replace")
            v_off = idx + 3 + name_len
            val_len = struct.unpack(">H", body[v_off:v_off+2])[0]
            val_bytes = body[v_off+2:v_off+2+val_len]
            if name == "job-id" and val_len == 4:
                job_id = struct.unpack(">i", val_bytes)[0]
            elif name == "job-state" and val_len == 4:
                job_state = struct.unpack(">i", val_bytes)[0]
            idx = v_off + 2 + val_len
    except Exception:
        pass

    return {"ok": True, "job_id": job_id, "state": job_state}


async def get_jobs(host: str, use_tls: bool = False) -> list[dict]:
    """Return active/recent jobs on a printer."""
    from pyipp import IPP
    port = 631 if not use_tls else 443
    try:
        async with IPP(host=host, port=port, base_path="/ipp/print", tls=use_tls,
                       request_timeout=8) as ipp:
            r = await ipp.execute(
                "Get-Jobs",
                {"version": (2, 0), "operation": {
                    "requesting-user-name": "avcast",
                    "which-jobs": "not-completed",
                    "requested-attributes": ["job-id", "job-name", "job-state",
                                             "job-state-reasons", "job-printer-uri",
                                             "job-originating-user-name", "job-impressions"],
                }},
            )
            return r.get("jobs", [])
    except Exception:
        return []


# ---------- Booklet imposition ----------

def make_booklet_pdf(pdf_bytes: bytes) -> tuple[bytes, dict]:
    """Re-impose a PDF as a saddle-stitch booklet (2-up landscape signature).

    Page order example for 8 source pages: [8,1, 2,7, 6,3, 4,5]
    Each output page is landscape with two source pages side-by-side.
    Pads with blanks to a multiple of 4.
    """
    from pypdf import PdfReader, PdfWriter, PageObject
    from pypdf.generic import RectangleObject

    reader = PdfReader(io.BytesIO(pdf_bytes))
    src_pages = list(reader.pages)
    n = len(src_pages)
    if n == 0:
        raise ValueError("empty PDF")

    # Pad to multiple of 4 with blank pages
    sample = src_pages[0]
    page_w = float(sample.mediabox.width)
    page_h = float(sample.mediabox.height)
    while len(src_pages) % 4 != 0:
        blank = PageObject.create_blank_page(width=page_w, height=page_h)
        src_pages.append(blank)
    n_padded = len(src_pages)

    # Saddle-stitch order: pairs are (last, first), (second, second-last), ...
    order: list[int] = []
    left, right = 0, n_padded - 1
    flip = False
    while left < right:
        if not flip:
            order += [right, left]
        else:
            order += [left, right]
        left += 1
        right -= 1
        flip = not flip

    # Build the output: each output page is landscape (2 × page_w) × page_h
    writer = PdfWriter()
    for i in range(0, len(order), 2):
        a_idx, b_idx = order[i], order[i + 1] if i + 1 < len(order) else order[i]
        out = PageObject.create_blank_page(width=page_w * 2, height=page_h)
        # Left half = first source, right half = second source
        out.merge_translated_page(src_pages[a_idx], 0, 0)
        out.merge_translated_page(src_pages[b_idx], page_w, 0)
        writer.add_page(out)

    buf = io.BytesIO()
    writer.write(buf)
    return buf.getvalue(), {
        "source_pages": n,
        "padded_pages": n_padded,
        "output_sheets": n_padded // 2,
        "page_order": order,
    }
