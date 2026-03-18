---
name: goal-backward-verification
description: Verify that task outputs actually achieve stated goals through 4 progressive levels of verification
version: 1.0
model: sonnet
invoked_by: both
user_invocable: true
tools: [Read, Glob, Grep, Bash]

verified: true
best_practices:
  - Always verify from Exists through Functional in order
  - Log warnings for advisory mode without blocking
  - Report structured results for downstream consumption
error_handling: graceful
streaming: supported
---

# Goal-Backward Verification

Verify that task outputs actually achieve stated goals through 4 progressive levels of verification. Works backward from the goal to verify each artifact exists, is substantive, is wired into the system, and passes functional tests.

## When to Invoke

```javascript
Skill({ skill: 'goal-backward-verification' });
```

Invoke when:

- A task claims completion and you need to verify the output
- QA agent is validating deliverables from a pipeline
- Post-pipeline drain gate needs artifact validation
- Reflection-agent is scoring task completeness

## Verification Levels

### Level 1: Exists

Verify the expected output artifact is present on disk.

```bash
# Check file existence
test -f <expected_path> && echo "PASS: File exists" || echo "FAIL: File missing"
```

**Pass**: File exists at expected path.
**Fail**: File missing — task did not produce expected output.

### Level 2: Substantive

Verify the file contains real content, not a stub or placeholder.

**Checks:**

- File has more than 10 non-empty, non-comment lines
- File does not consist primarily of TODO, PLACEHOLDER, FIXME, or stub markers
- For code files: at least one function/class definition present
- For markdown: at least one heading and paragraph of content

```bash
# Count substantive lines (non-empty, non-comment)
grep -cvE '^\s*(//|#|\*|$|TODO|PLACEHOLDER|FIXME|STUB)' <file>
```

**Pass**: File has substantive content (>10 real lines).
**Fail**: Stub detected — file exists but contains no real implementation.

### Level 3: Wired

Verify the artifact is imported, referenced, or registered by the system.

**Checks:**

- For `.cjs`/`.js` modules: at least 1 `require()` or `import` reference in other files
- For skills: listed in an agent's `skills:` frontmatter or skill-index.json
- For schemas: referenced by at least 1 validation script or test
- For hooks: registered in settings.json
- For agents: listed in agent-registry.json

```bash
# Search for references to the artifact
grep -r "require.*<module-name>" .claude/ --include="*.cjs" --include="*.js" | grep -v node_modules | grep -v _archive
```

**Pass**: At least 1 external reference found.
**Fail**: Orphaned artifact — exists but nothing uses it.

### Level 4: Functional

Verify the artifact passes its associated tests end-to-end.

**Checks:**

- Locate test file(s) for the artifact (convention: `tests/<mirror-path>/<name>.test.cjs`)
- Run tests with `node --test <test-file>`
- Exit code 0 = pass

```bash
# Run associated tests
node --test tests/<path>/<artifact>.test.cjs
```

**Pass**: All tests pass (exit code 0).
**Fail**: Test failures detected — artifact may be broken.

## Modes

### Strict Mode (default for HIGH/EPIC complexity)

All 4 levels must pass. Any failure at any level blocks the verification.

### Advisory Mode (default for LOW/MEDIUM complexity)

All 4 levels are checked, but failures produce warnings instead of blocking. Useful for incremental development where wiring may not be complete yet.

Set mode via environment variable:

```bash
GOAL_VERIFICATION_MODE=strict  # or advisory
```

## Output Format

```json
{
  "artifact": "path/to/file",
  "levels": {
    "exists": { "passed": true },
    "substantive": { "passed": true, "lines": 45 },
    "wired": { "passed": true, "references": ["path/to/importer.cjs"] },
    "functional": { "passed": false, "reason": "2 tests failed", "exitCode": 1 }
  },
  "verdict": "PARTIAL",
  "mode": "advisory",
  "passedLevels": 3,
  "totalLevels": 4
}
```

**Verdict values:**

- `PASS` — All 4 levels passed
- `PARTIAL` — Some levels passed, some failed
- `FAIL` — Level 1 (Exists) failed (nothing else to check)

## Workflow

### Step 1: Identify Artifacts

Read the task's acceptance criteria or plan file to identify expected output artifacts (files, schemas, skills, hooks).

### Step 2: Run Verification Cascade

For each artifact, run Levels 1-4 in order. Stop early if Level 1 fails (no point checking substantiveness of a missing file).

### Step 3: Produce Report

Generate structured JSON output with per-artifact, per-level results. Include the overall verdict.

### Step 4: Log Results

In advisory mode, log warnings to session-gap-log for reflection-agent consumption. In strict mode, return FAIL verdict to block completion.

## Anti-Patterns

- Never skip Level 1 (Exists) — it gates all other checks
- Never mark an artifact as "Wired" just because it exists in the right directory
- Never run Level 4 (Functional) if Level 2 (Substantive) fails — a stub will have no meaningful tests
- Never hardcode artifact paths — derive from task metadata or plan file

## Related Skills

- `verification-before-completion` — Evidence-based completion gates
- `proactive-audit` — Framework health checks
- `tdd` — Test-driven development ensuring Level 4 passes
