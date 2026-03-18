#!/usr/bin/env python3
"""Normalize external framework payloads to portable text input."""

from __future__ import annotations

from typing import Any


def _safe_str(value: Any) -> str:
    if value is None:
        return ""
    return str(value)


def normalize_langchain_like(documents: list[Any]) -> list[dict[str, Any]]:
    """Normalize LangChain-like documents to a common row shape."""
    rows: list[dict[str, Any]] = []
    for index, doc in enumerate(documents):
        if isinstance(doc, dict):
            text = _safe_str(doc.get("page_content", ""))
            metadata = doc.get("metadata", {}) or {}
        else:
            text = _safe_str(getattr(doc, "page_content", ""))
            metadata = getattr(doc, "metadata", {}) or {}
        if not text.strip():
            continue
        rows.append(
            {
                "source_id": _safe_str(metadata.get("id") or metadata.get("source") or index),
                "text": text,
                "metadata": metadata if isinstance(metadata, dict) else {},
            }
        )
    return rows


def normalize_llamaindex_like(nodes: list[Any]) -> list[dict[str, Any]]:
    """Normalize LlamaIndex-like nodes to a common row shape."""
    rows: list[dict[str, Any]] = []
    for index, node in enumerate(nodes):
        text = ""
        metadata: dict[str, Any] = {}
        node_id = None
        if isinstance(node, dict):
            text = _safe_str(node.get("text", ""))
            metadata = node.get("metadata") or node.get("extra_info") or {}
            node_id = node.get("id_") or node.get("node_id")
        else:
            getter = getattr(node, "get_content", None)
            if callable(getter):
                text = _safe_str(getter())
            else:
                text = _safe_str(getattr(node, "text", ""))
            metadata = getattr(node, "metadata", None) or getattr(node, "extra_info", None) or {}
            node_id = getattr(node, "node_id", None) or getattr(node, "id_", None)

        if not text.strip():
            continue
        if not isinstance(metadata, dict):
            metadata = {}
        rows.append(
            {
                "source_id": _safe_str(node_id or metadata.get("id") or index),
                "text": text,
                "metadata": metadata,
            }
        )
    return rows


def infer_adapter(payload: Any) -> str:
    """Infer adapter for JSON payload shapes."""
    if not isinstance(payload, list) or not payload:
        return "raw_json"
    first = payload[0]
    if not isinstance(first, dict):
        return "raw_json"
    if "page_content" in first:
        return "langchain_json"
    if "text" in first and (
        "metadata" in first or "extra_info" in first or "id_" in first or "node_id" in first
    ):
        return "llamaindex_json"
    return "raw_json"


def adapt_input_to_text(payload: Any, *, adapter: str) -> tuple[str, dict[str, Any]]:
    """Adapt framework payload to plain text and attach adapter diagnostics."""
    resolved = adapter
    if resolved == "auto":
        resolved = infer_adapter(payload)

    rows: list[dict[str, Any]]
    if resolved == "langchain_json":
        if not isinstance(payload, list):
            raise ValueError("langchain_json adapter expects a JSON array input.")
        rows = normalize_langchain_like(payload)
    elif resolved == "llamaindex_json":
        if not isinstance(payload, list):
            raise ValueError("llamaindex_json adapter expects a JSON array input.")
        rows = normalize_llamaindex_like(payload)
    elif resolved == "raw_json":
        if isinstance(payload, (dict, list)):
            text = "\n".join(str(payload).splitlines())
        else:
            text = _safe_str(payload)
        return text, {"adapter": "raw_json", "document_count": 1}
    else:
        raise ValueError(f"Unsupported input adapter '{adapter}'.")

    text = "\n\n".join(row["text"] for row in rows)
    return text, {"adapter": resolved, "document_count": len(rows)}
