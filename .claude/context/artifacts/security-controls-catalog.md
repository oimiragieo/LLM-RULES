# Security Controls Catalog

**Version**: 1.0.0
**Last Updated**: 2026-01-28
**Purpose**: Centralized registry of reusable security controls with OWASP mappings, implementation code, and test cases.

---

## Overview

This catalog documents security controls used throughout the Agent-Studio framework. Each control includes:

- **Control ID**: Unique identifier (SEC-XXX-YYY format)
- **Description**: What the control does
- **Threat Mitigated**: OWASP Top 10 mapping + STRIDE category
- **Implementation Code**: Reference implementation
- **Test Cases**: Validation examples
- **Locations**: Where the control is used in the framework

---

## Meta-Controls (Registry Integrity)

### SEC-REGISTRY-001: Registry Read-Only at Runtime

**Description**: Security controls catalog MUST be read-only during runtime. Changes require controlled update process.

**Threat Mitigated**:
- **OWASP A04**: Insecure Design (tampering with security controls)
- **STRIDE**: Tampering (modified controls weaken security)

**Implementation**:
```javascript
// Hook: security-registry-guard.cjs (proposed)
function enforceReadOnly(hookInput) {
  const { toolName, params } = hookInput;

  if (toolName === 'Write' || toolName === 'Edit') {
    if (params.file_path && params.file_path.includes('security-controls-catalog.md')) {
      return {
        allowed: false,
        reasoning: 'SEC-REGISTRY-001: Security controls catalog is read-only at runtime. Use security-architect agent to propose changes via PR.'
      };
    }
  }

  return { allowed: true };
}
```

**Test Cases**:
- Input: `Write({ file_path: "security-controls-catalog.md", ... })`
- Expected: Hook blocks with SEC-REGISTRY-001 error
- Input: `Edit({ file_path: "security-controls-catalog.md", ... })`
- Expected: Hook blocks with SEC-REGISTRY-001 error
- Input: `Read({ file_path: "security-controls-catalog.md" })`
- Expected: Allowed (read-only access permitted)

**Locations**:
- Enforced by: `.claude/hooks/safety/security-registry-guard.cjs` (proposed)
- Referenced by: All creator skills, security-architect agent

---

### SEC-REGISTRY-002: Security-Architect Review Required

**Description**: All changes to security controls catalog MUST be reviewed by security-architect agent before merging.

**Threat Mitigated**:
- **OWASP A01**: Broken Access Control (unauthorized security changes)
- **STRIDE**: Elevation of Privilege (bypassing security review)

**Implementation**:
```javascript
// routing-guard.cjs extension
function enforceSecurityReview(hookInput) {
  const { conversationHistory, isCommitAttempt } = hookInput;

  // Check if modifying security-controls-catalog.md
  const modifiesRegistry = conversationHistory.some(msg =>
    msg.includes('security-controls-catalog.md') &&
    (msg.includes('Write') || msg.includes('Edit'))
  );

  if (modifiesRegistry && isCommitAttempt) {
    // Check if security-architect was invoked
    const securityReviewPerformed = conversationHistory.some(msg =>
      msg.includes('security-architect') || msg.includes('Skill({ skill: "security-architect" })')
    );

    if (!securityReviewPerformed) {
      return {
        allowed: false,
        reasoning: 'SEC-REGISTRY-002: Changes to security-controls-catalog.md require security-architect review before commit.'
      };
    }
  }

  return { allowed: true };
}
```

**Test Cases**:
- Input: Commit attempt after modifying catalog WITHOUT security-architect review
- Expected: Hook blocks with SEC-REGISTRY-002 error
- Input: Commit attempt after security-architect reviewed changes
- Expected: Allowed (review completed)

**Locations**:
- Enforced by: `.claude/hooks/routing/routing-guard.cjs` (extension)
- Referenced by: security-architect agent, devops agent

---

## Application Controls

### SEC-001: Token Whitelist Validation

**Description**: Template token names MUST be validated against a whitelist before rendering to prevent arbitrary token injection.

**Threat Mitigated**:
- **OWASP A03**: Injection (template injection via malicious token names)
- **STRIDE**: Tampering (injecting unexpected content via tokens)

