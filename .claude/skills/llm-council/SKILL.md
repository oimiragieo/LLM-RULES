---
name: llm-council
description: Orchestrate multi-LLM parallel debate and synthesis. Dispatches prompts to available omega CLI wrappers in parallel, collects independent responses, runs anonymized peer review ranking, and synthesizes via a chairman model. Supports collaboration templates, idle watchdog, inter-agent messaging, worktree isolation, and multi-turn sessions. No server required.
version: 1.1.0
model: sonnet
invoked_by: both
user_invocable: true
tools: [Bash, Read, Write]
args: '"PROMPT" [--models MODEL1,MODEL2,...] [--chairman MODEL] [--skip-review] [--timeout-ms N] [--template review|implementation|research|debug] [--enable-messaging] [--use-worktrees] [--multi-turn] [--resume SESSION_ID]'
best_practices:
  - Always check available CLIs before dispatching (run verify-setup.mjs for each)
  - Use at least 3 models for meaningful peer review rankings
  - Set --timeout-ms per model to prevent one slow model from blocking the council
  - Anonymize responses before peer review to prevent model identity bias
  - Store council results in .claude/context/tmp/ for downstream consumption
error_handling: graceful
streaming: not_supported
verified: true
lastVerifiedAt: 2026-02-22T00:00:00.000Z
---

# LLM Council Skill

<identity>
Multi-LLM deliberation orchestrator. Implements a 3-stage council process:
Stage 1 (parallel independent responses) -> Stage 2 (anonymized peer review with ranking) ->
Stage 3 (chairman synthesis). Uses omega CLI wrapper skills for model invocation.
No server required -- pure Bash-level orchestration.
</identity>

<capabilities>
- Parallel dispatch to multiple LLM CLIs (Gemini, Codex, Cursor, Claude)
- Dynamic availability detection (only dispatches to available CLIs)
- 3-stage council protocol:
  - Stage 1: Independent parallel responses
  - Stage 2: Anonymized peer review with FINAL RANKING
  - Stage 3: Chairman synthesis of all inputs
- Anonymized labeling (Response A, B, C...) to prevent model identity bias
- Configurable chairman model (default: current Claude session)
- Per-model timeout enforcement
- Graceful degradation (skips unavailable models)
- Structured output with all 3 stages preserved
</capabilities>

## Council Protocol

### Stage 1: Independent Responses

Dispatch the user's prompt to all available omega CLIs in parallel:

```bash
# Check availability
node .claude/skills/omega-gemini-cli/scripts/verify-setup.mjs && HAS_GEMINI=1
node .claude/skills/omega-codex-cli/scripts/verify-setup.mjs && HAS_CODEX=1
node .claude/skills/omega-claude-cli/scripts/verify-setup.mjs && HAS_CLAUDE_CLI=1
node .claude/skills/omega-cursor-cli/scripts/verify-setup.mjs && HAS_CURSOR=1

# Parallel dispatch to available CLIs
TMPDIR=$(mktemp -d)
[ "$HAS_GEMINI" = "1" ] && node .claude/skills/omega-gemini-cli/scripts/ask-gemini.mjs "$PROMPT" --timeout-ms 120000 > "$TMPDIR/gemini.txt" 2>"$TMPDIR/gemini.err" &
[ "$HAS_CODEX" = "1" ] && node .claude/skills/omega-codex-cli/scripts/ask-codex.mjs "$PROMPT" --timeout-ms 120000 > "$TMPDIR/codex.txt" 2>"$TMPDIR/codex.err" &
[ "$HAS_CLAUDE_CLI" = "1" ] && node .claude/skills/omega-claude-cli/scripts/ask-claude.mjs "$PROMPT" --timeout-ms 120000 > "$TMPDIR/claude.txt" 2>"$TMPDIR/claude.err" &
[ "$HAS_CURSOR" = "1" ] && node .claude/skills/omega-cursor-cli/scripts/ask-cursor.mjs "$PROMPT" --yolo --trust --timeout-ms 120000 > "$TMPDIR/cursor.txt" 2>"$TMPDIR/cursor.err" &
wait
```

