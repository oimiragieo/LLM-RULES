# Phase 5: Data Strategy for ML-Based Evolution

**Version:** 1.0
**Status:** DRAFT
**Author:** Planner Agent (Task #26)
**Date:** 2026-01-30
**Related:** phase-5-implementation-plan.md, phase-5-ml-architecture.md

---

## 1. Executive Summary

This document defines the data strategy for Phase 5 ML capabilities, covering data collection, quality assurance, privacy considerations, storage architecture, and model training/validation approaches. The strategy is designed for:

- **Local-first operation**: All data stays on the local machine
- **Privacy by design**: Sensitive data never enters training pipelines
- **Incremental collection**: Data accumulates over time for better models
- **Quality assurance**: Automated validation prevents garbage-in-garbage-out
- **Efficient storage**: Optimized for ML training while minimizing disk usage

---

## 2. Data Collection Requirements

### 2.1 Data Sources

| Source       | Component           | Data Type                         | Collection Point         | Volume/Session |
| ------------ | ------------------- | --------------------------------- | ------------------------ | -------------- |
| **Metrics**  | MetricsCollector    | Counters, gauges, histograms      | metrics-collector.cjs    | ~10KB          |
| **Traces**   | DistributedTracer   | Spans, trace IDs, durations       | distributed-tracer.cjs   | ~50KB          |
| **Profiles** | PerformanceProfiler | Execution times, memory           | performance-profiler.cjs | ~5KB           |
| **Errors**   | Error Logger        | Error categories, context         | errors.jsonl             | ~2KB           |
| **Tasks**    | TaskUpdate          | Task metadata, status, duration   | post-task-unified.cjs    | ~3KB           |
| **Tools**    | PostToolUse hook    | Tool invocations, params, results | observability-hook.cjs   | ~15KB          |
| **Routing**  | Router decisions    | Agent selection, complexity       | routing-guard.cjs        | ~5KB           |

**Total per session:** ~90KB (compressed: ~15KB)
**Sessions for initial training:** 100 minimum (1.5MB training data)

### 2.2 Data Collection Schema

#### 2.2.1 Session Record

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "title": "ML Training Session Record",
  "type": "object",
  "required": ["sessionId", "timestamp", "taskSequence", "metrics"],
  "properties": {
    "sessionId": {
      "type": "string",
      "description": "Unique session identifier (hashed)"
    },
    "timestamp": {
      "type": "string",
      "format": "date-time"
    },
    "taskSequence": {
      "type": "array",
      "items": { "$ref": "#/definitions/taskRecord" }
    },
    "metrics": {
      "$ref": "#/definitions/sessionMetrics"
    },
    "errors": {
      "type": "array",
      "items": { "$ref": "#/definitions/errorSummary" }
    },
    "outcome": {
      "type": "string",
      "enum": ["success", "partial_success", "failure", "abandoned"]
    }
  },
  "definitions": {
    "taskRecord": {
      "type": "object",
      "properties": {
        "taskType": { "type": "string" },
        "agentType": { "type": "string" },
        "modelUsed": { "type": "string" },
        "durationMs": { "type": "number" },
        "tokenCount": { "type": "number" },
        "memoryPeakMb": { "type": "number" },
        "toolsUsed": { "type": "array", "items": { "type": "string" } },
        "status": { "type": "string" },
        "errorCount": { "type": "number" }
      }
    },
    "sessionMetrics": {
      "type": "object",
      "properties": {
        "totalDurationMs": { "type": "number" },
        "totalTokens": { "type": "number" },
        "taskCount": { "type": "number" },
        "errorRate": { "type": "number" },
        "agentDistribution": { "type": "object" }
      }
    },
    "errorSummary": {
      "type": "object",
      "properties": {
        "category": { "type": "string" },
        "severity": { "type": "string" },
        "recovered": { "type": "boolean" }
      }
    }
  }
}
```

#### 2.2.2 Tool Invocation Record

```json
{
  "toolName": "Bash",
  "timestamp": "2026-01-30T10:15:00.000Z",
  "durationMs": 245,
  "success": true,
  "inputFeatures": {
    "commandLength": 42,
    "hasTimeout": true,
    "usesBackground": false
  },
  "outputFeatures": {
    "exitCode": 0,
    "outputLength": 128,
    "hasStderr": false
  },
  "context": {
    "agentType": "developer",
    "taskType": "implementation",
    "sessionPhase": "execution"
  }
}
```

### 2.3 Collection Triggers

| Event                | Collection Action       | Data Captured                    |
| -------------------- | ----------------------- | -------------------------------- |
| **Session Start**    | Create session record   | sessionId, timestamp             |
| **Task Spawn**       | Add task record         | taskType, agentType, model       |
| **Task Complete**    | Update task record      | duration, tokens, status         |
| **Tool Invocation**  | Append tool record      | tool, params (sanitized), result |
| **Error Occurrence** | Append error summary    | category, severity               |
| **Session End**      | Finalize session record | outcome, total metrics           |

### 2.4 Collection Implementation

```javascript
// .claude/lib/ml/data-collector.cjs
class MLDataCollector {
  constructor(storagePath) {
    this.storagePath = storagePath;
    this.currentSession = null;
    this.sessionBuffer = [];
  }

