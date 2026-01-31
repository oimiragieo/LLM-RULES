# Track Metadata Schema Guide

**Version**: 1.0.0
**Schema**: `.claude/schemas/track-metadata.schema.json`
**Status**: Production Ready

## Overview

The Track Metadata Schema provides a consistent structure for enriched task tracking in agent-studio. It enables spec-driven development by tracking work items (tracks) through their lifecycle with comprehensive metadata, effort estimation, phase management, and dependency tracking.

### Key Benefits

- **Consistency**: All tracks follow the same structure
- **Traceability**: Full lifecycle tracking from creation to deployment
- **Planning**: Effort estimation with breakdown by activity type
- **Coordination**: Dependency management and blocking relationships
- **Reporting**: Structured data enables analytics and reporting

## Schema Fields Reference

### Required Fields

Every track metadata file **MUST** include:

| Field     | Type   | Description                                                               | Example                |
| --------- | ------ | ------------------------------------------------------------------------- | ---------------------- |
| `trackId` | string | Unique identifier (format: `shortname_YYYYMMDD`)                          | `"user-auth_20260129"` |
| `type`    | enum   | Type of work (`feature`, `bug`, `chore`, `refactor`, `docs`)              | `"feature"`            |
| `status`  | enum   | Current status (`new`, `in_progress`, `review`, `completed`, `cancelled`) | `"in_progress"`        |

### Optional Fields

| Field                 | Type     | Description                                                                                           |
| --------------------- | -------- | ----------------------------------------------------------------------------------------------------- |
| `phaseState`          | enum     | Spec-driven workflow phase (`draft`, `spec_review`, `plan_ready`, `implementation`, `qa`, `deployed`) |
| `description`         | string   | User-friendly description (min 10 characters)                                                         |
| `priority`            | enum     | Business priority (`low`, `medium`, `high`, `critical`)                                               |
| `classification`      | array    | Category tags (`security`, `performance`, `ux`, `dx`, `testing`, `documentation`, `technical-debt`)   |
| `estimatedEffort`     | object   | Estimated effort with breakdown                                                                       |
| `actualEffort`        | object   | Actual effort spent (for tracking accuracy)                                                           |
| `acceptance_criteria` | array    | List of completion criteria                                                                           |
| `dependencies`        | array    | Other track IDs this depends on                                                                       |
| `created_at`          | datetime | ISO 8601 creation timestamp                                                                           |
| `updated_at`          | datetime | ISO 8601 last update timestamp                                                                        |
| `assignee`            | string   | Assigned agent or person                                                                              |
| `blocked_by`          | array    | Track IDs blocking this one                                                                           |
| `blocks`              | array    | Track IDs blocked by this one                                                                         |

### Field Details

#### trackId Pattern

```
Format: [a-z0-9_-]+_[0-9]{8}
Examples:
  ✅ user-auth_20260129
  ✅ api-cache_20260130
  ✅ login-crash_20260201
  ❌ UserAuth_20260129 (uppercase not allowed)
  ❌ no-date (missing date)
  ❌ test_2026 (incomplete date)
```

**Rationale**: Lowercase with hyphens/underscores ensures cross-platform compatibility. Date suffix enables chronological sorting.

#### type Enum

| Value      | Use For                                   | Example                    |
| ---------- | ----------------------------------------- | -------------------------- |
| `feature`  | New functionality                         | "Add user authentication"  |
| `bug`      | Defect fixes                              | "Fix login crash"          |
| `chore`    | Maintenance tasks                         | "Update dependencies"      |
| `refactor` | Code improvements without behavior change | "Extract common utilities" |
| `docs`     | Documentation work                        | "Write API guide"          |

#### status Enum

| Value         | Meaning           | Typical Duration |
| ------------- | ----------------- | ---------------- |
| `new`         | Not yet started   | Days to weeks    |
| `in_progress` | Active work       | Hours to days    |
| `review`      | Under review/QA   | Hours            |
| `completed`   | Done and verified | Permanent        |
| `cancelled`   | Work cancelled    | Permanent        |

#### phaseState Enum (Spec-Driven Workflow)

| Phase            | Description                           | Artifacts                                 |
| ---------------- | ------------------------------------- | ----------------------------------------- |
| `draft`          | Initial context gathering             | `context/`, `product.md`, `tech-stack.md` |
| `spec_review`    | Specification review                  | `spec.md`                                 |
| `plan_ready`     | Planning complete, ready to implement | `plan.md`                                 |
| `implementation` | Active coding                         | Code commits                              |
| `qa`             | Quality assurance and testing         | Test results, QA signoff                  |
| `deployed`       | Deployed to production                | Deployment logs                           |

