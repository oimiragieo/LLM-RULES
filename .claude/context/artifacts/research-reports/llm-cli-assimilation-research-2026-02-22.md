<!-- Agent: researcher | Task: #1 | Session: 2026-02-22 -->

# Research Report: LLM CLI Assimilation

**Date**: 2026-02-22
**Researcher**: researcher agent
**Task**: #1
**Batch/Phase**: Phase O — Pre-creation codebase assimilation
**Sources Consulted**: 5 local codebases (direct code read, no external queries required)

---

## Executive Summary

Five LLM CLI codebases were analyzed in depth: omega-gemini-cli, omega-codex-cli, omega-cursor-cli, omega-claude-cli, and llm-council-master. The first four share a nearly identical architecture: a Node.js wrapper script (`ask-<tool>.mjs`) that shells out to the respective vendor CLI in headless mode, handling cross-platform path resolution, stdin-based prompt delivery, fallback to `npx`, timeout enforcement, and JSON output normalization. The llm-council-master is architecturally distinct — it is a Python/FastAPI web application that routes prompts through a 3-stage multi-LLM deliberation pipeline via the OpenRouter API, with no CLI wrapper; it is driven programmatically via HTTP REST/SSE endpoints.

All four omega wrappers are designed for use as agent-studio portable skills: they are dependency-free at runtime (no npm packages needed to run the scripts), use `node:util parseArgs` or a custom parser, and follow a consistent flag surface (`--model`, `--json`, `--sandbox`, `--timeout-ms`). Integration into agent-studio requires creating four skills (one per CLI wrapper) plus one orchestrating skill or agent for llm-council-style multi-LLM workflows. Availability detection is a critical design concern — each wrapper already contains a `verify-setup.mjs` script with npx fallback logic that can be reused verbatim.

The most significant integration opportunity is a `multi-llm-consultant` agent or `llm-council` skill that orchestrates multi-LLM queries in agent-studio without requiring a running web server. This can be implemented by calling the omega wrapper scripts in parallel from a Bash orchestration script, accumulating responses, and synthesizing with a Chairman model — replicating the council logic at the shell level rather than requiring the full FastAPI stack.

---

## Research Methodology

### Search Queries Executed

| # | Query | Source | Results Found |
|---|-------|--------|---------------|
| 1 | README.md glob across all 5 codebases | Local filesystem | 5 READMEs |
| 2 | `**/*.mjs` glob in `.claude/skills/` for each omega tool | Local filesystem | 15 script files |
| 3 | `**/*.py` glob in `backend/` for llm-council | Local filesystem | 6 Python files |
| 4 | Direct read of ask-*.mjs + parse-args.mjs + verify-setup.mjs | Local filesystem | 12 files |
| 5 | Direct read of council.py, config.py, main.py, openrouter.py | Local filesystem | 4 files |

### Sources Consulted

| # | Title | Type | URL/Path | Date |
|---|-------|------|----------|------|
| 1 | omega-gemini-cli README + scripts | Local codebase | `C:/dev/projects/omega-gemini-cli/` | 2026-02-22 |
| 2 | omega-codex-cli README + scripts | Local codebase | `C:/dev/projects/omega-codex-cli/` | 2026-02-22 |
| 3 | omega-cursor-cli README + scripts | Local codebase | `C:/dev/projects/omega-cursor-cli/` | 2026-02-22 |
| 4 | omega-claude-cli README + scripts | Local codebase | `C:/dev/projects/omega-claude-cli/` | 2026-02-22 |
| 5 | llm-council-master README + backend | Local archive | `C:/dev/projects/agent-studio/.claude.archive/.tmp/llm-council-master/` | 2026-02-22 |

---

## Detailed Findings

---

### Tool 1: omega-gemini-cli

#### A. CLI Invocation Patterns

**Installation:**
- Gemini CLI: `npm install -g @google/gemini-cli`
- One-time auth: Run `gemini` once and sign in via Google OAuth
- Node.js 18+ required

**Main command (native):**
```bash
gemini -p "PROMPT" --yolo [--model gemini-2.5-flash] [--output-format json] [-s]
```

**Wrapper script:**
```bash
node .claude/skills/omega-gemini-cli/scripts/ask-gemini.mjs "PROMPT" [--model MODEL] [--json] [--sandbox]
```

**Flags:**
- `--model` / `-m`: Model to use (e.g., `gemini-2.5-flash`, `gemini-2.5-pro`)
- `--json`: Machine-readable output (`--output-format json` forwarded)
- `--sandbox` / `-s`: Run code in Gemini's code execution sandbox
- No `--timeout-ms` (unlike codex/cursor/claude wrappers)

