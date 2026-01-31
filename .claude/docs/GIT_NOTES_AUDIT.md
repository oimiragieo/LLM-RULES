# Git Notes Audit Trail

## Overview

The git notes audit trail provides cryptographically verified metadata for every commit made by agents in the framework. This enables:

- **Forensic Analysis**: Trace decisions back to the agent and task that made them
- **Compliance Audits**: Provide tamper-proof evidence of who changed what and when
- **Knowledge Transfer**: Understand historical context for design decisions
- **Incident Investigation**: Quickly identify root cause of production issues

## How It Works

### Automatic Attachment

When an agent runs `Bash({ command: "git commit ..." })`:

1. **PostToolUse Hook Triggers**: `git-notes-audit.cjs` intercepts the commit command
2. **Extract Commit Hash**: Parses git output to get commit hash
3. **Build Audit Note**: Constructs structured metadata with:
   - **Task ID** from context
   - **Agent name** from context
   - **Timestamp** (ISO 8601 format)
   - **Decision rationale** (work summary from context)
   - **Verification hash** (SHA-256 of taskId + commitHash + timestamp + agentName)
4. **Attach to Commit**: Uses `git notes add` to attach metadata to the commit

### Git Note Format

```
[TASK-#6] developer
Decision: Created track metadata schema with 150 tests
Timestamp: 2026-01-29T14:30:00Z
Hash: a1b2c3d4e5f6...
```

**Field Descriptions**:

- **`[TASK-<id>]`**: Task ID from TaskCreate/TaskUpdate context
- **Agent name**: The agent that made the commit (developer, qa, planner, etc.)
- **Decision**: Sanitized work summary (credentials automatically masked)
- **Timestamp**: ISO 8601 timestamp (YYYY-MM-DDTHH:mm:ss.sssZ)
- **Hash**: SHA-256 verification hash (prevents tampering)

### Security Features

**Credential Masking**: Automatically detects and masks credentials before writing notes:

```javascript
// Input:  "Updated API_KEY=sk-abc123 and PASSWORD=secret123"
// Output: "Updated API_KEY=[REDACTED] and PASSWORD=[REDACTED]"
```

**Patterns Masked**:

- `API_KEY=...` → `API_KEY=[REDACTED]`
- `PASSWORD=...` → `PASSWORD=[REDACTED]`
- `sk-*` (OpenAI keys) → `[REDACTED]`
- `ghp_*` (GitHub personal access tokens) → `[REDACTED]`
- `gho_*` (GitHub OAuth tokens) → `[REDACTED]`

**Verification Hash**: Prevents post-commit tampering

```
SHA-256(taskId + commitHash + timestamp + agentName)
```

If anyone modifies the note after creation, the hash won't match and verification will fail.

## Verification

### View Notes for Single Commit

```bash
# View note attached to commit
git notes show <commit_hash>

# Example
git notes show abc123def
```

**Output**:

```
[TASK-test-123] developer
Decision: Test feature implementation
Timestamp: 2026-01-29T10:30:00Z
Hash: a1b2c3d4e5f6789012345678901234567890123456789012345678901234
```

### Audit Trail Report

Generate comprehensive report with verification status:

```bash
# Verify commits in range
node .claude/tools/cli/git-notes-verify.cjs main..HEAD

# Generate markdown report
node .claude/tools/cli/git-notes-verify.cjs main..HEAD --report=audit-2026-01-29.md

# Verify last 10 commits
node .claude/tools/cli/git-notes-verify.cjs HEAD~10..HEAD

# Verify all commits in repository
node .claude/tools/cli/git-notes-verify.cjs --all
```

**Output**:

```
=== Git Notes Audit Trail ===

Total Commits: 10
Verified: 8 ✓
Missing: 2 ⚠
Tampered: 0

⚠ Commits missing audit notes:
  abc123d - Initial commit
  def456a - Update README

Verified commits:
  789ghi0 [test-123] developer - feat: test feature
  012jkl3 [bug-456] developer - fix: bug fix
  ...
```

