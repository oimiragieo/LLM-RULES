# Codebase Exploration Research Requirements (2026)

## Verified Methodology

Based on research into SWE-bench top performers, LocAgent, and OpenHands.

**Core principle:** Search-first, read-selectively, write-findings-immediately.

## Tool Selection

| Need               | Tool                   |
| ------------------ | ---------------------- |
| File discovery     | Glob                   |
| Content search     | Grep (ripgrep)         |
| Targeted read      | Read with offset/limit |
| Structure patterns | ast-grep               |
| Definitions        | LSP                    |

## Token Budget Management

- Total budget: 34K tokens
- Hard stop at 60K: invoke context-compressor
- Max 10 files in Phase 4 selective reads
- Max 200 lines per read operation

## Source References

- [SWE-bench](https://www.swebench.com/)
- [OpenHands](https://github.com/All-Hands-AI/OpenHands)
- [LocAgent](https://github.com/facebookresearch/locagent)