  startSession() {
    this.currentSession = {
      sessionId: this._generateSessionId(),
      timestamp: new Date().toISOString(),
      taskSequence: [],
      metrics: this._initializeMetrics(),
      errors: [],
      outcome: 'in_progress',
    };
  }

  recordTask(taskData) {
    if (!this.currentSession) return;

    const sanitizedTask = this._sanitizeTaskData(taskData);
    this.currentSession.taskSequence.push(sanitizedTask);
    this._updateSessionMetrics(sanitizedTask);
  }

  recordError(errorData) {
    if (!this.currentSession) return;

    this.currentSession.errors.push({
      category: errorData.category,
      severity: errorData.severity,
      recovered: errorData.recovered || false,
    });
  }

  endSession(outcome) {
    if (!this.currentSession) return;

    this.currentSession.outcome = outcome;
    this._finalizeMetrics();

    // Buffer for batch write
    this.sessionBuffer.push(this.currentSession);

    // Write to disk when buffer is full
    if (this.sessionBuffer.length >= 10) {
      this._flushToDisk();
    }

    this.currentSession = null;
  }

  _sanitizeTaskData(taskData) {
    // Remove any sensitive information
    return {
      taskType: taskData.taskType,
      agentType: taskData.agentType,
      modelUsed: taskData.model,
      durationMs: taskData.duration,
      tokenCount: taskData.tokens,
      memoryPeakMb: taskData.memory,
      toolsUsed: taskData.tools || [],
      status: taskData.status,
      errorCount: taskData.errorCount || 0,
      // Explicitly NOT including: taskDescription, filePaths, userContent
    };
  }

  _flushToDisk() {
    const dataPath = path.join(this.storagePath, 'training-data.jsonl');
    const lines = this.sessionBuffer.map(s => JSON.stringify(s)).join('\n') + '\n';
    fs.appendFileSync(dataPath, lines);
    this.sessionBuffer = [];
  }
}
```

---

## 3. Data Quality Assurance

### 3.1 Quality Dimensions

| Dimension        | Definition                    | Threshold | Validation Method |
| ---------------- | ----------------------------- | --------- | ----------------- |
| **Completeness** | Required fields present       | 100%      | Schema validation |
| **Consistency**  | Values within expected ranges | 95%+      | Range checks      |
| **Accuracy**     | Correct data type and format  | 100%      | Type validation   |
| **Timeliness**   | Data freshness                | <24 hours | Timestamp check   |
| **Uniqueness**   | No duplicate sessions         | 100%      | Session ID dedup  |

### 3.2 Validation Rules

```javascript
// .claude/lib/ml/data-validator.cjs
const VALIDATION_RULES = {
  session: [
    { field: 'sessionId', type: 'string', required: true, pattern: /^[a-f0-9]{32}$/ },
    { field: 'timestamp', type: 'string', required: true, format: 'date-time' },
    { field: 'taskSequence', type: 'array', required: true, minLength: 1 },
    {
      field: 'outcome',
      type: 'string',
      required: true,
      enum: ['success', 'partial_success', 'failure', 'abandoned'],
    },
  ],
  task: [
    { field: 'taskType', type: 'string', required: true },
    { field: 'agentType', type: 'string', required: true },
    { field: 'durationMs', type: 'number', required: true, min: 0, max: 7200000 }, // Max 2 hours
    { field: 'tokenCount', type: 'number', required: false, min: 0, max: 200000 },
    {
      field: 'status',
      type: 'string',
      required: true,
      enum: ['completed', 'failed', 'timeout', 'cancelled'],
    },
  ],
};