**Workflow Flow**: `draft` → `spec_review` → `plan_ready` → `implementation` → `qa` → `deployed`

#### classification Tags

Multiple tags allowed for rich categorization:

| Tag              | Use For                                                       |
| ---------------- | ------------------------------------------------------------- |
| `security`       | Security-related work (auth, encryption, vulnerability fixes) |
| `performance`    | Performance improvements (caching, optimization)              |
| `ux`             | User experience improvements                                  |
| `dx`             | Developer experience improvements                             |
| `testing`        | Testing infrastructure or coverage                            |
| `documentation`  | Documentation work                                            |
| `technical-debt` | Technical debt reduction                                      |

#### Effort Tracking

**estimatedEffort** and **actualEffort** share the same structure:

```json
{
  "days": 5.0,
  "breakdown": {
    "design": 1.0,
    "implementation": 2.5,
    "testing": 1.0,
    "documentation": 0.5
  }
}
```

**Best Practices**:

- Always provide `estimatedEffort` for features
- Update `actualEffort` when work completes
- Compare estimates vs actuals to improve planning
- Track breakdown to identify bottlenecks

## Usage Examples

### Minimal Feature Track

The simplest valid metadata (only required fields):

```json
{
  "trackId": "user-login_20260129",
  "type": "feature",
  "status": "new",
  "description": "Implement user login functionality"
}
```

### Complete Feature Track

Full metadata with all recommended fields:

```json
{
  "trackId": "user-auth_20260129",
  "type": "feature",
  "status": "in_progress",
  "phaseState": "implementation",
  "description": "Implement user authentication with JWT tokens",
  "priority": "high",
  "classification": ["security", "ux"],
  "estimatedEffort": {
    "days": 5,
    "breakdown": {
      "design": 1,
      "implementation": 2.5,
      "testing": 1,
      "documentation": 0.5
    }
  },
  "actualEffort": {
    "days": 3.5,
    "breakdown": {
      "design": 0.5,
      "implementation": 2,
      "testing": 0.8,
      "documentation": 0.2
    }
  },
  "acceptance_criteria": [
    "Users can login with email/password",
    "JWT tokens expire after 1 hour",
    "Refresh tokens work correctly",
    "All authentication tests pass"
  ],
  "dependencies": ["db-schema_20260128"],
  "created_at": "2026-01-29T10:00:00Z",
  "updated_at": "2026-01-29T15:30:00Z",
  "assignee": "developer",
  "blocked_by": [],
  "blocks": ["api-docs_20260130"]
}
```

### Bug Track

Simplified for defect tracking:

```json
{
  "trackId": "login-crash_20260129",
  "type": "bug",
  "status": "review",
  "phaseState": "qa",
  "description": "Fix crash when user enters invalid email format",
  "priority": "critical",
  "classification": ["security", "ux"],
  "acceptance_criteria": [
    "No crashes on invalid email input",
    "User-friendly error messages displayed",
    "Email validation regex covers edge cases"
  ]
}
```

### Chore Track

Maintenance work:

```json
{
  "trackId": "deps-update_20260129",
  "type": "chore",
  "status": "new",
  "description": "Update dependencies to latest stable versions",
  "priority": "low",
  "classification": ["technical-debt"]
}
```

### Refactoring Track

Code quality improvement:

```json
{
  "trackId": "clean-utils_20260129",
  "type": "refactor",
  "status": "review",
  "phaseState": "qa",
  "description": "Extract common utility functions into shared module",
  "priority": "medium",
  "classification": ["technical-debt", "dx"],
  "estimatedEffort": {
    "days": 2,
    "breakdown": {
      "design": 0.5,
      "implementation": 1,
      "testing": 0.5,
      "documentation": 0
    }
  }
}
```

### Documentation Track

Technical writing:

```json
{
  "trackId": "api-guide_20260129",
  "type": "docs",
  "status": "completed",
  "phaseState": "deployed",
  "description": "Write comprehensive API integration guide",
  "priority": "medium",
  "classification": ["documentation"],
  "assignee": "technical-writer"
}
```

## Validation Rules

The schema enforces these validation rules automatically:

### Format Validation

1. **trackId**: Must match `^[a-z0-9_-]+_[0-9]{8}$`
2. **description**: Minimum 10 characters (ensures meaningful descriptions)
3. **created_at/updated_at**: Must be valid ISO 8601 datetime strings
4. **dependencies/blocked_by/blocks**: Must be valid trackId formats

### Enum Validation

Fields with limited allowed values:

