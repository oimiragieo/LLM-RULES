# Developer Onboarding Guide

**Version:** 1.0.0
**Last Updated:** 2026-01-30
**Target Audience:** New developers joining the agent-studio project

---

## Table of Contents

1. [Quick Start](#quick-start)
2. [Project Structure Tour](#project-structure-tour)
3. [Memory Management Best Practices](#memory-management-best-practices)
4. [Testing Guide](#testing-guide)
5. [Common Development Tasks](#common-development-tasks)
6. [Code Quality Standards](#code-quality-standards)

---

## Quick Start

### Prerequisites

Before you begin, ensure you have the following installed:

- **Node.js 20+** (LTS recommended)
- **npm 10+** (comes with Node.js)
- **Git 2.40+**
- A code editor (VS Code recommended with ESLint extension)

Verify your installation:

```bash
node --version    # Should be v20.x.x or higher
npm --version     # Should be 10.x.x or higher
git --version     # Should be 2.40.x or higher
```

### Clone and Install

```bash
# Clone the repository
git clone https://github.com/your-org/agent-studio.git
cd agent-studio

# Install dependencies
npm install

# Copy environment template
cp .env.example .env
```

### Configure Environment

Edit `.env` with your local settings:

```bash
# Development environment
AGENT_STUDIO_ENV=development

# ML Features (enable all for development)
PATTERN_DETECTION_ENABLED=true
COST_PREDICTION_ENABLED=true
ADAPTIVE_EXECUTION_ENABLED=true
PERFORMANCE_PROFILING_ENABLED=true
PATTERN_LIBRARY_ENABLED=true

# Memory settings
HEAP_WARNING_THRESHOLD=70
HEAP_CRITICAL_THRESHOLD=85
```

### Run Tests

Verify everything works:

```bash
# Run the full test suite
npm test

# Expected output:
# tests 1364
# pass 1322
# fail 34 (non-critical, see Known Issues)
# Duration: ~70 seconds
```

If tests pass (96%+ pass rate), your environment is correctly configured.

### Start Development

For development work with Claude Code:

```bash
# Start Claude Code in the project directory
cd agent-studio
claude

# The CLAUDE.md file will be automatically loaded,
# providing agent-studio context to Claude
```

For running the workflow engine directly:

```bash
# Run a workflow
node .claude/lib/workflow/workflow-engine.cjs

# Run with memory monitoring
NODE_OPTIONS="--trace-gc --max-old-space-size=4096" node index.js
```

---

## Project Structure Tour

### Top-Level Directory

```
agent-studio/
├── .claude/              # Claude Code framework (main codebase)
├── tests/                # Test files (.mjs and .cjs)
├── .env                  # Environment configuration (not committed)
├── .env.example          # Environment template
├── package.json          # Node.js project configuration
└── README.md             # Project overview
```

### .claude/agents/ - Agent Definitions

This directory contains all agent definitions. Each agent is a markdown file with YAML frontmatter.

```
.claude/agents/
├── core/                 # Essential agents
│   ├── developer.md      # Bug fixes, coding
│   ├── planner.md        # Feature planning
│   ├── architect.md      # System design
│   ├── qa.md             # Testing
│   ├── technical-writer.md # Documentation
│   ├── pm.md             # Product management
│   ├── reflection-agent.md # Quality reflection
│   ├── context-compressor.md # Context summarization
│   └── router.md         # Request routing (meta-agent)
│
├── domain/               # Language/framework experts
│   ├── python-pro.md
│   ├── rust-pro.md
│   ├── golang-pro.md
│   ├── typescript-pro.md
│   ├── frontend-pro.md
│   ├── java-pro.md
│   ├── nextjs-pro.md
│   └── ... (20+ more)
│
├── specialized/          # Function-specific agents
│   ├── security-architect.md
│   ├── devops.md
│   ├── devops-troubleshooter.md
│   ├── incident-responder.md
│   ├── code-reviewer.md
│   ├── database-architect.md
│   └── ... (15+ more)
│
└── orchestrators/        # Multi-agent coordination
    ├── master-orchestrator.md
    ├── swarm-coordinator.md
    ├── evolution-orchestrator.md
    └── party-orchestrator.md
```

**Agent File Format:**

```markdown
---
name: agent-name
version: 1.0.0
description: What this agent does
model: sonnet # haiku, sonnet, or opus
tools: [Read, Write, Edit, Bash, TaskUpdate, TaskList, Skill]
skills:
  - skill-name
---

# Agent Name

## Purpose

[Agent purpose]

## Capabilities

[What the agent can do]

## Workflow

[How the agent operates]
```

### .claude/hooks/ - Safety and Validation Hooks

Hooks intercept tool calls and enforce policies:

```
.claude/hooks/
├── routing/              # Routing enforcement
│   ├── routing-guard.cjs # Main routing enforcer
│   └── tool-availability-validator.cjs
│
├── safety/               # Safety validations
│   ├── bash-command-validator.cjs
│   └── validators/
│       └── registry.cjs  # Command allowlist
│
├── evolution/            # Self-evolution controls
│   ├── evolution-state-guard.cjs
│   └── conflict-detector.cjs
│
├── memory/               # Memory management
│   └── memory-pressure-hook.cjs
│
└── validation/           # General validation
    └── unified-creator-guard.cjs
```

**Hook Pattern:**

```javascript
// Hook intercepts tool use
module.exports = async function (input) {
  const { tool_name, tool_input } = input;

  // Validate the operation
  if (shouldBlock(tool_input)) {
    return {
      decision: 'block',
      message: 'Operation blocked: reason',
    };
  }

  // Allow the operation
  return { decision: 'allow' };
};
```

### .claude/lib/ - Core Modules

The library contains production code:

```
.claude/lib/
├── workflow/             # Workflow execution
│   ├── workflow-engine.cjs      # Main engine
│   ├── workflow-validator.cjs   # Validation
│   ├── checkpoint-manager.cjs   # Checkpoints
│   ├── state-sync-manager.cjs   # State sync
│   ├── task-router.cjs          # Task routing
│   └── result-normalizer.cjs    # Result normalization
│
├── ml/                   # Machine learning
│   ├── index.cjs         # ML entry point
│   ├── pattern-detector.cjs
│   ├── cost-predictor.cjs
│   ├── adaptive-executor.cjs
│   └── optimization-engine.cjs
│
├── memory/               # Memory management
│   ├── memory-manager.cjs
│   ├── memory-scheduler.cjs
│   └── smart-pruner.cjs
│
├── utils/                # Utilities
│   ├── memory-monitor.cjs
│   ├── hook-input.cjs
│   └── project-root.cjs
│
└── integration/          # External integrations
    └── system-registration-handler.cjs
```

### .claude/workflows/ - Workflow Definitions

Workflow YAML files define multi-step processes:

```
.claude/workflows/
├── core/                 # Core workflows
│   ├── router-decision.md       # Routing logic
│   ├── evolution-workflow.md    # EVOLVE process
│   └── skill-lifecycle.md       # Skill management
│
├── enterprise/           # Enterprise workflows
│   ├── feature-development-workflow.md
│   └── c4-architecture-workflow.md
│
└── operations/           # Operational workflows
    └── incident-response.md
```

### .claude/skills/ - Skill Definitions

Skills are reusable capabilities:

```
.claude/skills/
├── tdd/                  # Test-driven development
│   └── SKILL.md
├── debugging/
│   └── SKILL.md
├── doc-generator/
│   └── SKILL.md
├── writing-skills/
│   └── SKILL.md
└── ... (30+ skills)
```

### tests/ - Test Suite

All tests are in the root tests/ directory:

```
tests/
├── *.test.mjs            # ES Module tests
├── *.test.cjs            # CommonJS tests
└── ... (100+ test files)
```

---

## Memory Management Best Practices

### Why Memory Management Matters

Agent-studio runs long-lived processes with many concurrent operations. Without careful memory management, processes can crash with:

```
FATAL ERROR: Reached heap limit Allocation failed - JavaScript heap out of memory
```

We fixed 8 memory leak sources to achieve production stability. Follow these patterns to prevent regressions.

### Pattern 1: Bounded Collections

**Never create unbounded arrays or maps.**

```javascript
// BAD: Unbounded growth
class Manager {
  constructor() {
    this.history = []; // Will grow forever
  }

  record(item) {
    this.history.push(item); // LEAK
  }
}

// GOOD: Bounded with automatic trimming
class Manager {
  constructor(config = {}) {
    this.history = [];
    this.maxHistorySize = config.maxHistorySize || 1000;
  }

  record(item) {
    this.history.push(item);

    // Trim after each push
    if (this.history.length > this.maxHistorySize) {
      this.history.shift(); // Remove oldest
    }
  }
}
```

### Pattern 2: Cleanup Methods

**All classes with state must implement cleanup().**

```javascript
class ChaosEngineer extends EventEmitter {
  constructor() {
    super();
    this.testResults = [];
    this.recoveryAttempts = [];
    this.injectedFaults = new Map();
  }

  // REQUIRED: cleanup method
  cleanup() {
    this.testResults = [];
    this.recoveryAttempts = [];
    this.injectedFaults.clear();
    this.removeAllListeners(); // Clear event listeners
  }
}
```

### Pattern 3: Test Cleanup Hooks

**Always call cleanup in afterEach.**

```javascript
describe('ChaosEngineer', () => {
  let chaos;

  beforeEach(() => {
    chaos = new ChaosEngineer();
  });

  // REQUIRED: afterEach cleanup
  afterEach(async () => {
    if (chaos) {
      await chaos.cleanup();
    }
  });

  it('should do something', () => {
    // Test code
  });
});
```

### Pattern 4: Event Listener Management

**Remove event listeners when done.**

```javascript
class Workflow {
  constructor() {
    this.cleanupHandler = this.cleanup.bind(this);
  }

  start() {
    process.on('SIGINT', this.cleanupHandler);
  }

  cleanup() {
    // Remove the listener
    process.removeListener('SIGINT', this.cleanupHandler);
  }
}
```

### Debugging Memory Leaks

If you suspect a memory leak:

```bash
# Run with GC tracing
NODE_OPTIONS="--trace-gc --max-old-space-size=2048" npm test

# Generate heap snapshot on OOM
NODE_OPTIONS="--heapsnapshot-on-oom" npm test

# Use Chrome DevTools for profiling
node --inspect index.js
# Open chrome://inspect
```

See `.claude/docs/MEMORY_MANAGEMENT.md` for comprehensive guidance.

---

## Testing Guide

### TDD Workflow: RED-GREEN-REFACTOR

Agent-studio follows strict TDD. All new code requires tests first.

**RED Phase: Write Failing Test**

```javascript
// tests/my-feature.test.cjs
const assert = require('node:assert');
const { test } = require('node:test');

test('MyFeature should do something', () => {
  const feature = new MyFeature();
  const result = feature.doSomething();

  // This test will FAIL (feature doesn't exist yet)
  assert.strictEqual(result, 'expected value');
});
```

Run the test to verify it fails:

```bash
node --test tests/my-feature.test.cjs
# Expected: FAIL
```

**GREEN Phase: Implement Minimal Code**

```javascript
// .claude/lib/my-feature.cjs
class MyFeature {
  doSomething() {
    return 'expected value'; // Minimal implementation
  }
}

module.exports = { MyFeature };
```

Run the test to verify it passes:

```bash
node --test tests/my-feature.test.cjs
# Expected: PASS
```

**REFACTOR Phase: Improve Code**

Now improve the implementation while keeping tests green.

### Running Tests

```bash
# Run all tests
npm test

# Run specific test file
node --test tests/my-feature.test.cjs

# Run tests matching pattern
node --test tests/workflow*.test.cjs

# Run with memory monitoring
NODE_OPTIONS="--trace-gc --max-old-space-size=4096" npm test

# Run with verbose output
npm test -- --test-reporter spec
```

### Writing Memory Leak Regression Tests

When fixing memory leaks, add regression tests:

```javascript
test('should prevent memory leak in sync history', () => {
  const manager = new StateSyncManager({ maxHistorySize: 1000 });

  // Push more items than max
  for (let i = 0; i < 1500; i++) {
    manager.sync({ id: `item-${i}` });
  }

  // Verify bounded
  assert.ok(
    manager.syncHistory.length <= 1000,
    `Expected <=1000, got ${manager.syncHistory.length}`
  );
});
```

### Test File Conventions

- Use `.test.cjs` for CommonJS tests (production code)
- Use `.test.mjs` for ES Module tests (if needed)
- Place all tests in `tests/` directory
- Name tests descriptively: `feature-name.test.cjs`

### Load Testing

For performance testing:

```javascript
const { LoadTestFramework } = require('.claude/lib/testing/load-test-framework.cjs');

test('should handle 100 concurrent workflows', async () => {
  const framework = new LoadTestFramework();

  try {
    const results = await framework.simulateConcurrentWorkflows({
      workflowCount: 100,
      duration: 60000, // 1 minute
    });

    assert.ok(results.successRate >= 99.5);
    assert.ok(results.errorRate < 0.5);
  } finally {
    await framework.cleanup();
  }
});
```

---

## Common Development Tasks

### Adding a New Agent

**Step 1: Create Agent Definition**

Create `.claude/agents/domain/my-agent.md`:

```markdown
---
name: my-agent
version: 1.0.0
description: Handles specific task type
model: sonnet
tools: [Read, Write, Edit, Bash, TaskUpdate, TaskList, TaskCreate, TaskGet, Skill]
skills:
  - relevant-skill
---

# My Agent

## Purpose

[Describe what this agent does]

## Capabilities

- Capability 1
- Capability 2
- Capability 3

## Workflow

1. Read task context
2. Analyze requirements
3. Execute work
4. Update task status

## Memory Protocol

Read `.claude/context/memory/learnings.md` before starting.
Write learnings to memory after completing.
```

**Step 2: Update Routing Table**

Add to `.claude/CLAUDE.md` Section 3:

```markdown
| Specific task type | `my-agent` | `.claude/agents/domain/my-agent.md` |
```

**Step 3: Add Intent Keywords**

Update `.claude/hooks/routing/router-enforcer.cjs`:

```javascript
const intentKeywords = {
  // ... existing keywords
  'my-agent': ['keyword1', 'keyword2', 'specific-phrase'],
};
```

**Step 4: Test Routing**

Ask Claude Code a question using your keywords and verify routing.

### Adding a New Skill

**Step 1: Create Skill Directory**

```bash
mkdir .claude/skills/my-skill
```

**Step 2: Create SKILL.md**

```markdown
---
name: my-skill
description: Use when [specific triggering conditions]
---

# My Skill

## Overview

[What this skill does in 1-2 sentences]

## When to Use

- Symptom 1
- Symptom 2
- Use case

## Core Pattern

[Main technique or pattern]

## Quick Reference

| Command | Description |
| ------- | ----------- |
| cmd1    | Does X      |
| cmd2    | Does Y      |

## Common Mistakes

1. Mistake 1 - Fix
2. Mistake 2 - Fix

## Memory Protocol

Read learnings before starting.
Write learnings after completing.
```

**Step 3: Add to Skill Catalog**

Update `.claude/context/artifacts/skill-catalog.md`

**Step 4: Assign to Agents**

Add the skill to relevant agent definitions:

```yaml
skills:
  - my-skill
```

### Creating a Hook

**Step 1: Create Hook File**

Create `.claude/hooks/category/my-hook.cjs`:

```javascript
'use strict';

/**
 * My Hook
 * Purpose: [What this hook does]
 */

module.exports = async function (input) {
  const { tool_name, tool_input } = input;

  // Skip if not relevant tool
  if (tool_name !== 'TargetTool') {
    return { decision: 'allow' };
  }

  // Validate
  if (someCondition(tool_input)) {
    return {
      decision: 'block',
      message: 'Blocked: reason',
    };
  }

  return { decision: 'allow' };
};
```

**Step 2: Register Hook**

Add to `.claude/settings.json`:

```json
{
  "hooks": {
    "PreToolUse": [".claude/hooks/category/my-hook.cjs"]
  }
}
```

**Step 3: Test Hook**

Write tests for the hook behavior.

### Writing a Multi-Agent Workflow

**Step 1: Define Workflow**

Create `.claude/workflows/enterprise/my-workflow.md`:

```markdown
# My Workflow

## Overview

Multi-agent workflow for [purpose].

## Phases

### Phase 1: Planning

**Agent:** planner

**Steps:**

1. Analyze requirements
2. Create task breakdown
3. Identify dependencies

### Phase 2: Implementation

**Agent:** developer

**Steps:**

1. Implement features
2. Write tests
3. Update documentation

### Phase 3: Review

**Agent:** code-reviewer

**Steps:**

1. Review code changes
2. Identify issues
3. Approve or request changes
```

**Step 2: Implement Orchestration**

The master-orchestrator or swarm-coordinator will execute the workflow.

### Debugging with Memory Profiling

**Step 1: Enable Profiling**

```bash
NODE_OPTIONS="--inspect --trace-gc" node index.js
```

**Step 2: Open Chrome DevTools**

1. Open `chrome://inspect`
2. Click "inspect" on your Node process
3. Go to Memory tab

**Step 3: Take Heap Snapshots**

1. Take baseline snapshot
2. Run suspected leaking code
3. Take second snapshot
4. Compare snapshots

**Step 4: Identify Leaks**

Look for:

- Growing arrays
- Retained closures
- Accumulated event listeners

---

## Code Quality Standards

### ESLint Configuration

The project uses ESLint for code quality:

```bash
# Run linter
npm run lint

# Fix auto-fixable issues
npm run lint:fix
```

**Key Rules:**

- No unused variables
- No console.log in production (warning)
- Consistent quotes (single)
- Semicolons required
- No var (use let/const)

### Code Review Checklist

Before submitting PR, verify:

**Memory Safety:**

- [ ] All arrays have max size limits
- [ ] All classes implement cleanup() methods
- [ ] Tests use afterEach cleanup hooks
- [ ] No event listener leaks

**Testing:**

- [ ] New code has tests (TDD)
- [ ] Tests follow RED-GREEN-REFACTOR
- [ ] Memory leak regression tests added if applicable
- [ ] All tests pass locally

**Documentation:**

- [ ] Code comments explain WHY, not WHAT
- [ ] README updated if API changed
- [ ] Agent/skill definitions follow templates

**Quality:**

- [ ] No ESLint errors
- [ ] Consistent with existing code style
- [ ] Meaningful commit messages

### Documentation Standards

**Code Comments:**

```javascript
// GOOD: Explains why
// Limit to 1000 entries to prevent heap OOM during long-running processes
this.maxHistorySize = 1000;

// BAD: Explains what (obvious from code)
// Set max history size to 1000
this.maxHistorySize = 1000;
```

**JSDoc for Public APIs:**

```javascript
/**
 * Detect frequent task sequences in workflow history.
 *
 * @param {Object[]} workflows - Array of workflow execution records
 * @param {Object} options - Detection options
 * @param {number} options.minSupport - Minimum support threshold (0-1)
 * @returns {Object[]} Array of detected patterns sorted by support
 */
detectFrequentSequences(workflows, options = {}) {
  // ...
}
```

### Performance Budgets

Follow budgets in `.claude/docs/PERFORMANCE_BUDGETS.md`:

| Component         | Memory Budget | Enforcement              |
| ----------------- | ------------- | ------------------------ |
| StateSyncManager  | 50KB          | maxHistorySize = 1000    |
| LoadTestFramework | 100KB         | MAX_METRICS = 1000       |
| ChaosEngineer     | 0KB           | cleanup() in afterEach   |
| Agent Context     | 2MB           | context-compressor skill |

---

## Getting Help

### Documentation

| Topic               | Location                                       |
| ------------------- | ---------------------------------------------- |
| Framework spec      | `.claude/CLAUDE.md`                            |
| Memory management   | `.claude/docs/MEMORY_MANAGEMENT.md`            |
| Performance budgets | `.claude/docs/PERFORMANCE_BUDGETS.md`          |
| Operations          | `.claude/docs/OPERATIONS_HANDBOOK.md`          |
| Architecture        | `.claude/docs/SYSTEM_ARCHITECTURE_HANDBOOK.md` |

### Memory Files

Check project history and decisions:

- `.claude/context/memory/learnings.md` - Patterns and solutions
- `.claude/context/memory/decisions.md` - Architecture decisions
- `.claude/context/memory/issues.md` - Known issues and workarounds

### Common Issues

**Tests failing with OOM:**

- Reduce heap size to catch leaks earlier
- Add afterEach cleanup hooks
- Check for unbounded arrays

**Agent not routing correctly:**

- Verify keywords in router-enforcer.cjs
- Check agent file exists and is valid YAML
- Review routing table in CLAUDE.md

**Skill not invoking:**

- Use `Skill({ skill: 'name' })`, not just reading the file
- Verify skill is in skill catalog
- Check skill assigned to agent

---

**Document Version:** 1.0.0
**Last Updated:** 2026-01-30
**Maintainer:** Development Team
