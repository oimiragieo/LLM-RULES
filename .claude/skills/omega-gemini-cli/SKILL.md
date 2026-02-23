---
name: omega-gemini-cli
description: Shell out to Google Gemini CLI for headless AI queries, code analysis, and brainstorming. Uses stdin-based prompt delivery for cross-platform reliability. Free tier available via personal Google account.
version: 1.0.0
model: sonnet
invoked_by: both
user_invocable: true
tools: [Bash, Read]
best_practices:
  - Always run verify-setup.mjs before first invocation to check CLI availability
  - Use stdin prompt delivery (built into ask-gemini.mjs) -- never pass prompt as positional arg directly to gemini CLI
  - For file review, embed file content in prompt text -- no dedicated --file flag exists
  - Use --json flag for machine-parseable output in automation pipelines
  - Use --sandbox flag for code execution tasks requiring isolated sandbox
error_handling: graceful
streaming: not_supported
---

# Gemini CLI Skill

Headless wrapper for Google Gemini CLI. Sends prompts via stdin to `gemini -p "" --yolo`.
Free tier available — no API key required (Google OAuth only).

## When to Use

- Get a Google Gemini perspective on any question
- Free-tier AI consultation (no API key costs)
- Code review from Gemini's model
- Brainstorming and analysis tasks
- Cross-validation of Claude's own responses

## Usage

### Ask a question
```bash
node .claude/skills/omega-gemini-cli/scripts/ask-gemini.mjs "What is the best caching strategy for a Node.js API?"
```

### Specify model
```bash
node .claude/skills/omega-gemini-cli/scripts/ask-gemini.mjs "Explain async/await" --model gemini-2.5-pro
```

### JSON output
```bash
node .claude/skills/omega-gemini-cli/scripts/ask-gemini.mjs "List 5 design patterns" --json
```

### Code sandbox
```bash
node .claude/skills/omega-gemini-cli/scripts/ask-gemini.mjs "Write and run a fibonacci function" --sandbox
```

### File review (embed content in prompt)
```bash
node .claude/skills/omega-gemini-cli/scripts/ask-gemini.mjs "Review this code: $(cat src/auth.ts)"
```

## Availability Check

```bash
node .claude/skills/omega-gemini-cli/scripts/verify-setup.mjs
# Exit 0 = available, Exit 1 = not installed
```

## Scripts

| Script | Purpose |
|--------|---------|
| `ask-gemini.mjs` | Core headless wrapper — sends prompt via stdin |
| `parse-args.mjs` | Argument parser (--model, --json, --sandbox) |
| `verify-setup.mjs` | Availability check with npx fallback |
| `format-output.mjs` | Output normalization (JSON stream handling) |

## Flags

| Flag | Description |
|------|-------------|
| `--model MODEL` | Gemini model (e.g., gemini-2.5-flash, gemini-2.5-pro) |
| `--json` | Machine-readable JSON output |
| `--sandbox` | Code execution sandbox mode |

## Exit Codes

| Code | Meaning |
|------|---------|
| 0 | Success |
| 1 | Error (CLI failure, auth issue) |
| 9009 | Windows: command not found (falls back to npx) |

## Iron Laws

1. ALWAYS use verify-setup.mjs before first use
2. NEVER pass prompt as positional arg to raw gemini CLI — use ask-gemini.mjs wrapper
3. ALWAYS validate model parameter (wrapper does this automatically)
4. NEVER assume gemini is on PATH — wrapper handles npx fallback
5. ALWAYS handle exit code 1 and 9009 gracefully

## Integration Notes

- **Auth:** One-time Google OAuth via `gemini` interactive session
- **Rate limits:** Governed by Gemini API quotas (generous for personal use)
- **Platform:** Full cross-platform (Windows requires shell:true with model validation)
- **No timeout flag:** Unlike other omega wrappers, gemini wrapper has no --timeout-ms