function validateSession(session) {
  const errors = [];

  // Schema validation
  for (const rule of VALIDATION_RULES.session) {
    const value = session[rule.field];

    if (rule.required && (value === undefined || value === null)) {
      errors.push({ field: rule.field, error: 'required' });
      continue;
    }

    if (value !== undefined) {
      if (rule.type && typeof value !== rule.type && !Array.isArray(value)) {
        errors.push({ field: rule.field, error: 'type_mismatch', expected: rule.type });
      }
      if (rule.pattern && !rule.pattern.test(value)) {
        errors.push({ field: rule.field, error: 'pattern_mismatch' });
      }
      if (rule.enum && !rule.enum.includes(value)) {
        errors.push({ field: rule.field, error: 'invalid_enum', allowed: rule.enum });
      }
    }
  }

  // Task sequence validation
  for (const task of session.taskSequence || []) {
    const taskErrors = validateTask(task);
    errors.push(...taskErrors.map(e => ({ ...e, context: 'taskSequence' })));
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}
```

### 3.3 Anomaly Filtering

Before training, filter out anomalous data that could poison models:

```javascript
class TrainingDataFilter {
  constructor(config = {}) {
    this.maxDuration = config.maxDuration || 7200000; // 2 hours
    this.maxTokens = config.maxTokens || 200000;
    this.maxErrors = config.maxErrors || 50;
    this.minTasksPerSession = config.minTasks || 1;
  }

  filter(sessions) {
    return sessions.filter(session => {
      // Filter by session-level criteria
      if (session.taskSequence.length < this.minTasksPerSession) return false;
      if (session.errors.length > this.maxErrors) return false;

      // Filter by task-level criteria
      for (const task of session.taskSequence) {
        if (task.durationMs > this.maxDuration) return false;
        if (task.tokenCount > this.maxTokens) return false;
      }

      // Statistical outlier detection
      if (this._isStatisticalOutlier(session)) return false;

      return true;
    });
  }

  _isStatisticalOutlier(session) {
    // Z-score based filtering for key metrics
    const duration = session.metrics.totalDurationMs;
    const tokens = session.metrics.totalTokens;

    // These thresholds would be computed from historical data
    if (duration > this.meanDuration + 3 * this.stdDuration) return true;
    if (tokens > this.meanTokens + 3 * this.stdTokens) return true;

    return false;
  }

  updateStatistics(sessions) {
    const durations = sessions.map(s => s.metrics.totalDurationMs);
    const tokens = sessions.map(s => s.metrics.totalTokens);

    this.meanDuration = this._mean(durations);
    this.stdDuration = this._std(durations);
    this.meanTokens = this._mean(tokens);
    this.stdTokens = this._std(tokens);
  }
}
```

### 3.4 Data Quality Metrics

| Metric                          | Target    | Monitoring        |
| ------------------------------- | --------- | ----------------- |
| **Schema Validation Pass Rate** | >=99%     | Per-session check |
| **Outlier Rejection Rate**      | <5%       | Weekly audit      |
| **Data Completeness**           | >=98%     | Hourly check      |
| **Collection Latency**          | <100ms    | Per-event timing  |
| **Storage Growth Rate**         | <10MB/day | Daily monitoring  |

---

## 4. Privacy & Security Considerations

### 4.1 Privacy Principles

| Principle              | Implementation                            |
| ---------------------- | ----------------------------------------- |
| **Data Minimization**  | Collect only what's needed for ML         |
| **Purpose Limitation** | Data used only for model training         |
| **Local Storage**      | All data stays on local machine           |
| **No PII**             | No user identifiers, names, emails        |
| **Content Exclusion**  | Task descriptions, file contents excluded |
| **Anonymization**      | Session IDs are hashed                    |

### 4.2 Data Classification

| Classification          | Examples                                         | Handling              |
| ----------------------- | ------------------------------------------------ | --------------------- |
| **Safe for ML**         | Agent types, tool names, durations, token counts | Collect and train     |
| **Hash Before Storage** | Session IDs, trace IDs                           | SHA-256 hash          |
| **Exclude Entirely**    | Task descriptions, file paths, user content      | Never collect         |
| **Aggregate Only**      | Error messages                                   | Category + count only |

### 4.3 Sensitive Data Detection

```javascript
// Patterns that trigger exclusion
const SENSITIVE_PATTERNS = [
  // PII patterns
  /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/, // Email
  /\b\d{3}[-.]?\d{3}[-.]?\d{4}\b/, // Phone
  /\b\d{3}-\d{2}-\d{4}\b/, // SSN

  // Credential patterns (from existing masker)
  /sk-[a-zA-Z0-9]{32,}/,
  /AKIA[A-Z0-9]{16}/,
  /eyJ[a-zA-Z0-9_-]{10,}\.[a-zA-Z0-9_-]+/,

  // File path patterns
  /\/home\/[^\/]+/,
  /C:\\Users\\[^\\]+/,
  /\/Users\/[^\/]+/,
];

function containsSensitiveData(text) {
  if (typeof text !== 'string') return false;
  return SENSITIVE_PATTERNS.some(pattern => pattern.test(text));
}

function sanitizeForML(data) {
  const sanitized = {};

  for (const [key, value] of Object.entries(data)) {
    // Skip known sensitive fields
    if (['description', 'content', 'filePath', 'prompt'].includes(key)) {
      continue;
    }

    // Check string values for sensitive patterns
    if (typeof value === 'string' && containsSensitiveData(value)) {
      continue;
    }

    // Recursively sanitize objects
    if (typeof value === 'object' && value !== null) {
      sanitized[key] = sanitizeForML(value);
    } else {
      sanitized[key] = value;
    }
  }

  return sanitized;
}
```

### 4.4 Data Retention Policy

| Data Type              | Retention Period | Deletion Method    |
| ---------------------- | ---------------- | ------------------ |
| **Raw Training Data**  | 90 days          | Automatic rotation |
| **Trained Models**     | Indefinite       | Manual cleanup     |
| **Model Checkpoints**  | 30 days          | Automatic rotation |
| **Validation Results** | 90 days          | Automatic rotation |
| **Inference Logs**     | 7 days           | Automatic rotation |

### 4.5 Audit Trail

```javascript
// Log all data collection events (without the actual data)
const mlAuditLog = {
  timestamp: new Date().toISOString(),
  event: 'data_collected',
  sessionId: hashedSessionId, // Hashed
  dataType: 'task_record',
  fieldsCollected: ['taskType', 'agentType', 'durationMs', 'tokenCount', 'status'],
  fieldsExcluded: ['description', 'filePath'], // For transparency
  bytesCollected: 128,
};
```

---

## 5. Storage Architecture

### 5.1 File Structure

```
.claude/lib/ml/data/
├── raw/                          # Raw training data
│   ├── training-data.jsonl       # Append-only session records
│   ├── tool-invocations.jsonl    # Tool-level data
│   └── archive/                  # Archived old data
│       └── 2026-01/
│           └── training-data-2026-01-15.jsonl.gz
├── processed/                    # Processed feature vectors
│   ├── workflow-features.jsonl   # Ready for clustering
│   ├── sequence-features.jsonl   # Ready for Markov chains
│   └── resource-features.jsonl   # Ready for prediction
├── models/                       # Trained models
│   ├── pattern-detector/
│   │   └── v1.0.0/
│   │       ├── model.json
│   │       └── metadata.json
│   ├── anomaly-detector/
│   └── resource-predictor/
├── validation/                   # Validation results
│   ├── cross-validation-2026-01-30.json
│   └── holdout-test-2026-01-30.json
└── metrics/                      # Training metrics
    └── training-history.jsonl
```

### 5.2 Storage Format Selection

| Data Type               | Format | Rationale                                        |
| ----------------------- | ------ | ------------------------------------------------ |
| **Raw Data**            | JSONL  | Append-only, streaming, line-by-line processing  |
| **Feature Vectors**     | JSONL  | Same benefits as raw, ready for batch processing |
| **Models**              | JSON   | Human-readable, easy to inspect weights          |
| **Compressed Archives** | GZIP   | 10:1 compression for old data                    |
| **Validation Results**  | JSON   | Structured, easy to query                        |

### 5.3 Storage Optimization

```javascript
class StorageManager {
  constructor(basePath, options = {}) {
    this.basePath = basePath;
    this.maxRawSize = options.maxRawSize || 100 * 1024 * 1024; // 100MB
    this.archiveAfterDays = options.archiveAfterDays || 30;
  }

  async checkAndRotate() {
    const rawPath = path.join(this.basePath, 'raw', 'training-data.jsonl');
    const stats = await fs.stat(rawPath);

    if (stats.size > this.maxRawSize) {
      await this._archiveOldData();
    }
  }

  async _archiveOldData() {
    const rawPath = path.join(this.basePath, 'raw', 'training-data.jsonl');
    const lines = await this._readLines(rawPath);

    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - this.archiveAfterDays);

    const toArchive = [];
    const toKeep = [];

    for (const line of lines) {
      const record = JSON.parse(line);
      const recordDate = new Date(record.timestamp);

      if (recordDate < cutoffDate) {
        toArchive.push(line);
      } else {
        toKeep.push(line);
      }
    }

    // Archive old data
    if (toArchive.length > 0) {
      const archiveDate = new Date().toISOString().split('T')[0];
      const archivePath = path.join(
        this.basePath,
        'raw',
        'archive',
        archiveDate.slice(0, 7),
        `training-data-${archiveDate}.jsonl.gz`
      );

      await fs.mkdir(path.dirname(archivePath), { recursive: true });
      await this._compressAndWrite(archivePath, toArchive.join('\n'));
    }

    // Rewrite active file
    await fs.writeFile(rawPath, toKeep.join('\n') + '\n');
  }
}
```

### 5.4 Backup Strategy

| Backup Type            | Frequency     | Retention  | Location                |
| ---------------------- | ------------- | ---------- | ----------------------- |
| **Training Data**      | Daily         | 30 days    | archive/ directory      |
| **Trained Models**     | On training   | Indefinite | models/ with versioning |
| **Validation Results** | On validation | 90 days    | validation/ directory   |

---

## 6. Model Training Strategy

### 6.1 Training Workflow

```
┌─────────────────────────────────────────────────────────────────────┐
│                      Training Workflow                              │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐             │
│  │ Raw Data    │───>│ Validation  │───>│ Feature     │             │
│  │ Collection  │    │ & Filtering │    │ Engineering │             │
│  └─────────────┘    └─────────────┘    └─────────────┘             │
│                                               │                     │
│                                               v                     │
│                          ┌────────────────────────────────┐        │
│                          │       Train/Test Split         │        │
│                          │  ┌────────────┬────────────┐   │        │
│                          │  │  Training  │  Holdout   │   │        │
│                          │  │    80%     │    20%     │   │        │
│                          │  └────────────┴────────────┘   │        │
│                          └────────────────────────────────┘        │
│                                      │                              │
│           ┌──────────────────────────┼───────────────────────┐     │
│           │                          │                       │     │
│           v                          v                       v     │
│  ┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐│
│  │ Pattern Models  │    │ Anomaly Models  │    │ Prediction      ││
│  │ ───────────     │    │ ───────────     │    │ Models          ││
│  │ • K-Means       │    │ • Z-Score stats │    │ ───────────     ││
│  │ • Assoc Rules   │    │ • Thresholds    │    │ • Lin Regress   ││
│  │ • Markov Chain  │    │ • Pattern base  │    │ • Decision Tree ││
│  └────────┬────────┘    └────────┬────────┘    └────────┬────────┘│
│           │                      │                       │         │
│           └──────────────────────┼───────────────────────┘         │
│                                  v                                  │
│                    ┌─────────────────────────┐                     │
│                    │     Validation          │                     │
│                    │  • Cross-validation     │                     │
│                    │  • Holdout test         │                     │
│                    │  • Metrics calculation  │                     │
│                    └───────────┬─────────────┘                     │
│                                │                                    │
│                                v                                    │
│                    ┌─────────────────────────┐                     │
│                    │     Model Registry      │                     │
│                    │  • Version control      │                     │
│                    │  • A/B test config      │                     │
│                    │  • Deployment           │                     │
│                    └─────────────────────────┘                     │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

