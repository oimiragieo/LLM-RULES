---
name: app-generation-workflow
description: >-
  End-to-end workflow for autonomous app generation from forum pain point
  discovery through requirements drafting, code generation, validation,
  and reporting. Orchestrates forum-monitor-agent and app-generator-agent
  across six phases.
version: 1.0.0
agents:
  - forum-monitor-agent
  - app-generator-agent
  - qa
  - security-architect
  - code-reviewer
  - developer
tags:
  - app-generation
  - pain-point-discovery
  - autonomous
  - forum-monitoring
  - code-generation
  - workflow
---

# App Generation Workflow

Autonomous pipeline that discovers user pain points from online forums and generates
working application prototypes to address the highest-opportunity findings.

## Overview

This workflow orchestrates two primary agents across six sequential phases:

1. **Monitor**: Scrape and classify forum discussions
2. **Identify**: Rank and select the most promising pain points
3. **Specify**: Draft requirements from selected pain points
4. **Generate**: Scaffold application code using TDD
5. **Validate**: Run tests, lint, security review
6. **Report**: Produce a comprehensive pipeline report

## When to Use

- Running an autonomous product discovery and prototyping cycle
- Periodic (weekly/monthly) market research + prototype generation
- Competitive gap analysis with automatic prototype creation
- Hackathon-style rapid product ideation with working code output

## Configuration Options

### Monitor Scope

- **forums**: Which forums to scan (reddit, hn, producthunt, indiehackers, devto)
- **topic**: Target domain or industry keyword
- **time_window**: How far back to scan (7d, 30d, 90d)

### Generation Scope

- **max_apps**: Maximum number of apps to generate per run (default: 1)
- **min_opportunity_score**: Minimum score threshold for generation (default: 7.0)
- **stack_preference**: Preferred tech stack (auto-detect, node, python, react)

## Phase 1: Monitor

### Step 1: Forum Scanning

**Agent**: `forum-monitor-agent`

**Task Spawn**:

```javascript
Task({
  task_id: 'task-monitor-1',
  subagent_type: 'forum-monitor-agent',
  prompt: `You are the FORUM-MONITOR-AGENT.

## Task
Scan online forums for recurring user pain points related to: {TOPIC}

## Instructions
1. Read your agent definition: .claude/agents/domain/forum-monitor-agent.md
2. Invoke: Skill({ skill: "forum-monitor" })
3. Monitor forums: {FORUM_LIST}
4. Time window: last {TIME_WINDOW}
5. Collect minimum 20 posts per forum
6. Classify all findings into pain-point categories
7. Rank by opportunity score
8. Save report to: .claude/context/reports/backend/forum-monitor-report-{DATE}.md

## Memory Protocol
1. Read .claude/context/memory/learnings.md first
2. Record discoveries to .claude/context/memory/learnings.md

## TaskUpdate Protocol
- FIRST: TaskUpdate({ taskId: "task-monitor-1", status: "in_progress" })
- LAST: TaskUpdate({ taskId: "task-monitor-1", status: "completed", metadata: { summary: "...", filesModified: [...] } })
`,
});
```

**Expected Output**: Forum monitor report at `.claude/context/reports/backend/forum-monitor-report-{DATE}.md`

## Phase 2: Identify

### Step 2: Pain Point Selection

**Agent**: `forum-monitor-agent` (continued) or Router selection

The monitor report is filtered to select pain points that meet the generation threshold:

- Opportunity score >= `min_opportunity_score` (default 7.0)
- Category is `missing-feature` or `integration-gap` (most buildable)
- At least 3 independent source posts confirming the pain point
- No existing well-known solution already dominates the space

**Selection Output**: Top N pain points (where N = `max_apps`) written to
`.claude/context/plans/app-generation-candidates-{DATE}.md`

## Phase 3: Specify

### Step 3: Requirement Drafting

**Agent**: `app-generator-agent`

**Task Spawn**:

```javascript
Task({
  task_id: 'task-spec-1',
  subagent_type: 'app-generator-agent',
  prompt: `You are the APP-GENERATOR-AGENT.

## Task
Draft requirements for an application that solves the following pain point:
{PAIN_POINT_DESCRIPTION}

## Instructions
1. Read your agent definition: .claude/agents/domain/app-generator-agent.md
2. Read the forum monitor report: .claude/context/reports/backend/forum-monitor-report-{DATE}.md
3. Read the candidate selection: .claude/context/plans/app-generation-candidates-{DATE}.md
4. Invoke: Skill({ skill: "spec-init" })
5. Draft a requirements document with:
   - Problem statement (from pain point data)
   - Target users (from forum demographics)
   - Core features (MVP scope only, 3-5 features)
   - Non-goals (explicitly excluded scope)
   - Success criteria (measurable)
   - Technical approach (recommended stack)
6. Save to: .claude/context/artifacts/specs/{APP_NAME}-requirements-{DATE}.md

## Memory Protocol
1. Read .claude/context/memory/learnings.md first
2. Record decisions to .claude/context/memory/decisions.md

## TaskUpdate Protocol
- FIRST: TaskUpdate({ taskId: "task-spec-1", status: "in_progress" })
- LAST: TaskUpdate({ taskId: "task-spec-1", status: "completed", metadata: { summary: "...", filesModified: [...] } })
`,
});
```

**Expected Output**: Requirements document at `.claude/context/artifacts/specs/{APP_NAME}-requirements-{DATE}.md`

## Phase 4: Generate

### Step 4: Code Scaffolding (TDD)

**Agent**: `app-generator-agent`

**Task Spawn**:

```javascript
Task({
  task_id: 'task-gen-1',
  subagent_type: 'app-generator-agent',
  prompt: `You are the APP-GENERATOR-AGENT.

