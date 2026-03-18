#!/usr/bin/env python3
"""Self-contained text compression and evidence scoring engine."""

from __future__ import annotations

import math
import re
from dataclasses import dataclass
from typing import Any, Dict, List

from _pipeline import PipelineExecutionError, PipelineStage, run_pipeline
from _token_utils import count_tokens


SENTENCE_SPLIT = re.compile(r"(?<=[.!?])\s+|\n+")
TOKEN_SPLIT = re.compile(r"[A-Za-z0-9_]+")
LLMLINGUA_TAG = re.compile(r"<(/?)llmlingua([^>]*)>", re.IGNORECASE)


def _tokenize(text: str) -> List[str]:
    return [t.lower() for t in TOKEN_SPLIT.findall(text)]


def _jaccard(a: str, b: str) -> float:
    sa = set(_tokenize(a))
    sb = set(_tokenize(b))
    if not sa or not sb:
        return 0.0
    return len(sa & sb) / len(sa | sb)


def _split_segments(text: str) -> List[str]:
    segments = [s.strip() for s in SENTENCE_SPLIT.split(text) if s.strip()]
    return segments if segments else [text.strip()]


def _parse_bool(value: str) -> bool:
    lowered = value.strip().lower()
    if lowered in {"true", "1", "yes"}:
        return True
    if lowered in {"false", "0", "no"}:
        return False
    raise ValueError(f"Invalid boolean value '{value}' for llmlingua tag attribute.")


def _parse_llmlingua_attrs(raw: str) -> dict[str, Any]:
    attrs: dict[str, Any] = {"compress": True, "rate": None}
    normalized = raw.strip().lstrip(",").strip()
    if not normalized:
        return attrs
    for item in [part.strip() for part in normalized.split(",") if part.strip()]:
        if "=" not in item:
            raise ValueError(f"Invalid llmlingua attribute syntax '{item}'.")
        key, value = [x.strip() for x in item.split("=", 1)]
        key = key.lower()
        if key == "compress":
            attrs["compress"] = _parse_bool(value)
        elif key == "rate":
            rate = float(value)
            if not 0.0 <= rate <= 1.0:
                raise ValueError("llmlingua rate must be between 0.0 and 1.0.")
            attrs["rate"] = rate
        else:
            raise ValueError(f"Unsupported llmlingua attribute '{key}'.")
    return attrs


def _split_with_structured_policy(text: str) -> list[dict[str, Any]]:
    if "<llmlingua" not in text.lower():
        return [
            {"text": seg, "force_keep": False, "local_rate": None, "group_id": None}
            for seg in _split_segments(text)
        ]

    blocks: list[dict[str, Any]] = []
    cursor = 0
    open_policy: dict[str, Any] | None = None
    open_content_start = 0
    group_counter = 0

    for match in LLMLINGUA_TAG.finditer(text):
        is_closing = bool(match.group(1))
        attrs_raw = match.group(2) or ""
        start, end = match.span()

        if is_closing:
            if open_policy is None:
                raise ValueError("Closing </llmlingua> tag found without matching opener.")
            content = text[open_content_start:start]
            if content.strip():
                blocks.append({"text": content, **open_policy})
            open_policy = None
            cursor = end
            continue

        if open_policy is not None:
            raise ValueError("Nested <llmlingua> tags are not supported.")

        plain = text[cursor:start]
        if plain.strip():
            blocks.append(
                {"text": plain, "force_keep": False, "local_rate": None, "group_id": None}
            )

        attrs = _parse_llmlingua_attrs(attrs_raw)
        local_rate = attrs["rate"] if attrs["compress"] else None
        group_id = None
        if local_rate is not None:
            group_counter += 1
            group_id = f"group_{group_counter}"
        open_policy = {
            "force_keep": not attrs["compress"],
            "local_rate": local_rate,
            "group_id": group_id,
        }
        open_content_start = end
        cursor = end

    if open_policy is not None:
        raise ValueError("Unclosed <llmlingua> tag.")

    tail = text[cursor:]
    if tail.strip():
        blocks.append({"text": tail, "force_keep": False, "local_rate": None, "group_id": None})

    segments: list[dict[str, Any]] = []
    for block in blocks:
        for segment in _split_segments(block["text"]):
            segments.append(
                {
                    "text": segment,
                    "force_keep": block["force_keep"],
                    "local_rate": block["local_rate"],
                    "group_id": block["group_id"],
                }
            )
    return segments


@dataclass
class CompressionResult:
    mode: str
    original_text: str
    compressed_text: str
    segments: List[Dict[str, Any]]
    original_tokens: int
    compressed_tokens: int
    compression_ratio: float
    token_savings_pct: float


def _score_segment(segment: str, query: str | None, idx: int) -> float:
    # Stable deterministic blend: relevance + light position prior.
    relevance = _jaccard(segment, query or "")
    position = 1.0 / (1.0 + math.log2(idx + 2))
    return 0.75 * relevance + 0.25 * position


def _score_components(segment: str, query: str | None, idx: int) -> dict[str, float]:
    relevance = _jaccard(segment, query or "")
    position = 1.0 / (1.0 + math.log2(idx + 2))
    final = 0.75 * relevance + 0.25 * position
    return {
        "relevance": round(relevance, 4),
        "position": round(position, 4),
        "final": round(final, 4),
    }


