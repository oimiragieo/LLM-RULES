#!/usr/bin/env python3
"""Profile token counts for raw vs compressed context (self-contained)."""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

from _compression_engine import compress_text
from _output_format import render_output
from _runtime import read_text_or_adapted_input


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Profile token usage before/after compression.")
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
        "--file-id", type=str, default="skill_profile_doc", help="Document identifier."
    )
    parser.add_argument("--skeleton-ratio", type=float, default=0.2, help="Compression keep ratio.")
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
        mode="baseline",
        query="",
        skeleton_ratio=args.skeleton_ratio,
    )

    payload = {
        "file_id": args.file_id,
        "mode": "baseline",
        "original_tokens": compressed.original_tokens,
        "compressed_tokens": compressed.compressed_tokens,
        "compression_ratio": compressed.compression_ratio,
        "token_savings_pct": compressed.token_savings_pct,
        "selected_segments": sum(1 for s in compressed.segments if s["selected"]),
        "total_segments": len(compressed.segments),
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
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
