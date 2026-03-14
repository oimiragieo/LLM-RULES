---
name: security-scanning
description: Automated security scanning pipeline covering SAST (Semgrep), SCA (OWASP dependency-check), SBOM generation (Syft), vulnerability scanning (Grype), and secrets detection (detect-secrets). Invoked by security-architect for pre-commit gates, CI integration, and finding triage.
version: 1.0.0
category: security
agents:
  - security-architect
  - devops
  - qa
tools:
  - Bash
  - Read
  - Write
  - Grep
---

# Security Scanning Skill

Automated security scanning pipeline: SAST, SCA, SBOM, and secrets detection.

## Tools

| Tool                   | Purpose                           | Install                            |
| ---------------------- | --------------------------------- | ---------------------------------- |
| Semgrep                | SAST — static analysis            | `pip install semgrep`              |
| OWASP dependency-check | SCA — known CVEs in deps          | `brew install dependency-check`    |
| Syft                   | SBOM generation                   | `brew install anchore/syft/syft`   |
| Grype                  | Vulnerability scanner (uses SBOM) | `brew install anchore/grype/grype` |
| detect-secrets         | Secrets detection                 | `pip install detect-secrets`       |

## Phase 1: SAST — Static Analysis (Semgrep)

```bash
# Run default ruleset
semgrep --config auto .

# Run security-focused rules only
semgrep --config p/security-audit .

# Run OWASP Top 10 rules
semgrep --config p/owasp-top-ten .

# Output JSON for CI
semgrep --config auto --json --output semgrep-results.json .

# Fail CI on any HIGH or CRITICAL finding
semgrep --config auto --severity ERROR .
```

**Recommended rulesets:**

- `p/security-audit` — broad security audit
- `p/owasp-top-ten` — OWASP Top 10 coverage
- `p/javascript` — JS/TS patterns (injection, XSS, prototype pollution)
- `p/python` — Python patterns (SQL injection, insecure deserialization)
- `p/secrets` — hardcoded credential detection

## Phase 2: SCA — Software Composition Analysis (OWASP dependency-check)

```bash
# Scan Node.js project
dependency-check --project myapp --scan . --format JSON --out dependency-check-report

# Scan with NVD API key (avoids rate limiting)
dependency-check --project myapp --scan . \
  --nvdApiKey "$NVD_API_KEY" \
  --format HTML --out reports/

# CI integration: fail on CVSS >= 7.0
dependency-check --project myapp --scan . \
  --failOnCVSS 7 \
  --format JSON --out reports/

# Suppress false positives
dependency-check --project myapp --scan . \
  --suppression suppressions.xml
```

## Phase 3: SBOM Generation (Syft)

```bash
# Generate SBOM for current directory
syft . -o spdx-json > sbom.spdx.json

# SBOM from Docker image
syft my-image:latest -o cyclonedx-json > sbom.cyclonedx.json

# Multiple formats
syft . -o spdx-json -o cyclonedx-json -o syft-json

# Sign SBOM with cosign
cosign attest --predicate sbom.spdx.json --type spdx $IMAGE_DIGEST
```

## Phase 4: Vulnerability Scanning (Grype)

```bash
# Scan from SBOM
grype sbom:sbom.spdx.json

# Scan Docker image directly
grype my-image:latest

# Scan current directory
grype .

# Fail on CRITICAL or HIGH
grype sbom:sbom.spdx.json --fail-on high

# Output JSON for CI
grype sbom:sbom.spdx.json -o json > grype-results.json

# Filter by severity
grype sbom:sbom.spdx.json --only-fixed
```

## Phase 5: Secrets Detection (detect-secrets)

```bash
# Create baseline (initial scan)
detect-secrets scan > .secrets.baseline

# Audit baseline interactively
detect-secrets audit .secrets.baseline

# Scan for new secrets (CI check)
detect-secrets scan --baseline .secrets.baseline

# Add to pre-commit hook
# .pre-commit-config.yaml:
# - repo: https://github.com/Yelp/detect-secrets
#   rev: v1.4.0
#   hooks:
#   - id: detect-secrets
#     args: ['--baseline', '.secrets.baseline']
```

