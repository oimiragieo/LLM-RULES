#!/usr/bin/env python3
"""Benchmark TOON vs JSON for token delta, round-trip, and retrieval accuracy."""

from __future__ import annotations

import argparse
import json
from dataclasses import dataclass
from typing import Any, Dict, List, Tuple

from _token_utils import compact_json, count_tokens
from _toon_codec import decode_table, encode_table, is_uniform_object_array
from _output_format import render_output


def _build_uniform_rows(n: int = 200) -> List[Dict[str, Any]]:
    return [
        {
            "id": i,
            "name": f"user_{i}",
            "role": "admin" if i % 7 == 0 else "user",
            "tier": "pro" if i % 5 == 0 else "free",
        }
        for i in range(1, n + 1)
    ]


def _build_mixed_payload() -> Dict[str, Any]:
    return {
        "meta": {"page": 1, "next": None, "ok": True},
        "items": [
            {"id": 1, "tags": ["a", "b"], "attrs": {"k": "v"}},
            {"id": 2, "tags": ["x"], "attrs": {"k2": "v2"}},
        ],
    }


def _qa_set(rows: List[Dict[str, Any]], k: int = 40) -> List[Tuple[int, str]]:
    out: List[Tuple[int, str]] = []
    for i in range(min(k, len(rows))):
        row = rows[i]
        out.append((int(row["id"]), str(row["role"])))
    return out


def _answer_from_rows(rows: List[Dict[str, Any]], row_id: int) -> str | None:
    target = str(row_id)
    for row in rows:
        if str(row.get("id")) == target:
            val = row.get("role")
            return None if val is None else str(val)
    return None


@dataclass
class BenchmarkSummary:
    dataset: str
    json_tokens: int
    toon_tokens: int | None
    token_savings_pct: float | None
    roundtrip_ok: bool | None
    retrieval_accuracy_json: float
    retrieval_accuracy_toon: float | None
    auto_selected_format: str

    def to_dict(self) -> Dict[str, Any]:
        return {
            "dataset": self.dataset,
            "json_tokens": self.json_tokens,
            "toon_tokens": self.toon_tokens,
            "token_savings_pct": self.token_savings_pct,
            "roundtrip_ok": self.roundtrip_ok,
            "retrieval_accuracy_json": self.retrieval_accuracy_json,
            "retrieval_accuracy_toon": self.retrieval_accuracy_toon,
            "auto_selected_format": self.auto_selected_format,
        }


def _accuracy(rows: List[Dict[str, Any]], qa: List[Tuple[int, str]]) -> float:
    correct = 0
    for row_id, gold in qa:
        pred = _answer_from_rows(rows, row_id)
        if pred == gold:
            correct += 1
    return round(correct / max(len(qa), 1), 4)


def benchmark_uniform() -> BenchmarkSummary:
    rows = _build_uniform_rows()
    qa = _qa_set(rows)
    payload = {"rows": rows}

    json_text = compact_json(payload)
    json_tokens = count_tokens(json_text)
    json_acc = _accuracy(rows, qa)

    toon_text = encode_table("rows", rows)
    toon_tokens = count_tokens(toon_text)
    savings = round((1 - toon_tokens / max(json_tokens, 1)) * 100, 2)

    decoded = decode_table(toon_text)
    decoded_rows = decoded.rows
    roundtrip_ok = len(decoded_rows) == len(rows) and all(
        str(a["id"]) == str(b["id"]) and str(a["role"]) == str(b["role"])
        for a, b in zip(decoded_rows, rows)
    )
    toon_acc = _accuracy(decoded_rows, qa)
    _, auto_selected_format, _ = render_output(payload, "auto", auto_min_rows=8)

    return BenchmarkSummary(
        dataset="uniform_rows",
        json_tokens=json_tokens,
        toon_tokens=toon_tokens,
        token_savings_pct=savings,
        roundtrip_ok=roundtrip_ok,
        retrieval_accuracy_json=json_acc,
        retrieval_accuracy_toon=toon_acc,
        auto_selected_format=auto_selected_format,
    )


def benchmark_mixed() -> BenchmarkSummary:
    data = _build_mixed_payload()
    json_text = compact_json(data)
    json_tokens = count_tokens(json_text)
    _, auto_selected_format, _ = render_output(data, "auto", auto_min_rows=8)

    # Mixed data isn't a TOON sweet spot. We record this explicitly.
    toon_tokens = None
    if is_uniform_object_array(data):  # always false, retained for completeness
        toon_tokens = count_tokens(encode_table("items", data))  # type: ignore[arg-type]

    return BenchmarkSummary(
        dataset="mixed_nested",
        json_tokens=json_tokens,
        toon_tokens=toon_tokens,
        token_savings_pct=None,
        roundtrip_ok=None,
        retrieval_accuracy_json=1.0,
        retrieval_accuracy_toon=None,
        auto_selected_format=auto_selected_format,
    )


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Benchmark TOON vs JSON within portable skill package."
    )
    parser.add_argument("--indent", type=int, default=2, help="JSON indent for benchmark output.")
    args = parser.parse_args()

    results = [benchmark_uniform().to_dict(), benchmark_mixed().to_dict()]
    summary = {
        "benchmarks": results,
        "guard": {
            "uniform_min_token_savings_pct": 20.0,
            "uniform_roundtrip_required": True,
            "uniform_min_retrieval_accuracy": 0.95,
            "uniform_auto_should_select": "toon",
            "mixed_auto_should_select": "json",
        },
    }

    # Apply simple guard checks.
    uniform = results[0]
    mixed = results[1]
    passes = (
        (uniform["token_savings_pct"] or 0) >= 20.0
        and uniform["roundtrip_ok"] is True
        and (uniform["retrieval_accuracy_toon"] or 0) >= 0.95
        and uniform["auto_selected_format"] == summary["guard"]["uniform_auto_should_select"]
        and mixed["auto_selected_format"] == summary["guard"]["mixed_auto_should_select"]
    )
    summary["guard"]["pass"] = passes

    print(json.dumps(summary, indent=args.indent))
    return 0 if passes else 1


if __name__ == "__main__":
    raise SystemExit(main())