### 6.2 Training Triggers

| Trigger                     | Condition               | Action                 |
| --------------------------- | ----------------------- | ---------------------- |
| **Initial Training**        | 100+ sessions collected | Train all models       |
| **Periodic Retraining**     | Every 7 days            | Retrain with new data  |
| **Performance Degradation** | Accuracy drops >10%     | Retrain affected model |
| **Data Drift Detection**    | Distribution shift      | Retrain affected model |
| **Manual Trigger**          | CLI command             | Train specified model  |

### 6.3 Cross-Validation Strategy

```javascript
class CrossValidator {
  constructor(k = 5) {
    this.k = k;
  }

  validate(model, features, labels) {
    const foldSize = Math.ceil(features.length / this.k);
    const metrics = [];

    for (let i = 0; i < this.k; i++) {
      // Split data
      const testStart = i * foldSize;
      const testEnd = Math.min((i + 1) * foldSize, features.length);

      const testFeatures = features.slice(testStart, testEnd);
      const testLabels = labels.slice(testStart, testEnd);
      const trainFeatures = [...features.slice(0, testStart), ...features.slice(testEnd)];
      const trainLabels = [...labels.slice(0, testStart), ...labels.slice(testEnd)];

      // Train and evaluate
      const foldModel = model.clone();
      foldModel.fit(trainFeatures, trainLabels);
      const predictions = foldModel.predict(testFeatures);

      // Calculate metrics
      metrics.push(this._calculateMetrics(predictions, testLabels));
    }

    return {
      meanAccuracy: this._mean(metrics.map(m => m.accuracy)),
      stdAccuracy: this._std(metrics.map(m => m.accuracy)),
      meanPrecision: this._mean(metrics.map(m => m.precision)),
      meanRecall: this._mean(metrics.map(m => m.recall)),
      foldMetrics: metrics,
    };
  }
}
```