**Prompt delivery:** Prompt is always sent via stdin to `gemini -p "" --yolo`. The `-p ""` keeps Gemini in headless mode while stdin contains the actual prompt. This avoids shell argument length limits (8191-char limit on Windows).

**File review pattern:** Reference files in the prompt text: `"Summarize README.md"` or `"Review the scripts in .claude/skills/..."`. No dedicated `--file` flag.

**Verification:**
```bash
node .claude/skills/omega-gemini-cli/scripts/verify-setup.mjs
```

**Windows specifics:** Requires `shell: true` on Windows to resolve `gemini.cmd`; model parameter is validated with `/^[a-zA-Z0-9._-]+$/` before injection into command string.

**npx fallback:** If `gemini` is not on PATH, falls back to `npx -y @google/gemini-cli`.

**Slash commands exposed:** `/analyze`, `/brainstorm`, `/sandbox`, `/omega-gemini`, `/omega-gemini-setup`

#### B. Capability Matrix

| Capability | Support | Notes |
|------------|---------|-------|
| `review_file` | Partial | Via prompt text reference, not a dedicated flag |
| `review_plan` | Partial | Via prompt text, e.g., "Review this plan: [content]" |
| `ask_question` | Y | Primary use case |
| `compare_files` | Partial | Via prompt text |
| `generate_code` | Y | Sandbox mode for code execution |
| `streaming_output` | N | Script buffers all output, then writes |
| `exit_codes` | Y | 0=success, 1=error, 9009=not found (Win), npx fallback |

#### C. Integration Requirements

- **API key:** None needed; uses Google OAuth via browser sign-in
- **Auth:** One-time `gemini` interactive session; credentials stored locally by Gemini CLI
- **Subscription:** Gemini CLI offers a free tier (Gemini Flash free via personal Google account)
- **Rate limits:** Governed by Gemini API quotas (generous for personal use)
- **Output format:** Plain text by default; JSON JSONL stream with `--output-format json`
- **Known edge cases:**
  - On Windows, empty string arg in array form fails; must build full command string
  - Model validation required before string interpolation on Windows (injection risk)
  - `-p ""` + stdin is the only reliable cross-platform headless mode

---

### Tool 2: omega-codex-cli

#### A. CLI Invocation Patterns

**Installation:**
```bash
npm install -g @openai/codex
```

**Main command (native):**
```bash
codex exec "PROMPT" --skip-git-repo-check [--model MODEL] [--json] [--sandbox workspace-write]
```

**Wrapper script:**
```bash
node .claude/skills/omega-codex-cli/scripts/ask-codex.mjs "PROMPT" [--model MODEL] [--json] [--sandbox] [--timeout-ms N]
```

**Flags:**
- `--model` / `-m`: Model to use
- `--json`: Forwards `--json` to codex (JSONL event stream output)
- `--sandbox`: Maps to `--sandbox workspace-write`
- `--timeout-ms`: Wrapper-level timeout; exits with code 124 on expiry

**Prompt delivery:** Prompt is passed as a **positional argument** to `codex exec "PROMPT"` (not via stdin). `stdio: ['ignore', 'pipe', 'pipe']` — stdin is closed.

**File review pattern:** Reference files in the prompt: `"codex exec 'Summarize src/auth.ts'"`.

**Verification:**
```bash
node .claude/skills/omega-codex-cli/scripts/verify-setup.mjs
```

**Windows specifics:** Uses `cmd.exe /d /s /c codex ...` invocation; falls back to `npx -y @openai/codex`.

**Key distinction:** Uses `--skip-git-repo-check` flag by default to avoid requiring a git repo.

#### B. Capability Matrix

| Capability | Support | Notes |
|------------|---------|-------|
| `review_file` | Partial | Via prompt positional arg |
| `review_plan` | Partial | Via prompt positional arg |
| `ask_question` | Y | Primary use case |
| `compare_files` | Partial | Via prompt text |
| `generate_code` | Y | Codex is optimized for code generation |
| `streaming_output` | Y | `--json` produces JSONL event stream |
| `exit_codes` | Y | 0=success, 1=error, 124=timeout |

#### C. Integration Requirements