### Stage 2: Anonymized Peer Review

1. Collect all successful Stage 1 responses
2. Assign anonymous labels: Response A, Response B, Response C, ...
3. Maintain label_to_model mapping (e.g., A=gemini, B=codex, C=claude)
4. Send all anonymized responses back to each available model with:

```
You are reviewing responses to this question: "$PROMPT"

Response A:
[content]

Response B:
[content]

Response C:
[content]

Evaluate each response for accuracy, completeness, and reasoning quality.
Then provide your FINAL RANKING (best to worst):
1. Response [X]
2. Response [Y]
3. Response [Z]
```

1. Parse FINAL RANKING from each reviewer's output using regex: `\d+\.\s*Response [A-Z]`
2. Compute aggregate ranking (average position across all reviewers)

### Stage 3: Chairman Synthesis

Send to chairman model (default: current Claude session or ask-claude.mjs):

```
You are the Chairman synthesizing a multi-model council discussion.

Original question: "$PROMPT"

Stage 1 Responses (with de-anonymized model names):
[Model]: [Response]
...

Stage 2 Peer Review Rankings:
Aggregate ranking: [best to worst with scores]

Synthesize the best insights from all responses into a single comprehensive answer.
Highlight areas of consensus and dissent. Provide the strongest possible answer.
```

## Usage

### Full council (all available models)

```bash
Skill({ skill: 'llm-council' })
# Then in agent: run full council protocol above
```

### Quick consultation (skip peer review)

```bash
# Stage 1 only -- parallel dispatch, collect responses, skip ranking
# Use when speed matters more than rigorous evaluation
```

## When to Use

- High-stakes architectural decisions requiring multiple perspectives
- Code review where diverse model viewpoints reduce blind spots
- Plan critique and validation
- Resolving disagreements about implementation approach
- Cross-validation of security analysis
- When the user explicitly requests "council", "multiple perspectives", or "cross-validate"

## Iron Laws

1. ALWAYS check CLI availability before dispatch -- never assume a model is present
2. ALWAYS anonymize responses before peer review -- model identity bias is real
3. NEVER skip Stage 2 for high-stakes decisions -- the peer review is the core innovation
4. ALWAYS preserve all 3 stages in output for transparency
5. ALWAYS set per-model timeout to prevent one slow model from blocking the council

## Anti-Patterns

| Anti-Pattern                           | Why Bad                              | Correct Approach                        |
| -------------------------------------- | ------------------------------------ | --------------------------------------- |
| Dispatching to unavailable CLIs        | Silent failure, missing responses    | Run verify-setup.mjs first              |
| Showing model names during peer review | Introduces identity bias             | Use anonymous labels (Response A, B, C) |
| Using only 2 models for council        | Peer review meaningless with 2       | Require minimum 3 for ranking value     |
| Ignoring failed model responses        | May miss degradation                 | Log failures, include in metadata       |
| Running council for simple questions   | Massive overhead for trivial queries | Reserve for high-stakes decisions       |

## Exit Codes

| Code | Meaning                                                         |
| ---- | --------------------------------------------------------------- |
| 0    | Council completed successfully (at least 2 models responded)    |
| 1    | Council failed (fewer than 2 models available or all timed out) |

## Configuration

| Env Var                  | Default           | Purpose                                        |
| ------------------------ | ----------------- | ---------------------------------------------- |
| `LLM_COUNCIL_TIMEOUT_MS` | 120000            | Per-model timeout for Stage 1 and Stage 2      |
| `LLM_COUNCIL_MIN_MODELS` | 2                 | Minimum models required for council to proceed |
| `LLM_COUNCIL_CHAIRMAN`   | (current session) | Chairman model for Stage 3 synthesis           |

## Integration Notes

- This skill does NOT require the llm-council-master FastAPI server
- Uses omega wrapper scripts directly via Bash backgrounding for parallelism
- Anonymized peer review is preserved from llm-council-master's design (its core innovation)
- Chairman synthesis can use the current Claude session (no additional CLI call needed)
- Temporary files stored in system temp dir, cleaned up after council completes
- Minimum 2 available models required for council to proceed

