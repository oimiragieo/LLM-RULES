---
description: An orchestrator workflow enforcing safety constraints and parallel scoping before modifying code.
---

# Start Mission Work Flow

This workflow defines the strict standard operating procedure for beginning a complex architectural task in a new or existing repository. You MUST invoke it step-by-step. Do not jump straight into file editing.

### 1. Context Metadata Gathering
If this mission is bound by existing architecture paths defined by humans:
- Use `view_file` to read `.claude/templates/mission/CONTINUATION_PLAN.md` (or equivalent `.md` plan in the project root if it exists).
- Read `.claude/templates/mission/INVARIANTS.md` and `.claude/templates/mission/ANTI_GOALS.md` to establish constraints.

### 2. Pre-Flight Health Check
Invoke `Skill({ skill: 'system-health-check' })` to strictly verify the baseline test suite is clean and the host environment has ample resources.
If the tests fail, STOP and warn the user. 
Do not assume you caused the breakage, but do not start working on new features top of a broken build.

### 3. Parallel Scouting
For large repos with heavily coupled systems (e.g., API, DB, Frontend UI), explicitly dispatch parallel read-only agents via the `TaskCreate` tool to investigate the subsystems simultaneously while you coordinate the results. 

### 4. Interactive Scoping (Optional)
If the project `CONTINUATION_PLAN.md` has 5+ distinct priorities, or if multiple scouting agents return conflicting constraints, explicitly invoke `notify_user` asking the human which specific priority item should be tackled first.

### 5. Milestone Execution
Only after steps 1-4 are verified should you begin editing files. Enforce the test-driven process locally by iteratively testing (`cargo test`/`npm test`) immediately after a batch of file edits.