### 6.4 Hyperparameter Tuning

| Model                 | Hyperparameters             | Tuning Range      | Method           |
| --------------------- | --------------------------- | ----------------- | ---------------- |
| **K-Means**           | k (clusters)                | 3-10              | Elbow method     |
| **Association Rules** | min_support, min_confidence | 0.05-0.3, 0.5-0.9 | Grid search      |
| **Markov Chain**      | order                       | 1-3               | Cross-validation |
| **Linear Regression** | regularization              | 0-1               | Cross-validation |
| **Decision Tree**     | max_depth                   | 3-10              | Cross-validation |
| **Z-Score Detector**  | threshold                   | 2-4               | ROC analysis     |

### 6.5 Training Metrics

```javascript
const trainingMetrics = {
  timestamp: new Date().toISOString(),
  model: 'pattern-detector',
  version: '1.0.0',
  training: {
    samplesUsed: 850,
    trainingDurationMs: 12500,
    iterationsCompleted: 100,
  },
  validation: {
    crossValidationK: 5,
    accuracy: { mean: 0.82, std: 0.03 },
    precision: { mean: 0.79, std: 0.04 },
    recall: { mean: 0.85, std: 0.02 },
    f1: { mean: 0.82, std: 0.03 },
  },
  holdout: {
    samplesUsed: 150,
    accuracy: 0.81,
    precision: 0.78,
    recall: 0.84,
    f1: 0.81,
  },
  hyperparameters: {
    k: 5,
    min_support: 0.1,
    min_confidence: 0.6,
  },
};
```

