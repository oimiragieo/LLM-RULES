# Workflow Guide

Use this guide when you need to decide which script or compression mode to run.

## Default path

1. Run `profile_tokens.py` to establish the raw token footprint.
2. If the user has a question, prefer `query_guided`.
3. If the answer needs stronger confidence, use `evidence_aware`.
4. If the user wants one command, use `run_skill_workflow.py`.

## Script chooser

| Need                                          | Script                      | Notes                                                     |
| --------------------------------------------- | --------------------------- | --------------------------------------------------------- |
| Raw vs compressed token profile               | `profile_tokens.py`         | Fastest first pass                                        |
| Produce compressed context                    | `compress_context.py`       | Supports baseline, query-guided, and evidence-aware modes |
| Check sufficiency only                        | `validate_evidence.py`      | Exits non-zero when evidence is insufficient              |
| Run profile + compression + evidence together | `run_skill_workflow.py`     | Best default for end-to-end use                           |
| Check TOON vs JSON output policy              | `benchmark_toon_vs_json.py` | Regression guard for structured output formatting         |

## Input types

The skill supports:

- `--file` for local UTF-8 text files
- `--text` for inline content
- `--json` or `--json-file` for adapted framework payloads

When compressing JSON payloads from frameworks, prefer `--input-adapter auto` unless the payload format is already known.

## Command examples

### Codebase or architecture review

```bash
python .claude/skills/context-compressor\scripts\compress_context.py --file <path> --mode query_guided --query "what changed and why?" --output-format auto
```

### Correctness-sensitive question

```bash
python .claude/skills/context-compressor\scripts\run_skill_workflow.py --file <path> --mode evidence_aware --query "<question>" --output-format auto --fail-on-insufficient-evidence
```

### Framework payload cleanup

```bash
python .claude/skills/context-compressor\scripts\compress_context.py --json-file <payload.json> --input-adapter auto --mode query_guided --query "<question>" --output-format auto
```

## Reporting pattern

When you present results, include:

1. the compression mode used
2. token savings or compression ratio
3. whether evidence sufficiency passed
4. the safest next step if evidence was weak