### Check All Notes (Manual)

```bash
git log --oneline | while read hash msg; do
  echo "=== $hash ==="
  git notes show $hash 2>/dev/null || echo "No note"
done
```

## Use Cases

### 1. Incident Investigation

**Scenario**: Bug found in production, need to trace root cause.

```bash
# Find commit that introduced bug
git log --oneline | grep "authentication"

# Output:
# abc123d feat: add authentication middleware

# Check audit notes
git notes show abc123d

# Output:
# [TASK-auth-789] developer
# Decision: Implemented JWT authentication with 30-min expiry
# Timestamp: 2026-01-15T14:30:00Z
# Hash: a1b2c3d4e5f6...
```

**Result**: Know exact task, agent, decision rationale, and timestamp. Can review task context and agent logs for full investigation.

### 2. Compliance Audits

**Scenario**: Security/compliance review needs evidence of decision-making.

```bash
# Generate audit report for release
node .claude/tools/cli/git-notes-verify.cjs v1.0..v1.1 --report=audit-v1.1.md
```

**Report Contents**:

- All commits in release
- Task IDs for each commit
- Verification hashes (tamper-proof)
- Timestamps (chronological timeline)
- Decision rationale

**Compliance Benefits**:

- **Traceability**: Every code change linked to task and agent
- **Accountability**: Clear record of who made what decision
- **Integrity**: Cryptographic verification prevents tampering
- **Auditability**: Markdown reports ready for compliance review

### 3. Knowledge Transfer

**Scenario**: New developer wants to understand design decisions.

```bash
# Look at commits for component
git log --grep="UserAuth" --oneline

# Output:
# abc123d feat: add UserAuth component
# def456a refactor: extract auth logic to UserAuth

# Read audit notes
git notes show abc123d

# Output:
# [TASK-feature-456] developer
# Decision: Created UserAuth component with OAuth2 support per SPEC-123
# Timestamp: 2026-01-10T09:00:00Z
# Hash: a1b2c3d4e5f6...
```

**Result**: Understand **what** changed (commit), **why** (decision rationale), **when** (timestamp), and **by whom** (agent + task).

### 4. Performance Analysis

**Scenario**: Analyze development velocity and bottlenecks.

```bash
# Extract timestamps from notes
git log --all --pretty=format:%H | while read hash; do
  git notes show $hash 2>/dev/null | grep "Timestamp:"
done | sort

# Analyze task duration
# (timestamp of first commit to timestamp of last commit per task)
```

**Insights**:

- Which tasks took longest?
- Which agents are most productive?
- What time of day are commits made?

## Implementation Details

### Note Format Specification

```
[TASK-<taskId>] <agentName>
Decision: <sanitized workSummary>
Timestamp: <ISO 8601 timestamp>
Hash: <SHA-256 verification hash>
```

**Constraints**:

- `taskId`: Any string (from TaskCreate/TaskUpdate)
- `agentName`: Any string (from agent context)
- `workSummary`: Max 200 characters, credentials masked
- `timestamp`: ISO 8601 format (YYYY-MM-DDTHH:mm:ss.sssZ)
- `hash`: 64-character hex string (SHA-256)

### Verification Hash Algorithm

```javascript
function computeVerificationHash(taskId, commitHash, timestamp, agentName) {
  return crypto
    .createHash('sha256')
    .update(taskId + commitHash + timestamp + agentName)
    .digest('hex');
}
```

**Why This Prevents Tampering**:

1. **Commit hash included**: Can't move note to different commit
2. **Timestamp included**: Can't backdate note
3. **Task ID included**: Can't reassign to different task
4. **Agent name included**: Can't change attribution
5. **SHA-256**: Cryptographically secure, collision-resistant

### Performance

**Hook Execution**:

