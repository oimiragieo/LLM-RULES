#!/usr/bin/env python3
"""TOON encoding/decoding helpers for self-contained skill usage."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Dict, List


Primitive = (str, int, float, bool, type(None))


def _is_primitive(value: Any) -> bool:
    return isinstance(value, Primitive)


def _escape_cell(value: Any) -> str:
    raw = "" if value is None else str(value)
    return raw.replace("\\", "\\\\").replace(",", "\\,").replace("\n", "\\n")


def _unescape_cell(value: str) -> str:
    out: List[str] = []
    i = 0
    while i < len(value):
        ch = value[i]
        if ch == "\\" and i + 1 < len(value):
            nxt = value[i + 1]
            if nxt == "n":
                out.append("\n")
            else:
                out.append(nxt)
            i += 2
        else:
            out.append(ch)
            i += 1
    return "".join(out)


def _split_escaped_csv(line: str) -> List[str]:
    cells: List[str] = []
    buf: List[str] = []
    escape = False
    for ch in line:
        if escape:
            if ch == "n":
                buf.append("\n")
            else:
                buf.append(ch)
            escape = False
            continue
        if ch == "\\":
            escape = True
            continue
        if ch == ",":
            cells.append("".join(buf))
            buf = []
            continue
        buf.append(ch)
    cells.append("".join(buf))
    return cells


def is_uniform_object_array(value: Any, min_rows: int = 3) -> bool:
    if not isinstance(value, list) or len(value) < min_rows:
        return False
    if not all(isinstance(item, dict) for item in value):
        return False

    first_keys = list(value[0].keys())
    if not first_keys:
        return False
    for item in value:
        if list(item.keys()) != first_keys:
            return False
        if not all(_is_primitive(v) for v in item.values()):
            return False
    return True


def _maybe_official_encode(data: Any) -> str | None:
    """Use official toon-format package when present."""
    try:
        from toon_format import dumps as toon_dumps  # type: ignore

        return toon_dumps(data)
    except Exception:
        return None


def _encode_scalar(value: Any) -> str:
    if isinstance(value, bool):
        return "true" if value else "false"
    if value is None:
        return "null"
    return str(value)


def encode_table(name: str, rows: List[Dict[str, Any]], indent: int = 0) -> str:
    if not rows:
        return f"{' ' * indent}{name}[0]{{}}:"
    fields = list(rows[0].keys())
    lines = [f"{' ' * indent}{name}[{len(rows)}]{{{','.join(fields)}}}:"]
    row_prefix = " " * (indent + 2)
    for row in rows:
        lines.append(row_prefix + ",".join(_escape_cell(row.get(field, "")) for field in fields))
    return "\n".join(lines)


def encode_toon(data: Any, root_name: str = "data", indent: int = 0) -> str:
    """Encode Python data to TOON-like text (lossless for supported structures)."""
    official = _maybe_official_encode(data)
    if official is not None:
        return official

    pad = " " * indent
    if isinstance(data, dict):
        lines: List[str] = []
        for key, value in data.items():
            if isinstance(value, dict):
                lines.append(f"{pad}{key}:")
                lines.append(encode_toon(value, root_name=key, indent=indent + 2))
            elif is_uniform_object_array(value, min_rows=1):
                lines.append(encode_table(key, value, indent=indent))
            elif isinstance(value, list) and all(_is_primitive(v) for v in value):
                lines.append(
                    f"{pad}{key}[{len(value)}]: " + ",".join(_escape_cell(v) for v in value)
                )
            elif isinstance(value, list):
                lines.append(f"{pad}{key}[{len(value)}]:")
                for item in value:
                    if isinstance(item, dict):
                        lines.append(f"{pad}  -")
                        lines.append(encode_toon(item, root_name=key, indent=indent + 4))
                    else:
                        lines.append(f"{pad}  - {_escape_cell(item)}")
            else:
                lines.append(f"{pad}{key}: {_encode_scalar(value)}")
        return "\n".join(lines)

    if is_uniform_object_array(data, min_rows=1):
        return encode_table(root_name, data, indent=indent)

    if isinstance(data, list) and all(_is_primitive(v) for v in data):
        return f"{pad}{root_name}[{len(data)}]: " + ",".join(_escape_cell(v) for v in data)

    return f"{pad}{root_name}: {_encode_scalar(data)}"


@dataclass
class DecodeResult:
    rows: List[Dict[str, str]]
    row_count: int
    fields: List[str]


def decode_table(table_toon: str) -> DecodeResult:
    """
    Decode a TOON table in the form: name[N]{field1,field2}:<rows>.

    This powers round-trip checks and retrieval benchmarks for uniform arrays.
    """
    lines = [ln.rstrip() for ln in table_toon.splitlines() if ln.strip()]
    if not lines:
        return DecodeResult(rows=[], row_count=0, fields=[])

    header = lines[0].strip()
    lb = header.find("[")
    rb = header.find("]")
    lcb = header.find("{")
    rcb = header.find("}")
    if min(lb, rb, lcb, rcb) == -1 or not header.endswith(":"):
        raise ValueError("Invalid TOON table header.")

    row_count = int(header[lb + 1 : rb])
    fields = header[lcb + 1 : rcb].split(",") if rcb > lcb + 1 else []

    rows: List[Dict[str, str]] = []
    for raw_line in lines[1:]:
        raw_line = raw_line.strip()
        if not raw_line:
            continue
        cells = _split_escaped_csv(raw_line)
        row = {
            field: _unescape_cell(cells[i]) if i < len(cells) else ""
            for i, field in enumerate(fields)
        }
        rows.append(row)

    return DecodeResult(rows=rows, row_count=row_count, fields=fields)