- **API key:** `OPENAI_API_KEY` env var required (or configured in Codex)
- **Subscription:** OpenAI account; Codex CLI uses API credits
- **Rate limits:** OpenAI API rate limits apply
- **Output format:** Plain text or JSONL events (`--json`)
- **Stdin limit:** `ASK_CODEX_MAX_STDIN_BYTES` env var (default 50MB) for stdin fallback
- **Known edge cases:**
  - `codex exec` can be slow when using tools (web search)
  - `--json` produces JSONL not standard JSON — agent must handle streaming events
  - Requires authenticated OpenAI account

---

### Tool 3: omega-cursor-cli

#### A. CLI Invocation Patterns

**Installation:**
```bash
# Linux/macOS via installer:
curl https://cursor.com/install -fsS | bash
# Windows: npm install -g @cursor/agent OR local install at %LOCALAPPDATA%\cursor-agent\
npm install -g @cursor/agent
```

**Main command (native):**
```bash
cursor-agent --print --output-format text "PROMPT" [--model MODEL] [--yolo] [--trust] [--approve-mcps]
# or:
agent --print --output-format text "PROMPT"  # alias
```

**Wrapper script:**
```bash
node .claude/skills/omega-cursor-cli/scripts/ask-cursor.mjs "PROMPT" [--model MODEL] [--json] [--yolo] [--trust] [--timeout-ms N]
```

**Flags:**
- `--model` / `-m`: Model to use (e.g., `claude-4.6-opus`, `gemini-3.1-pro`)
- `--json`: Maps to `--output-format json`
- `--yolo`: Maps to `cursor-agent --yolo` — auto-approves all tool calls (formerly `--force`)
- `--trust`: Trusts workspace without prompting (headless only)
- `--approve-mcps`: Approves MCP connections without prompting
- `--sandbox`: Deprecated alias for `--yolo`
- `--timeout-ms`: Wrapper-level timeout; exits with code 124

**Prompt delivery:** Prompt is passed as the last positional argument: `cursor-agent --print --output-format text [flags] "PROMPT"`. `stdio: ['ignore', 'pipe', 'pipe']`.

**Windows specifics:** Tries `agent`, then `cursor-agent`, then derives path from `%LOCALAPPDATA%\cursor-agent\cursor-agent.cmd`, then falls back to `npx -y @cursor/agent`. Escapes `%` chars in cmd.exe args.

**Available models (examples from README):**
- `claude-4.6-opus`, `claude-4.6-sonnet`
- `composer-1.5`
- `gemini-3.1-pro`
- `gpt-5.3-codex`
- `auto` (default — Cursor chooses)

**Stdin limit:** `ASK_CURSOR_MAX_STDIN_BYTES` env var (default 50MB).

#### B. Capability Matrix

| Capability | Support | Notes |
|------------|---------|-------|
| `review_file` | Partial | Via prompt text |
| `review_plan` | Partial | Via prompt text |
| `ask_question` | Y | Primary use case |
| `compare_files` | Partial | Via prompt text |
| `generate_code` | Y | Cursor is optimized for code |
| `streaming_output` | N | Script buffers full output |
| `exit_codes` | Y | 0=success, 1=error, 124=timeout |

#### C. Integration Requirements

- **Subscription:** Cursor Pro or Business subscription required for headless/agent mode
- **API key:** Managed by Cursor client (not a direct API key env var)
- **Rate limits:** Cursor subscription plan limits apply
- **Output format:** Plain text or JSON (`--output-format json`)
- **Known edge cases:**
  - Cursor Agent CLI is WSL-only on some Windows configurations (needs WSL install)
  - `%LOCALAPPDATA%\cursor-agent` path requires Windows-specific detection
  - `--yolo` required for non-interactive use (otherwise blocks on tool approval prompts)
  - `cursor-agent --list-models` to check available models for account

---

### Tool 4: omega-claude-cli

#### A. CLI Invocation Patterns

**Installation:**
```bash
npm install -g @anthropic-ai/claude-code
# One-time auth: run `claude` and sign in
```

**Main command (native):**
```bash
claude -p "PROMPT" --dangerously-skip-permissions [--model opus|sonnet|haiku] [--output-format json] [--sandbox]
```

**Wrapper script:**
```bash
node .claude/skills/omega-claude-cli/scripts/ask-claude.mjs "PROMPT" [--model MODEL] [--json] [--sandbox] [--timeout-ms N]
```

**Flags:**
- `--model` / `-m`: Model shorthand (`opus`=Opus 4.6, `sonnet`=4.5, `haiku`=4.5) or full model ID
- `--json`: Forwards `--output-format json` to claude
- `--sandbox`: Forwards `--sandbox` to claude (code execution sandbox)
- `--timeout-ms`: Wrapper-level timeout; exits with code 124