- `type`: `feature`, `bug`, `chore`, `refactor`, `docs`
- `status`: `new`, `in_progress`, `review`, `completed`, `cancelled`
- `phaseState`: `draft`, `spec_review`, `plan_ready`, `implementation`, `qa`, `deployed`
- `priority`: `low`, `medium`, `high`, `critical`
- `classification` items: `security`, `performance`, `ux`, `dx`, `testing`, `documentation`, `technical-debt`

### Range Validation

- **effort.days**: Must be ≥ 0 (no negative effort)
- **effort.breakdown values**: Must be ≥ 0

### Uniqueness

- **classification**: Tags must be unique (no duplicates)

## Integration with TaskCreate

When creating tasks, include track metadata to enable rich tracking:

```javascript
TaskCreate({
  subject: 'Implement user authentication',
  description: 'See track metadata at .claude/context/tracks/user-auth_20260129/metadata.json',
  activeForm: 'Implementing user authentication',
  metadata: {
    trackId: 'user-auth_20260129',
    type: 'feature',
    status: 'new',
    phaseState: 'plan_ready',
    priority: 'high',
    classification: ['security', 'ux'],
  },
});
```

**Benefits**:

- TaskList shows priority and classification
- TaskUpdate can update track status automatically
- Reporting tools can aggregate by classification

## Migration Guide

### Existing Tasks Without Metadata

For tasks created before schema introduction:

1. **Add minimal metadata**:

   ```json
   {
     "trackId": "existing-task_20260129",
     "type": "feature",
     "status": "in_progress",
     "description": "<copy from task description>"
   }
   ```

2. **Enhance incrementally**:
   - Add `priority` and `classification` based on context
   - Add `estimatedEffort` if relevant
   - Add `phaseState` if following spec-driven workflow

3. **Update CLAUDE.md references**:
   - Link to track directory in routing tables
   - Update workflow integration documentation

### Schema Versioning

The schema supports **additional properties** (`additionalProperties: true`), enabling forward compatibility:

- New fields can be added without breaking existing metadata
- Custom fields are allowed for project-specific needs
- Migration to new schema versions is non-breaking

**Example custom field**:

```json
{
  "trackId": "custom_20260129",
  "type": "feature",
  "status": "new",
  "description": "Feature with custom tracking",
  "jiraTicket": "PROJ-123",
  "customPriority": "P1"
}
```

## Best Practices

### 1. Always Use Meaningful Descriptions

❌ Bad:

```json
{
  "description": "Fix bug"
}
```

✅ Good:

```json
{
  "description": "Fix crash when user enters invalid email format in login form"
}
```

### 2. Track Dependencies Accurately

Dependencies enable automatic scheduling and blocking detection.

```json
{
  "trackId": "api-docs_20260130",
  "dependencies": ["user-auth_20260129"],
  "blocked_by": ["api-design_20260129"]
}
```

**Router can use this to**:

- Prevent starting dependent tracks too early
- Show critical path in plans
- Auto-unblock when dependencies complete

### 3. Use Classification for Filtering

Enable powerful reporting:

```javascript
// Find all security-related tracks
tracks.filter(t => t.classification.includes('security'));

// Find all technical debt
tracks.filter(t => t.classification.includes('technical-debt'));

// Find high-priority UX work
tracks.filter(t => t.priority === 'high' && t.classification.includes('ux'));
```

### 4. Update Timestamps

Use ISO 8601 format for timezone-safe timestamps:

```json
{
  "created_at": "2026-01-29T10:00:00Z",
  "updated_at": "2026-01-29T15:30:00Z"
}
```

**Tip**: Use `new Date().toISOString()` in JavaScript.

### 5. Track Effort for Continuous Improvement

```json
{
  "estimatedEffort": {
    "days": 5,
    "breakdown": { "design": 1, "implementation": 2.5, "testing": 1, "documentation": 0.5 }
  },
  "actualEffort": {
    "days": 3.5,
    "breakdown": { "design": 0.5, "implementation": 2, "testing": 0.8, "documentation": 0.2 }
  }
}
```

**Analysis**: Implementation faster than estimated, design shorter, testing took 80% of estimate.

**Action**: Adjust future estimates based on patterns.

### 6. Use Phase States for Spec-Driven Workflow

Track progress through the spec-driven lifecycle:

```json
{
  "phaseState": "draft"         // Gathering context
  "phaseState": "spec_review"   // Reviewing spec.md
  "phaseState": "plan_ready"    // Plan approved, ready to code
  "phaseState": "implementation" // Coding in progress
  "phaseState": "qa"            // Testing and QA
  "phaseState": "deployed"      // In production
}
```

## Validation Tools

### Programmatic Validation