def compress_text(
    text: str,
    mode: str = "baseline",
    query: str = "",
    skeleton_ratio: float = 0.2,
    top_k: int = 5,
) -> CompressionResult:
    def stage_split(state: Dict[str, Any]) -> Dict[str, Any]:
        segments = _split_with_structured_policy(state["text"])
        state["segments"] = segments
        state["target_keep"] = max(
            1,
            int(
                round(
                    len(segments) * max(0.05, min(0.95, float(state["skeleton_ratio"]))),
                )
            ),
        )
        return state

    def stage_score(state: Dict[str, Any]) -> Dict[str, Any]:
        scored: List[Dict[str, Any]] = []
        effective_query = state["query"] if state["mode"] != "baseline" else ""
        for idx, seg in enumerate(state["segments"]):
            components = _score_components(seg["text"], effective_query, idx)
            scored.append(
                {
                    "segment_id": idx,
                    "score": components["final"],
                    "tokens": count_tokens(seg["text"]),
                    "text": seg["text"],
                    "force_keep": seg["force_keep"],
                    "local_rate": seg["local_rate"],
                    "group_id": seg["group_id"],
                    "score_components": components,
                }
            )
        state["segment_rows"] = scored
        return state

    def stage_select(state: Dict[str, Any]) -> Dict[str, Any]:
        ranked = sorted(
            state["segment_rows"],
            key=lambda r: (r["score"], -r["segment_id"]),
            reverse=True,
        )
        target_keep = state["target_keep"]
        if state["mode"] == "baseline":
            target = target_keep
        elif state["mode"] == "query_guided":
            target = max(target_keep, min(int(state["top_k"]), len(ranked)))
        else:
            target = max(target_keep, int(state["top_k"]))

        chosen_ids = {row["segment_id"] for row in ranked if row["force_keep"]}

        grouped_rows: dict[str, list[Dict[str, Any]]] = {}
        local_rate_selected_ids: set[int] = set()
        for row in ranked:
            if row["group_id"] and row["local_rate"] is not None and not row["force_keep"]:
                grouped_rows.setdefault(str(row["group_id"]), []).append(row)
        for rows in grouped_rows.values():
            local_rate = float(rows[0]["local_rate"])
            required = max(1, int(math.ceil(len(rows) * local_rate)))
            for row in sorted(rows, key=lambda r: (r["score"], -r["segment_id"]), reverse=True)[
                :required
            ]:
                chosen_ids.add(row["segment_id"])
                local_rate_selected_ids.add(row["segment_id"])

        for row in ranked:
            if len(chosen_ids) >= target:
                break
            chosen_ids.add(row["segment_id"])

        state["chosen_ids"] = chosen_ids
        state["local_rate_selected_ids"] = local_rate_selected_ids
        state["ordered_selected_rows"] = [
            row for row in state["segment_rows"] if row["segment_id"] in chosen_ids
        ]
        return state

    try:
        state = run_pipeline(
            {
                "text": text,
                "mode": mode,
                "query": query,
                "skeleton_ratio": skeleton_ratio,
                "top_k": top_k,
            },
            [
                PipelineStage(name="split", fn=stage_split),
                PipelineStage(name="score", fn=stage_score),
                PipelineStage(name="select", fn=stage_select),
            ],
        )
    except PipelineExecutionError as exc:
        if exc.stage_name == "split" and isinstance(exc.cause, ValueError):
            raise exc.cause
        raise

    segment_rows = state["segment_rows"]
    chosen_ids = state["chosen_ids"]
    local_rate_selected_ids = state["local_rate_selected_ids"]
    compressed_text = "\n".join(row["text"] for row in state["ordered_selected_rows"])

    original_tokens = count_tokens(text)
    compressed_tokens = count_tokens(compressed_text)
    ratio = round(original_tokens / max(compressed_tokens, 1), 3)
    savings = round((1 - compressed_tokens / max(original_tokens, 1)) * 100, 2)

    for row in segment_rows:
        row["selected"] = row["segment_id"] in chosen_ids
        if row["segment_id"] in chosen_ids:
            if row["force_keep"]:
                row["selection_reason"] = "forced_by_tag"
            elif row["segment_id"] in local_rate_selected_ids:
                row["selection_reason"] = "local_rate_policy"
            else:
                row["selection_reason"] = "top_rank"
        else:
            row["selection_reason"] = "not_selected"

    return CompressionResult(
        mode=mode,
        original_text=text,
        compressed_text=compressed_text,
        segments=segment_rows,
        original_tokens=original_tokens,
        compressed_tokens=compressed_tokens,
        compression_ratio=ratio,
        token_savings_pct=savings,
    )


def evaluate_evidence(
    compressed: CompressionResult,
    query: str,
    min_similarity: float = 0.35,
    top_k: int = 5,
) -> Dict[str, Any]:
    scored = []
    for row in compressed.segments:
        if not row["selected"]:
            continue
        sim = _jaccard(row["text"], query)
        scored.append(
            {
                "segment_id": row["segment_id"],
                "similarity": round(sim, 4),
                "text": row["text"],
            }
        )
    scored.sort(key=lambda r: r["similarity"], reverse=True)
    top = scored[:top_k]
    best = top[0]["similarity"] if top else 0.0
    sufficient = best >= min_similarity
    return {
        "query": query,
        "sufficient": sufficient,
        "best_score": round(best, 4),
        "threshold": min_similarity,
        "top_matches": top,
        "used_expanded_search": False,
        "message": "Evidence sufficient." if sufficient else "Evidence below threshold.",
    }
