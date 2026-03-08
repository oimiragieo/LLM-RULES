#!/usr/bin/env python3
"""
markitdown-convert.py — Convert files to Markdown using Microsoft's MarkItDown.

Usage:
  python markitdown-convert.py <input_file_path> [output_file_path]
  python markitdown-convert.py <input_file_path> --ext .pdf [output_file_path]

Exit codes:
  0 = success
  1 = conversion error
  2 = file not found
  3 = markitdown not installed
"""
from __future__ import annotations

import json
import sys
from pathlib import Path


def check_markitdown():
    """Check if markitdown is installed and return the MarkItDown class."""
    try:
        from markitdown import MarkItDown  # noqa: WPS433
        return MarkItDown
    except ImportError:
        print(
            json.dumps({
                "success": False,
                "error": "markitdown not installed. Run: pip install 'markitdown[all]'",
            }),
        )
        sys.exit(3)


def convert_file(
    input_path: str,
    output_path: str | None = None,
    ext_hint: str | None = None,
) -> dict:
    """Convert a file to markdown.

    Args:
        input_path: Path to the input file.
        output_path: Optional path to write the markdown output.
        ext_hint: Optional file extension hint for format detection.

    Returns:
        Dict with success status, text_content, and metadata.
    """
    markitdown_cls = check_markitdown()

    path = Path(input_path)
    if not path.exists():
        return {"success": False, "error": f"File not found: {input_path}"}

    try:
        md = markitdown_cls()
        if ext_hint:
            with open(input_path, "rb") as f:
                result = md.convert_stream(f, file_extension=ext_hint)
        else:
            result = md.convert(str(path))

        text = result.text_content

        if output_path:
            Path(output_path).parent.mkdir(parents=True, exist_ok=True)
            Path(output_path).write_text(text, encoding="utf-8")

        return {
            "success": True,
            "text_content": text,
            "char_count": len(text),
            "source_file": path.name,
            "output_file": output_path,
        }
    except Exception as e:
        return {"success": False, "error": str(e), "source_file": str(input_path)}


def main() -> None:
    """Parse CLI arguments and run conversion."""
    args = sys.argv[1:]

    if not args or args[0] in ("-h", "--help"):
        print(__doc__)
        sys.exit(0)

    ext_hint: str | None = None
    output_path: str | None = None
    input_path: str | None = None

    i = 0
    while i < len(args):
        if args[i] == "--ext" and i + 1 < len(args):
            ext_hint = args[i + 1]
            i += 2
        elif input_path is None:
            input_path = args[i]
            i += 1
        elif output_path is None:
            output_path = args[i]
            i += 1
        else:
            i += 1

    if not input_path:
        print(json.dumps({"success": False, "error": "No input file specified"}))
        sys.exit(1)

    path = Path(input_path)
    if not path.exists():
        print(json.dumps({"success": False, "error": f"File not found: {input_path}"}))
        sys.exit(2)

    result = convert_file(input_path, output_path, ext_hint)
    print(json.dumps(result, ensure_ascii=False))
    sys.exit(0 if result["success"] else 1)


if __name__ == "__main__":
    main()
