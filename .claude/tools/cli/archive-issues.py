#!/usr/bin/env python3
"""
Archive RESOLVED issues from issues.md to archive/issues-resolved-2026-02.md
Keep only OPEN issues in main file
"""

import re
from pathlib import Path

PROJECT_ROOT = Path(__file__).parent.parent.parent.parent
ISSUES_FILE = PROJECT_ROOT / ".claude" / "context" / "memory" / "issues.md"
ARCHIVE_FILE = PROJECT_ROOT / ".claude" / "context" / "memory" / "archive" / "issues-resolved-2026-02.md"

def split_issues():
    """Split issues into OPEN and RESOLVED"""
    with open(ISSUES_FILE, 'r', encoding='utf-8') as f:
        content = f.read()

    # Split by issue headers
    parts = re.split(r'(^## \[.*?\].*?$)', content, flags=re.MULTILINE)

    # parts[0] is the preamble (before first issue)
    preamble = parts[0]

    open_issues = []
    resolved_issues = []

    # Process issue pairs (header, content)
    for i in range(1, len(parts), 2):
        if i + 1 < len(parts):
            header = parts[i]
            body = parts[i + 1] if i + 1 < len(parts) else ""

            # Check if RESOLVED
            if "RESOLVED" in header or "Status**: RESOLVED" in body:
                resolved_issues.append((header, body))
            else:
                open_issues.append((header, body))

    return preamble, open_issues, resolved_issues

def write_open_issues(preamble, open_issues):
    """Write OPEN issues back to main file"""
    with open(ISSUES_FILE, 'w', encoding='utf-8') as f:
        f.write(preamble)

        # Update summary
        f.write(f"\n**Archival Note**: RESOLVED issues moved to `archive/issues-resolved-2026-02.md` on 2026-02-04.\n")
        f.write(f"**Current OPEN Count**: {len(open_issues)}\n\n")

        for header, body in open_issues:
            f.write(header)
            f.write(body)

def write_archive(resolved_issues):
    """Write RESOLVED issues to archive"""
    ARCHIVE_FILE.parent.mkdir(parents=True, exist_ok=True)

    with open(ARCHIVE_FILE, 'w', encoding='utf-8') as f:
        f.write("# Resolved Issues - February 2026\n\n")
        f.write(f"**Total Resolved This Month**: {len(resolved_issues)}\n")
        f.write(f"**Archive Date**: 2026-02-04\n")
        f.write(f"**Source**: issues.md (main file now contains only OPEN issues)\n\n")
        f.write("---\n\n")

        f.write("## Index\n\n")
        for i, (header, _) in enumerate(resolved_issues, 1):
            # Extract issue ID from header
            match = re.search(r'\[(.*?)\]', header)
            if match:
                issue_id = match.group(1)
                f.write(f"{i}. {issue_id}\n")

        f.write("\n---\n\n")
        f.write("## Resolved Issues\n\n")

        for header, body in resolved_issues:
            f.write(header)
            f.write(body)

def main():
    print(f"Reading {ISSUES_FILE}...")
    preamble, open_issues, resolved_issues = split_issues()

    print(f"Found {len(open_issues)} OPEN issues")
    print(f"Found {len(resolved_issues)} RESOLVED issues")

    print(f"\nWriting OPEN issues to {ISSUES_FILE}...")
    write_open_issues(preamble, open_issues)

    print(f"Writing RESOLVED issues to {ARCHIVE_FILE}...")
    write_archive(resolved_issues)

    print("\n✅ Archival complete!")
    print(f"   OPEN issues: {len(open_issues)}")
    print(f"   RESOLVED issues: {len(resolved_issues)}")
    print(f"   Archive: {ARCHIVE_FILE}")

if __name__ == "__main__":
    main()
