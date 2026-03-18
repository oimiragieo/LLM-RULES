#!/usr/bin/env python3
"""Run profile + compression + evidence validation workflow."""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

from _compression_engine import compress_text, evaluate_evidence
from _output_format import render_output
from _runtime import read_text_or_adapted_input


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Run profile + compression + evidence validation workflow."
    )
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
        "--file-id", type=str, default="skill_workflow_doc", help="Document identifier."
    )
    parser.add_argument(
        "--mode",
        choices=["baseline", "query_guided", "evidence_aware"],
        default="baseline",
        help="Compression selection mode.",
    )
    parser.add_argument(
        "--query", type=str, default="", help="Query for guided/evidence-aware modes."
    )
    parser.add_argument("--top-k", type=int, default=5, help="Evidence top-k segment count.")
    parser.add_argument("--min-similarity", type=float, default=0.35, help="Evidence threshold.")
    parser.add_argument("--skeleton-ratio", type=float, default=0.2, help="Compression keep ratio.")
    parser.add_argument(
        "--output-format",
        choices=["json", "toon", "auto"],
        default="auto",
        help="Output format for the emitted payload.",
    )
    parser.add_argument(
        "--auto-min-rows",
        type=int,
        default=8,
        help="Minimum uniform rows before auto format selects TOON.",
    )
    parser.add_argument(
        "--fail-on-insufficient-evidence",
        action="store_true",
        help="Exit non-zero if evidence validation is insufficient.",
    )
    return parser


def main() -> int:
    parser = build_parser()
    args = parser.parse_args()
    text, adapter_meta = read_text_or_adapted_input(args)
    if not text.strip():
        print("No input text provided.", file=sys.stderr)
        return 2
    if args.mode != "baseline" and not args.query.strip():
        print("--query is required for query_guided and evidence_aware modes.", file=sys.stderr)
        return 2

    compressed = compress_text(
        text=text,
        mode=args.mode,
        query=args.query,
        skeleton_ratio=args.skeleton_ratio,
        top_k=args.top_k,
    )

    profile = {
        "file_id": args.file_id,
        "original_tokens": compressed.original_tokens,
        "compressed_tokens": compressed.compressed_tokens,
        "compression_ratio": compressed.compression_ratio,
        "token_savings_pct": compressed.token_savings_pct,
    }

    selected_segments = [row for row in compressed.segments if row["selected"]]
    compressed_payload = {
        "mode": args.mode,
        "query": args.query or None,
        "compressed_text": compressed.compressed_text,
        "segments": selected_segments,
    }

    evidence_validation = None
    if args.query.strip():
        evidence_validation = evaluate_evidence(
            compressed=compressed,
            query=args.query,
            min_similarity=args.min_similarity,
            top_k=args.top_k,
        )

    payload = {
        "profile": profile,
        "compressed": compressed_payload,
        "evidence_validation": evidence_validation,
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

    if (
        args.fail_on_insufficient_evidence
        and evidence_validation
        and not evidence_validation["sufficient"]
    ):
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