**Implementation**:
```javascript
// template-renderer skill
const ALLOWED_TOKENS = [
  // Specification template
  'PROJECT_NAME', 'STAKEHOLDER', 'DATE', 'VERSION', 'ACCEPTANCE_CRITERIA', 'OUT_OF_SCOPE', 'CONSTRAINTS', 'DEPENDENCIES',
  // Plan template
  'TASK_LIST', 'DEPENDENCIES_GRAPH', 'TIMELINE', 'RESOURCES',
  // Tasks template
  'EPIC_LIST', 'STORY_LIST', 'PRIORITY_ORDER',
  // ADR template
  'ADR_NUMBER', 'TITLE', 'STATUS', 'CONTEXT', 'DECISION', 'CONSEQUENCES', 'ALTERNATIVES'
];

function validateToken(tokenName) {
  if (!ALLOWED_TOKENS.includes(tokenName)) {
    throw new Error(`SEC-001: Token "${tokenName}" not in whitelist. Allowed: ${ALLOWED_TOKENS.join(', ')}`);
  }
  return true;
}
```

**Test Cases**:
- Input: `validateToken('PROJECT_NAME')` → Expected: true
- Input: `validateToken('MALICIOUS_TOKEN')` → Expected: Error (not in whitelist)
- Input: `validateToken('{{INJECT}}')` → Expected: Error (not in whitelist)

**Locations**:
- Implemented in: `.claude/skills/template-renderer/SKILL.md`
- Referenced by: spec-gathering, plan-generator, task-breakdown skills

---

### SEC-002: Path Validation (Path Traversal Prevention)

**Description**: All file paths MUST be validated to ensure they remain within PROJECT_ROOT before file operations.

**Threat Mitigated**:
- **OWASP A01**: Broken Access Control (path traversal to read/write arbitrary files)
- **STRIDE**: Information Disclosure + Tampering (read/write outside project)

**Implementation**:
```javascript
// lib/utils/project-root.cjs (existing)
const path = require('path');

function validatePathWithinProject(filePath) {
  const projectRoot = process.env.PROJECT_ROOT || process.cwd();
  const normalizedPath = path.normalize(filePath);
  const resolvedPath = path.resolve(normalizedPath);

  // Reject dangerous patterns
  if (filePath.includes('..') || filePath.startsWith('/') || /^[A-Z]:\\/i.test(filePath)) {
    throw new Error(`SEC-002: Path traversal attempt detected: ${filePath}`);
  }

  // Ensure path is within project root
  if (!resolvedPath.startsWith(projectRoot)) {
    throw new Error(`SEC-002: Path outside project root: ${filePath}`);
  }

  return resolvedPath;
}

module.exports = { validatePathWithinProject };
```

**Test Cases**:
- Input: `validatePathWithinProject('.claude/templates/spec.md')` → Expected: Valid path
- Input: `validatePathWithinProject('../../../etc/passwd')` → Expected: Error (traversal attempt)
- Input: `validatePathWithinProject('/absolute/path')` → Expected: Error (absolute path rejected)
- Input: `validatePathWithinProject('C:\\Windows\\System32')` → Expected: Error (Windows absolute rejected)

**Locations**:
- Implemented in: `.claude/lib/utils/project-root.cjs`
- Used by: template-renderer, all creator skills, file-placement-guard.cjs

---

### SEC-003: Input Sanitization (Token Value Sanitization)

**Description**: Token values provided by users MUST be sanitized to remove potentially dangerous characters before rendering.

**Threat Mitigated**:
- **OWASP A03**: Injection (markdown/YAML injection via token values)
- **STRIDE**: Tampering (corrupted output via malicious values)