**Prompt delivery:** Prompt is passed as positional arg to `-p "PROMPT"`. `stdio: ['ignore', 'pipe', 'pipe']` — stdin closed.

**Windows specifics:** Uses `cmd.exe /d /s /c claude ...`; falls back to `npx -y @anthropic-ai/claude-code`.

**JSON output handling:** `extractJsonResponse()` in `format-output.mjs` extracts JSON from Claude's potentially-verbose stdout (Claude may wrap JSON response in conversational text).

**Models (per README):**
- Default (no `--model`): Opus 4.6
- `--model sonnet`: Claude Sonnet 4.5
- `--model haiku`: Claude Haiku 4.5

**Stdin limit:** `ASK_CLAUDE_MAX_STDIN_BYTES` env var (default 50MB).

#### B. Capability Matrix

| Capability | Support | Notes |
|------------|---------|-------|
| `review_file` | Partial | Via prompt text; `-p "Review this file: [content]"` |
| `review_plan` | Partial | Via prompt text |
| `ask_question` | Y | Primary use case |
| `compare_files` | Partial | Via prompt text |
| `generate_code` | Y | Full Claude capability |
| `streaming_output` | N | Wrapper buffers output |
| `exit_codes` | Y | 0=success, 1=error, 124=timeout |

#### C. Integration Requirements

- **API key:** Claude Code subscription or `ANTHROPIC_API_KEY` env var
- **Subscription:** Anthropic account with Claude Code access
- **Rate limits:** Anthropic API rate limits
- **Output format:** Plain text or JSON
- **`--dangerously-skip-permissions`:** Required for all non-interactive headless usage; allows tool execution without per-tool approval
- **Known edge cases:**
  - Claude may add conversational wrapper text around JSON responses — `extractJsonResponse()` strips this
  - Windows platform detection needed for `cmd.exe` invocation path
  - `--sandbox` flag exists but behavior depends on Claude Code version

---

### Tool 5: llm-council-master

#### A. Overview

**Architecture:** Python/FastAPI web application, NOT a CLI tool. Runs a local web server on port 8001 with a React frontend on port 5173.

**Installation:**
```bash
# Python backend
uv sync  # uses uv for dependency management

# Frontend
cd frontend && npm install

# Start
./start.sh  # or run backend + frontend manually
```

**API Key:** `OPENROUTER_API_KEY` in `.env` file (required). OpenRouter provides unified access to all models.

#### B. Council/Debate Mechanism

The council operates in 3 sequential stages:

**Stage 1: Independent Responses**
- User query is sent in parallel to ALL `COUNCIL_MODELS` via `asyncio.gather()`
- Each model responds independently with no knowledge of others
- Responses collected as `{model, response}` dicts
- Failed models are excluded gracefully (None response)

**Stage 2: Anonymized Peer Review (The Core Innovation)**
- Each council model's response is labeled as "Response A", "Response B", etc. (anonymized)
- A `label_to_model` mapping is kept server-side for de-anonymization
- The anonymized set of responses is sent back to ALL council models in parallel
- Each model evaluates all responses and provides:
  1. Per-response qualitative evaluation
  2. A structured `FINAL RANKING:` section (numbered list)
- Rankings are parsed with regex: `\d+\.\s*Response [A-Z]`
- Aggregate rankings computed as average position across all peer evaluations

**Stage 3: Chairman Synthesis**
- `CHAIRMAN_MODEL` receives: original query + all stage1 responses + all stage2 rankings
- Chairman synthesizes a single comprehensive final answer
- Chairman can be same or different model from council members

**Configuration (`backend/config.py`):**
```python
COUNCIL_MODELS = [
    "openai/gpt-5.1",
    "google/gemini-3-pro-preview",
    "anthropic/claude-sonnet-4.5",
    "x-ai/grok-4",
]
CHAIRMAN_MODEL = "google/gemini-3-pro-preview"
```

**Supported models:** Any model available on OpenRouter. OpenRouter provides unified API access to 100+ models.

#### C. Programmatic Invocation

**HTTP API (batch mode):**
```bash
# Create conversation
curl -X POST http://localhost:8001/api/conversations

# Send message (runs full 3-stage council)
curl -X POST http://localhost:8001/api/conversations/{id}/message \
  -H "Content-Type: application/json" \
  -d '{"content": "What is the best approach to X?"}'

# Response: {stage1: [...], stage2: [...], stage3: {...}, metadata: {...}}
```

