# Pre-commit Security Lint

The repository uses a **pre-commit hook** that runs a security scanner on **staged files** before each commit. This helps prevent secrets, injection patterns, and unsafe practices from being committed.

**Tool:** `.claude/tools/cli/security-lint.cjs`  
**Hook:** `.git/hooks/pre-commit` (runs `security-lint.cjs --staged`)

---

## When it runs

- **On every `git commit`**: The hook runs on **staged files only** (not the whole repo).
- **Exit 0**: Commit proceeds.
- **Exit 1**: Commit is blocked; fix or exclude the reported issues (see below).

---

## Exclusions (so docs and examples don’t block commits)

To avoid false positives from documentation and example code, the linter **skips** certain paths and **ignores** specific finding+path pairs.

### 1. Markdown under docs / plans / skills

**Config:** `CONFIG.skipMdPaths` in `security-lint.cjs`

- **Paths:** `.claude/docs/`, `.claude/context/plans/`, `.claude/skills/`
- **Rule:** Any **`.md`** file under these directories is **not scanned**.
- **Reason:** These files contain examples (e.g. `path.join`, `http://`, `eval`, SQL snippets). Scanning them would block commits on documentation.

If you add new doc/plan/skill directories that are example-only, you can add them to `skipMdPaths` in `.claude/tools/cli/security-lint.cjs`.

### 2. Known false positives (path + rule)

**Config:** `CONFIG.skipFindings` in `security-lint.cjs`

Findings in these **path + rule** combinations are **excluded** from the report and from blocking:

| Path (substring)           | Rule    | Reason |
|----------------------------|---------|--------|
| `user-prompt-unified.cjs`  | SEC-040 | `path.join` with literal `"reflection-spawn-request"`, not user input |
| `generate-tool-manifest.cjs` | SEC-030 | CLI diagnostic logging (tool names), not sensitive data |
| `tests/migration/`         | SEC-011 | Test harness `execSync` with controlled input |

To add another allowed false positive, add an entry to `skipFindings`:

```javascript
{ pathSubstring: 'path/to/file.cjs', ruleId: 'SEC-XXX' }
```

Use a path substring that uniquely identifies the file or directory (e.g. filename or `tests/foo/`).

---

## Running the linter manually

```bash
# Staged files only (same as pre-commit)
node .claude/tools/cli/security-lint.cjs --staged

# All tracked files
node .claude/tools/cli/security-lint.cjs --all

# Specific files
node .claude/tools/cli/security-lint.cjs path/to/file.cjs

# JSON output
node .claude/tools/cli/security-lint.cjs --staged --json
```

---

## Bypassing the hook (emergencies only)

To commit without running the security lint (e.g. WIP or known-safe change):

```bash
git commit --no-verify -m "your message"
```

Use sparingly; the hook is there to catch mistakes.

---

## Rule reference

The scanner checks for patterns such as:

- **SEC-001 to SEC-005**: Hardcoded secrets (API keys, passwords, private keys, AWS keys, JWT).
- **SEC-010 to SEC-013**: Injection (SQL, command, eval, Function constructor).
- **SEC-020 to SEC-023**: Insecure HTTP, SSL, MD5.
- **SEC-030, SEC-031**: Logging sensitive data.
- **SEC-040**: Path built from user input (e.g. `path.join` with `req.*` / `request.*`).
- **SEC-050**: Prototype pollution risk.

Full list and patterns: see `SECURITY_RULES` in `.claude/tools/cli/security-lint.cjs`.

---

## File-level skip

To skip scanning a **single file** (e.g. test fixture with intentional patterns), add one of these at the **very first line** of the file:

- `// security-lint-ignore`
- `/* security-lint-ignore */`
- `# security-lint-ignore`

The entire file will then be skipped. Prefer path-based exclusions (`skipMdPaths` / `skipFindings`) for maintainability.