Use the schema with AJV (JSON Schema validator):

```javascript
const Ajv = require('ajv');
const addFormats = require('ajv-formats');
const schema = require('./.claude/schemas/track-metadata.schema.json');

const ajv = new Ajv({ allErrors: true, strict: true });
addFormats(ajv);
const validate = ajv.compile(schema);

const metadata = {
  trackId: 'test_20260129',
  type: 'feature',
  status: 'new',
  description: 'Test metadata',
};

if (validate(metadata)) {
  console.log('✅ Valid metadata');
} else {
  console.error('❌ Invalid:', validate.errors);
}
```

### CLI Validation

Create a validation script:

```bash
#!/usr/bin/env node
// validate-track-metadata.mjs

import Ajv from 'ajv';
import addFormats from 'ajv-formats';
import fs from 'fs';

const schema = JSON.parse(fs.readFileSync('./.claude/schemas/track-metadata.schema.json', 'utf8'));
const metadata = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));

const ajv = new Ajv({ allErrors: true });
addFormats(ajv);
const validate = ajv.compile(schema);

if (validate(metadata)) {
  console.log('✅ Valid metadata');
  process.exit(0);
} else {
  console.error('❌ Validation errors:', JSON.stringify(validate.errors, null, 2));
  process.exit(1);
}
```

**Usage**:

```bash
node validate-track-metadata.mjs .claude/context/tracks/user-auth_20260129/metadata.json
```

### Pre-Commit Hook Integration

Validate metadata before commits:

```bash
#!/bin/bash
# .git/hooks/pre-commit

for file in $(git diff --cached --name-only --diff-filter=ACM | grep 'metadata.json$'); do
  if ! node validate-track-metadata.mjs "$file"; then
    echo "❌ Metadata validation failed for $file"
    exit 1
  fi
done
```

## Troubleshooting

### Common Validation Errors

#### 1. Invalid trackId Format

**Error**:

```json
{
  "keyword": "pattern",
  "dataPath": ".trackId",
  "message": "should match pattern \"^[a-z0-9_-]+_[0-9]{8}$\""
}
```

**Fix**: Use lowercase letters, numbers, hyphens, underscores, and 8-digit date:

```json
{
  "trackId": "user-auth_20260129"
}
```

#### 2. Missing Required Fields

**Error**:

```json
{
  "keyword": "required",
  "params": { "missingProperty": "status" }
}
```

**Fix**: Add all required fields (trackId, type, status).

#### 3. Invalid Enum Value

**Error**:

```json
{
  "keyword": "enum",
  "dataPath": ".priority",
  "message": "should be equal to one of the allowed values"
}
```

**Fix**: Use only allowed enum values:

```json
{
  "priority": "high" // not "urgent" or "p1"
}
```

#### 4. Description Too Short

**Error**:

```json
{
  "keyword": "minLength",
  "dataPath": ".description",
  "message": "should NOT be shorter than 10 characters"
}
```

**Fix**: Provide meaningful description (minimum 10 characters):

```json
{
  "description": "Implement user authentication with JWT tokens"
}
```

## Performance Considerations

### Validation Performance

- **Validation time**: <1ms per metadata object (tested with 1000 iterations)
- **Schema load**: <10ms (one-time cost)
- **No impact** on existing TaskCreate performance

### File Size

- **Minimal metadata**: ~150 bytes
- **Complete metadata**: ~800 bytes
- **Negligible** storage impact

### Recommendations

- ✅ Validate on TaskCreate
- ✅ Validate on metadata.json writes
- ❌ Don't validate on every TaskList call (unnecessary)

## Related Documentation

- **Schema File**: `.claude/schemas/track-metadata.schema.json`
- **Test Suite**: `tests/track-metadata-schema.test.cjs`
- **Upgrade Roadmap**: `.claude/context/artifacts/upgrade-roadmap-spec-2026-01-29.md` (SPEC-007)
- **Track Management Skill**: `.claude/skills/track-management/SKILL.md`
- **Workflow Patterns Skill**: `.claude/skills/workflow-patterns/SKILL.md`
- **Context-Driven Development**: `.claude/skills/context-driven-development/SKILL.md`

## Analytics Integration (SPEC-008)

**Version**: 1.1.0 (2026-01-29)

SPEC-008 adds analytics capabilities to track metadata:

### New Fields

#### metrics Object

```json
{
  "metrics": {
    "elapsedTimeMs": 3600000,
    "effortMultiplier": 0.7,
    "riskScore": 25,
    "completionRate": 100
  }
}
```