**HTTP API (streaming mode via SSE):**
```bash
curl -N http://localhost:8001/api/conversations/{id}/message/stream \
  -H "Content-Type: application/json" \
  -d '{"content": "What is the best approach to X?"}'

# SSE events: stage1_start, stage1_complete, stage2_start, stage2_complete, stage3_start, stage3_complete, complete
```

**Python programmatic (direct import):**
```python
from backend.council import run_full_council
import asyncio

stage1, stage2, stage3, metadata = asyncio.run(
    run_full_council("What is the best approach to X?")
)
```

#### D. How to Invoke for Specific Use Cases

**Code review debate:**
```json
{"content": "Review this code and debate the best approach: [code here]"}
```

**Plan critique debate:**
```json
{"content": "Critique this architectural plan and identify weaknesses: [plan here]"}
```

**Question debate:**
```json
{"content": "Debate the pros and cons of [topic]. Models should challenge each other's reasoning."}
```

#### E. Capability Matrix

| Capability | Support | Notes |
|------------|---------|-------|
| `review_file` | Y | Via API content field |
| `review_plan` | Y | Via API content field |
| `ask_question` | Y | Primary use case |
| `compare_files` | Y | Stage 1 responses serve as comparison |
| `generate_code` | Y | Via API (though not optimized for it) |
| `streaming_output` | Y | SSE stream endpoint |
| `exit_codes` | N/A | HTTP status codes only (200, 404, 500) |

#### F. Integration Requirements

- **API key:** `OPENROUTER_API_KEY` (OpenRouter, not per-model keys)
- **Cost:** OpenRouter credits required; pay-per-use per model token
- **Rate limits:** OpenRouter per-model rate limits
- **Requires running server:** Cannot be invoked as a CLI; needs `uv run python -m backend.main`
- **Python 3.10+** required (uses `match` statements in uv)
- **Known limitations:**
  - Ranking parser may fail if models deviate from `FINAL RANKING:` format
  - No persistence of `label_to_model` metadata — only in API response
  - Not designed for agentic tool use; responds to conversation messages only

---

## Capability Matrix (Cross-Tool Comparison)

| Capability | omega-gemini | omega-codex | omega-cursor | omega-claude | llm-council |
|------------|:---:|:---:|:---:|:---:|:---:|
| `review_file` | Partial | Partial | Partial | Partial | Y |
| `review_plan` | Partial | Partial | Partial | Partial | Y |
| `ask_question` | Y | Y | Y | Y | Y |
| `compare_files` | Partial | Partial | Partial | Partial | Y (via debate) |
| `generate_code` | Y | Y | Y | Y | Partial |
| `streaming_output` | N | Y (JSONL) | N | N | Y (SSE) |
| `exit_codes` | Y | Y (124=timeout) | Y (124=timeout) | Y (124=timeout) | HTTP codes |
| Headless/CLI | Y | Y | Y | Y | N (HTTP only) |
| API Key Required | OAuth | OPENAI_API_KEY | Cursor subscription | Anthropic account | OPENROUTER_API_KEY |
| Cross-platform | Y | Y | Partial (WSL on Win) | Y | Y |
| npx fallback | Y | Y | Y | Y | N/A |
| Timeout support | N | Y | Y | Y | N/A |
| stdin prompt | Y (primary) | N (positional) | N (positional) | N (positional) | N (HTTP body) |
| JSON output | Y | Y (JSONL) | Y | Y | Y (structured) |

---

## Proposed Agent-Studio Integration Architecture

### Skill Names and Purposes

**Skill 1: `omega-gemini-cli`** (already exists in omega-gemini-cli project as a portable skill)
- Purpose: Shell out to Gemini CLI for questions, analysis, brainstorming
- Core script: `ask-gemini.mjs` — copy/symlink into agent-studio skills
- When to use: When Google's Gemini perspective is needed; free tier available
- Availability detection: `verify-setup.mjs` checks for `gemini` or `npx @google/gemini-cli`

**Skill 2: `omega-codex-cli`**
- Purpose: Shell out to OpenAI Codex CLI for code-focused tasks
- Core script: `ask-codex.mjs`
- When to use: When OpenAI/GPT model output is needed; Codex is code-optimized
- Availability detection: Check for `codex` or `npx @openai/codex`; requires OPENAI_API_KEY