---

## 7. Model Validation Strategy

### 7.1 Validation Metrics by Model

| Model                   | Primary Metric      | Secondary Metrics       | Target |
| ----------------------- | ------------------- | ----------------------- | ------ |
| **Workflow Clustering** | Silhouette Score    | Inertia, Cluster purity | >0.5   |
| **Association Rules**   | Confidence          | Support, Lift           | >0.7   |
| **Markov Chain**        | Prediction Accuracy | Perplexity              | >0.7   |
| **Anomaly Detection**   | F1 Score            | Precision, Recall, AUC  | >0.85  |
| **Token Prediction**    | MAPE                | R-squared, MAE          | <15%   |
| **Model Recommender**   | Accuracy            | Precision, Recall       | >0.9   |

### 7.2 Validation Workflow

```javascript
async function validateModel(modelType, model, testData) {
  const validator = getValidator(modelType);

  const results = {
    timestamp: new Date().toISOString(),
    modelType,
    testSamples: testData.length,
    metrics: {},
    passed: false,
  };

  // Calculate metrics
  const predictions = model.predict(testData.features);
  results.metrics = validator.calculateMetrics(predictions, testData.labels);

  // Check against thresholds
  const thresholds = VALIDATION_THRESHOLDS[modelType];
  results.passed = Object.entries(thresholds).every(([metric, threshold]) => {
    return results.metrics[metric] >= threshold;
  });

  // Log results
  await appendToValidationLog(results);

  // Alert if validation fails
  if (!results.passed) {
    emitEvent('model_validation_failed', {
      modelType,
      metrics: results.metrics,
      thresholds,
    });
  }

  return results;
}

const VALIDATION_THRESHOLDS = {
  'pattern-detector': { accuracy: 0.8, precision: 0.75, recall: 0.75 },
  'anomaly-detector': { f1: 0.85, precision: 0.85, recall: 0.85 },
  'token-predictor': { mape: 0.15, r_squared: 0.7 },
  'model-recommender': { accuracy: 0.9, precision: 0.85 },
};
```

