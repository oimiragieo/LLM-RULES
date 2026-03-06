# Security-First Design Checklist

**Purpose**: Prevent "security as afterthought" antipattern by asking "What could go wrong?" during Phase E (Evaluate) of the EVOLVE workflow.

**When to Use**: Every time a new agent, skill, workflow, hook, schema, or template is being created.

**How to Use**: Work through each STRIDE category and answer the relevant questions BEFORE creating the artifact.

---

## STRIDE Threat Model

STRIDE is a threat modeling framework that helps identify security risks systematically. For each category below, ask: **"What could go wrong?"**

### S - Spoofing (Identity)

**Threat**: Can someone impersonate a user, agent, or system component?

**Questions**:

1. Does this artifact handle authentication credentials or tokens?
2. Could an attacker fake their identity to gain unauthorized access?
3. Are agent identities verified before spawning or delegation?
4. Does this artifact trust input from external sources without validation?
5. Are API keys, tokens, or secrets properly managed (not hardcoded)?

**Mitigations**:

- Validate authentication tokens before processing
- Use environment variables for secrets (never hardcode)
- Implement agent identity verification in spawn prompts
- Sanitize all external inputs (user input, API responses, file contents)

**OWASP Reference**: [A07:2021 – Identification and Authentication Failures](https://owasp.org/Top10/A07_2021-Identification_and_Authentication_Failures/)

---

### T - Tampering (Data Integrity)

**Threat**: Can someone modify data or code without authorization?

**Questions**:

1. Does this artifact write to files? Can path traversal attacks occur?
2. Are file paths validated against whitelists?
3. Could template injection or code injection happen?
4. Are inputs sanitized before being used in commands, queries, or templates?
5. Can configuration files or schemas be tampered with?

**Mitigations**:

- Validate all file paths within allowed directories (e.g., `.claude/templates/`)
- Reject path traversal patterns (`..`, `//`, `\\`)
- Sanitize inputs before template rendering or command execution
- Use JSON Schema validation for configuration integrity
- Implement atomic writes with rollback for critical files

**OWASP Reference**: [A03:2021 – Injection](https://owasp.org/Top10/A03_2021-Injection/)

---

### R - Repudiation (Audit & Logging)

**Threat**: Can someone deny performing an action?

**Questions**:

1. Are sensitive operations logged for audit trails?
2. Is it clear which agent/user performed an action?
3. Are task status updates properly tracked (TaskUpdate protocol)?
4. Can we trace artifact creation back to the original request?
5. Are security events (failures, access denials) logged?

**Mitigations**:

- Log all artifact creation events to evolution-state.json
- Use TaskUpdate with metadata for action attribution
- Record ADRs for significant decisions (decisions.md)
- Implement audit logs for security-sensitive operations
- Include timestamps and agent identifiers in all logs

**OWASP Reference**: [A09:2021 – Security Logging and Monitoring Failures](https://owasp.org/Top10/A09_2021-Security_Logging_and_Monitoring_Failures/)

---

### I - Information Disclosure (Confidentiality)

**Threat**: Can someone access information they shouldn't see?

**Questions**:

1. Does this artifact handle sensitive data (credentials, PII, secrets)?
2. Are error messages verbose enough to leak implementation details?
3. Could logs or debug output expose sensitive information?
4. Are temporary files or caches properly cleaned up?
5. Does this artifact expose internal file paths or system details?

**Mitigations**:

- Never log sensitive data (passwords, tokens, API keys)
- Use generic error messages for user-facing errors
- Sanitize file paths in logs (use relative paths from PROJECT_ROOT)
- Clean up temporary files after use
- Validate schema examples don't contain real secrets
- Use `.gitignore` for sensitive files

**OWASP Reference**: [A01:2021 – Broken Access Control](https://owasp.org/Top10/A01_2021-Broken_Access_Control/)

---

### D - Denial of Service (Availability)

**Threat**: Can someone make the system unavailable or unresponsive?

**Questions**:

1. Can this artifact be exploited for resource exhaustion (infinite loops, memory leaks)?
2. Are there limits on input size (file uploads, token counts)?
3. Can malicious input cause crashes or hangs?
4. Does this artifact spawn unbounded numbers of agents or tasks?
5. Are there safeguards against recursive or circular dependencies?

**Mitigations**:

- Implement input size limits (max tokens, max file size)
- Add timeouts for long-running operations
- Use circuit breakers for external API calls
- Limit agent spawn depth (prevent infinite recursion)
- Validate dependencies for circular references

**OWASP Reference**: [Security Misconfiguration](https://owasp.org/Top10/A05_2021-Security_Misconfiguration/)

---

### E - Elevation of Privilege (Authorization)

**Threat**: Can someone gain unauthorized permissions or capabilities?

**Questions**:

1. Does this artifact enforce least privilege (minimal permissions)?
2. Can an agent escalate privileges by spawning other agents?
3. Are tool permissions properly restricted (allowed_tools whitelist)?
4. Does this artifact bypass security gates or hooks?
5. Can environment variables or configuration be manipulated to gain elevated access?

**Mitigations**:

- Define minimal `allowed_tools` for each agent spawn
- Enforce routing-guard.cjs for tool restrictions
- Validate agent permissions before delegation
- Use hooks to enforce security policies (cannot be bypassed)
- Document privilege requirements in agent definitions

**OWASP Reference**: [A04:2021 – Insecure Design](https://owasp.org/Top10/A04_2021-Insecure_Design/)

---

## Security Controls Reference

After answering STRIDE questions, check if existing security controls apply:

### Existing Controls

| Control ID          | Description                                  | Location                                      |
| ------------------- | -------------------------------------------- | --------------------------------------------- |
| **SEC-SPEC-002**    | Path validation (whitelist `.claude/` paths) | template-renderer skill                       |
| **SEC-SPEC-003**    | Token whitelist validation                   | template-renderer skill                       |
| **SEC-SPEC-004**    | Input sanitization (XSS protection)          | template-renderer skill                       |
| **SEC-CATALOG-001** | File path validation for catalogs            | Template catalog, security registry           |
| **SEC-CATALOG-002** | Path traversal rejection (`..`, `//`, `\\`)  | Template catalog, security registry           |
| **ROUTING-001**     | Tool whitelist enforcement                   | routing-guard.cjs                             |
| **ROUTING-002**     | Security review enforcement                  | routing-guard.cjs                             |
| **CREATOR-001**     | Artifact output path validation              | unified-creator-guard.cjs                     |
| **PLANNER-001**     | Complexity-based task creation guard         | routing-guard.cjs (planner-first enforcement) |

**Reference**: `.claude/context/artifacts/security-controls-catalog.md` (created in Sprint 3, Enhancement #8)

### New Controls Needed?

If STRIDE analysis reveals gaps, create new security controls:

1. **Document** the threat and mitigation in security-controls-catalog.md
2. **Assign** a control ID (SEC-XXX-YYY format)
3. **Implement** the control in appropriate hooks or validators
4. **Test** the control with both valid and attack scenarios
5. **Reference** the control in relevant agent/skill documentation

---

## Integration with EVOLVE Workflow

### Phase E (Evaluate) - Security-First Checkpoint

**BEFORE** confirming gap and proceeding to Phase V (Validate):

1. **Read** this security-design-checklist.md
2. **Answer** all STRIDE questions for the proposed artifact
3. **Document** security considerations in Phase 0 research report
4. **Identify** which existing controls apply
5. **Create** new controls if gaps found

**Output**: Security assessment section in research report with:

- STRIDE threat analysis (which categories apply)
- Existing controls that will be used
- New controls to be implemented (if any)
- Mitigation strategies for identified threats

### Example Security Assessment

```markdown
## Security Assessment (STRIDE)

**Artifact**: template-renderer skill

### S - Spoofing

- N/A (no authentication handled)

### T - Tampering

- **Threat**: Template injection attacks
- **Mitigation**: SEC-SPEC-003 (token whitelist), SEC-SPEC-004 (input sanitization)

### R - Repudiation

- **Threat**: No audit trail for template usage
- **Mitigation**: NEW CONTROL (SEC-TEMPLATE-001) - Log template rendering events

### I - Information Disclosure

- **Threat**: Sensitive data in template examples
- **Mitigation**: Review all template examples, redact secrets

### D - Denial of Service

- **Threat**: Large template files causing memory exhaustion
- **Mitigation**: Add file size limit (1MB max)

### E - Elevation of Privilege

- **Threat**: Template paths escaping allowed directories
- **Mitigation**: SEC-SPEC-002 (path whitelist validation)

**Controls Created**: 1 new (SEC-TEMPLATE-001)
**Controls Reused**: 3 existing (SEC-SPEC-002, SEC-SPEC-003, SEC-SPEC-004)
```

---

## DREAD Risk Scoring

DREAD is a risk assessment model for prioritizing security threats. Score each STRIDE threat using the 5 DREAD factors (scale: 1-10).

### DREAD Scoring Table

For each threat identified in STRIDE analysis, calculate DREAD score:

| Factor                | Score (1-10) | Description                                               |
| --------------------- | ------------ | --------------------------------------------------------- |
| **D**amage Potential  | 1-10         | How much damage will be caused if exploited?              |
| **R**eproducibility   | 1-10         | How easy is it to reproduce the attack?                   |
| **E**xploitability    | 1-10         | How much effort is required to exploit?                   |
| **A**ffected Users    | 1-10         | How many users will be impacted?                          |
| **D**iscoverability   | 1-10         | How easy is it to discover the vulnerability?             |
| **TOTAL DREAD Score** | Sum / 5      | Average score (1-10). Higher score = higher priority fix. |

### Scoring Guidelines

**Damage Potential (1-10):**

- 10: Complete system compromise, data loss, legal liability
- 7-9: Significant data breach, unauthorized access
- 4-6: Limited data exposure, service disruption
- 1-3: Minor annoyance, cosmetic issues

**Reproducibility (1-10):**

- 10: Works every time, trivial to reproduce
- 7-9: Works most of the time with standard tools
- 4-6: Requires specific conditions or timing
- 1-3: Very difficult to reproduce, race conditions

**Exploitability (1-10):**

- 10: No authentication, automated tools available
- 7-9: Basic skills required, public exploits exist
- 4-6: Advanced skills, custom tools needed
- 1-3: Expert skills, deep system knowledge required

**Affected Users (1-10):**

- 10: All users, entire system
- 7-9: Majority of users, critical features
- 4-6: Subset of users, specific features
- 1-3: Individual users, edge cases

**Discoverability (1-10):**

- 10: Publicly documented, easily found
- 7-9: Discoverable with basic scanning
- 4-6: Requires source code analysis
- 1-3: Obscure, requires deep knowledge

### Example DREAD Scoring

**Threat:** Template injection attack (STRIDE: Tampering)

| Factor          | Score | Reasoning                                              |
| --------------- | ----- | ------------------------------------------------------ |
| Damage          | 9     | Could execute arbitrary code                           |
| Reproducibility | 10    | Works every time with malicious template               |
| Exploitability  | 7     | Requires understanding of template syntax              |
| Affected Users  | 8     | All users of template rendering feature                |
| Discoverability | 6     | Requires code review or fuzzing to find                |
| **DREAD Score** | 8.0   | **HIGH PRIORITY** - Implement token whitelist controls |

**Priority Mapping:**

- **Critical (9-10):** Fix immediately, block release
- **High (7-8.9):** Fix in current sprint
- **Medium (4-6.9):** Fix in next sprint
- **Low (1-3.9):** Backlog, fix when capacity allows

---

## OWASP ASVS (Application Security Verification Standard) References

ASVS provides a framework for testing web application security controls. Map each STRIDE threat to relevant ASVS verification requirements.

### ASVS Categories (V1-V14)

| Category | Description                        | STRIDE Mapping                       |
| -------- | ---------------------------------- | ------------------------------------ |
| **V1**   | Architecture, Design and Modeling  | All categories                       |
| **V2**   | Authentication                     | S (Spoofing)                         |
| **V3**   | Session Management                 | S (Spoofing), E (Elevation)          |
| **V4**   | Access Control                     | E (Elevation of Privilege)           |
| **V5**   | Validation, Sanitization, Encoding | T (Tampering), I (Info Disclosure)   |
| **V6**   | Stored Cryptography                | I (Information Disclosure)           |
| **V7**   | Error Handling and Logging         | R (Repudiation), I (Info Disclosure) |
| **V8**   | Data Protection                    | I (Information Disclosure)           |
| **V9**   | Communication                      | I (Information Disclosure)           |
| **V10**  | Malicious Code                     | T (Tampering)                        |
| **V11**  | Business Logic                     | T (Tampering), E (Elevation)         |
| **V12**  | Files and Resources                | T (Tampering), D (DoS)               |
| **V13**  | API and Web Service                | All categories                       |
| **V14**  | Configuration                      | E (Elevation), D (DoS)               |

### STRIDE to ASVS Mapping

#### S - Spoofing → V2 (Authentication) + V3 (Session Management)

**Relevant ASVS Requirements:**

- **V2.1:** Password security
- **V2.2:** General authenticator security
- **V2.7:** Out of band verifier security
- **V3.2:** Session binding
- **V3.3:** Session timeout

**Example Verification:**

- V2.1.1: Verify passwords are at least 12 characters
- V2.2.1: Verify anti-automation controls (CAPTCHA, rate limiting)
- V3.2.1: Verify session tokens generated by framework

#### T - Tampering → V5 (Validation) + V10 (Malicious Code)

**Relevant ASVS Requirements:**

- **V5.1:** Input validation
- **V5.2:** Sanitization and sandboxing
- **V5.3:** Output encoding
- **V10.3:** Application integrity

**Example Verification:**

- V5.1.1: Verify input validation for all user inputs
- V5.2.1: Verify sanitization of user-supplied SVG/HTML
- V5.3.1: Verify output encoding for XSS prevention

#### R - Repudiation → V7 (Error Handling and Logging)

**Relevant ASVS Requirements:**

- **V7.1:** Log content
- **V7.2:** Log processing
- **V7.3:** Log protection

**Example Verification:**

- V7.1.1: Verify security-relevant events are logged
- V7.2.1: Verify logs contain sufficient detail for investigation
- V7.3.1: Verify logs are protected from unauthorized access

#### I - Information Disclosure → V6 (Cryptography) + V8 (Data Protection)

**Relevant ASVS Requirements:**

- **V6.2:** Algorithms
- **V8.1:** General data protection
- **V8.3:** Sensitive private data

**Example Verification:**

- V6.2.1: Verify approved cryptographic algorithms
- V8.1.1: Verify sensitive data encrypted at rest
- V8.3.4: Verify sensitive data not logged

#### D - Denial of Service → V12 (Files and Resources) + V14 (Configuration)

**Relevant ASVS Requirements:**

- **V12.1:** File upload
- **V12.5:** File download
- **V14.4:** HTTP security headers

**Example Verification:**

- V12.1.1: Verify file upload size limits
- V12.5.1: Verify file download size limits
- V14.4.3: Verify rate limiting headers

#### E - Elevation of Privilege → V4 (Access Control)

**Relevant ASVS Requirements:**

- **V4.1:** General access control
- **V4.2:** Operation level access control
- **V4.3:** Other access control considerations

**Example Verification:**

- V4.1.1: Verify principle of least privilege
- V4.2.1: Verify access control enforced on every request
- V4.3.1: Verify administrative functions isolated

### Using ASVS in Security Assessment

**Step 1:** Identify STRIDE threats (see STRIDE section above)

**Step 2:** Map each threat to ASVS categories

**Step 3:** Select relevant ASVS requirements from categories

**Step 4:** Verify implementation meets ASVS requirements

**Example Security Assessment with ASVS:**

```markdown
## Security Assessment (STRIDE + ASVS)

**Artifact**: User authentication system

### S - Spoofing

- **Threat**: Credential stuffing attacks
- **DREAD Score**: 8.5 (High)
- **ASVS Category**: V2 (Authentication)
- **Requirements**:
  - V2.2.1: Anti-automation controls (rate limiting)
  - V2.2.3: Credential recovery not vulnerable to account enumeration
- **Mitigation**: Implement rate limiting (5 attempts/minute)

### T - Tampering

- **Threat**: Session token manipulation
- **DREAD Score**: 9.0 (Critical)
- **ASVS Category**: V3 (Session Management)
- **Requirements**:
  - V3.2.1: Session tokens generated by secure framework
  - V3.5.1: Session tokens invalidated on logout
- **Mitigation**: Use framework-generated tokens, implement logout

### R - Repudiation

- **Threat**: No audit trail for login attempts
- **DREAD Score**: 6.5 (Medium)
- **ASVS Category**: V7 (Logging)
- **Requirements**:
  - V7.1.1: Log authentication successes and failures
  - V7.2.1: Logs contain user ID, timestamp, outcome
- **Mitigation**: Implement security event logging
```

**ASVS Reference**: [OWASP ASVS v4.0](https://owasp.org/www-project-application-security-verification-standard/)

---

## OWASP Top 10 Quick Reference

For deeper security analysis, cross-reference with OWASP Top 10:

1. **A01:2021 – Broken Access Control** → STRIDE: I (Information Disclosure), E (Elevation of Privilege)
2. **A02:2021 – Cryptographic Failures** → STRIDE: I (Information Disclosure)
3. **A03:2021 – Injection** → STRIDE: T (Tampering)
4. **A04:2021 – Insecure Design** → STRIDE: E (Elevation of Privilege), D (Denial of Service)
5. **A05:2021 – Security Misconfiguration** → STRIDE: E (Elevation of Privilege), D (Denial of Service)
6. **A06:2021 – Vulnerable Components** → All STRIDE categories
7. **A07:2021 – Authentication Failures** → STRIDE: S (Spoofing)
8. **A08:2021 – Software/Data Integrity** → STRIDE: T (Tampering), R (Repudiation)
9. **A09:2021 – Logging Failures** → STRIDE: R (Repudiation)
10. **A10:2021 – SSRF** → STRIDE: T (Tampering), I (Information Disclosure)

**Full Guide**: <https://owasp.org/Top10/>

---

## Related Documentation

- **Security Architect Skill**: `.claude/skills/security-architect/SKILL.md`
- **Security Audit Workflow**: `.claude/workflows/security-architect-skill-workflow.md`
- **Security Controls Catalog**: `.claude/context/artifacts/security-controls-catalog.md` (Sprint 3)
- **Verification Before Completion**: `.claude/skills/verification-before-completion/SKILL.md`

---

**Usage Note**: This checklist is invoked during EVOLVE Phase E (Evaluate). It is MANDATORY for all artifact creation to prevent "security as afterthought" antipattern.
