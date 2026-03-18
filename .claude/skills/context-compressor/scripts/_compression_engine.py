#!/usr/bin/env python3
"""Self-contained text compression and evidence scoring engine."""

from __future__ import annotations

import math
import re
from dataclasses import dataclass
from typing import Any, Dict, List

from _token_utils import count_tokens


SENTENCE_SPLIT = re.compile(r"(?<=[.!?])\s+|\n+")
TOKEN_SPLIT = re.compile(r"[A-Za-z0-9_]+")


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


def compress_text(
    text: str,
    mode: str = "baseline",
    query: str = "",
    skeleton_ratio: float = 0.2,
    top_k: int = 5,
) -> CompressionResult:
    segments = _split_segments(text)
    target_keep = max(1, int(round(len(segments) * max(0.05, min(0.95, skeleton_ratio)))))

    segment_rows: List[Dict[str, Any]] = []
    for idx, seg in enumerate(segments):
        score = _score_segment(seg, query if mode != "baseline" else "", idx)
        segment_rows.append(
            {
                "segment_id": idx,
                "score": round(score, 4),
                "tokens": count_tokens(seg),
                "text": seg,
            }
        )

    ranked = sorted(segment_rows, key=lambda r: (r["score"], -r["segment_id"]), reverse=True)
    if mode == "baseline":
        chosen = ranked[:target_keep]
    elif mode == "query_guided":
        chosen = ranked[: max(target_keep, min(top_k, len(ranked)))]
    else:  # evidence_aware
        chosen = ranked[: max(target_keep, top_k)]

    chosen_ids = {row["segment_id"] for row in chosen}
    ordered = [row for row in segment_rows if row["segment_id"] in chosen_ids]
    compressed_text = "\n".join(row["text"] for row in ordered)

    original_tokens = count_tokens(text)
    compressed_tokens = count_tokens(compressed_text)
    ratio = round(original_tokens / max(compressed_tokens, 1), 3)
    savings = round((1 - compressed_tokens / max(original_tokens, 1)) * 100, 2)

    for row in segment_rows:
        row["selected"] = row["segment_id"] in chosen_ids

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
