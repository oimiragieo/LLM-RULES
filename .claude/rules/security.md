# Security

## Core Rules

- Never commit secrets or credentials to version control
- Validate all user input and sanitize outputs
- Use parameterized queries for database access (never string interpolation)
- Review auth/authz/PII changes with security-architect agent

## Command Execution Safety

### shell: false Standard (CRITICAL)

**Requirement:** Always use `shell: false` with array arguments for child process spawning.

```javascript
// SECURE
spawn('npm', ['run', 'build'], { shell: false });
spawn('git', ['commit', '-m', message], { shell: false });

// INSECURE — DO NOT USE
spawn('npm run build', { shell: true }); // shell injection risk
execSync('git commit -m "' + message + '"'); // command injection risk
```

`shell: true` exposes the process to shell metacharacter injection. Array arguments bypass shell parsing entirely — no metacharacter interpretation possible. **Enforcement:** ESLint rule blocks `shell: true`.

### JSON Parsing Safety (HIGH)

**Requirement:** Always use `safeParseJSON()` for parsing untrusted JSON. Never use raw `JSON.parse()` on user/agent input.

```javascript
// INSECURE
const data = JSON.parse(userInput);

// SECURE
const { success, data, error } = safeParseJSON(userInput, {});
if (!success) return {};
```

`safeParseJSON` (`.claude/lib/utils/safe-json.cjs`) provides: try-catch wrapping, prototype pollution protection (`__proto__`/`constructor`/`prototype` stripped), structured `{ success, data, error }` return. **Enforcement:** ESLint rule blocks direct `JSON.parse()` in hook files.

### Concurrent File Operations (MEDIUM)

- Use file-based locking (`proper-lockfile`) for concurrent database initialization
- Validate file paths before operations (prevent path traversal)

## OWASP Agentic AI Top 10

### ASI01: Agent Goal Hijacking

Adversarial prompts redirect agent behavior from intended tasks. Mitigations: validate inputs against expected task scope; implement task boundary checks in routing; use system prompts that resist goal redirection.

### ASI02: Tool Misuse

Agents use tools beyond intended scope. Mitigations: enforce least privilege for tool access; whitelist/blacklist tools per agent type (see CLAUDE.md §1.1); validate tool parameters; monitor tool usage patterns.

### ASI06: Memory & Context Poisoning

Malicious data in memory/context influences future agent behavior. Mitigations: sanitize all data written to memory files; validate entries before use; never execute code from memory without validation; implement memory rotation (ADR-102).

## Prompt Injection Defense

**Attack Vector**: User input contains instructions that override system behavior.

**Defenses:**

- Separate system instructions from user input (distinct message roles)
- Validate inputs contain only data, not instructions
- Filter outputs for leaked system prompts
- Sandbox execution environments for untrusted input

## Memory Poisoning Prevention

**Risk**: Stored memory influences agent decisions maliciously.

**Mitigations:** validate memory writes match expected schemas; sanitize code snippets before storing; never execute bash commands from memory without approval; flag anomalous memory patterns; rotate memory to cold storage (ADR-102).

## Tool Use Safety

**Principle of Least Privilege**: Agents get minimum tools needed for their role.

- Router: whitelist-only (`Task`, `Read`, `AskUserQuestion`)
- Developer/QA: broader toolsets
- Orchestrators: `Task` tool for delegation
- See CLAUDE.md Section 1.1 for complete tool restrictions

**Validation**: `routing-guard.cjs` enforces tool restrictions at runtime.

## Related References

- `@ENFORCEMENT_HOOKS.md` - security-trigger.cjs enforcement
- `@AGENT_ROUTING_TABLE.md` - security-architect agent routing
- `.claude/workflows/security-architect-skill-workflow.md` - Structured security review
