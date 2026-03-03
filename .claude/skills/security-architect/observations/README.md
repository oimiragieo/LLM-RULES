# Security Architect Skill Observations

This directory contains observations and learnings from applying the security architecture and threat modeling skill in agent-studio.

## Purpose

The `observations/` directory serves as a feedback loop for continuous improvement of the security architecture skill. Agents should record:

1. **STRIDE threat patterns** - Common threat vectors found in different architecture types
2. **OWASP vulnerabilities discovered** - Real vulnerabilities found during reviews
3. **Security patterns that work** - Successful defensive architectures and controls
4. **Difficult threat categories** - Threat types that are easy to miss or overlook
5. **Compliance gaps** - Patterns that violate SOC2, GDPR, or HIPAA requirements
6. **Tool effectiveness** - Which static analysis or threat modeling approaches work best
7. **Model-specific observations** - How different LLM models handle STRIDE threat modeling

## Structure

Observations are recorded in JSONL format:

```json
{
  "timestamp": "2026-03-03T10:00:00Z",
  "type": "threat_pattern|vulnerability|control_pattern|gap|tool_insight|model_behavior",
  "description": "Human-readable description of the observation",
  "threatCategory": "spoofing|tampering|repudiation|information_disclosure|denial_of_service|elevation_of_privilege",
  "owaspTop10": "A01|A02|A03|A04|A05|A06|A07|A08|A09|A10|null",
  "severity": "CRITICAL|HIGH|MEDIUM|LOW",
  "affectedComponents": ["component1", "component2"],
  "suggestedImprovement": "Recommended documentation or process improvement",
  "complianceImpact": "SOC2|GDPR|HIPAA|PCI-DSS|null"
}
```

## When to Write Observations

- **After completing a security architecture review**
- When STRIDE threat modeling reveals a new threat pattern
- When OWASP Top 10 analysis finds a real vulnerability
- When a security control prevents an attack
- When compliance requirements are violated
- When a threat was nearly missed
- When a model misses obvious security implications
- When threat modeling takes unexpectedly long

## Example Observations

### Threat Pattern (recurring vulnerability class)

```json
{
  "timestamp": "2026-03-03T10:30:00Z",
  "type": "threat_pattern",
  "description": "API endpoints validating input on client-side only; missing server-side validation creates injection vulnerability",
  "threatCategory": "tampering",
  "owaspTop10": "A03",
  "severity": "CRITICAL",
  "affectedComponents": ["api_handler", "input_validation"],
  "suggestedImprovement": "Add mandatory server-side validation checklist to API security review template",
  "complianceImpact": "SOC2"
}
```

### Security Control Pattern (what works)

```json
{
  "timestamp": "2026-03-03T11:00:00Z",
  "type": "control_pattern",
  "description": "Defense-in-depth with rate limiting + token expiry + audit logging prevented brute force AND unauthorized access",
  "threatCategory": "elevation_of_privilege",
  "owaspTop10": "A07",
  "severity": "HIGH",
  "affectedComponents": ["authentication", "rate_limiter", "audit_log"],
  "suggestedImprovement": "Document this three-layer control pattern as recommended for authentication",
  "complianceImpact": null
}
```

### Compliance Gap (regulation violation)

```json
{
  "timestamp": "2026-03-03T11:30:00Z",
  "type": "gap",
  "description": "User PII stored without encryption at rest; violates GDPR data protection requirements",
  "threatCategory": "information_disclosure",
  "owaspTop10": "A02",
  "severity": "CRITICAL",
  "affectedComponents": ["database", "user_service"],
  "suggestedImprovement": "Add encryption-at-rest requirement to data classification review",
  "complianceImpact": "GDPR"
}
```

### Model Behavior (AI-specific insight)

```json
{
  "timestamp": "2026-03-03T12:00:00Z",
  "type": "model_behavior",
  "description": "Haiku model skipped 'Elevation of Privilege' threat in STRIDE analysis; required sonnet to surface it",
  "threatCategory": "elevation_of_privilege",
  "owaspTop10": null,
  "severity": "HIGH",
  "affectedComponents": ["threat_modeling_process"],
  "suggestedImprovement": "Upgrade security-architect to use opus model for STRIDE threat modeling",
  "complianceImpact": null
}
```

## Common Threat Patterns by Architecture Type

### Web Applications

- Client-side validation without server-side checks (Tampering → A03)
- Missing CSRF protection on state-changing endpoints (Tampering → A03)
- Hardcoded credentials in source code (Information Disclosure → A01)

### APIs

- Missing authentication on sensitive endpoints (Elevation → A01)
- Verbose error messages leaking system details (Information → A09)
- No rate limiting on auth endpoints (DoS → A05)

### Microservices

- Service-to-service communication unencrypted (Information Disclosure → A02)
- No mutual TLS between services (Spoofing → A07)
- Missing distributed tracing for audit (Repudiation → A09)

### Databases

- Credentials stored in plaintext (Information Disclosure → A02)
- SQL injection via dynamic query construction (Tampering → A03)
- Backups unencrypted (Information Disclosure → A02)

## Integration with Skill Evolution

Observations are automatically analyzed quarterly to:

1. Identify emerging threat patterns
2. Update STRIDE threat categories
3. Refine OWASP Top 10 checks
4. Assess which vulnerabilities are hardest to catch
5. Improve model assignment for threat modeling

## References

- [Security Architect Skill Documentation](../SKILL.md)
- [STRIDE Threat Model Categories](../STRIDE_THREAT_MODEL.md)
- [OWASP Top 10 Checklist](../OWASP_TOP10_CHECKLIST.md)
- [Agent Studio Security Rules](../../rules/security.md)
- [Agent Studio Security Architect Rules](../../rules/security-architect.md)
