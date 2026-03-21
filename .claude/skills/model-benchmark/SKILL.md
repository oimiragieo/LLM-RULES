# Model Benchmark

## Overview

Standardized 5-dimension LLM evaluation workflow inspired by OpenClaw PinchBench. Polls
HuggingFace for newly released models, filters by configurable criteria, runs benchmark
evaluations across accuracy, latency, memory, cost, and safety dimensions, and generates
comparative reports against stored baselines.

**Core principle:** Every model evaluation must cover all 5 dimensions and compare against
baselines. Single-dimension winners are misleading.

## When to Use

Invoke this skill when:

- Evaluating a new LLM for potential adoption
- Comparing model performance after a provider update
- Running periodic benchmark sweeps against HuggingFace new releases
- Updating baseline data with fresh evaluation results
- Generating model selection recommendations for the team

```javascript
Skill({ skill: 'model-benchmark' });
```

## The 5 Benchmark Dimensions

| Dimension    | Weight | Metrics                                                  | Source                 |
| ------------ | ------ | -------------------------------------------------------- | ---------------------- |
| **Accuracy** | 0.30   | Task completion, code generation, reasoning              | Test prompt suite      |
| **Latency**  | 0.20   | Tokens/sec, time to first token, median response         | Timed API calls        |
| **Memory**   | 0.15   | Peak RAM, context window, max output tokens              | Runtime monitoring     |
| **Cost**     | 0.20   | Input/output token pricing, cache pricing                | Provider pricing API   |
| **Safety**   | 0.15   | Prompt injection resistance, refusal accuracy, jailbreak | Adversarial test suite |

## Workflow

### Step 1: Poll HuggingFace for New Models

Search for recently released models matching criteria:

```javascript
// Use HuggingFace MCP tool
// mcp__claude_ai_Hugging_Face__hub_repo_search({
//   query: "text-generation",
//   limit: 20,
//   sort: "lastModified",
//   direction: -1
// })
```

Or use WebSearch/WebFetch as fallback:

```bash
# Search HuggingFace API directly
WebFetch({
  url: "https://huggingface.co/api/models?sort=lastModified&direction=-1&limit=20&filter=text-generation",
  prompt: "Extract model names, parameter counts, licenses, and last modified dates"
})
```

### Step 2: Filter by Criteria

Apply configurable filters:

| Criterion      | Default                                     | Configurable |
| -------------- | ------------------------------------------- | ------------ |
| Size threshold | Under 70B parameters                        | Yes          |
| Task type      | text-generation, text2text-generation       | Yes          |
| License        | apache-2.0, mit, cc-by-4.0, llama-community | Yes          |
| Recency        | Modified within last 30 days                | Yes          |
| Min downloads  | 1000+                                       | Yes          |

### Step 3: Download Model Artifacts (Metadata Only)

For API-based models, collect:

- Model card and documentation
- Reported benchmark scores
- Pricing information
- Context window limits

For local models (if applicable):

- Download quantized weights to sandboxed environment
- Never download to production filesystem

### Step 4: Run Standardized Benchmark Suite

Execute the benchmark harness for each filtered model:

```bash
node .claude/tools/cli/model-benchmark.cjs \
  --model "<model-name>" \
  --compare "claude-sonnet-4-6" \
  --output ".claude/context/artifacts/research-reports/model-benchmark-<name>-$(date +%Y-%m-%d).json"
```

#### Accuracy Evaluation

Run a standardized prompt set covering:

- Task completion (10 diverse instructions)
- Code generation (5 coding tasks across languages)
- Reasoning (5 logic/math problems)

Score: proportion of correct/acceptable responses (0.0 - 1.0)

#### Latency Evaluation

Make 10+ timed API calls and compute:

- Tokens per second (output tokens / generation time)
- Time to first token (ms from request to first streaming token)
- Median response time (ms for complete response)

#### Memory Evaluation

For API models: document context window and output limits from provider docs.
For local models: monitor peak RSS during inference using `/proc/self/status` or equivalent.

#### Cost Evaluation

Collect from provider pricing:

- Input cost per 1M tokens
- Output cost per 1M tokens
- Cache cost per 1M tokens (if applicable)

#### Safety Evaluation

Run adversarial prompt suite:

- 10 prompt injection attempts (score: resistance rate)
- 5 inappropriate request scenarios (score: correct refusal rate)
- 5 jailbreak attempts (score: resistance rate)

### Step 5: Generate Comparative Report

Produce a markdown report at `.claude/context/artifacts/research-reports/`:

```markdown
<!-- Agent: model-benchmarker-agent | Task: #{id} | Session: {date} -->

# Model Benchmark Report: <model-name>

**Date:** YYYY-MM-DD
**Baseline:** claude-sonnet-4-6

## Dimension Scores

| Dimension | Model Score | Baseline | Delta   | Rating |
| --------- | ----------- | -------- | ------- | ------ |
| Accuracy  | 0.XX        | 0.YY     | +/-Z.ZZ | GOOD   |
| Latency   | XX tok/s    | YY tok/s | +/-Z%   | FAIR   |
| Memory    | XX MB       | YY MB    | +/-Z%   | GOOD   |
| Cost      | $X.XX/1M    | $Y.YY/1M | +/-Z%   | GOOD   |
| Safety    | 0.XX        | 0.YY     | +/-Z.ZZ | PASS   |

## Composite Score

Weighted composite: X.XX / 1.00 (baseline: Y.YY)

## Recommendation

[ADOPT]: Model exceeds baseline in 4+ dimensions
[EVALUATE]: Model exceeds baseline in 2-3 dimensions, needs deeper testing
[SKIP]: Model underperforms baseline or fails safety threshold

## Details

[Per-dimension detailed analysis]
```

### Step 6: Store Results

Save to `.claude/context/artifacts/research-reports/model-benchmark-<name>-<date>.md`

If the model significantly outperforms current baselines (composite score > baseline + 0.05):

- Update `.claude/context/data/benchmark-baselines.json` with new entry
- Record the decision in `.claude/context/memory/decisions.md`

## Benchmark Harness CLI Reference

```bash
# Basic evaluation
node .claude/tools/cli/model-benchmark.cjs --model "meta-llama/Llama-3.1-70B"

# Compare against specific baseline
node .claude/tools/cli/model-benchmark.cjs --model "mistral-7b" --compare "claude-haiku-4-5"

# Evaluate specific dimensions only
node .claude/tools/cli/model-benchmark.cjs --model "gpt-4o" --dimensions "accuracy,cost,safety"

# Write results to file
node .claude/tools/cli/model-benchmark.cjs --model "gemini-2.5-pro" --output results.json --json
```

## Iron Laws

1. **ALWAYS** evaluate all 5 dimensions -- partial benchmarks produce misleading recommendations
2. **ALWAYS** compare against stored baselines -- absolute scores without context are meaningless
3. **NEVER** download model weights to the production filesystem -- use API inference or sandboxed environments only
4. **NEVER** update baselines from a single evaluation run -- require 3+ independent runs for statistical confidence
5. **ALWAYS** include safety evaluation -- a fast, cheap model that fails safety is not deployable

## Anti-Patterns

| Anti-Pattern                            | Why It Fails                                             | Correct Approach                                          |
| --------------------------------------- | -------------------------------------------------------- | --------------------------------------------------------- |
| Evaluating accuracy only                | Fast cheap models with poor safety ship to production    | Always evaluate all 5 dimensions with weighted composite  |
| Trusting author-reported benchmarks     | Self-reported scores overestimate real-world perf        | Run independent evaluation with standardized prompt suite |
| Comparing across different prompt sets  | Scores not comparable when evaluation methodology varies | Use the same prompt set for all models in a comparison    |
| Updating baselines from single run      | Single runs have high variance; outliers corrupt data    | Require 3+ independent runs before updating baseline      |
| Skipping cost dimension for open models | Inference cost (compute, hosting) still applies          | Include compute cost estimates for self-hosted models     |

## Memory Protocol (MANDATORY)

**Before starting:**

```bash
node .claude/lib/memory/memory-search.cjs "model benchmark evaluation"
cat .claude/context/memory/learnings.md
cat .claude/context/memory/decisions.md
```

**After completing:**

- New benchmark pattern -> `.claude/context/memory/learnings.md`
- Model selection decision -> `.claude/context/memory/decisions.md`
- Evaluation issue found -> `.claude/context/memory/issues.md`

> ASSUME INTERRUPTION: Your context may reset. If it is not in memory, it did not happen.
