# Phased Rollout Strategy

## Overview

This document describes the phased rollout system for the hybrid memory system (Task #35). The system uses feature flags with percentage-based gradual rollout and consistent hashing for stable user assignment.

## Architecture

### Components

1. **FeatureFlags class** (`.claude/lib/utils/feature-flags.cjs`)
   - Manages feature flag state
   - Implements consistent hashing for stable assignment
   - Provides rollback procedure

2. **Environment Variables**
   - `MEMORY_SYSTEM_ENABLED` (true/false) - Global enable/disable
   - `MEMORY_ROLLOUT_PERCENTAGE` (0-100) - Gradual rollout percentage

3. **Rollout Algorithm**
   - SHA-256 hash of `feature:sessionId`
   - First 8 hex characters converted to integer
   - Modulo 100 for percentage (0-99)
   - Session assigned if hash < rollout percentage

## Rollout Phases

### Phase 1: 10% Rollout

**Objective**: Validate production stability with limited exposure

**Configuration**:

```bash
MEMORY_SYSTEM_ENABLED=true
MEMORY_ROLLOUT_PERCENTAGE=10
```

**Expected Behavior**:

- ~10% of sessions use hybrid memory system
- ~90% of sessions use legacy file-based system
- Assignment is stable per session (same session = same result)

**Validation**:

- Monitor error rates (target: <0.1%)
- Check latency (p50 <10ms, p99 <50ms)
- Verify no data loss
- Confirm rollback works

**Duration**: 1-2 days minimum

**Success Criteria**:

- Zero data loss incidents
- Error rate within acceptable limits (<0.1%)
- Latency targets met
- No critical bugs

**Rollback**:

```javascript
const { FeatureFlags } = require('./.claude/lib/utils/feature-flags.cjs');
const flags = new FeatureFlags();
flags.rollback('memory_system', 'Critical bug: <description>');
```

### Phase 2: 50% Rollout

**Objective**: Validate at scale, stress-test infrastructure

**Configuration**:

```bash
MEMORY_SYSTEM_ENABLED=true
MEMORY_ROLLOUT_PERCENTAGE=50
```

**Expected Behavior**:

- ~50% of sessions use hybrid memory system
- ~50% of sessions use legacy system (control group)
- Assignment remains stable per session

**Validation**:

- Monitor performance under load
- Compare metrics between hybrid and legacy (A/B test)
- Verify ChromaDB handles concurrent queries
- Check SQLite database growth

**Duration**: 3-5 days minimum

**Success Criteria**:

- Performance equal or better than legacy
- ChromaDB stable under load
- SQLite scaling acceptable
- Positive user feedback

**Rollback**:

```bash
# Emergency disable (environment variable)
MEMORY_ROLLOUT_PERCENTAGE=0

# OR via API
flags.rollback('memory_system', 'Performance degradation detected');
```

### Phase 3: 100% Rollout

**Objective**: Full production deployment

**Configuration**:

```bash
MEMORY_SYSTEM_ENABLED=true
MEMORY_ROLLOUT_PERCENTAGE=100
```

**Expected Behavior**:

- All sessions use hybrid memory system
- Legacy system deprecated (but available for rollback)

**Validation**:

- Monitor for 1-2 weeks
- Gradual legacy system deprecation
- Document migration complete

**Success Criteria**:

- All users migrated successfully
- Performance targets maintained at 100%
- Zero rollbacks needed

## Usage Examples

### Initialize Feature Flags

```javascript
const { FeatureFlags } = require('./.claude/lib/utils/feature-flags.cjs');

// Create instance (reads from env automatically)
const flags = new FeatureFlags();

// Check if memory system is enabled globally
if (flags.isEnabled('memory_system')) {
  console.log('Memory system is enabled');
}

// Get current rollout percentage
const percentage = flags.getRolloutPercentage('memory_system');
console.log(`Rollout: ${percentage}%`);
```

### Check Rollout for Session

```javascript
const { FeatureFlags } = require('./.claude/lib/utils/feature-flags.cjs');
const flags = new FeatureFlags();

// Session ID from Claude session or user identifier
const sessionId = process.env.CLAUDE_SESSION_ID || 'default-session';

// Determine if this session should use memory system
if (flags.shouldUse('memory_system', sessionId)) {
  // Use hybrid memory system (SQLite + ChromaDB)
  const memory = require('./.claude/lib/memory/contextual-memory.cjs');
  const results = await memory.search(query);
} else {
  // Use legacy file-based system
  const fs = require('fs');
  const content = fs.readFileSync('.claude/context/memory/learnings.md', 'utf8');
}
```

### Emergency Rollback

```javascript
const { FeatureFlags } = require('./.claude/lib/utils/feature-flags.cjs');
const flags = new FeatureFlags();

// Rollback with reason
flags.rollback('memory_system', 'Critical bug: ChromaDB connection timeout');

// Verify disabled
console.log(flags.isEnabled('memory_system')); // false
console.log(flags.getRolloutPercentage('memory_system')); // 0
```

### Status Monitoring

```javascript
const { FeatureFlags } = require('./.claude/lib/utils/feature-flags.cjs');
const flags = new FeatureFlags();

// Get status for single feature
const status = flags.getStatus('memory_system');
console.log(status);
// {
//   enabled: true,
//   rolloutPercentage: 50,
//   rollbackHistory: [
//     { timestamp: '2026-01-29T...', reason: '...' }
//   ]
// }

// Get all features
const allStatus = flags.getAllStatus();
console.log(allStatus);
// {
//   memory_system: { enabled: true, rolloutPercentage: 50, ... },
//   party_mode: { enabled: false, rolloutPercentage: 0, ... }
// }
```

## Consistent Hashing Algorithm

The rollout uses consistent hashing to ensure stable assignment:

1. **Input**: `feature:sessionId`
2. **Hash**: SHA-256
3. **Extract**: First 8 hex characters
4. **Convert**: Parse as integer (base 16)
5. **Normalize**: Modulo 100 (0-99)
6. **Assign**: If hash < rollout percentage, enable feature

**Properties**:

- Same session ID always gets same assignment
- Distribution is uniform across 0-99 range
- No sudden changes when percentage increases

**Example**:

```javascript
// Session: "user-123", Feature: "memory_system"
// Input: "memory_system:user-123"
// SHA-256: "a3f5b2c1..." (64 hex chars)
// Extract: "a3f5b2c1" (first 8 chars)
// Integer: 2750870209 (base 16 → base 10)
// Percentage: 9 (2750870209 % 100)
// Result: Enabled if rollout >= 10%
```

## Testing

### Unit Tests

```bash
npm test -- tests/unit/utils/feature-flags.test.mjs
```

**Coverage**:

- Construction and configuration (6 tests)
- Phased rollout logic (8 tests)
- Rollback procedure (3 tests)
- Multiple features support (2 tests)
- Status reporting (3 tests)

**Total**: 22 tests, 100% pass rate

### Integration Testing

Manual validation:

```bash
# Phase 1: 10% rollout
export MEMORY_SYSTEM_ENABLED=true
export MEMORY_ROLLOUT_PERCENTAGE=10

# Test 100 different session IDs
for i in {1..100}; do
  node -e "
    const { FeatureFlags } = require('./.claude/lib/utils/feature-flags.cjs');
    const flags = new FeatureFlags();
    const enabled = flags.shouldUse('memory_system', 'user-$i');
    console.log(\`user-$i: \${enabled}\`);
  "
done | grep true | wc -l
# Expected: ~10 (8-12 range acceptable)
```

## Monitoring

### Key Metrics

1. **Rollout Distribution**
   - Expected: ~X% enabled (where X = rollout percentage)
   - Tolerance: ±2%

2. **Error Rates**
   - Hybrid memory: <0.1% (target)
   - Legacy memory: <0.05% (baseline)

3. **Latency**
   - p50: <10ms (semantic search)
   - p99: <50ms (semantic search)
   - No regression vs. legacy

4. **Stability**
   - Zero data loss
   - Zero session reassignments
   - Zero unintended rollbacks

### Dashboards

**Feature Flag Status**:

```bash
node -e "
  const { FeatureFlags } = require('./.claude/lib/utils/feature-flags.cjs');
  const flags = new FeatureFlags();
  console.log(JSON.stringify(flags.getAllStatus(), null, 2));
"
```

**Rollout Distribution**:

```bash
# Check how many sessions are enabled (sample 1000)
node .claude/tools/cli/rollout-distribution.cjs --feature memory_system --samples 1000
# Expected output:
# Enabled: 103/1000 (10.3%)
# Disabled: 897/1000 (89.7%)
```

## Rollback Procedures

### Immediate Rollback

**When**: Critical bug, data loss, or production incident

**Action**:

```bash
# 1. Disable via environment variable (fastest)
export MEMORY_ROLLOUT_PERCENTAGE=0

# 2. OR disable globally
export MEMORY_SYSTEM_ENABLED=false

# 3. Restart affected services (if needed)
# 4. Verify rollback
node -e "
  const { FeatureFlags } = require('./.claude/lib/utils/feature-flags.cjs');
  const flags = new FeatureFlags();
  console.log('Enabled:', flags.isEnabled('memory_system'));
  console.log('Rollout:', flags.getRolloutPercentage('memory_system'));
"
```

### Partial Rollback

**When**: Performance degradation affects subset of users

**Action**:

```bash
# Reduce rollout percentage
export MEMORY_ROLLOUT_PERCENTAGE=10  # Down from 50%

# Sessions above 10% automatically revert to legacy
```

### Gradual Re-Enable

**After fix deployed**:

```bash
# Day 1: Test fix with 1%
export MEMORY_ROLLOUT_PERCENTAGE=1

# Day 2: Increase to 10%
export MEMORY_ROLLOUT_PERCENTAGE=10

# Day 3+: Resume normal rollout schedule
export MEMORY_ROLLOUT_PERCENTAGE=50
```

## Security Considerations

### Session ID Handling

- **Input Validation**: Session IDs sanitized before hashing
- **Fallback**: Empty/null IDs use "default-session"
- **No PII**: Session IDs should not contain personally identifiable information

### Rollback Authentication

- Rollback requires server access (environment variables)
- No client-side rollback override
- All rollbacks logged with timestamp and reason

## Performance Impact

### Overhead

- Feature flag check: <1ms (in-memory lookup)
- Hashing overhead: <1ms (SHA-256 is fast)
- Total overhead: ~2ms per session initialization

### Memory Usage

- Per-feature overhead: ~100 bytes
- Total for 10 features: ~1KB
- Negligible compared to application memory

## Compatibility

### Backward Compatibility

- Legacy file-based system remains available
- Gradual migration (no breaking changes)
- Rollback to 100% legacy possible anytime

### Forward Compatibility

- Support for multiple features (memory_system, party_mode, etc.)
- Extensible to other rollout strategies (time-based, geo-based)

## Related Documentation

- **Task Specification**: `.claude/context/plans/production-hardening-plan-20260128.md` (Task #35)
- **Memory System Spec**: `.claude/context/artifacts/specs/memory-system-enhancement-spec.md`
- **Performance Benchmarks**: `tests/performance/memory-benchmarks.test.mjs`
- **Feature Flags Implementation**: `.claude/lib/utils/feature-flags.cjs`
- **Unit Tests**: `tests/unit/utils/feature-flags.test.mjs`

---

**Version**: 1.0.0
**Last Updated**: 2026-01-29
**Status**: Implemented (Task #35)
**Next Steps**: Deploy Phase 1 (10% rollout)