**Skill 3: `omega-cursor-cli`**
- Purpose: Shell out to Cursor Agent CLI for IDE-aware code tasks
- Core script: `ask-cursor.mjs`
- When to use: When Cursor's multi-model routing is desired (can route to Claude, Gemini, GPT via `auto`)
- Availability detection: Check for `agent`/`cursor-agent`; requires Cursor subscription
- Note: Most restrictive availability — requires paid subscription AND correct PATH setup

**Skill 4: `omega-claude-cli`**
- Purpose: Shell out to Claude Code CLI — effectively invoking a second Claude session
- Core script: `ask-claude.mjs`
- When to use: Get a second-opinion Claude response without using current agent's context; useful for cross-validation
- Availability detection: Check for `claude` or `npx @anthropic-ai/claude-code`

**Skill 5: `llm-council`**
- Purpose: Orchestrate multi-LLM parallel debate and synthesis
- Approach A (server-based): Start llm-council FastAPI server, call HTTP API
- Approach B (scriptless, recommended): Implement council logic directly using the omega wrapper scripts in parallel via Bash, then use a Claude/Gemini call to synthesize
- When to use: High-stakes decisions requiring multiple LLM perspectives; plan critique; code review consensus

### Recommended Skill Architecture

All four omega skills should follow a consistent pattern:

```
.claude/skills/<skill-name>/
  SKILL.md                 — Skill definition with invocation examples
  scripts/
    ask-<tool>.mjs        — Core headless wrapper (copy from omega repo)
    parse-args.mjs        — Argument parser (copy from omega repo)
    verify-setup.mjs      — Availability check (copy from omega repo)
    format-output.mjs     — Output normalization (copy from omega repo, if present)
```

**SKILL.md pattern for each omega skill:**

```markdown
# <Tool> CLI Skill

Invoke <tool> CLI headless from agent-studio.

## Usage

node .claude/skills/<skill>/scripts/ask-<tool>.mjs "PROMPT" [--model MODEL] [--json] [--timeout-ms N]

## Availability Check

node .claude/skills/<skill>/scripts/verify-setup.mjs

## When to Use

- Get a <tool> perspective on a question
- Code review from <tool>'s model
- Generate code with <tool>
```

### Agent Design: Multi-LLM Workflows

**Recommended: `multi-llm-consultant` agent** (new agent to create)

This agent orchestrates multi-LLM consultation workflows by invoking multiple omega CLI skills in parallel and synthesizing results. It does NOT require the llm-council FastAPI server.

**Agent routing triggers:**
- "get multiple perspectives on..."
- "ask all LLMs about..."
- "compare what Claude vs Gemini vs GPT think about..."
- "LLM council", "multi-LLM review", "consensus from multiple models"
- "second opinion", "cross-validate with another model"

**Workflow:**
1. Detect available CLIs (run `verify-setup.mjs` for each)
2. Dispatch prompts in parallel to all available tools (using Bash `&` for parallelism)
3. Collect responses
4. Synthesize with a chairman model (e.g., the current Claude session or `ask-claude.mjs`)

**Example invocation in agent-studio:**

```bash
# Parallel dispatch
node .claude/skills/omega-gemini-cli/scripts/ask-gemini.mjs "PROMPT" > /tmp/gemini_out.txt &
node .claude/skills/omega-codex-cli/scripts/ask-codex.mjs "PROMPT" > /tmp/codex_out.txt &
node .claude/skills/omega-claude-cli/scripts/ask-claude.mjs "PROMPT" > /tmp/claude_out.txt &
wait

# Synthesize
node .claude/skills/omega-claude-cli/scripts/ask-claude.mjs \
  "You are the Chairman. Synthesize these responses: $(cat /tmp/gemini_out.txt /tmp/codex_out.txt /tmp/claude_out.txt)"
```

**Alternatively: `llm-council` skill** wrapping the FastAPI approach (for when richer debate semantics — anonymized peer review — are needed). This requires the llm-council server to be running.

### Availability Detection Pattern (for all skills)

Each skill MUST check availability before attempting invocation:

```javascript
// In SKILL.md or wrapper:
// 1. Run verify-setup.mjs — exit code 0 = available, 1 = not installed
// 2. Check required env vars (OPENAI_API_KEY for codex, etc.)
// 3. Gracefully degrade: if tool unavailable, skip it in multi-LLM workflows
```

### Error Handling and Graceful Degradation

- All four omega wrappers exit with code 1 on error, 124 on timeout
- npx fallback is already built in — if CLI not on PATH, tries npx auto-download
- For multi-LLM workflows: exclude failed tools from synthesis rather than aborting
- Skills should emit structured errors for the agent to handle:
  - `TOOL_NOT_AVAILABLE`: CLI not installed
  - `AUTH_FAILED`: Authentication error
  - `TIMEOUT`: Request timed out
  - `RATE_LIMITED`: API quota exceeded

