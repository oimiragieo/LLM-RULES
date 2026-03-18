#!/usr/bin/env python3
"""Output format routing for json/toon/auto with safe fallback behavior."""

from __future__ import annotations

from typing import Any, Dict, Tuple

from _token_utils import compact_json, count_tokens
from _toon_codec import encode_toon, is_uniform_object_array


def _find_uniform_candidate(data: Any, min_rows: int) -> bool:
    if is_uniform_object_array(data, min_rows=min_rows):
        return True
    if isinstance(data, dict):
        for value in data.values():
            if _find_uniform_candidate(value, min_rows=min_rows):
                return True
    if isinstance(data, list):
        for value in data:
            if _find_uniform_candidate(value, min_rows=min_rows):
                return True
    return False


def render_output(
    payload: Dict[str, Any],
    output_format: str,
    auto_min_rows: int = 8,
) -> Tuple[str, str, Dict[str, Any]]:
    """
    Render payload as JSON or TOON.

    Returns tuple: (serialized_text, resolved_format, format_meta)
    """
    requested = output_format.lower()
    if requested not in {"json", "toon", "auto"}:
        requested = "json"

    if requested == "json":
        text = compact_json(payload)
        return text, "json", {"json_tokens": count_tokens(text)}

    if requested == "auto":
        resolved = "toon" if _find_uniform_candidate(payload, min_rows=auto_min_rows) else "json"
    else:
        resolved = "toon"

    if resolved == "toon":
        toon_text = encode_toon(payload)
        json_text = compact_json(payload)
        toon_tokens = count_tokens(toon_text)
        json_tokens = count_tokens(json_text)
        if toon_tokens <= json_tokens:
            savings = round((1 - toon_tokens / max(json_tokens, 1)) * 100, 2)
            return (
                toon_text,
                "toon",
                {
                    "toon_tokens": toon_tokens,
                    "json_tokens": json_tokens,
                    "token_savings_pct_vs_json": savings,
                },
            )
        # Safe fallback: TOON is not better for this payload.
        return (
            json_text,
            "json",
            {
                "fallback_reason": "toon_not_better_than_json",
                "toon_tokens": toon_tokens,
                "json_tokens": json_tokens,
                "token_savings_pct_vs_json": round(
                    (1 - toon_tokens / max(json_tokens, 1)) * 100, 2
                ),
            },
        )

    json_text = compact_json(payload)
    return json_text, "json", {"json_tokens": count_tokens(json_text)}