- **Build note**: <1ms (string concatenation + crypto hash)
- **Write temp file**: <5ms (small file write)
- **Git notes add**: ~30-40ms (git command execution)
- **Total overhead**: <50ms per commit

**Storage**:

- **Note size**: ~150 bytes per commit
- **Repository impact**: <15 KB per 100 commits (negligible)

### Error Handling

**Graceful Failures** (hook does not block commits):

- **Missing context**: Uses default values (unknown task/agent)
- **Note already exists**: Silently skips (re-run scenarios)
- **Git command failure**: Logs error but returns original result
- **Temp file cleanup**: Always attempts cleanup, even on errors

## Troubleshooting

### Notes Not Appearing

**Symptom**: Commits have no git notes attached.

**Diagnosis**:

1. **Check if hook is registered**:

   ```bash
   cat .claude/hooks/index.json | grep git-notes-audit
   ```

2. **Verify hook is executable**:

   ```bash
   node .claude/hooks/audit/git-notes-audit.cjs
   # Should not throw errors
   ```

3. **Check git commit output** (hook needs commit hash):

   ```bash
   git log --oneline -1
   # Should show: [branch hash] message
   ```

4. **Manually add note** (test git notes functionality):
   ```bash
   git notes add -m "Test note" HEAD
   git notes show HEAD
   ```

**Common Causes**:

- Hook not registered in `.claude/hooks/index.json`
- PostToolUse hook not enabled
- Git commit failed (no hash to attach note to)
- Running git from directory outside repository

### Verify Notes Integrity

**Check for tampering**:

```bash
node .claude/tools/cli/git-notes-verify.cjs HEAD~100..HEAD
```

**Output States**:

- **✓ VERIFIED**: Hash matches, note is authentic
- **⚠ MISSING**: No note attached to commit
- **🚨 TAMPERED**: Hash mismatch, note has been modified

**If Tampered Detected**:

1. **Identify commit**:

   ```bash
   git notes show <commit_hash>
   ```

2. **Check original note** (if backed up):

   ```bash
   git log refs/notes/commits
   ```

3. **Restore from backup** or **delete invalid note**:
   ```bash
   git notes remove <commit_hash>
   ```

### CLI Tool Errors

**Error**: `git log ... failed: fatal: bad revision`

**Cause**: Invalid commit range

**Fix**: Use `git log` to verify range exists:

```bash
git log main..HEAD  # Check range has commits
```

**Error**: `Cannot read property 'verified' of undefined`

**Cause**: Malformed git note (missing required fields)

**Fix**: Manually inspect note and delete if corrupt:

```bash
git notes show <commit_hash>
git notes remove <commit_hash>
```

## Best Practices

### 1. Always Commit with Git Commit

**DO**: Use standard git commit workflow

```bash
git add file.txt
git commit -m "feat: new feature"
```

**DON'T**: Use alternative commit methods that bypass hooks

```bash
git commit --amend  # May skip hook
git rebase -i       # Modifies existing commits
```

### 2. Review Notes Before Publishing

**Before pushing to remote**:

```bash
# Verify last 10 commits have notes
node .claude/tools/cli/git-notes-verify.cjs HEAD~10..HEAD

# Check specific commit
git notes show HEAD
```

### 3. Run Audits Before Releases

**Add to release checklist**:

```bash
# Generate audit report
node .claude/tools/cli/git-notes-verify.cjs v1.0..v1.1 --report=audit-v1.1.md

# Verify all commits have notes
# (exit code 1 if any missing/tampered)
```

### 4. Archive Reports

**Store audit reports in version control**:

```bash
mkdir -p .claude/context/artifacts/audit-reports
node .claude/tools/cli/git-notes-verify.cjs main..v1.1 \
  --report=.claude/context/artifacts/audit-reports/v1.1-audit.md
git add .claude/context/artifacts/audit-reports/v1.1-audit.md
git commit -m "docs: add v1.1 audit report"
```

### 5. Monitor for Tampering