## Task
Generate application code from the requirements document.

## Instructions
1. Read your agent definition: .claude/agents/domain/app-generator-agent.md
2. Read requirements: .claude/context/artifacts/specs/{APP_NAME}-requirements-{DATE}.md
3. Invoke: Skill({ skill: "tdd" })
4. Invoke: Skill({ skill: "plan-generator" })
5. For each core feature:
   a. Write a failing test (RED)
   b. Implement minimal code to pass (GREEN)
   c. Refactor for quality (REFACTOR)
6. Ensure project has:
   - package.json or equivalent manifest
   - README.md with setup instructions
   - Test suite with passing tests
   - Proper .gitignore
7. Save generated app to: .claude/context/artifacts/generated-apps/{APP_NAME}/

## Memory Protocol
1. Read .claude/context/memory/learnings.md first
2. Record patterns to .claude/context/memory/learnings.md

## TaskUpdate Protocol
- FIRST: TaskUpdate({ taskId: "task-gen-1", status: "in_progress" })
- LAST: TaskUpdate({ taskId: "task-gen-1", status: "completed", metadata: { summary: "...", filesModified: [...] } })
`,
});
```

**Expected Output**: Generated application at `.claude/context/artifacts/generated-apps/{APP_NAME}/`

## Phase 5: Validate

### Step 5a: QA Validation (Parallel)

**Agent**: `qa`

Validate the generated application:

- All tests pass
- Lint checks pass
- No obvious code quality issues
- Build/start succeeds

### Step 5b: Security Review (Parallel)

**Agent**: `security-architect`

Review the generated application for:

- No hardcoded secrets
- Input validation present
- No injection vulnerabilities
- Dependencies are safe (no known CVEs)

**Task Spawn** (both spawned in parallel):

```javascript
Task({
  task_id: 'task-qa-1',
  subagent_type: 'qa',
  prompt: `Validate the generated application at .claude/context/artifacts/generated-apps/{APP_NAME}/.
Run tests, check lint, verify build. Report findings.`,
});

Task({
  task_id: 'task-sec-1',
  subagent_type: 'security-architect',
  prompt: `Security review the generated application at .claude/context/artifacts/generated-apps/{APP_NAME}/.
Check for hardcoded secrets, injection risks, unsafe dependencies. Report findings.`,
});
```

**Expected Output**: QA report and security report

## Phase 6: Report

### Step 6: Pipeline Report

**Agent**: Router (synthesizes outputs)

Compile all phase outputs into a final pipeline report:

```markdown
<!-- Agent: router | Task: #{id} | Session: {date} -->

# App Generation Pipeline Report

**Date**: {DATE}
**Topic**: {TOPIC}
**Forums Scanned**: {FORUM_LIST}

## Pipeline Summary

| Phase    | Status   | Duration | Output                              |
| -------- | -------- | -------- | ----------------------------------- |
| Monitor  | COMPLETE | Xm       | forum-monitor-report-{DATE}.md      |
| Identify | COMPLETE | Xm       | app-generation-candidates-{DATE}.md |
| Specify  | COMPLETE | Xm       | {APP_NAME}-requirements-{DATE}.md   |
| Generate | COMPLETE | Xm       | generated-apps/{APP_NAME}/          |
| Validate | COMPLETE | Xm       | QA + Security reports               |
| Report   | COMPLETE | Xm       | This document                       |

## Generated Application

- **Name**: {APP_NAME}
- **Pain Point**: {description}
- **Opportunity Score**: {score}
- **Files Generated**: {count}
- **Tests**: {pass_count}/{total_count} passing
- **Security Issues**: {count}

## Next Steps

- [ ] Human review of generated code
- [ ] Deploy to staging environment
- [ ] User testing with target audience from forums
- [ ] Iterate based on feedback
```

Save to `.claude/context/reports/backend/app-generation-pipeline-{DATE}.md`

## Error Recovery

### If Phase 1 (Monitor) fails

1. Check WebSearch/WebFetch connectivity
2. Verify forum URLs are accessible
3. Retry with reduced forum list
4. If persistent: skip to manual pain-point input

### If Phase 4 (Generate) fails

1. Check if requirements are too vague -> re-run Phase 3 with more specific scope
2. Check if stack is unsupported -> suggest alternative
3. If persistent: generate a simpler subset of features

### If Phase 5 (Validate) finds critical issues

1. Route critical security findings back to Phase 4 for fix
2. Route QA failures back to Phase 4 for fix
3. Maximum 2 fix-validate loops before escalating to human review

## Success Criteria

- [ ] Forum monitor report generated with >= 5 ranked pain points
- [ ] At least 1 pain point scores >= 7.0 (opportunity threshold)
- [ ] Requirements document has 3-5 core features defined
- [ ] Generated app has passing tests
- [ ] Generated app passes security review (no CRITICAL findings)
- [ ] Pipeline report documents all phases

## Usage Example

```javascript
// Router spawning the workflow
Task({
  task_id: 'task-pipeline-1',
  subagent_type: 'forum-monitor-agent',
  prompt: `Execute Phase 1 of the app-generation-workflow.
Topic: developer-tools
Forums: reddit, hn, producthunt
Time window: 30d
Follow: .claude/workflows/enterprise/app-generation-workflow.md`,
});
```

## Cron Integration

Schedule this workflow for periodic execution:

```javascript
CronCreate({
  name: 'monthly-app-generation',
  schedule: '0 6 1 * *', // First of each month at 6 AM
  prompt:
    'Execute app-generation-workflow for topic: developer-tools. Follow .claude/workflows/enterprise/app-generation-workflow.md',
});
```