## Pre-Commit Gate

```yaml
# .pre-commit-config.yaml
repos:
  - repo: https://github.com/returntocorp/semgrep
    rev: v1.58.0
    hooks:
      - id: semgrep
        args: ['--config', 'p/security-audit', '--error']

  - repo: https://github.com/Yelp/detect-secrets
    rev: v1.4.0
    hooks:
      - id: detect-secrets
        args: ['--baseline', '.secrets.baseline']
```

## CI Integration (GitHub Actions)

```yaml
# .github/workflows/security.yml
name: Security Scan
on: [push, pull_request]

jobs:
  security:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: SAST (Semgrep)
        uses: returntocorp/semgrep-action@v1
        with:
          config: p/security-audit

      - name: Generate SBOM
        uses: anchore/sbom-action@v0
        with:
          format: spdx-json
          output-file: sbom.spdx.json

      - name: Vulnerability Scan (Grype)
        uses: anchore/scan-action@v3
        with:
          sbom: sbom.spdx.json
          fail-build: true
          severity-cutoff: high

      - name: Secrets Detection
        run: |
          pip install detect-secrets
          detect-secrets scan --baseline .secrets.baseline
```

## Finding Triage Workflow

```
HIGH/CRITICAL findings:
  → Create security issue immediately
  → Assign to security-architect for review
  → Block merge until resolved or suppressed with justification

MEDIUM findings:
  → Log in security backlog
  → Review in next sprint
  → Add to suppression file with justification if false positive

LOW/INFO findings:
  → Weekly review
  → Suppress with justification or accept risk
```

## Suppression Patterns

**Semgrep (inline):**

```python
# nosemgrep: python.lang.security.audit.hardcoded-password.hardcoded-password
PASSWORD = os.environ["PASSWORD"]
```

**detect-secrets (.secrets.baseline):**

```bash
# Mark as false positive during audit
detect-secrets audit .secrets.baseline
# Press 'n' to mark as not a secret
```

**Grype (grype.yaml):**

```yaml
ignore:
  - vulnerability: CVE-2021-44228
    reason: 'Not affected — log4j not in classpath'
```

## When to Invoke

- `Skill({ skill: 'security-scanning' })` — before any security review
- Pre-commit: automatically via pre-commit hooks
- CI: on every PR targeting main/release branches
- Release gates: mandatory before any production deployment

## Iron Laws

1. **ALWAYS** scan before merging to main — no exceptions for "quick fixes"
2. **NEVER** suppress a HIGH/CRITICAL finding without documented justification and security-architect approval
3. **ALWAYS** generate and store SBOM for every container image pushed to production
4. **NEVER** commit secrets baseline with unmarked findings — audit every detected secret
5. **ALWAYS** update SBOM and re-scan after any dependency change

## Anti-Patterns

| Anti-Pattern                     | Why It Fails                      | Correct Approach                         |
| -------------------------------- | --------------------------------- | ---------------------------------------- |
| Skipping SCA for "known" deps    | CVEs are discovered continuously  | Always run SCA; pin versions + audit     |
| Suppressing all Semgrep findings | Breaks the safety net             | Suppress only with justification + owner |
| Not rotating detected secrets    | Secret is already compromised     | Rotate immediately, then suppress        |
| SBOM generated but not scanned   | SBOM alone adds no security value | Always run Grype against generated SBOM  |
| Scanning only in CI              | Developers get slow feedback loop | Add pre-commit hooks for SAST + secrets  |

## Memory Protocol (MANDATORY)

**Before starting:**
Read `.claude/context/memory/learnings.md`

**After completing:**

- New pattern -> `.claude/context/memory/learnings.md`
- Issue found -> `.claude/context/memory/issues.md`
- Decision made -> `.claude/context/memory/decisions.md`

> ASSUME INTERRUPTION: If it's not in memory, it didn't happen.