**Add to CI/CD pipeline**:

```yaml
# .github/workflows/audit.yml
- name: Verify git notes integrity
  run: |
    node .claude/tools/cli/git-notes-verify.cjs origin/main..HEAD
    if [ $? -ne 0 ]; then
      echo "Git notes verification failed"
      exit 1
    fi
```

## Security Considerations

### What Git Notes Protect

**✓ Protects Against**:

- **Unauthorized modification**: Hash mismatch detected
- **Attribution forgery**: Hash includes agent name
- **Timestamp manipulation**: Hash includes timestamp
- **Note reassignment**: Hash includes commit hash

### What Git Notes DON'T Protect

**✗ Does NOT Protect Against**:

- **Commit rewriting** (rebase/amend): Notes lost during git history rewrite
- **Force push**: Can overwrite history and notes
- **Repository access**: Anyone with repo access can read notes
- **Secret data**: Notes are visible to all with repo access

### Best Practices for Security

1. **Don't store secrets in notes**: Automatic masking helps but not foolproof
2. **Use GPG signing for commits**: Adds cryptographic signature to commits themselves
3. **Protect main branch**: Require PR reviews and status checks
4. **Monitor for force pushes**: Alert on git history rewriting
5. **Backup git notes**: Periodically archive notes separately from commits

### Credential Leakage Prevention

**Automatic Masking** (implemented):

- API keys, passwords, tokens automatically replaced with `[REDACTED]`
- Max note length (200 chars) prevents accidental inclusion of large secrets

**Manual Review** (recommended):

```bash
# Review notes before pushing
git notes show HEAD

# Check for secrets
git notes show HEAD | grep -iE "(password|token|key|secret)"
```

## Integration

### TaskCreate/TaskUpdate

Notes automatically use context from task operations:

```javascript
TaskUpdate({
  taskId: 'feature-123',
  status: 'in_progress',
  metadata: { summary: 'Implementing user authentication' },
});

// Later, when agent commits:
Bash({ command: 'git commit -m "feat: add auth"' });

// Note attached automatically:
// [TASK-feature-123] developer
// Decision: Implementing user authentication
// Timestamp: 2026-01-29T10:30:00Z
// Hash: a1b2c3d4e5f6...
```

### CI/CD Integration

**Verify notes in CI**:

```yaml
# .github/workflows/ci.yml
jobs:
  audit:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
        with:
          fetch-depth: 0 # Fetch full history for git notes

      - name: Fetch git notes
        run: git fetch origin refs/notes/*:refs/notes/*

      - name: Verify audit trail
        run: |
          node .claude/tools/cli/git-notes-verify.cjs origin/main..HEAD
```

### Compliance Reporting

**Generate monthly reports**:

```bash
#!/bin/bash
# monthly-audit.sh

YEAR=$(date +%Y)
MONTH=$(date +%m)
PREV_MONTH=$(date -d "last month" +%Y-%m)

# Generate report for previous month
node .claude/tools/cli/git-notes-verify.cjs \
  --all \
  --report=audit-${PREV_MONTH}.md

# Archive to compliance directory
mv audit-${PREV_MONTH}.md /compliance/git-audit/
```

## Related Documentation

- **Hook Implementation**: `.claude/hooks/audit/git-notes-audit.cjs`
- **CLI Tool**: `.claude/tools/cli/git-notes-verify.cjs`
- **Test Suite**: `tests/git-notes-audit.test.cjs`
- **Workflow Integration**: `.claude/workflows/core/router-decision.md`

## References

- [Git Notes Documentation](https://git-scm.com/docs/git-notes)
- [SHA-256 Cryptographic Hash](https://en.wikipedia.org/wiki/SHA-2)
- [ISO 8601 Timestamp Format](https://en.wikipedia.org/wiki/ISO_8601)
- [TaskCreate/TaskUpdate Protocol](../CLAUDE.md#55-task-tracking-iron-laws)