**Implementation**:
```javascript
// template-renderer skill
function sanitizeTokenValue(value) {
  if (typeof value !== 'string') {
    value = String(value);
  }

  return value
    .replace(/[<>]/g, '')        // Remove HTML tags
    .replace(/\$\{/g, '')        // Prevent template literal injection
    .replace(/`/g, '')           // Remove backticks (code execution)
    .replace(/\r?\n\s*---\s*\n/g, '') // Remove YAML frontmatter separators
    .trim();
}
```

**Test Cases**:
- Input: `sanitizeTokenValue('Project X')` → Expected: `'Project X'`
- Input: `sanitizeTokenValue('<script>alert(1)</script>')` → Expected: `'scriptalert(1)/script'`
- Input: `sanitizeTokenValue('${process.exit()}')` → Expected: `'process.exit()'`
- Input: `sanitizeTokenValue('---\nmalicious: yaml\n---')` → Expected: `''` (removed)

**Locations**:
- Implemented in: `.claude/skills/template-renderer/SKILL.md`
- Used by: spec-gathering, plan-generator, task-breakdown skills

---

### SEC-004: Transparency Markers for AI-Generated Content

**Description**: All AI-generated contextual items MUST be prefixed with `[AI-GENERATED]` to distinguish from validated IEEE/standard content.

**Threat Mitigated**:
- **OWASP A04**: Insecure Design (users trusting hallucinated content)
- **STRIDE**: Information Disclosure (misleading quality guidance)

**Implementation**:
```javascript
// checklist-generator skill
function generateContextualItem(projectContext, ieeeBase) {
  // Analyze project to generate contextual checklist item
  const contextualItem = analyzeProject(projectContext);

  // ALWAYS prefix with transparency marker
  return `- [ ] [AI-GENERATED] ${contextualItem}`;
}

// Example output
function generateChecklist(projectContext) {
  const ieee = [
    '- [ ] Code follows project style guide',
    '- [ ] No code duplication',
    '- [ ] Cyclomatic complexity < 10'
  ];

  const contextual = [
    '- [ ] [AI-GENERATED] React components use proper memo',
    '- [ ] [AI-GENERATED] TypeScript types exported properly',
    '- [ ] [AI-GENERATED] API rate limiting implemented'
  ];

  return [...ieee, ...contextual];
}
```

**Test Cases**:
- Input: Generate checklist for TypeScript React project
- Expected: 80-90% IEEE items (no prefix), 10-20% contextual items (with `[AI-GENERATED]` prefix)
- Input: Grep for `[AI-GENERATED]` in output
- Expected: All contextual items have marker, zero IEEE items have marker

**Locations**:
- Implemented in: `.claude/skills/checklist-generator/SKILL.md`
- Used by: qa agent, code-reviewer agent, security-architect agent (after Enhancement #10)

---

## Control Usage Matrix

| Control ID | Threat (OWASP) | Threat (STRIDE) | Primary Location | Used By |
|------------|----------------|-----------------|------------------|---------|
| SEC-REGISTRY-001 | A04 Insecure Design | Tampering | security-registry-guard.cjs | All agents |
| SEC-REGISTRY-002 | A01 Broken Access Control | Elevation of Privilege | routing-guard.cjs | security-architect |
| SEC-001 | A03 Injection | Tampering | template-renderer | spec-gathering, plan-generator, task-breakdown |
| SEC-002 | A01 Broken Access Control | Information Disclosure | project-root.cjs | All file operations |
| SEC-003 | A03 Injection | Tampering | template-renderer | spec-gathering, plan-generator, task-breakdown |
| SEC-004 | A04 Insecure Design | Information Disclosure | checklist-generator | qa, code-reviewer, security-architect, architect |

---

## Versioning & Updates

**Current Version**: 1.0.0 (Sprint 3 - Enhancement #8)

**Change Process**:
1. Propose changes via security-architect agent
2. Security review REQUIRED (SEC-REGISTRY-002)
3. Update version number (semantic versioning)
4. Update CHANGELOG with control additions/modifications
5. PR review with mandatory security-architect approval

**Semantic Versioning**:
- MAJOR (X.0.0): Breaking changes to control implementations
- MINOR (1.X.0): New controls added
- PATCH (1.0.X): Bug fixes, clarifications, non-functional changes

---

## References

- **OWASP Top 10 (2021)**: https://owasp.org/Top10/
- **STRIDE Threat Model**: https://learn.microsoft.com/en-us/azure/security/develop/threat-modeling-tool-threats
- **CWE (Common Weakness Enumeration)**: https://cwe.mitre.org/
- **Template System Security Review**: `.claude/context/artifacts/security-reviews/spec-kit-integration-security-review-2026-01-28.md`
- **Security Assessment (Reflection Enhancements)**: `.claude/context/reports/security-assessment-reflection-enhancements-2026-01-28.md`

---

**End of Security Controls Catalog v1.0.0**
