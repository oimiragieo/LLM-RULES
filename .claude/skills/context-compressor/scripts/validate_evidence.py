#!/usr/bin/env python3
"""Validate evidence sufficiency for a query against compressed context."""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

from _compression_engine import compress_text, evaluate_evidence
from _output_format import render_output
from _runtime import read_text_or_adapted_input


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Check evidence sufficiency for a query.")
    parser.add_argument("--text", type=str, default="", help="Inline text input.")
    parser.add_argument("--file", type=Path, help="Path to UTF-8 text file.")
    parser.add_argument("--json", type=str, default="", help="Inline JSON input to adapt.")
    parser.add_argument("--json-file", type=Path, help="Path to JSON input to adapt.")
    parser.add_argument(
        "--input-adapter",
        choices=["raw_json", "langchain_json", "llamaindex_json", "auto"],
        default="raw_json",
        help="Adapter used when --json/--json-file is provided.",
    )
    parser.add_argument(
        "--file-id", type=str, default="skill_evidence_doc", help="Document identifier."
    )
    parser.add_argument("--query", type=str, required=True, help="Query to validate.")
    parser.add_argument("--top-k", type=int, default=5, help="Evidence top-k segment count.")
    parser.add_argument("--min-similarity", type=float, default=0.35, help="Sufficiency threshold.")
    parser.add_argument(
        "--skeleton-ratio", type=float, default=0.25, help="Compression keep ratio."
    )
    parser.add_argument(
        "--output-format",
        choices=["json", "toon", "auto"],
        default="json",
        help="Output format for the emitted payload.",
    )
    parser.add_argument(
        "--auto-min-rows",
        type=int,
        default=8,
        help="Minimum uniform rows before auto format selects TOON.",
    )
    return parser


def main() -> int:
    parser = build_parser()
    args = parser.parse_args()
    text, adapter_meta = read_text_or_adapted_input(args)
    if not text.strip():
        print("No input text provided.", file=sys.stderr)
        return 2

    compressed = compress_text(
        text=text,
        mode="query_guided",
        query=args.query,
        skeleton_ratio=args.skeleton_ratio,
        top_k=args.top_k,
    )
    evidence = evaluate_evidence(
        compressed=compressed,
        query=args.query,
        min_similarity=args.min_similarity,
        top_k=args.top_k,
    )
    payload = {
        "file_id": args.file_id,
        "query": args.query,
        **evidence,
    }
    if adapter_meta is not None:
        payload["input_adapter"] = adapter_meta

    rendered, resolved, meta = render_output(
        payload, args.output_format, auto_min_rows=args.auto_min_rows
    )
    if args.output_format == "toon" and resolved != "toon":
        payload_meta = {
            "requested_output_format": args.output_format,
            "resolved_output_format": resolved,
            **meta,
        }
        rendered, _, _ = render_output({**payload, "_format_meta": payload_meta}, "json")
    print(rendered)

    return 0 if evidence["sufficient"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
