# ML Features Guide

**Version:** 1.0.0
**Last Updated:** 2026-01-30
**Target Audience:** Developers working with Phase 5 ML features

---

## Table of Contents

1. [Pattern Detection](#pattern-detection)
2. [Cost Prediction](#cost-prediction)
3. [Adaptive Execution](#adaptive-execution)
4. [Pattern Library](#pattern-library)

---

## Overview

Phase 5 ML features provide machine learning capabilities integrated into the workflow engine. These features analyze workflow execution patterns, predict costs, and optimize execution based on learned patterns.

**Feature Flags:**

All ML features are controlled by environment variables:

```bash
PATTERN_DETECTION_ENABLED=true
COST_PREDICTION_ENABLED=true
ADAPTIVE_EXECUTION_ENABLED=true
PERFORMANCE_PROFILING_ENABLED=true
PATTERN_LIBRARY_ENABLED=true
```

**Location:** `.claude/lib/ml/`

**Integration Point:** `.claude/lib/workflow/workflow-engine.cjs`

---

## Pattern Detection

### What Patterns Are Detected

The Pattern Detector identifies recurring task sequences in workflow execution history. Detected patterns include:

**Successful Task Sequences:**
- Tasks that frequently execute together successfully
- Common execution orders (A then B then C)
- Tasks that tend to complete faster when grouped

**Bottleneck Patterns:**
- Tasks that frequently cause delays
- Sequences where failures cluster
- Long-running task combinations

**Optimization Opportunities:**
- Independent tasks that could run in parallel
- Repeated identical operations (cache candidates)
- Redundant task sequences

### How Pattern Detection Works

Pattern detection uses N-gram analysis and frequency counting:

**Step 1: N-gram Generation**

The detector generates all possible subsequences of task types:

```
Workflow: [A, B, C, D]
2-grams: [A->B, B->C, C->D]
3-grams: [A->B->C, B->C->D]
4-grams: [A->B->C->D]
```

**Step 2: Frequency Counting**

Each pattern is counted across all workflows:

```javascript
candidates = {
  'A->B': 150,      // Appears in 150 workflows
  'B->C': 120,      // Appears in 120 workflows
  'A->B->C': 100    // Appears in 100 workflows
}
```

**Step 3: Support Filtering**

Patterns are filtered by support threshold:

```javascript
// minSupport = 0.1 means pattern must appear in 10% of workflows
// With 1000 workflows, pattern needs 100+ occurrences
if (count / totalWorkflows >= minSupport) {
  // Pattern is frequent
}
```

**Step 4: Result Bounding**

Results are bounded to prevent memory exhaustion:

```javascript
// MAX_RESULT_SIZE = 500
return frequentPatterns.slice(0, MAX_RESULT_SIZE);
```

### Using Pattern Detection in Workflows

**Basic Usage:**

```javascript
const { getPatternDetector } = require('.claude/lib/ml');

// Get detector instance (null if feature disabled)
const detector = getPatternDetector({
  minSupport: 0.1,      // 10% frequency threshold
  minConfidence: 0.6    // 60% confidence threshold
});

if (detector) {
  // Detect patterns in workflow history
  const patterns = detector.detectFrequentSequences(workflows);

  // Process patterns
  for (const pattern of patterns) {
    console.log(`Pattern: ${pattern.pattern}`);
    console.log(`Support: ${(pattern.support * 100).toFixed(1)}%`);
    console.log(`Count: ${pattern.count}`);
  }
}
```

**Detecting Bottlenecks:**

```javascript
const bottlenecks = detector.detectBottleneckPatterns(workflows, {
  minDurationMs: 1000,  // Only consider tasks >1s
  topN: 10              // Return top 10 bottlenecks
});

for (const bottleneck of bottlenecks) {
  console.log(`Bottleneck: ${bottleneck.taskType}`);
  console.log(`Avg Duration: ${bottleneck.avgDuration}ms`);
  console.log(`Frequency: ${bottleneck.frequency}`);
}
```

### Pattern Detector API Reference

```javascript
class WorkflowPatternDetector {
  /**
   * Create pattern detector instance.
   * @param {Object} config - Configuration options
   * @param {number} config.minSupport - Minimum support threshold (0-1)
   * @param {number} config.minConfidence - Minimum confidence threshold (0-1)
   */
  constructor(config = {})

  /**
   * Detect frequent task sequences in workflows.
   * @param {Object[]} workflows - Array of workflow records
   * @param {Object} options - Detection options
   * @param {number} options.maxPatternLength - Maximum N-gram length
   * @returns {Object[]} Array of patterns sorted by support
   */
  detectFrequentSequences(workflows, options = {})

  /**
   * Detect bottleneck patterns in workflows.
   * @param {Object[]} workflows - Array of workflow records
   * @param {Object} options - Detection options
   * @returns {Object[]} Array of bottleneck patterns
   */
  detectBottleneckPatterns(workflows, options = {})
}
```

**Configuration Parameters:**

| Parameter | Default | Description |
|-----------|---------|-------------|
| `PATTERN_MIN_SUPPORT` | 0.1 | Minimum pattern frequency (10%) |
| `PATTERN_MIN_CONFIDENCE` | 0.6 | Minimum pattern confidence (60%) |
| `MAX_INPUT_WORKFLOWS` | 5000 | Maximum workflows to process |
| `MAX_RESULT_SIZE` | 500 | Maximum patterns returned |
| `MAX_CANDIDATES` | 10000 | Maximum candidate patterns |

---

## Cost Prediction

### Token Estimation

The Cost Predictor estimates LLM token counts from text:

**Character-Based Estimation:**

```javascript
// Rough estimation: ~4 characters per token for English
const CHARS_PER_TOKEN = 4;

estimateTokens(text, options = {}) {
  const baseTokens = Math.ceil(text.length / CHARS_PER_TOKEN);

  if (options.includeSystemOverhead) {
    return baseTokens + 500;  // ~500 tokens for system prompt
  }

  return baseTokens;
}
```

**Usage:**

```javascript
const { getCostPredictor } = require('.claude/lib/ml');

const predictor = getCostPredictor();

if (predictor) {
  // Estimate tokens for a prompt
  const tokens = predictor.estimateTokens(promptText, {
    includeSystemOverhead: true
  });

  console.log(`Estimated tokens: ${tokens}`);
}
```

### Model Accuracy

Token estimation accuracy depends on:

**Factors Affecting Accuracy:**

| Factor | Impact | Notes |
|--------|--------|-------|
| Language | High | English ~4 chars/token, code varies |
| Content Type | Medium | Code has more symbols, prose is regular |
| Formatting | Low | Markdown adds ~5% overhead |
| System Prompts | Fixed | ~500 tokens constant overhead |

**Accuracy Expectations:**

- Simple English text: +/- 15%
- Code: +/- 25%
- Mixed content: +/- 20%

**Improving Accuracy:**

For critical cost tracking, measure actual vs predicted:

```javascript
// Track actual usage from API response
const actualTokens = response.usage.input_tokens + response.usage.output_tokens;
const predicted = predictor.estimateTokens(input);

// Log accuracy for monitoring
const accuracy = (predicted / actualTokens) * 100;
console.log(`Prediction accuracy: ${accuracy.toFixed(1)}%`);
```

### Using Cost Prediction for Optimization

**Pre-Execution Cost Check:**

```javascript
const estimatedCost = predictor.estimateCost(
  inputTokens,
  outputTokens,
  'claude-sonnet-4-20250514'
);

if (estimatedCost > budgetLimit) {
  console.warn(`Estimated cost $${estimatedCost} exceeds budget`);
  // Consider using smaller model or chunking
}
```

**Cost Budget Alerting:**

```javascript
const predictor = getCostPredictor({
  budgetAlertThreshold: 10.00  // Alert at $10
});

predictor.on('budgetAlert', (data) => {
  console.warn(`Budget alert: $${data.currentCost} spent`);
});
```

### Cost Predictor API Reference

```javascript
class CostPredictor {
  /**
   * Create cost predictor instance.
   * @param {Object} config - Configuration options
   * @param {number} config.budgetAlertThreshold - Alert threshold in USD
   */
  constructor(config = {})

  /**
   * Estimate token count from text.
   * @param {string} text - Text to estimate
   * @param {Object} options - Estimation options
   * @param {boolean} options.includeSystemOverhead - Include system tokens
   * @returns {number} Estimated token count
   */
  estimateTokens(text, options = {})

  /**
   * Estimate cost from token counts.
   * @param {number} inputTokens - Input token count
   * @param {number} outputTokens - Output token count
   * @param {string} model - Model identifier
   * @returns {number} Estimated cost in USD
   */
  estimateCost(inputTokens, outputTokens, model)
}
```

**Model Pricing (per million tokens):**

| Model | Input | Output |
|-------|-------|--------|
| claude-opus-4-20250514 | $15.00 | $75.00 |
| claude-sonnet-4-20250514 | $3.00 | $15.00 |
| claude-haiku-3-5-20241022 | $0.25 | $1.25 |

**Configuration Parameters:**

| Parameter | Default | Description |
|-----------|---------|-------------|
| `COST_BUDGET_ALERT_USD` | 10.00 | Budget alert threshold |

---

## Adaptive Execution

### How Adaptation Works

The Adaptive Executor applies optimizations based on detected patterns:

**Optimization Types:**

1. **Parallelization:** Run independent tasks concurrently
2. **Caching:** Cache results of repeated operations
3. **Batching:** Group similar tasks for efficiency
4. **Reordering:** Optimal task execution order

**Adaptation Process:**

```
1. Analyze detected patterns
   |
   v
2. Identify optimization opportunities
   - Independent tasks → Parallelize
   - Repeated tasks → Cache
   - Similar tasks → Batch
   |
   v
3. Generate optimization plan
   |
   v
4. Apply to workflow execution
```

### Success Metrics

Track adaptation effectiveness:

**Latency Reduction:**
```javascript
// Before optimization
const baselineDuration = 10000;  // 10 seconds

// After optimization
const optimizedDuration = 6000;  // 6 seconds

const latencyReduction = ((baselineDuration - optimizedDuration) / baselineDuration) * 100;
// 40% reduction
```

**Cost Savings:**
```javascript
// Before: Sequential execution
const sequentialCost = 0.50;

// After: Cached repeated calls
const optimizedCost = 0.35;

const costSavings = ((sequentialCost - optimizedCost) / sequentialCost) * 100;
// 30% savings
```

### Enabling/Disabling Adaptive Execution

**Enable:**
```bash
ADAPTIVE_EXECUTION_ENABLED=true
pm2 restart agent-studio
```

**Disable:**
```bash
ADAPTIVE_EXECUTION_ENABLED=false
pm2 restart agent-studio
```

**Runtime Check:**
```javascript
const { ML_FEATURES } = require('.claude/lib/ml');

if (ML_FEATURES.ADAPTIVE_EXECUTION) {
  // Adaptive execution is enabled
}
```

### Adaptive Executor API Reference

```javascript
class AdaptiveExecutor {
  /**
   * Create adaptive executor instance.
   * @param {Object} config - Configuration options
   * @param {number} config.maxConcurrency - Maximum parallel tasks
   */
  constructor(config = {})

  /**
   * Generate optimizations from detected patterns.
   * @param {Object[]} patterns - Detected patterns
   * @returns {Object[]} Optimization recommendations
   */
  generateOptimizations(patterns)

  /**
   * Apply optimizations to workflow.
   * @param {Object} workflow - Workflow to optimize
   * @param {Object[]} optimizations - Optimizations to apply
   * @returns {Object} Optimized workflow
   */
  applyOptimizations(workflow, optimizations)

  /**
   * Execute tasks with adaptive concurrency.
   * @param {Object[]} tasks - Tasks to execute
   * @param {Object} options - Execution options
   * @returns {Object[]} Task results
   */
  executeAdaptive(tasks, options = {})
}
```

**Configuration Parameters:**

| Parameter | Default | Description |
|-----------|---------|-------------|
| `ADAPTIVE_MAX_CONCURRENCY` | 10 | Maximum parallel tasks |

---

## Pattern Library

### Pattern Persistence

The Pattern Library stores detected patterns for reuse across sessions:

**Storage Location:** `.claude/lib/ml/patterns.json`

**Storage Format:**
```json
{
  "patterns": [
    {
      "id": "pattern-001",
      "pattern": "A->B->C",
      "support": 0.15,
      "count": 150,
      "lastSeen": "2026-01-30T10:00:00Z",
      "metadata": {
        "avgDuration": 5000,
        "successRate": 0.95
      }
    }
  ],
  "metadata": {
    "version": "1.0.0",
    "lastUpdated": "2026-01-30T10:00:00Z",
    "patternCount": 500
  }
}
```

### Pattern Reuse

**How Patterns Are Applied:**

1. **Matching:** New workflows are matched against stored patterns
2. **Recommendation:** Matching patterns suggest optimizations
3. **Learning:** Execution results update pattern statistics

```javascript
// When a new workflow starts
const matches = patternLibrary.matchPatterns(workflow);

for (const match of matches) {
  console.log(`Matched pattern: ${match.pattern}`);
  console.log(`Historical success rate: ${match.successRate}`);
  console.log(`Recommended optimization: ${match.optimization}`);
}
```

### Library Statistics

**Coverage:**
- Percentage of workflows with matching patterns
- Indicates how well the library covers common cases

**Effectiveness:**
- Success rate of pattern-based optimizations
- Latency improvement from cached patterns

```javascript
const stats = patternLibrary.getStatistics();

console.log(`Total patterns: ${stats.patternCount}`);
console.log(`Coverage: ${stats.coverage}%`);
console.log(`Hit rate: ${stats.hitRate}%`);
console.log(`Avg improvement: ${stats.avgImprovement}%`);
```

### Pattern Library API Reference

```javascript
class PatternLibrary {
  /**
   * Create pattern library instance.
   * @param {Object} config - Configuration options
   * @param {number} config.maxSize - Maximum patterns to store
   */
  constructor(config = {})

  /**
   * Add pattern to library.
   * @param {Object} pattern - Pattern to add
   */
  addPattern(pattern)

  /**
   * Match workflow against stored patterns.
   * @param {Object} workflow - Workflow to match
   * @returns {Object[]} Matching patterns
   */
  matchPatterns(workflow)

  /**
   * Get library statistics.
   * @returns {Object} Statistics object
   */
  getStatistics()

  /**
   * Save library to disk.
   */
  async save()

  /**
   * Load library from disk.
   */
  async load()

  /**
   * Clear all patterns.
   */
  clear()
}
```

**Configuration Parameters:**

| Parameter | Default | Description |
|-----------|---------|-------------|
| `PATTERN_LIBRARY_MAX_SIZE` | 1000 | Maximum stored patterns |

---

## Integration with Workflow Engine

### ML Hooks in WorkflowEngine

The WorkflowEngine integrates ML features at three points:

**1. Pre-Execution: Cost Estimation**

```javascript
// workflow-engine.cjs line 949-954
async execute(context = {}) {
  if (this.ml.costPredictor) {
    const estimatedCost = this._estimateWorkflowCost(context);
    console.log(`Estimated cost: $${estimatedCost.toFixed(4)}`);
  }
  // ... execute workflow
}
```

**2. Post-Execution: Pattern Recording**

```javascript
// workflow-engine.cjs line 965-968
// After successful completion
if (this.ml.patternDetector) {
  this._recordExecutionPattern();
}
```

**3. Post-Execution: Optimization Generation**

```javascript
// workflow-engine.cjs line 970-972
if (this.ml.optimizationEngine) {
  this._generateOptimizations();
}
```

### Graceful Degradation

All ML features degrade gracefully:

```javascript
// ML module initialization (workflow-engine.cjs line 461-488)
_initializeMLModules() {
  try {
    if (ML_FEATURES.PATTERN_DETECTION) {
      this.ml.patternDetector = getPatternDetector();
    }
    // ... other modules
  } catch (error) {
    console.warn('Failed to initialize ML modules:', error.message);
    // Continue without ML features
    this.ml.enabled = false;
  }
}
```

If ML initialization fails, the workflow engine continues operating without ML features.

---

## Memory Budgets

### ML Module Memory Limits

| Module | Budget | Enforcement |
|--------|--------|-------------|
| PatternDetector | 500KB | MAX_CANDIDATES=10000 |
| CostPredictor | Stateless | Per-call estimation |
| AdaptiveExecutor | 1MB | Bounded optimization history |
| PatternLibrary | 2MB | PATTERN_LIBRARY_MAX_SIZE=1000 |
| **Total ML** | **3.5MB** | Within 4GB heap |

### Preventing Memory Issues

```javascript
// Pattern detector: Input validation
if (workflows.length > MAX_INPUT_WORKFLOWS) {
  workflows = workflows.slice(-MAX_INPUT_WORKFLOWS);  // Keep recent
}

// Pattern library: LRU eviction
if (this.patterns.length >= this.maxSize) {
  // Remove least recently used pattern
  this.patterns.shift();
}
```

---

## Troubleshooting

### ML Features Not Working

**Check 1: Feature Flags**

```bash
env | grep -E '(PATTERN|COST|ADAPTIVE|PERFORMANCE|PATTERN_LIBRARY)_ENABLED'
```

All should be `=true` for features to work.

**Check 2: Module Loading**

```bash
grep "ML modules initialized" /var/log/agent-studio/app.log
```

Should show all modules loaded successfully.

**Check 3: Health Endpoint**

```bash
curl -s http://localhost:3000/api/health/ml | jq '.'
```

All modules should show `"status": "OK"`.

### High ML Latency

**Check 1: Pattern Library Size**

```bash
ls -lh .claude/lib/ml/patterns.json
```

If >10MB, clean up old patterns.

**Check 2: Input Size**

Large workflow histories can cause slow detection. Limit input:

```javascript
const recentWorkflows = workflows.slice(-1000);  // Last 1000 only
```

### ML Module Errors

**Pattern Detector Errors:**

```bash
grep "Pattern" /var/log/agent-studio/app.log | grep -i error
```

Common causes:
- Corrupted pattern library
- Invalid workflow format
- Memory exhaustion

**Recovery:**

```bash
# Backup and reset pattern library
cp .claude/lib/ml/patterns.json .claude/lib/ml/patterns.json.bak
echo '{"patterns":[],"metadata":{}}' > .claude/lib/ml/patterns.json
pm2 restart agent-studio
```

---

## Quick Reference

### Environment Variables

```bash
# Feature enablement
PATTERN_DETECTION_ENABLED=true|false
COST_PREDICTION_ENABLED=true|false
ADAPTIVE_EXECUTION_ENABLED=true|false
PERFORMANCE_PROFILING_ENABLED=true|false
PATTERN_LIBRARY_ENABLED=true|false

# Configuration
PATTERN_MIN_SUPPORT=0.1
PATTERN_MIN_CONFIDENCE=0.6
ADAPTIVE_MAX_CONCURRENCY=10
COST_BUDGET_ALERT_USD=10.00
PATTERN_LIBRARY_MAX_SIZE=1000
```

### Key Files

| File | Purpose |
|------|---------|
| `.claude/lib/ml/index.cjs` | ML entry point |
| `.claude/lib/ml/pattern-detector.cjs` | Pattern detection |
| `.claude/lib/ml/cost-predictor.cjs` | Cost prediction |
| `.claude/lib/ml/adaptive-executor.cjs` | Adaptive execution |
| `.claude/lib/ml/optimization-engine.cjs` | Optimization |
| `.claude/lib/ml/patterns.json` | Pattern storage |

### Feature Flag Rollback

```bash
# Disable all ML features (<1 minute)
export PATTERN_DETECTION_ENABLED=false
export COST_PREDICTION_ENABLED=false
export ADAPTIVE_EXECUTION_ENABLED=false
export PERFORMANCE_PROFILING_ENABLED=false
export PATTERN_LIBRARY_ENABLED=false
pm2 restart agent-studio
```

---

**Document Version:** 1.0.0
**Last Updated:** 2026-01-30
**Maintainer:** ML Platform Team