---

## Collaboration Templates

Templates constrain each model's focus during council sessions, producing higher-quality synthesis than sending the same generic prompt to all models. Without a `--template` flag, the council operates in its default mode (all models receive the same prompt).

### Available Templates

#### Review Template

| Field         | Value                                                                                |
| ------------- | ------------------------------------------------------------------------------------ |
| **Agents**    | 2-3 (minimum 2)                                                                      |
| **Focus**     | Each agent reviews from their model's strengths (correctness, security, performance) |
| **Synthesis** | Chairman merges non-overlapping findings, deduplicates shared findings               |

**Roles:**

```yaml
roles:
  - name: correctness-reviewer
    focus: 'Review for logic errors, edge cases, off-by-one bugs, and correctness'
  - name: performance-reviewer
    focus: 'Review for performance bottlenecks, algorithmic complexity, and scalability'
  - name: security-reviewer
    focus: 'Review for security vulnerabilities, injection vectors, and data exposure'
synthesis_strategy: 'merge-by-category'
```

**When to use:** Code reviews, PR reviews, audit passes where multiple review dimensions matter.

#### Implementation Template

| Field         | Value                                                                    |
| ------------- | ------------------------------------------------------------------------ |
| **Agents**    | 2-4 (minimum 2)                                                          |
| **Focus**     | Plan, execute, verify staged workflow with sequential handoff            |
| **Synthesis** | Sequential -- architect output feeds implementer, verifier checks result |

**Roles:**

```yaml
roles:
  - name: architect
    focus: 'Design the approach, define interfaces, data flow, and module boundaries'
  - name: implementer
    focus: "Write the implementation following the architect's design exactly"
  - name: verifier
    focus: 'Verify the implementation matches the design and passes acceptance criteria'
synthesis_strategy: 'sequential'
```

**When to use:** Feature implementation where design and coding benefit from separation of concerns.

#### Research Template

| Field         | Value                                                                     |
| ------------- | ------------------------------------------------------------------------- |
| **Agents**    | 2-3 (minimum 2)                                                           |
| **Focus**     | Independent investigation of the same topic, then cross-compare findings  |
| **Synthesis** | Side-by-side comparison matrix highlighting contradictions and agreements |

**Roles:**

```yaml
roles:
  - name: researcher-a
    focus: 'Research the topic independently, cite sources, provide evidence-backed findings'
  - name: researcher-b
    focus: 'Research the same topic independently from a different angle, cite sources'
synthesis_strategy: 'compare-and-converge'
```

**When to use:** Technology evaluation, best-practice research, exploring solution spaces.

#### Debug Template

| Field         | Value                                                                     |
| ------------- | ------------------------------------------------------------------------- |
| **Agents**    | 2-3 (minimum 2)                                                           |
| **Focus**     | Each agent independently diagnoses the same bug and proposes a fix        |
| **Synthesis** | Convergence analysis -- if 2+ agents agree on root cause, high confidence |

**Roles:**

```yaml
roles:
  - name: diagnostician-a
    focus: 'Independently reproduce and diagnose the bug, propose root cause and fix'
  - name: diagnostician-b
    focus: 'Independently reproduce and diagnose the bug, propose root cause and fix'
synthesis_strategy: 'convergence'
```

**When to use:** Hard-to-diagnose bugs where independent analysis reduces bias.

### Template Invocation

```bash
# Invoke with template
Skill({ skill: 'llm-council', args: '--template review' })
Skill({ skill: 'llm-council', args: '--template implementation' })
Skill({ skill: 'llm-council', args: '--template research' })
Skill({ skill: 'llm-council', args: '--template debug' })
```

### Template Dispatch Behavior

When a `--template` is specified:

