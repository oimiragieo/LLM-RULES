#!/usr/bin/env python3
"""Shared runtime helpers for portable, self-contained skill scripts."""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Any


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
