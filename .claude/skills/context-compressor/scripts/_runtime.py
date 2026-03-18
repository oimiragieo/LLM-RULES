#!/usr/bin/env python3
"""Shared runtime helpers for portable, self-contained skill scripts."""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Any

from _external_adapters import adapt_input_to_text


def read_text_input(args: argparse.Namespace) -> str:
    """Read text from --text, --file, or stdin."""
    if getattr(args, "text", ""):
        return args.text
    if getattr(args, "file", None):
        return Path(args.file).read_text(encoding="utf-8")
    return sys.stdin.read()


def read_json_input(args: argparse.Namespace) -> Any:
    """Read JSON from --json, --json-file, or stdin."""
    if getattr(args, "json", ""):
        return json.loads(args.json)
    if getattr(args, "json_file", None):
        return json.loads(Path(args.json_file).read_text(encoding="utf-8"))
    raw = sys.stdin.read().strip()
    if not raw:
        raise ValueError("No JSON input provided.")
    return json.loads(raw)


def read_text_or_adapted_input(args: argparse.Namespace) -> tuple[str, dict[str, Any] | None]:
    """Read text input, optionally adapting external JSON payloads."""
    if getattr(args, "json", "") or getattr(args, "json_file", None):
        payload = read_json_input(args)
        adapter = getattr(args, "input_adapter", "raw_json")
        text, metadata = adapt_input_to_text(payload, adapter=adapter)
        return text, metadata
    return read_text_input(args), None