1. **Stage 1**: Each model receives the base prompt PLUS its role-specific focus instruction from the template
2. **Stage 2**: Peer review proceeds as normal (anonymized, ranked)
3. **Stage 3**: Chairman uses the template's `synthesis_strategy` to guide synthesis:
   - `merge-by-category`: Merge findings by review category, deduplicate
   - `sequential`: Present outputs in role order, highlight handoff points
   - `compare-and-converge`: Build side-by-side comparison matrix
   - `convergence`: Report agreement/disagreement on root cause, confidence score

---

## Council Watchdog

Per-model idle monitoring with two-tier thresholds to detect hung or stalled models during council sessions.

### Two-Tier Monitoring

| Tier              | Threshold                | Action                                        |
| ----------------- | ------------------------ | --------------------------------------------- |
| **Idle Warning**  | 90 seconds of no output  | Log warning, optionally send nudge prompt     |
| **Stall Timeout** | 180 seconds of no output | Terminate model process, exclude from results |

### Configuration

```yaml
watchdog:
  idle_warning_seconds: 90
  stall_timeout_seconds: 180
  nudge_prompt: 'Please continue with your analysis.'
  action_on_stall: 'exclude' # exclude | retry | fail
```

| Env Var                       | Default | Purpose                           |
| ----------------------------- | ------- | --------------------------------- |
| `LLM_COUNCIL_IDLE_WARNING_S`  | 90      | Seconds before idle warning       |
| `LLM_COUNCIL_STALL_TIMEOUT_S` | 180     | Seconds before stall auto-exclude |

### Integration with Stage 1

During parallel dispatch, each backgrounded model process is monitored independently:

1. Start a per-model timer when the process launches
2. If no output file growth after `idle_warning_seconds`, log a warning
3. If no output file growth after `stall_timeout_seconds`, kill the process and set `stall_timeout: true` in council metadata
4. Continue council with remaining models (graceful degradation)

### Watchdog Output Metadata

```json
{
  "watchdog": {
    "gemini": { "status": "completed", "duration_s": 45 },
    "codex": { "status": "stall_timeout", "duration_s": 180, "excluded": true },
    "claude": { "status": "completed", "duration_s": 62 }
  }
}
```

### Backward Compatibility

The watchdog is additive to the existing `--timeout-ms` global timeout. `--timeout-ms` remains the hard ceiling for the entire council session. The watchdog provides per-model granularity within that ceiling.

---

## Inter-Agent Message Bus

Optional JSONL message file protocol that enables council members to share partial outputs during deliberation.

### Overview

By default, council models work in complete isolation during Stage 1. The message bus enables optional partial-output sharing, useful for long deliberations where early findings from one model can inform others.

### Opt-In

Enable with `--enable-messaging` flag. Without this flag, no message directory is created and the council operates in default isolated mode.

### Message Protocol

**Location:** `.claude/context/tmp/council-<session-id>/messages.jsonl`

**Message Schema:**

```json
{
  "id": "msg-001",
  "session_id": "council-2026-03-21-abc123",
  "from": "gemini",
  "to": "team",
  "type": "partial_output",
  "content": "Partial finding: JWT implementation has XSS risk in refresh flow",
  "timestamp": "2026-03-21T10:30:00Z"
}
```

**Message Types:**

| Type             | Purpose                                       | When Sent                                         |
| ---------------- | --------------------------------------------- | ------------------------------------------------- |
| `partial_output` | Share an intermediate finding or observation  | During Stage 1, when a model has a partial result |
| `question`       | Ask the team a clarifying question            | During Stage 1, when a model needs input          |
| `agreement`      | Signal agreement with another model's finding | During Stage 2, after reading peer outputs        |
| `disagreement`   | Signal disagreement with reasoning            | During Stage 2, after reading peer outputs        |

### Read/Write Protocol

- **Write**: Each model appends messages to `messages.jsonl` during Stage 1 execution
- **Read (optional)**: Models can read `messages.jsonl` between Stage 1 and Stage 2 for informed review
- **Chairman read**: Chairman reads all messages during Stage 3 synthesis for additional context

### Cleanup

The session directory (`.claude/context/tmp/council-<session-id>/`) is deleted after the council completes, including the messages file.

---

## Worktree Isolation