### 7.3 A/B Testing Validation

```javascript
class ABTestValidator {
  constructor(config) {
    this.config = config;
    this.controlResults = [];
    this.treatmentResults = [];
  }

  recordResult(variant, prediction, actual, outcome) {
    const result = {
      prediction,
      actual,
      correct: prediction === actual,
      outcome, // e.g., task success, user override
    };

    if (variant === 'control') {
      this.controlResults.push(result);
    } else {
      this.treatmentResults.push(result);
    }
  }

  analyze() {
    const controlAccuracy = this._accuracy(this.controlResults);
    const treatmentAccuracy = this._accuracy(this.treatmentResults);

    const { pValue, significant } = this._tTest(
      this.controlResults.map(r => (r.correct ? 1 : 0)),
      this.treatmentResults.map(r => (r.correct ? 1 : 0)),
      this.config.significance
    );

    return {
      control: {
        samples: this.controlResults.length,
        accuracy: controlAccuracy,
      },
      treatment: {
        samples: this.treatmentResults.length,
        accuracy: treatmentAccuracy,
      },
      improvement: treatmentAccuracy - controlAccuracy,
      pValue,
      significant,
      recommendation:
        significant && treatmentAccuracy > controlAccuracy ? 'promote_treatment' : 'continue_test',
    };
  }
}
```

---

## 8. Data Drift Detection

### 8.1 Drift Types

| Drift Type          | Definition                                | Detection Method          |
| ------------------- | ----------------------------------------- | ------------------------- |
| **Covariate Drift** | Input distribution changes                | KL divergence, PSI        |
| **Concept Drift**   | Relationship between input/output changes | Accuracy monitoring       |
| **Label Drift**     | Output distribution changes               | Chi-squared test          |
| **Sudden Drift**    | Abrupt distribution change                | Change point detection    |
| **Gradual Drift**   | Slow distribution change                  | Sliding window comparison |

