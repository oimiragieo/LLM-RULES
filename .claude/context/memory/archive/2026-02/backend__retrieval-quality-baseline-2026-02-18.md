# Retrieval Quality Baseline (2026-02-18)

- Benchmark fixture: `tests/evals/fixtures/retrieval-quality-benchmark.json`
- Report output: `.claude/context/reports/retrieval-quality-baseline-latest.json`
- Query count: `30`
- Modes: `legacy`, `expanded`

## Results

| Mode     | Recall@5 | MRR@10 | p50 ms | p95 ms | fallbackRate | keywordOnlyRate |
| -------- | -------- | ------ | ------ | ------ | ------------ | --------------- |
| legacy   | 0.0667   | 0.0220 | 62.69  | 65.24  | 0.0000       | 0.1000          |
| expanded | 0.0667   | 0.0220 | 60.88  | 66.00  | 0.0000       | 0.1000          |

## Gate Comparison (expanded vs legacy)

- Recall@5 delta: `0.0000` (threshold >= `0.03`)
- MRR@10 delta: `0.0000` (threshold >= `0`)
- p95 latency ratio: `0.0116` (threshold <= `0.15`)
- fallbackRate delta: `0.0000` (threshold <= `0`)
- Gate pass: `false`

## Conclusion

- Phase 2A `expanded` mode did not improve retrieval quality on this benchmark.
- Keep default mode `legacy`.
- Re-run this baseline after any benchmark/needle quality improvements before enabling new retrieval phases.
