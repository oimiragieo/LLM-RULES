#!/usr/bin/env python3
"""Token counting helpers with graceful fallback when tiktoken is unavailable."""

from __future__ import annotations

import re
from typing import Any


_WORD_OR_PUNCT = re.compile(r"\w+|[^\w\s]", re.UNICODE)


def count_tokens(text: str, encoding_name: str = "cl100k_base") -> int:
    """
    Count tokens using tiktoken when available.

    Falls back to a stable approximation for out-of-the-box portability.
    """
    try:
        import tiktoken  # type: ignore

        enc = tiktoken.get_encoding(encoding_name)
        return len(enc.encode(text))
    except Exception:
        # Conservative fallback approximation.
        return len(_WORD_OR_PUNCT.findall(text))


def compact_json(data: Any) -> str:
    """Compact JSON for token-efficient transmission."""
    import json

    return json.dumps(data, ensure_ascii=False, separators=(",", ":"))