### 8.2 Drift Detection Implementation

```javascript
class DriftDetector {
  constructor(referenceData, threshold = 0.1) {
    this.referenceDistribution = this._computeDistribution(referenceData);
    this.threshold = threshold;
  }

  checkDrift(newData) {
    const newDistribution = this._computeDistribution(newData);

    // Calculate Population Stability Index (PSI)
    const psi = this._calculatePSI(this.referenceDistribution, newDistribution);

    const hasDrift = psi > this.threshold;

    return {
      psi,
      threshold: this.threshold,
      hasDrift,
      severity: psi < 0.1 ? 'none' : psi < 0.25 ? 'moderate' : 'significant',
      recommendation: hasDrift ? 'retrain_model' : 'no_action',
    };
  }

  _calculatePSI(expected, actual) {
    let psi = 0;

    for (const bucket of Object.keys(expected)) {
      const e = expected[bucket] || 0.0001;
      const a = actual[bucket] || 0.0001;
      psi += (a - e) * Math.log(a / e);
    }

    return psi;
  }

  _computeDistribution(data) {
    // Compute histogram for numerical features
    // Compute frequency table for categorical features
    const distribution = {};

    for (const feature of Object.keys(data[0])) {
      if (typeof data[0][feature] === 'number') {
        distribution[feature] = this._computeHistogram(data.map(d => d[feature]));
      } else {
        distribution[feature] = this._computeFrequency(data.map(d => d[feature]));
      }
    }

    return distribution;
  }
}
```

### 8.3 Drift Monitoring Schedule

| Check                  | Frequency           | Action on Drift              |
| ---------------------- | ------------------- | ---------------------------- |
| **Covariate Drift**    | Daily               | Alert + evaluate impact      |
| **Accuracy Drift**     | Per 100 predictions | Alert + retrain if >10% drop |
| **Distribution Drift** | Weekly              | Archive reference + retrain  |

---

## 9. Implementation Checklist

### Phase 1: Collection Infrastructure (Days 1-2)

- [ ] Implement MLDataCollector class
- [ ] Create data validation rules
- [ ] Add collection hooks to existing infrastructure
- [ ] Set up storage directory structure
- [ ] Implement sanitization functions
- [ ] Create audit logging

### Phase 2: Quality Assurance (Days 3-4)

- [ ] Implement data validator
- [ ] Create anomaly filtering
- [ ] Set up quality metrics monitoring
- [ ] Implement storage rotation
- [ ] Add backup automation

### Phase 3: Training Pipeline (Days 5-7)

- [ ] Implement feature engineering
- [ ] Create train/test split logic
- [ ] Implement cross-validation
- [ ] Add hyperparameter tuning
- [ ] Create model registry

### Phase 4: Validation & Monitoring (Days 8-10)

- [ ] Implement validation metrics
- [ ] Create A/B testing framework
- [ ] Implement drift detection
- [ ] Set up monitoring dashboards
- [ ] Create alerting rules

---

## 10. Success Metrics

| Metric                       | Target                | Measurement                           |
| ---------------------------- | --------------------- | ------------------------------------- |
| **Data Collection Rate**     | >95% of sessions      | Sessions collected / total sessions   |
| **Data Quality Score**       | >98%                  | Valid records / total records         |
| **Storage Efficiency**       | <10MB/day growth      | Daily storage delta                   |
| **Training Success Rate**    | >99%                  | Successful trainings / total attempts |
| **Model Accuracy Retention** | <5% degradation/month | Monthly accuracy comparison           |
| **Drift Detection Latency**  | <24 hours             | Time to detect significant drift      |

---

**Document Status:** DRAFT - Pending Phase 0 Research
**Next Step:** Validate data requirements with observability infrastructure audit
**Related Documents:** phase-5-implementation-plan.md, phase-5-ml-architecture.md
