# Phase 5: ML Architecture Design

**Version:** 1.0
**Status:** DRAFT
**Author:** Planner Agent (Task #26)
**Date:** 2026-01-30
**Related:** phase-5-implementation-plan.md

---

## 1. Executive Summary

This document defines the machine learning architecture for Phase 5 of Agent-Studio. The architecture is designed for:

- **Lightweight operation**: Pure JavaScript/Node.js implementation, no Python dependencies
- **Incremental learning**: Models improve as more data is collected
- **Explainability**: All recommendations include reasoning and evidence
- **Fail-safe operation**: Graceful degradation when ML features are unavailable
- **Privacy-first**: Training data stays local, no external model calls

### Architecture Principles

| Principle         | Description                                                        |
| ----------------- | ------------------------------------------------------------------ |
| **Edge ML**       | All inference runs locally in Node.js                              |
| **Hybrid Models** | Mix of statistical (Z-score) and ML (clustering) approaches        |
| **Interpretable** | Prefer explainable models (decision trees, rules) over black boxes |
| **Incremental**   | Support online learning and incremental updates                    |
| **Modular**       | Each ML component is independently testable and replaceable        |

---

## 2. Model Selection & Justification

### 2.1 Model Overview

| Component                | Model Type                 | Library                 | Rationale                                       |
| ------------------------ | -------------------------- | ----------------------- | ----------------------------------------------- |
| **Workflow Clustering**  | K-Means                    | TensorFlow.js or Custom | Group similar workflows for pattern discovery   |
| **Sequence Mining**      | Apriori/FP-Growth          | Custom JS               | Extract "if A then B" rules from task sequences |
| **Sequence Prediction**  | Markov Chain               | Custom JS               | Predict next likely agent/tool                  |
| **Anomaly Detection**    | Z-Score + Isolation Forest | Custom JS               | Statistical + ML hybrid                         |
| **Resource Prediction**  | Linear Regression          | Custom JS               | Simple, interpretable token/memory prediction   |
| **Model Recommendation** | Decision Tree              | Custom JS               | Explainable model selection                     |

### 2.2 Why TensorFlow.js (When Used)

**Pros:**

- Pure JavaScript, runs in Node.js without Python
- GPU acceleration available via WebGL/WASM
- Pre-built operations for common ML tasks
- Active community and documentation

**Cons:**

- Larger bundle size (~5MB)
- Learning curve for tensor operations
- Overkill for simple statistical models

**Decision:** Use TensorFlow.js only for complex models (K-Means clustering). Use custom JS implementations for simpler models (linear regression, decision trees, Markov chains).

### 2.3 Why Custom Implementations

For simpler models, custom implementations offer:

- **Smaller footprint**: No large dependencies
- **Full control**: Customize for our specific use case
- **Transparency**: Easier to debug and explain
- **Performance**: Optimized for our data shapes

---

## 3. Component Architecture

### 3.1 Pattern Detection Engine (SPEC-023)

```
┌─────────────────────────────────────────────────────────────────────┐
│                    Pattern Detection Engine                         │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  ┌─────────────────┐                                                │
│  │   Data Layer    │                                                │
│  └────────┬────────┘                                                │
│           │                                                         │
│           v                                                         │
│  ┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐ │
│  │ MetricsCollector│    │DistributedTracer│    │ PerformanceProf │ │
│  │     Stream      │    │     Stream      │    │     Stream      │ │
│  └────────┬────────┘    └────────┬────────┘    └────────┬────────┘ │
│           └──────────────────────┼──────────────────────┘           │
│                                  v                                  │
│                    ┌─────────────────────────┐                      │
│                    │    Feature Engineer     │                      │
│                    │    ─────────────────    │                      │
│                    │ • Sequence extraction   │                      │
│                    │ • Timing normalization  │                      │
│                    │ • Error aggregation     │                      │
│                    │ • Dimensionality reduce │                      │
│                    └───────────┬─────────────┘                      │
│                                │                                    │
│           ┌────────────────────┼────────────────────┐               │
│           │                    │                    │               │
│           v                    v                    v               │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐     │
│  │   K-Means       │  │ Association     │  │  Markov Chain   │     │
│  │   Clustering    │  │ Rules Mining    │  │  Predictor      │     │
│  │   ───────────   │  │ ───────────     │  │  ───────────    │     │
│  │ • Workflow      │  │ • Apriori       │  │ • Transition    │     │
│  │   similarity    │  │ • Min support   │  │   probabilities │     │
│  │ • Cluster       │  │ • Confidence    │  │ • State         │     │
│  │   centroids     │  │   threshold     │  │   prediction    │     │
│  │ • K selection   │  │ • Rule pruning  │  │ • Sequence      │     │
│  │   (elbow)       │  │                 │  │   generation    │     │
│  └────────┬────────┘  └────────┬────────┘  └────────┬────────┘     │
│           │                    │                    │               │
│           └────────────────────┼────────────────────┘               │
│                                v                                    │
│                    ┌─────────────────────────┐                      │
│                    │    Pattern Aggregator   │                      │
│                    │    ─────────────────    │                      │
│                    │ • Merge cluster insights│                      │
│                    │ • Rank association rules│                      │
│                    │ • Generate predictions  │                      │
│                    │ • Confidence scoring    │                      │
│                    └───────────┬─────────────┘                      │
│                                │                                    │
│                                v                                    │
│                    ┌─────────────────────────┐                      │
│                    │    Pattern Insights     │                      │
│                    │    ─────────────────    │                      │
│                    │ {                       │                      │
│                    │   clusters: [...],      │                      │
│                    │   rules: [...],         │                      │
│                    │   predictions: [...],   │                      │
│                    │   bottlenecks: [...]    │                      │
│                    │ }                       │                      │
│                    └─────────────────────────┘                      │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

#### 3.1.1 Feature Engineering

**Input:** Raw metrics, traces, profiles
**Output:** Normalized feature vectors

```javascript
// Feature vector for workflow clustering
const workflowFeatures = {
  // Sequence features
  agentSequence: ['planner', 'developer', 'qa'], // Categorical -> one-hot
  toolSequence: ['Read', 'Edit', 'Bash', 'Write'], // Categorical -> one-hot
  sequenceLength: 4, // Numeric

  // Timing features (normalized 0-1)
  totalDuration: 0.65,
  avgAgentDuration: 0.32,
  maxAgentDuration: 0.81,
  stdAgentDuration: 0.12,

  // Error features
  errorCount: 0,
  errorRate: 0.0,
  errorCategories: [], // One-hot

  // Resource features (normalized 0-1)
  totalTokens: 0.45,
  maxMemory: 0.23,
  checkpointCount: 3,
};
```

**Normalization Strategy:**

- **Min-Max Normalization**: For bounded metrics (0-1 range)
- **Z-Score Normalization**: For unbounded metrics (mean=0, std=1)
- **One-Hot Encoding**: For categorical features (agent types, tools)
- **Sequence Embedding**: For variable-length sequences (pad/truncate to fixed length)

#### 3.1.2 K-Means Clustering

**Purpose:** Group similar workflows to identify patterns

```javascript
class WorkflowClusterer {
  constructor(k = 5, maxIterations = 100) {
    this.k = k;
    this.maxIterations = maxIterations;
    this.centroids = [];
  }

  fit(features) {
    // 1. Initialize centroids (K-Means++)
    this.centroids = this._initCentroids(features);

    // 2. Iterate until convergence
    for (let i = 0; i < this.maxIterations; i++) {
      // Assign points to nearest centroid
      const assignments = this._assignClusters(features);

      // Update centroids
      const newCentroids = this._updateCentroids(features, assignments);

      // Check convergence
      if (this._hasConverged(newCentroids)) break;
      this.centroids = newCentroids;
    }

    return this;
  }

  predict(features) {
    return this._assignClusters(features);
  }

  // Elbow method for optimal K
  static findOptimalK(features, maxK = 10) {
    const inertias = [];
    for (let k = 1; k <= maxK; k++) {
      const clusterer = new WorkflowClusterer(k);
      clusterer.fit(features);
      inertias.push({ k, inertia: clusterer._calculateInertia(features) });
    }
    return this._findElbow(inertias);
  }
}
```

**Cluster Interpretation:**

- Cluster 0: "Quick fixes" (short duration, developer-only)
- Cluster 1: "Full feature" (planner → developer → qa)
- Cluster 2: "Architecture changes" (architect → developer → security)
- Cluster 3: "Documentation" (technical-writer only)
- Cluster 4: "Incident response" (incident-responder → devops)

#### 3.1.3 Association Rule Mining

**Purpose:** Find "if A then B" patterns in task sequences

```javascript
class AssociationRuleMiner {
  constructor(minSupport = 0.1, minConfidence = 0.6) {
    this.minSupport = minSupport;
    this.minConfidence = minConfidence;
  }

  mine(sequences) {
    // 1. Find frequent itemsets using Apriori
    const frequentItemsets = this._apriori(sequences);

    // 2. Generate association rules
    const rules = this._generateRules(frequentItemsets);

    // 3. Filter by confidence
    return rules.filter(r => r.confidence >= this.minConfidence);
  }

  _apriori(sequences) {
    const itemsets = [];
    let candidates = this._getUniqueItems(sequences);

    while (candidates.length > 0) {
      // Count support for each candidate
      const supported = candidates.filter(
        c => this._calculateSupport(c, sequences) >= this.minSupport
      );

      if (supported.length === 0) break;
      itemsets.push(...supported);

      // Generate next level candidates
      candidates = this._generateCandidates(supported);
    }

    return itemsets;
  }
}

// Example output:
// {
//   antecedent: ['planner'],
//   consequent: ['developer'],
//   support: 0.75,
//   confidence: 0.92,
//   lift: 1.15
// }
```

#### 3.1.4 Markov Chain Predictor

**Purpose:** Predict next agent/tool based on current state

```javascript
class MarkovChainPredictor {
  constructor() {
    this.transitionMatrix = new Map();
    this.states = new Set();
  }

  fit(sequences) {
    // Build transition counts
    for (const seq of sequences) {
      for (let i = 0; i < seq.length - 1; i++) {
        const current = seq[i];
        const next = seq[i + 1];

        this.states.add(current);
        this.states.add(next);

        if (!this.transitionMatrix.has(current)) {
          this.transitionMatrix.set(current, new Map());
        }

        const transitions = this.transitionMatrix.get(current);
        transitions.set(next, (transitions.get(next) || 0) + 1);
      }
    }

    // Convert counts to probabilities
    this._normalizeProbabilities();
  }

  predict(currentState, topK = 3) {
    const transitions = this.transitionMatrix.get(currentState);
    if (!transitions) return [];

    return Array.from(transitions.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, topK)
      .map(([state, prob]) => ({ state, probability: prob }));
  }
}

// Example:
// predictor.predict('planner')
// => [
//   { state: 'developer', probability: 0.75 },
//   { state: 'architect', probability: 0.15 },
//   { state: 'qa', probability: 0.10 }
// ]
```

---

### 3.2 Anomaly Detection System (SPEC-025)

```
┌─────────────────────────────────────────────────────────────────────┐
│                   Anomaly Detection System                          │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  ┌─────────────────┐                                                │
│  │  Metrics Stream │                                                │
│  │  (Real-time)    │                                                │
│  └────────┬────────┘                                                │
│           │                                                         │
│           v                                                         │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │              Sliding Window Buffer (5 minutes)               │   │
│  │  ┌─────┬─────┬─────┬─────┬─────┬─────┬─────┬─────┬─────┐   │   │
│  │  │ t-9 │ t-8 │ t-7 │ t-6 │ t-5 │ t-4 │ t-3 │ t-2 │ t-1 │   │   │
│  │  └─────┴─────┴─────┴─────┴─────┴─────┴─────┴─────┴─────┘   │   │
│  └───────────────────────────┬─────────────────────────────────┘   │
│                              │                                      │
│           ┌──────────────────┼──────────────────┐                   │
│           │                  │                  │                   │
│           v                  v                  v                   │
│  ┌─────────────────┐ ┌─────────────────┐ ┌─────────────────┐       │
│  │  Z-Score        │ │  Threshold      │ │  Pattern        │       │
│  │  Detector       │ │  Detector       │ │  Detector       │       │
│  │  ───────────    │ │  ───────────    │ │  ───────────    │       │
│  │ • Mean/StdDev   │ │ • Static limits │ │ • Sequence      │       │
│  │ • Rolling stats │ │ • Rate limits   │ │   anomalies     │       │
│  │ • Threshold: 3σ │ │ • Error caps    │ │ • Unusual       │       │
│  └────────┬────────┘ └────────┬────────┘ │   combinations  │       │
│           │                   │          └────────┬────────┘       │
│           │                   │                   │                 │
│           └───────────────────┼───────────────────┘                 │
│                               v                                     │
│                    ┌─────────────────────────┐                      │
│                    │    Anomaly Classifier   │                      │
│                    │    ─────────────────    │                      │
│                    │ • Deduplicate           │                      │
│                    │ • Assign severity       │                      │
│                    │ • Correlate with traces │                      │
│                    │ • Generate context      │                      │
│                    └───────────┬─────────────┘                      │
│                                │                                    │
│                                v                                    │
│                    ┌─────────────────────────┐                      │
│                    │   Anomaly Event         │                      │
│                    │   ─────────────         │                      │
│                    │ {                       │                      │
│                    │   type: 'LATENCY_SPIKE',│                      │
│                    │   severity: 'HIGH',     │                      │
│                    │   zscore: 4.2,          │                      │
│                    │   context: {...}        │                      │
│                    │ }                       │                      │
│                    └─────────────────────────┘                      │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

#### 3.2.1 Z-Score Detector

**Purpose:** Detect statistical outliers in time series metrics

```javascript
class ZScoreDetector {
  constructor(threshold = 3, windowSize = 100) {
    this.threshold = threshold;
    this.windowSize = windowSize;
    this.buffer = [];
  }

  addSample(value) {
    this.buffer.push(value);
    if (this.buffer.length > this.windowSize) {
      this.buffer.shift();
    }
  }

  isAnomaly(value) {
    if (this.buffer.length < 10) return { isAnomaly: false, reason: 'insufficient_data' };

    const mean = this._mean(this.buffer);
    const std = this._stdDev(this.buffer, mean);

    if (std === 0) return { isAnomaly: false, reason: 'zero_variance' };

    const zscore = (value - mean) / std;

    return {
      isAnomaly: Math.abs(zscore) > this.threshold,
      zscore,
      mean,
      std,
      threshold: this.threshold,
    };
  }

  _mean(arr) {
    return arr.reduce((a, b) => a + b, 0) / arr.length;
  }

  _stdDev(arr, mean) {
    const squaredDiffs = arr.map(v => Math.pow(v - mean, 2));
    return Math.sqrt(this._mean(squaredDiffs));
  }
}
```

#### 3.2.2 Threshold Detector

**Purpose:** Detect when metrics exceed predefined limits

```javascript
class ThresholdDetector {
  constructor(thresholds) {
    this.thresholds = thresholds;
  }

  check(metricName, value) {
    const threshold = this.thresholds[metricName];
    if (!threshold) return { isAnomaly: false };

    const anomalies = [];

    if (threshold.min !== undefined && value < threshold.min) {
      anomalies.push({ type: 'BELOW_MIN', value, min: threshold.min });
    }

    if (threshold.max !== undefined && value > threshold.max) {
      anomalies.push({ type: 'ABOVE_MAX', value, max: threshold.max });
    }

    if (threshold.rate !== undefined) {
      const rate = this._calculateRate(metricName, value);
      if (rate > threshold.rate) {
        anomalies.push({ type: 'RATE_EXCEEDED', rate, limit: threshold.rate });
      }
    }

    return {
      isAnomaly: anomalies.length > 0,
      anomalies,
    };
  }
}

// Default thresholds
const DEFAULT_THRESHOLDS = {
  task_duration_ms: { max: 600000 }, // 10 minutes
  error_rate: { max: 0.1 }, // 10%
  memory_mb: { max: 512 }, // 512MB
  token_usage: { max: 20000 }, // 20K tokens
  concurrent_tasks: { max: 10 },
};
```

#### 3.2.3 Pattern Detector

**Purpose:** Detect anomalous sequences and combinations

```javascript
class PatternAnomalyDetector {
  constructor(normalPatterns) {
    this.normalPatterns = normalPatterns; // Learned from SPEC-023
  }

  detect(sequence) {
    const anomalies = [];

    // Check for unusual agent sequences
    const similarity = this._sequenceSimilarity(sequence, this.normalPatterns);
    if (similarity < 0.5) {
      anomalies.push({
        type: 'UNUSUAL_SEQUENCE',
        sequence,
        similarity,
        closestPattern: this._findClosestPattern(sequence),
      });
    }

    // Check for forbidden patterns
    if (this._containsForbiddenPattern(sequence)) {
      anomalies.push({
        type: 'FORBIDDEN_PATTERN',
        sequence,
        forbiddenPart: this._extractForbiddenPart(sequence),
      });
    }

    return {
      isAnomaly: anomalies.length > 0,
      anomalies,
    };
  }

  // Levenshtein distance for sequence similarity
  _sequenceSimilarity(seq1, patterns) {
    const similarities = patterns.map(p => this._levenshtein(seq1, p));
    return Math.max(...similarities);
  }
}
```

---

### 3.3 Resource Prediction Models (SPEC-026)

```
┌─────────────────────────────────────────────────────────────────────┐
│                   Resource Prediction System                        │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  ┌─────────────────┐                                                │
│  │  Task Context   │                                                │
│  │  (Pre-spawn)    │                                                │
│  └────────┬────────┘                                                │
│           │                                                         │
│           v                                                         │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │                   Feature Extraction                         │   │
│  │  ┌───────────┐ ┌───────────┐ ┌───────────┐ ┌───────────┐    │   │
│  │  │Task Type  │ │Complexity │ │Historical │ │Context    │    │   │
│  │  │Features   │ │Score      │ │Patterns   │ │Size       │    │   │
│  │  └───────────┘ └───────────┘ └───────────┘ └───────────┘    │   │
│  └───────────────────────────┬─────────────────────────────────┘   │
│                              │                                      │
│           ┌──────────────────┼──────────────────┐                   │
│           │                  │                  │                   │
│           v                  v                  v                   │
│  ┌─────────────────┐ ┌─────────────────┐ ┌─────────────────┐       │
│  │  Token          │ │  Memory         │ │  Model          │       │
│  │  Predictor      │ │  Predictor      │ │  Recommender    │       │
│  │  ───────────    │ │  ───────────    │ │  ───────────    │       │
│  │ Linear          │ │ Random Forest   │ │ Decision Tree   │       │
│  │ Regression      │ │ (simplified)    │ │                 │       │
│  └────────┬────────┘ └────────┬────────┘ └────────┬────────┘       │
│           │                   │                   │                 │
│           └───────────────────┼───────────────────┘                 │
│                               v                                     │
│                    ┌─────────────────────────┐                      │
│                    │   Resource Prediction   │                      │
│                    │   ─────────────────     │                      │
│                    │ {                       │                      │
│                    │   tokens: 5200,         │                      │
│                    │   memory: 128,          │                      │
│                    │   model: 'sonnet',      │                      │
│                    │   confidence: 0.85,     │                      │
│                    │   reasoning: '...'      │                      │
│                    │ }                       │                      │
│                    └─────────────────────────┘                      │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

#### 3.3.1 Token Predictor (Linear Regression)

```javascript
class TokenPredictor {
  constructor() {
    this.weights = null;
    this.bias = 0;
  }

  fit(features, targets) {
    // Simple linear regression: y = Wx + b
    // Using normal equation: W = (X^T X)^-1 X^T y

    const X = this._addBiasTerm(features);
    const y = targets;

    // Compute (X^T X)^-1 X^T y
    const XtX = this._matMul(this._transpose(X), X);
    const XtXinv = this._inverse(XtX);
    const XtY = this._matMul(this._transpose(X), y);
    const weights = this._matMul(XtXinv, XtY);

    this.bias = weights[0];
    this.weights = weights.slice(1);
  }

  predict(features) {
    if (!this.weights) throw new Error('Model not trained');

    let prediction = this.bias;
    for (let i = 0; i < features.length; i++) {
      prediction += this.weights[i] * features[i];
    }

    return {
      tokens: Math.max(0, Math.round(prediction)),
      confidence: this._calculateConfidence(features),
      features: this._explainFeatures(features),
    };
  }
}

// Features for token prediction:
// [taskTypeEncoded, complexityScore, fileCount, toolCount, avgHistoricalTokens]
```

#### 3.3.2 Model Recommender (Decision Tree)

```javascript
class ModelRecommender {
  constructor() {
    this.tree = null;
  }

  fit(features, labels) {
    // Build decision tree using ID3/CART algorithm
    this.tree = this._buildTree(features, labels, 0);
  }

  predict(features) {
    if (!this.tree) throw new Error('Model not trained');

    const result = this._traverse(this.tree, features);

    return {
      model: result.label,
      confidence: result.confidence,
      reasoning: this._generateReasoning(features, result.path),
    };
  }

  _buildTree(features, labels, depth, maxDepth = 5) {
    // Base cases
    if (depth >= maxDepth || this._isPure(labels)) {
      return { type: 'leaf', label: this._majorityLabel(labels), confidence: this._purity(labels) };
    }

    // Find best split
    const { featureIndex, threshold, gain } = this._findBestSplit(features, labels);

    if (gain === 0) {
      return { type: 'leaf', label: this._majorityLabel(labels), confidence: this._purity(labels) };
    }

    // Split data
    const { leftFeatures, leftLabels, rightFeatures, rightLabels } = this._splitData(
      features,
      labels,
      featureIndex,
      threshold
    );

    return {
      type: 'node',
      featureIndex,
      threshold,
      featureName: FEATURE_NAMES[featureIndex],
      left: this._buildTree(leftFeatures, leftLabels, depth + 1, maxDepth),
      right: this._buildTree(rightFeatures, rightLabels, depth + 1, maxDepth),
    };
  }

  _generateReasoning(features, path) {
    // Generate human-readable reasoning
    return path.map(step => `${step.feature} ${step.comparison} ${step.value}`).join(' AND ');
  }
}

// Example reasoning:
// "complexity_score > 5 AND tool_count > 10 AND involves_security = true"
// => "Use opus model"
```

---

## 4. Training Pipeline

### 4.1 Data Collection

```
┌─────────────────────────────────────────────────────────────────────┐
│                     Training Data Pipeline                          │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  ┌─────────────┐   ┌─────────────┐   ┌─────────────┐               │
│  │  Metrics    │   │   Traces    │   │   Errors    │               │
│  │  Collector  │   │   Exporter  │   │   Logger    │               │
│  └──────┬──────┘   └──────┬──────┘   └──────┬──────┘               │
│         │                 │                 │                       │
│         └─────────────────┼─────────────────┘                       │
│                           v                                         │
│                ┌─────────────────────┐                              │
│                │   Data Aggregator   │                              │
│                │   ───────────────   │                              │
│                │ • Session grouping  │                              │
│                │ • Task alignment    │                              │
│                │ • Deduplication     │                              │
│                └──────────┬──────────┘                              │
│                           │                                         │
│                           v                                         │
│                ┌─────────────────────┐                              │
│                │   Training Store    │                              │
│                │   ───────────────   │                              │
│                │ training-data.jsonl │                              │
│                │ (append-only)       │                              │
│                └──────────┬──────────┘                              │
│                           │                                         │
│                           v                                         │
│                ┌─────────────────────┐                              │
│                │   Training Trigger  │                              │
│                │   ───────────────   │                              │
│                │ • Min samples: 100  │                              │
│                │ • Retrain interval  │                              │
│                │ • Data drift check  │                              │
│                └─────────────────────┘                              │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

### 4.2 Training Schedule

| Trigger        | Condition                   | Models Retrained               |
| -------------- | --------------------------- | ------------------------------ |
| **Initial**    | First 100 samples collected | All models                     |
| **Periodic**   | Every 24 hours              | Pattern detection, predictions |
| **Data Drift** | Distribution shift detected | Affected model only            |
| **Manual**     | CLI command                 | Specified model                |
| **On Error**   | Model accuracy drops >10%   | Affected model only            |

### 4.3 Model Versioning

```
.claude/lib/ml/data/models/
├── pattern-detector/
│   ├── v1.0.0/
│   │   ├── model.json          # Model weights
│   │   ├── metadata.json       # Training metadata
│   │   └── validation.json     # Validation results
│   └── v1.0.1/
│       └── ...
├── anomaly-detector/
│   └── v1.0.0/
│       └── ...
└── resource-predictor/
    └── v1.0.0/
        └── ...
```

### 4.4 A/B Testing Strategy

```javascript
// A/B test configuration
const AB_TEST_CONFIG = {
  'model-recommender': {
    enabled: true,
    variants: {
      control: { weight: 0.5, model: 'v1.0.0' },
      treatment: { weight: 0.5, model: 'v1.1.0' },
    },
    metrics: ['accuracy', 'user_override_rate', 'task_success_rate'],
    minSamples: 100,
    significance: 0.95,
  },
};
```

---

## 5. Inference Architecture

### 5.1 Real-Time Inference

```
┌─────────────────────────────────────────────────────────────────────┐
│                     Real-Time Inference Flow                        │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  ┌─────────────────┐                                                │
│  │  Task Spawn     │                                                │
│  │  Request        │                                                │
│  └────────┬────────┘                                                │
│           │                                                         │
│           v                                                         │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │                    Inference Router                          │   │
│  │  ┌───────────────────────────────────────────────────────┐  │   │
│  │  │ if (ML_FEATURES_ENABLED) {                            │  │   │
│  │  │   features = extractFeatures(taskContext);            │  │   │
│  │  │   prediction = modelRecommender.predict(features);    │  │   │
│  │  │   resources = resourcePredictor.predict(features);    │  │   │
│  │  │   return { model: prediction.model, ...resources };   │  │   │
│  │  │ } else {                                              │  │   │
│  │  │   return defaultConfig; // Fallback                   │  │   │
│  │  │ }                                                     │  │   │
│  │  └───────────────────────────────────────────────────────┘  │   │
│  └──────────────────────────┬──────────────────────────────────┘   │
│                             │                                       │
│                             v                                       │
│                ┌────────────────────────┐                           │
│                │   Inference Result     │                           │
│                │   ────────────────     │                           │
│                │ {                      │                           │
│                │   model: 'sonnet',     │                           │
│                │   tokens: 5200,        │                           │
│                │   memory: 128,         │                           │
│                │   confidence: 0.85,    │                           │
│                │   latency_ms: 3        │                           │
│                │ }                      │                           │
│                └────────────────────────┘                           │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

### 5.2 Performance Requirements

| Metric                | Target       | Measurement      |
| --------------------- | ------------ | ---------------- |
| **Inference Latency** | <10ms        | p99 latency      |
| **Model Load Time**   | <100ms       | Cold start       |
| **Memory Footprint**  | <50MB        | Per model        |
| **CPU Usage**         | <5% baseline | Average overhead |

### 5.3 Caching Strategy

```javascript
class InferenceCache {
  constructor(maxSize = 1000, ttlMs = 300000) {
    this.cache = new Map();
    this.maxSize = maxSize;
    this.ttlMs = ttlMs;
  }

  getOrCompute(key, computeFn) {
    const cached = this.cache.get(key);
    if (cached && Date.now() - cached.timestamp < this.ttlMs) {
      return { ...cached.value, cached: true };
    }

    const value = computeFn();
    this._set(key, value);
    return { ...value, cached: false };
  }

  _set(key, value) {
    if (this.cache.size >= this.maxSize) {
      // Evict oldest entry
      const oldestKey = this.cache.keys().next().value;
      this.cache.delete(oldestKey);
    }
    this.cache.set(key, { value, timestamp: Date.now() });
  }
}
```

---

## 6. Integration Points

### 6.1 Router Integration

```javascript
// In router-decision.md workflow, add ML recommendation step

// Step 6.5: ML Model Recommendation (if enabled)
if (process.env.ML_AUTO_MODEL === 'true') {
  const recommendation = await modelRecommender.predict({
    taskType: classifiedIntent,
    complexity: complexityScore,
    tools: estimatedTools,
    historical: taskHistory,
  });

  if (recommendation.confidence >= 0.8) {
    selectedModel = recommendation.model;
    spawnMetadata.mlRecommended = true;
  }
}
```

### 6.2 Task Spawn Hook

```javascript
// .claude/hooks/ml/pre-spawn-prediction.cjs
module.exports = {
  trigger: 'PreToolUse(Task)',
  execute: async input => {
    if (!process.env.ML_RESOURCE_PREDICTION) return input;

    const features = extractFeatures(input.toolInput.prompt);
    const prediction = resourcePredictor.predict(features);

    // Add prediction to spawn metadata
    input.toolInput.metadata = {
      ...input.toolInput.metadata,
      mlPrediction: prediction,
    };

    return input;
  },
};
```

### 6.3 Anomaly Detection Hook

```javascript
// .claude/hooks/ml/anomaly-hook.cjs
module.exports = {
  trigger: 'PostToolUse',
  execute: async (tool, params, result, context) => {
    if (!process.env.ML_ANOMALY_DETECTION) return;

    // Check for anomalies
    const metrics = extractMetrics(tool, result);
    const anomalyResult = anomalyDetector.check(metrics);

    if (anomalyResult.isAnomaly) {
      // Emit anomaly event
      eventBus.emit('anomaly_detected', {
        tool,
        anomaly: anomalyResult,
        context,
      });

      // Trigger self-healing if enabled
      if (process.env.ML_AUTO_HEAL) {
        await selfHealController.handle(anomalyResult, context);
      }
    }

    return { tool, params, result };
  },
};
```

---

## 7. Security Considerations

### 7.1 Model Security

| Threat                 | Mitigation                                  |
| ---------------------- | ------------------------------------------- |
| **Model Tampering**    | Checksum verification on model load         |
| **Adversarial Inputs** | Input validation, outlier detection         |
| **Data Poisoning**     | Training data validation, anomaly filtering |
| **Model Extraction**   | Models stored locally, not exposed via API  |

### 7.2 Data Privacy

| Data Type             | Privacy Measure                               |
| --------------------- | --------------------------------------------- |
| **Task Descriptions** | Hash before storage (not stored in plaintext) |
| **File Paths**        | Anonymize to relative paths                   |
| **User Information**  | Not collected                                 |
| **Error Messages**    | Sensitive data masking (existing)             |

### 7.3 Audit Logging

```javascript
// All ML decisions logged
const mlAuditLog = {
  timestamp: new Date().toISOString(),
  action: 'model_recommendation',
  input: { taskType: 'developer', complexity: 3.2 },
  output: { model: 'sonnet', confidence: 0.85 },
  mlVersion: '1.0.0',
  override: false,
  sessionId: process.env.CLAUDE_SESSION_ID,
};
```

---

## 8. Fallback Behavior

### 8.1 Graceful Degradation

```javascript
function getModelRecommendation(context) {
  // Level 1: Full ML prediction
  if (modelRecommender.isReady() && process.env.ML_AUTO_MODEL) {
    return modelRecommender.predict(context);
  }

  // Level 2: Rule-based fallback
  if (context.complexity > 7) return { model: 'opus', source: 'rule' };
  if (context.complexity < 3) return { model: 'haiku', source: 'rule' };
  return { model: 'sonnet', source: 'default' };
}
```

### 8.2 Cold Start Handling

```javascript
class PatternDetector {
  constructor(minSamples = 100) {
    this.minSamples = minSamples;
    this.samples = [];
    this.isTrained = false;
  }

  addSample(sample) {
    this.samples.push(sample);

    // Auto-train when threshold reached
    if (this.samples.length >= this.minSamples && !this.isTrained) {
      this.train();
    }
  }

  detect(context) {
    if (!this.isTrained) {
      return {
        patterns: [],
        status: 'cold_start',
        samplesNeeded: this.minSamples - this.samples.length,
      };
    }

    return this._detect(context);
  }
}
```

---

## 9. Testing Strategy

### 9.1 Unit Tests

| Component          | Test Coverage | Key Tests                                        |
| ------------------ | ------------- | ------------------------------------------------ |
| K-Means Clustering | 90%+          | Convergence, k selection, edge cases             |
| Association Rules  | 90%+          | Support/confidence calculation, pruning          |
| Markov Chain       | 90%+          | Transition probabilities, prediction accuracy    |
| Z-Score Detector   | 95%+          | Statistical correctness, window handling         |
| Linear Regression  | 95%+          | Normal equation, prediction accuracy             |
| Decision Tree      | 90%+          | Split selection, pruning, overfitting prevention |

### 9.2 Integration Tests

| Scenario                             | Expected Outcome                            |
| ------------------------------------ | ------------------------------------------- |
| **End-to-end pattern detection**     | Patterns extracted from 100+ task sequences |
| **Anomaly detection + healing**      | Anomaly injected -> detected -> healed      |
| **Resource prediction before spawn** | Prediction available, task succeeds         |
| **Model recommendation accuracy**    | A/B test shows improvement over baseline    |

### 9.3 Chaos Tests

| Injection            | Expected Response                       |
| -------------------- | --------------------------------------- |
| **Latency spike**    | Detected within 5s, alert generated     |
| **Error burst**      | Circuit breaker activated               |
| **Memory leak**      | Detected, context compression triggered |
| **Token exhaustion** | Early warning, checkpoint triggered     |

---

## 10. Appendix: Feature Engineering Details

### 10.1 Task Feature Vector

```javascript
const taskFeatures = {
  // Task type encoding (one-hot)
  taskType: [0, 1, 0, 0, 0], // [development, planning, qa, architecture, documentation]

  // Complexity indicators
  complexityScore: 4.2, // 1-10 scale
  fileCount: 5,
  toolCount: 8,
  dependencyCount: 2,

  // Historical features
  avgHistoricalDuration: 0.45, // Normalized
  avgHistoricalTokens: 0.32, // Normalized
  historicalSuccessRate: 0.95,

  // Context features
  contextSize: 0.6, // Normalized
  hasSecurityContext: 1, // Binary
  hasArchitectureContext: 0, // Binary
};
```

### 10.2 Sequence Feature Vector

```javascript
const sequenceFeatures = {
  // Agent sequence (padded to max length 10)
  agentSequence: ['planner', 'developer', 'qa', 'PAD', 'PAD', 'PAD', 'PAD', 'PAD', 'PAD', 'PAD'],

  // Sequence statistics
  sequenceLength: 3,
  uniqueAgents: 3,
  hasLoop: false,

  // Timing statistics
  totalDuration: 45000, // ms
  avgStepDuration: 15000, // ms
  maxStepDuration: 25000, // ms
  minStepDuration: 8000, // ms
};
```

### 10.3 Normalization Functions

```javascript
// Min-Max normalization
function minMaxNormalize(value, min, max) {
  return (value - min) / (max - min);
}

// Z-Score normalization
function zScoreNormalize(value, mean, std) {
  return (value - mean) / std;
}

// One-hot encoding
function oneHot(category, categories) {
  return categories.map(c => (c === category ? 1 : 0));
}

// Sequence padding
function padSequence(sequence, maxLength, padValue = 'PAD') {
  const padded = [...sequence];
  while (padded.length < maxLength) {
    padded.push(padValue);
  }
  return padded.slice(0, maxLength);
}
```

---

**Document Status:** DRAFT - Pending Phase 0 Research
**Next Step:** Validate ML model selection with external research
**Related Documents:** phase-5-implementation-plan.md, phase-5-data-strategy.md