Optional per-agent git worktree isolation for council sessions where agents modify code.

### When to Use

Worktree isolation is relevant only for templates that modify code:

| Template       | Worktree Applicable? | Reason                              |
| -------------- | -------------------- | ----------------------------------- |
| Review         | No                   | Read-only analysis                  |
| Implementation | Yes                  | Agents write code that may conflict |
| Research       | No                   | Read-only research                  |
| Debug          | Yes                  | Agents may apply experimental fixes |

### Opt-In

Enable with `--use-worktrees` flag. Only takes effect when combined with `--template implementation` or `--template debug`.

### Worktree Lifecycle

1. **Create**: For each participating agent, create a worktree:

   ```bash
   git worktree add .claude/context/tmp/council-<session-id>/<agent-name> -b council/<session-id>/<agent-name>
   ```

2. **Execute**: Each agent operates within its isolated worktree directory. File modifications do not conflict across agents.

3. **Merge**: After council completes, the chairman reviews diffs from each worktree branch and merges non-conflicting changes back to the source branch.

4. **Cleanup**: Remove worktrees and branches:

   ```bash
   git worktree remove .claude/context/tmp/council-<session-id>/<agent-name>
   git branch -D council/<session-id>/<agent-name>
   ```

### Conflict Resolution

When worktrees have overlapping changes to the same files:

1. Chairman identifies conflicting hunks from each agent's diff
2. Chairman selects the best version based on Stage 2 peer review rankings
3. If ranking is inconclusive, chairman presents both versions with rationale for human decision

### Platform Note

Worktree isolation follows existing agent-studio worktree safety rules. On Windows, ensure paths stay under the OS path length limit. Reference `.claude/rules/` for worktree safety patterns.

---

## Multi-Turn Council Sessions

Persistent session state that allows council deliberations to span multiple turns with user feedback between rounds.

### Overview

By default, each council invocation is one-shot. Multi-turn sessions enable iterative refinement: the user reviews the synthesis, provides feedback, and the council continues deliberation with the additional context.

### Opt-In

- `--multi-turn`: Create a resumable session (generates a session ID)
- `--resume SESSION_ID`: Continue a previous session with new user input

### Session State

**Location:** `.claude/context/tmp/council-<session-id>/session.json`

**Schema:**

```json
{
  "session_id": "council-2026-03-21-abc123",
  "status": "active",
  "turn_count": 2,
  "max_turns": 5,
  "original_prompt": "Review this auth implementation",
  "template": "review",
  "models": ["gemini", "codex", "claude"],
  "turns": [
    {
      "turn": 1,
      "stage_1_responses": { "gemini": "...", "codex": "...", "claude": "..." },
      "stage_2_rankings": { "aggregate": ["gemini", "claude", "codex"] },
      "stage_3_synthesis": "...",
      "user_feedback": "Focus more on the JWT refresh flow"
    }
  ],
  "created_at": "2026-03-21T10:00:00Z",
  "last_active": "2026-03-21T10:15:00Z"
}
```

### Continuation Protocol

When `--resume SESSION_ID` is used:

1. Load `session.json` from the session directory
2. Verify session is not expired (24-hour TTL from `last_active`)
3. Include previous turns' synthesis and user feedback in the next Stage 1 prompt:

   ```
   Previous council synthesis: [Stage 3 output from last turn]
   User feedback: [feedback text]
   Continue the analysis with this additional context.
   ```

4. Models receive full conversation history for context continuity
5. Increment `turn_count` and update `last_active`

### Configuration

| Env Var                 | Default | Purpose                                         |
| ----------------------- | ------- | ----------------------------------------------- |
| `LLM_COUNCIL_MAX_TURNS` | 5       | Maximum turns per session before forced closure |

### Session Expiry

Sessions older than 24 hours are considered expired. Attempting to `--resume` an expired session returns an error with the session's last synthesis as context.

### Cleanup

Session directories are cleaned up when:

- The session reaches `max_turns`
- The user does not resume within 24 hours
- The user explicitly closes the session (no `--resume` after final turn)
