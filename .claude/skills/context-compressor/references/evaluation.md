# Evaluation Guide

Use this guide when you want to prove the skill is helping rather than just sounding helpful.

## Starter eval set

The file `evals\evals.json` contains a small realistic set of prompts that exercise:

1. question-guided document compression
2. evidence sufficiency checks
3. framework JSON adaptation

## What good outputs should show

- reduced token footprint
- preserved query-relevant content
- clear evidence status
- no fake confidence when evidence is weak

## Cheap validation loop

1. Run one of the sample prompts from `evals\evals.json`.
2. Save the output.
3. Compare raw token profile against compressed token profile.
4. Verify that the returned content still answers the prompt.
5. If evidence is insufficient, rerun with a less aggressive mode or broader retrieval.

## Useful commands

```bash
python .claude/skills/context-compressor/scripts/profile_tokens.py --file tests\fixtures\skill_context_sample.txt --output-format auto
python .claude/skills/context-compressor/scripts/run_skill_workflow.py --file tests\fixtures\skill_context_sample.txt --mode evidence_aware --query "what are the retry rules?" --output-format auto --fail-on-insufficient-evidence
python .claude/skills/context-compressor/scripts/benchmark_toon_vs_json.py
```

## Success criteria

For most evals, the skill should:

1. reduce token count materially
2. keep the answer-supporting passages
3. expose insufficiency instead of hiding it
4. keep output formatting deterministic enough for repeated use