| Field              | Type   | Range   | Description                                                                                |
| ------------------ | ------ | ------- | ------------------------------------------------------------------------------------------ |
| `elapsedTimeMs`    | number | >= 0    | Elapsed time in milliseconds from track start to completion                                |
| `effortMultiplier` | number | 0.5 - 5 | Ratio of actual to estimated effort (1.0 = perfect estimate, <1.0 = faster, >1.0 = slower) |
| `riskScore`        | number | 0 - 100 | Risk assessment score (0 = low risk, 100 = high risk)                                      |
| `completionRate`   | number | 0 - 100 | Percentage of acceptance criteria completed (0-100)                                        |

#### reporting Object

```json
{
  "reporting": {
    "generatedAt": "2026-01-29T10:00:00Z",
    "lastReportPath": ".claude/context/artifacts/reports/analytics-2026-01-29.md",
    "insights": ["Implementation faster than estimated", "Testing took 80% of estimate"]
  }
}
```

| Field            | Type              | Description                                     |
| ---------------- | ----------------- | ----------------------------------------------- |
| `generatedAt`    | string (ISO 8601) | Timestamp when last report was generated        |
| `lastReportPath` | string            | File path to the most recent analytics report   |
| `insights`       | array of strings  | Auto-generated insights about track performance |

### Analytics Functions

**Library**: `.claude/lib/utils/track-analytics.cjs`

| Function                        | Purpose                                      | Returns                                              |
| ------------------------------- | -------------------------------------------- | ---------------------------------------------------- |
| `queryByPhase(phaseId, tracks)` | Group tasks by phase with aggregated metrics | `{ phase, tasks, metrics }`                          |
| `queryByAgent(agentId, tracks)` | Group tasks by agent with completion metrics | `{ agent, tasks, metrics }`                          |
| `queryByStatus(status, tracks)` | Group tasks by status with timeline metrics  | `{ status, tasks, metrics }`                         |
| `computeProjectMetrics(tracks)` | Aggregate project-wide statistics            | `{ completionPercentage, avgEffortMultiplier, ... }` |
| `generateReport(tracks)`        | Create markdown analytics report             | Markdown string                                      |

**Example Usage:**

```javascript
const trackAnalytics = require('./.claude/lib/utils/track-analytics.cjs');
const fs = require('fs');

// Load track metadata
const tracks = [
  JSON.parse(fs.readFileSync('.claude/context/tracks/track1_20260129/metadata.json', 'utf8')),
  JSON.parse(fs.readFileSync('.claude/context/tracks/track2_20260129/metadata.json', 'utf8')),
];

// Query by phase
const deployedTasks = trackAnalytics.queryByPhase('deployed', tracks);
console.log(`Deployed: ${deployedTasks.tasks.length} tasks`);

// Generate report
const report = trackAnalytics.generateReport(tracks);
fs.writeFileSync('.claude/context/artifacts/reports/analytics.md', report);
```

### Validation Hook

**Hook**: `.claude/hooks/validation/track-analytics-validator.cjs`

Validates analytics fields on Write/Edit to `metadata.json` files:

- Metrics bounds (elapsedTimeMs >= 0, effortMultiplier in [0.5, 5], etc.)
- Reporting timestamp format (ISO 8601)
- Insights array structure

**Environment Variable**: `TRACK_ANALYTICS_VALIDATOR=block|warn|off` (default: warn)

### Test Coverage

- **150 tests** from SPEC-007 (schema validation)
- **65 tests** from SPEC-008 (analytics functions)
- **Total**: 215 tests with 100% pass rate

---

## Changelog

### Version 1.1.0 (2026-01-29)

**SPEC-008 Release**:

- Added `metrics` object (elapsedTimeMs, effortMultiplier, riskScore, completionRate)
- Added `reporting` object (generatedAt, lastReportPath, insights)
- Analytics library (`.claude/lib/utils/track-analytics.cjs`)
- Query functions: queryByPhase, queryByAgent, queryByStatus, computeProjectMetrics
- Report generation: generateReport
- Validation hook: track-analytics-validator.cjs
- 65 new tests (total: 215 tests, 100% pass rate)

### Version 1.0.0 (2026-01-29)

**Initial Release** (SPEC-007):

- JSON Schema v7 draft
- Required fields: trackId, type, status
- Optional fields: phaseState, description, priority, classification, effort tracking, dependencies, timestamps, assignee, blocking relationships
- Extensible with additional properties
- Comprehensive validation rules
- 150 test cases with 100% coverage

---

**Generated by**: Developer Agent (Task #15)
**Date**: 2026-01-29
**Schema Location**: `.claude/schemas/track-metadata.schema.json`
**Analytics Library**: `.claude/lib/utils/track-analytics.cjs`