---

## Academic References

*(No academic papers consulted; this research was purely codebase analysis.)*

---

## Practical Recommendations

### P0 (Immediate — This Sprint)

- Copy the four omega wrapper scripts (`ask-*.mjs`, `parse-args.mjs`, `verify-setup.mjs`, `format-output.mjs`) into corresponding agent-studio skill directories under `.claude/skills/omega-*/scripts/`
- Write `SKILL.md` files for each of the four omega skills using the consistent SKILL.md pattern documented above
- Register all four skills in the agent-studio skill catalog
- Assign the `omega-gemini-cli` skill to `researcher` and `developer` agents (most broadly useful; free tier)

### P1 (Soon — Next Sprint)

- Create the `multi-llm-consultant` agent with routing keywords matching "multiple perspectives", "LLM council", "cross-validate", "second opinion"
- Implement the parallel Bash dispatch pattern for multi-tool consultation
- Write a `llm-council` skill wrapper that can call the FastAPI server if available, or fall back to the parallel Bash pattern
- Add availability detection to all four omega skills (check via `verify-setup.mjs` before use)

### P2 (Future — Backlog)

- Implement Python port of llm-council logic as a standalone CLI script (removes need for FastAPI server running)
- Add streaming support to omega-gemini and omega-claude wrappers (pass output chunks as they arrive)
- Create integration tests that spawn each CLI headlessly in CI (with mocked CLI binaries)
- Add `COUNCIL_MODELS` config to agent-studio `.env` / config.yaml for customizing which models participate in multi-LLM workflows

---

## Risk Assessment

| Risk | Impact | Probability | Mitigation |
|------|--------|-------------|------------|
| Cursor CLI requires paid subscription | High — skill unusable without it | High | Mark as optional; check subscription in verify-setup |
| OpenAI API key not configured | Medium — codex skill unavailable | Medium | Verify `OPENAI_API_KEY` in setup check; skip in multi-LLM if absent |
| Gemini CLI auth expires | Medium — silent failure until re-auth | Low | verify-setup checks auth; provide clear re-auth instructions |
| OpenRouter credits depleted | High — llm-council stops working | Medium | Check balance before large council runs; use per-query cost estimate |
| llm-council server not running | High — council skill unavailable | High | Implement no-server fallback (parallel Bash approach) |
| Windows PATH issues for cursor-agent | Medium — cursor skill fails on Windows | High | Already handled in wrapper; document `CURSOR_AGENT_CMD_PATH` env var |
| Claude's `--dangerously-skip-permissions` security risk | High — allows all tool execution | Low | Only for headless mode; document risk clearly in skill |
| Prompt injection via model flag (Gemini, Windows) | High — command injection | Low | Already mitigated: model validated against `/^[a-zA-Z0-9._-]+$/` |
| llm-council ranking parser fails on model deviation | Medium — rankings incorrect | Medium | Fallback regex already implemented; test with all council models |
| Context overflow when injecting large file content | High — truncated prompt | Medium | Set `--timeout-ms` limits; document prompt size limits (50MB stdin cap already built in) |

---

## Implementation Roadmap

### Phase 1: Skill Scaffolding (1-2 days)

1. Create `.claude/skills/omega-gemini-cli/` directory structure
2. Copy `ask-gemini.mjs`, `parse-args.mjs`, `verify-setup.mjs`, `format-output.mjs` from `C:/dev/projects/omega-gemini-cli/.claude/skills/omega-gemini-cli/scripts/`
3. Write `SKILL.md` for omega-gemini-cli
4. Repeat for omega-codex-cli, omega-cursor-cli, omega-claude-cli
5. Register all 4 skills in `.claude/context/artifacts/catalogs/skill-catalog.md`
6. Assign omega-gemini-cli to researcher, developer, planner agents initially

### Phase 2: Multi-LLM Agent (2-3 days)

1. Create `multi-llm-consultant` agent at `.claude/agents/domain/multi-llm-consultant.md`
2. Define routing keywords and task types
3. Implement parallel dispatch pattern using Bash
4. Implement synthesis step using omega-claude-cli or direct Claude invocation
5. Add graceful degradation when tools unavailable
6. Write integration test

### Phase 3: LLM Council Integration (3-5 days)

