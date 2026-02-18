# gemini-cli-security Command

## Overview

The `gemini-cli-security` command runs AI-powered vulnerability analysis on TypeScript/JavaScript code. It detects hardcoded secrets, injection attacks, weak cryptography, and LLM-specific risks. It can also scan npm dependencies against the OSV.dev vulnerability database.

## Syntax

```
/security-scan [target] [options]
```

Or via skill invocation:

```javascript
Skill({ skill: 'gemini-cli-security', args: '[target] [options]' });
```

## Arguments

| Argument         | Description                                         | Default                 |
| ---------------- | --------------------------------------------------- | ----------------------- |
| `[target]`       | Directory or file to analyze                        | `.` (current directory) |
| `--scan-deps`    | Also scan package.json dependencies against OSV.dev | disabled                |
| `--json`         | Output as JSON for CI/CD integration                | disabled                |
| `--scope <text>` | Natural language scope restriction                  | none                    |

## Examples

### Scan entire project

```bash
node .claude/skills/gemini-cli-security/scripts/main.cjs
```

### Scan a specific directory

```bash
node .claude/skills/gemini-cli-security/scripts/main.cjs --target src/
```

### Scan with dependency check

```bash
node .claude/skills/gemini-cli-security/scripts/main.cjs --scan-deps
```

### JSON output for CI pipeline

```bash
node .claude/skills/gemini-cli-security/scripts/main.cjs --target . --json
```

### Scoped analysis

```bash
node .claude/skills/gemini-cli-security/scripts/main.cjs --target src/auth/ --scope "token handling and session management"
```

### Agent invocation

```javascript
// Invoke from within an agent
Skill({ skill: 'gemini-cli-security' });

// With arguments
Skill({ skill: 'gemini-cli-security', args: 'src/ --scan-deps' });
```

## Output

### Default (Markdown Report)

The default output is a structured markdown security report grouped by severity:

```
## Security Analysis Report

### CRITICAL (N)
- [SEC-001] Hardcoded API key
  File: `src/config.ts:42`
  Remediation: Move API key to environment variable or secrets manager

### HIGH (N)
...

### Summary
- Critical: N
- High: N
- Medium: N
- Low: N
- Total findings: N
```

### JSON Output (`--json` flag)

Machine-parseable JSON for CI/CD integration:

```json
{
  "findings": [...],
  "dependencies": [...],
  "summary": {
    "critical": 0,
    "high": 2,
    "medium": 3,
    "low": 0,
    "precision": 0.90,
    "recall": 0.93
  }
}
```

## Exit Codes

| Code | Meaning                                         |
| ---- | ----------------------------------------------- |
| `0`  | No CRITICAL or HIGH findings                    |
| `1`  | CRITICAL or HIGH findings found (CI gate fails) |

## Vulnerability Categories

| Category     | Severity | Examples                                      |
| ------------ | -------- | --------------------------------------------- |
| Secrets      | CRITICAL | API keys, passwords, private keys, tokens     |
| Injection    | HIGH     | SQL injection, XSS, command injection, eval() |
| Cryptography | MEDIUM   | MD5/SHA1, DES/RC4, Math.random() for security |
| LLM Safety   | MEDIUM   | Prompt injection, unsafe LLM output in exec   |

## Performance

- Precision: 90% (OpenSSF CVE benchmark, TypeScript/JavaScript)
- Recall: 93% (OpenSSF CVE benchmark, TypeScript/JavaScript)
- Source: `github.com/gemini-cli-extensions/security` (Apache 2.0)

## Related Skills

- `security-architect` - Comprehensive OWASP/STRIDE security reviews
- `insecure-defaults` - Detects default credentials and hardcoded values
- `differential-review` - Security review of code diffs
- `auth-security-expert` - OAuth 2.1 and JWT-specific security
- `static-analysis` - CodeQL and Semgrep SARIF analysis
