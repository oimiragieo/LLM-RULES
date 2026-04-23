---
description: MMP CLI — query CAT7 lineage and descendant chains
---

# mmp — Mesh Memory Protocol CLI

Query CAT7 lineage chains and descendants from the command line.

## Usage

```
node .claude/tools/cli/mmp.cjs <subcommand> <record-id> [flags]
```

Or via pnpm scripts:

```
pnpm mmp:lineage  <record-id> [flags]
pnpm mmp:descendants <record-id> [flags]
```

## Subcommands

| Subcommand    | Description                                                      |
| ------------- | ---------------------------------------------------------------- |
| `lineage`     | Print the ancestry chain from `record-id` back to earliest root |
| `descendants` | Print all records whose lineage includes `record-id`            |

## Flags

| Flag              | Default | Description                                    |
| ----------------- | ------- | ---------------------------------------------- |
| `--format=json`   | yes     | Output as JSON array                           |
| `--format=tree`   | no      | Output as indented ASCII tree                  |
| `--json`          | —       | Alias for `--format=json` (explicit override)  |

## Exit Codes

| Code | Meaning                                          |
| ---- | ------------------------------------------------ |
| `0`  | Success                                          |
| `1`  | Record not found                                 |
| `2`  | Usage error (missing/unknown subcommand or args) |

## Examples

```bash
# Trace ancestry of a record (default JSON)
node .claude/tools/cli/mmp.cjs lineage my-record-id

# Trace ancestry as indented tree
node .claude/tools/cli/mmp.cjs lineage my-record-id --format=tree

# Find all direct descendants of a record
node .claude/tools/cli/mmp.cjs descendants root-record-id

# Pipe JSON output to jq
node .claude/tools/cli/mmp.cjs lineage my-record-id | jq '.[].concept'
```

## Environment Variables

| Variable       | Description                                                       |
| -------------- | ----------------------------------------------------------------- |
| `MMP_BASE_DIR` | Override the base directory for CAT7 tier storage. Defaults to   |
|                | `.claude/context/memory` relative to the project root.           |

## Notes

- Lineage traversal follows `lineage[0]` (linear chain; DAG deferred to v3.3.0).
- `findDescendants` is non-transitive: only direct references are returned.
- Records are located across `stm/`, `mtm/`, and `ltm/` subdirectories.