1. Create `llm-council` skill at `.claude/skills/llm-council/SKILL.md`
2. Implement no-server council orchestration (Python or Bash)
3. Optionally: package llm-council as a standalone Python CLI script
4. Add to skill catalog; assign to multi-llm-consultant agent
5. Document council configuration in agent-studio `.env`

---

## Integration Risks and Open Questions

### Open Questions

1. **File content injection:** All four omega wrappers pass prompts as strings. For file review tasks, should file content be embedded in the prompt string, or should the skill support a `--file` flag that reads the file and prepends it? The current wrappers have no `--file` flag; file content must be embedded in the prompt text.

2. **Token limits per tool:** Gemini 2.5 has a very large context window; Codex models may have smaller limits. Need to document per-tool context limits and implement prompt truncation for large file reviews.

3. **Parallel vs sequential:** The multi-LLM consultant dispatches all tools in parallel for speed. But for council/debate, Stage 2 must wait for Stage 1 to complete. Need to decide if the agent-studio implementation uses sequential stages or a streaming approach.

4. **llm-council server lifecycle:** Should agent-studio automatically start the llm-council FastAPI server when needed? Or only support the no-server parallel Bash approach? Recommendation: start with no-server approach; server management adds operational complexity.

5. **Output format normalization:** Each tool produces slightly different output formats (Gemini JSONL, Codex JSONL events, Claude sometimes adds conversational framing). A shared `normalize-output.mjs` utility would reduce downstream parsing complexity.

6. **Cursor availability detection:** The verify-setup.mjs for cursor needs to detect subscription status, not just CLI installation. Currently no way to programmatically verify subscription.

7. **Cost visibility:** For multi-LLM workflows using OpenRouter or OpenAI APIs, cost per query is variable. Should the skill emit cost estimates or warnings for expensive council queries?

### What Was Found That May Affect Design

- The omega scripts are already designed as portable agent skills — they are production-ready and can be copied directly into agent-studio without modification
- The llm-council anonymized peer review mechanism is a genuine innovation that prevents model identity bias; any agent-studio reimplementation should preserve this design
- Gemini's `-p "" --yolo` + stdin pattern is the most reliable cross-platform headless mode for that tool; do not attempt to pass the prompt as a positional arg
- Codex uses `codex exec "PROMPT"` with prompt as positional arg (NOT stdin); this is the opposite of Gemini's pattern
- All four wrappers share a `--timeout-ms` flag (except Gemini) and a 50MB stdin limit for piped input
- The `format-output.mjs` files differ across tools; Gemini's handles JSON stream normalization while Claude's handles conversational text stripping around JSON

---

## Appendix: Raw Invocation Reference

### Gemini (native headless)
```bash
gemini -p "" --yolo [-m MODEL] [-s] [--output-format json]
# Prompt via stdin; -p "" is required for headless mode
echo "Your prompt" | gemini -p "" --yolo
```

### Codex (native headless)
```bash
codex exec "Your prompt" --skip-git-repo-check [--model MODEL] [--json] [--sandbox workspace-write]
```

### Cursor Agent (native headless)
```bash
cursor-agent --print --output-format text [--model MODEL] [--yolo] [--trust] "Your prompt"
# or:
agent --print --output-format text "Your prompt"
```

### Claude Code (native headless)
```bash
claude -p "Your prompt" --dangerously-skip-permissions [--model MODEL] [--output-format json] [--sandbox]
```

### LLM Council (HTTP API)
```bash
# Start server first:
uv run python -m backend.main

# Create conversation:
CONV_ID=$(curl -s -X POST http://localhost:8001/api/conversations | jq -r .id)

# Run council:
curl -X POST http://localhost:8001/api/conversations/$CONV_ID/message \
  -H "Content-Type: application/json" \
  -d '{"content": "Your question here"}'
```

### Wrapper scripts (portable, cross-platform)
```bash
# Gemini
node .claude/skills/omega-gemini-cli/scripts/ask-gemini.mjs "prompt" [--model MODEL] [--json] [--sandbox]

# Codex
node .claude/skills/omega-codex-cli/scripts/ask-codex.mjs "prompt" [--model MODEL] [--json] [--sandbox] [--timeout-ms 120000]

# Cursor
node .claude/skills/omega-cursor-cli/scripts/ask-cursor.mjs "prompt" [--model MODEL] [--json] [--yolo] [--trust] [--timeout-ms 120000]

# Claude
node .claude/skills/omega-claude-cli/scripts/ask-claude.mjs "prompt" [--model MODEL] [--json] [--sandbox] [--timeout-ms 120000]
```
