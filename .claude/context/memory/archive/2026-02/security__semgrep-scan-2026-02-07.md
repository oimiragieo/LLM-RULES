# Semgrep Security Scan Report

<!-- Agent: security-architect | Task: #131 | Session: 2026-02-07 -->

**Date:** 2026-02-07
**Tool:** Semgrep v1.141.0
**Scope:** `.claude/` directory (all hooks, lib, tools, skills)
**Rulesets:** `p/javascript`, `p/nodejs`, `p/security-audit`, `p/owasp-top-ten`

---

## Executive Summary

**Total Findings:** 55
**Active Code:** 53 findings
**Archived Code:** 2 findings (excluded from remediation)

**Severity Distribution:**
- **ERROR (Critical/High):** 30 findings
- **WARNING (Medium):** 25 findings

**Key Risk Areas:**
1. **JavaScript child_process usage (9 findings)** - Command injection risks
2. **Python XML parsing (19 findings)** - XML External Entity (XXE) vulnerabilities
3. **Python urllib usage (22 findings)** - SSRF and dynamic URL construction risks
4. **Other (5 findings)** - Hash algorithm, pickle deserialization, nginx config

**Disposition:**
- **New Critical Findings:** 2 (not previously documented in issues.md)
- **Cross-Referenced Findings:** Confirm existing SEC-LIB-001, SEC-TOOL-002
- **Scientific Skills:** 46 findings in scientific-skills subdirectory (separate audit track)

---

## Findings by Category

### 1. Command Injection (JavaScript `child_process`) - 9 Findings

**Severity:** ERROR (High)

**Pattern:** Usage of `child_process` module with dynamic input creates command injection risk.

#### 1.1 Finding: pre-completion-validation.cjs

**File:** `.claude/hooks/validation/pre-completion-validation.cjs:95`

**Code Context:**
```javascript
execSync(`git diff --exit-code ${artifactPath}`)
```

**Risk:** `artifactPath` derived from function argument. If user-controllable or constructed from untrusted input, could enable command injection.

**Cross-Reference:** **NEW FINDING** (not in issues.md)

**Severity Assessment:**
- **Exploitability:** Medium (depends on how `artifactPath` is derived)
- **Impact:** High (arbitrary command execution in git hook context)
- **Actual Risk:** Low (artifactPath comes from hookLogger internal sanitization)

**Recommendation:**
- Use `spawnSync` with array args instead of string interpolation
- Validate `artifactPath` against PROJECT_ROOT (path traversal check)
- Add to SEC-LIB command injection remediation (P1)

#### 1.2 Finding: contextual-memory.cjs

**File:** `.claude/lib/memory/contextual-memory.cjs:645`

**Code Context:**
```javascript
execSync(`"${binPath}" --version`)
```

**Risk:** `binPath` derived from function argument. Same command injection pattern.

**Cross-Reference:** **NEW FINDING** (not in issues.md)

**Severity Assessment:**
- **Exploitability:** Medium (depends on binPath source)
- **Impact:** High (arbitrary command execution)
- **Actual Risk:** Medium (binPath typically from package-manager detection)

**Recommendation:**
- Use `spawnSync([binPath, '--version'], { shell: false })`
- Validate binPath is absolute and within expected locations
- Add to SEC-LIB command injection remediation (P1)

#### 1.3 Finding: run-workflow-tests.cjs

**File:** `.claude/lib/workflow/run-workflow-tests.cjs:139`

**Code Context:**
```javascript
execSync(`node ${testPath}`)
```

**Risk:** `testPath` derived from `suiteKey` function argument.

**Cross-Reference:** Partially covered by SEC-LIB-001 (hybrid-lazy-indexer.cjs), same pattern

**Severity Assessment:**
- **Exploitability:** Low (suiteKey from internal workflow test registry)
- **Impact:** High (arbitrary command execution)
- **Actual Risk:** Low (trusted input)

**Recommendation:**
- Use `spawnSync(['node', testPath], { shell: false })`
- Validate testPath against PROJECT_ROOT
- Include in SEC-LIB command injection sweep (P1)

#### 1.4-1.9 Remaining Command Injection Findings

**Files (6 findings):**
- `.claude/tools/cli/git-notes-verify.cjs` (2 findings)
- `.claude/skills/skill-creator/scripts/convert.cjs` (2 findings)
- `.claude/hooks/_archive/audit/git-notes-audit.cjs` (1 finding, ARCHIVED)
- `.claude/lib/_archive/scheduler/modules/scheduler-tick.cjs` (1 finding, ARCHIVED)

**Archived Files:** Not actionable (already archived, zero consumers)

**Active Files (tools/cli, skills):**
- Same pattern: `execSync` with string interpolation
- Lower risk: internal tooling, not exposed to untrusted input
- **Recommendation:** Include in P2 command injection hardening sweep

---

### 2. XML External Entity (XXE) Vulnerabilities - 19 Findings

**Severity:** ERROR (High)

**Pattern:** Use of Python `xml.etree.ElementTree` without defusedxml library.

**Affected Files:** All in `.claude/skills/scientific-skills/`:
- `skills/document-skills/docx/ooxml/scripts/validation/redlining.py` (5 findings)
- `skills/document-skills/pptx/ooxml/scripts/validation/redlining.py` (5 findings)
- `skills/kegg-database/scripts/kegg_api.py` (uses `xml.dom.minidom`)
- `skills/string-database/scripts/string_api.py` (uses `xml.dom.minidom`)
- `skills/gene-database/scripts/*.py` (3 files, 6 total findings)
- `skills/citation-management/scripts/extract_metadata.py` (1 finding)

**Risk:** XML External Entity (XXE) attacks can:
- Read arbitrary files from the filesystem
- Cause denial of service (XML bombs)
- Perform SSRF attacks to internal network resources

**Cross-Reference:** **NEW FINDING** (scientific-skills not audited in previous security reviews)

**Severity Assessment:**
- **Exploitability:** High (if XML content from external sources like APIs)
- **Impact:** High (file disclosure, DoS, SSRF)
- **Actual Risk:** Medium-High (scientific skills fetch data from external APIs like KEGG, STRING, NCBI)

**Recommendation:**
1. **Immediate (P1):** Replace all `xml.etree.ElementTree` with `defusedxml.ElementTree`:
   ```python
   # OLD (vulnerable)
   import xml.etree.ElementTree as ET

   # NEW (safe)
   import defusedxml.ElementTree as ET
   ```

2. **Add dependency:** `pip install defusedxml` to scientific-skills requirements.txt

3. **Validation:** Run all affected scripts with sample data to ensure defusedxml compatibility

**Estimated Remediation Time:** 2-4 hours (batch find-replace + testing)

**Priority:** **P1** - Scientific skills actively used, external data sources

---

### 3. Dynamic urllib Usage (SSRF Risk) - 22 Findings

**Severity:** WARNING (Medium)

**Pattern:** Dynamic URL construction with `urllib.request.urlopen()`.

**Affected Files:** Same scientific-skills files as XXE findings.

**Risk:** Server-Side Request Forgery (SSRF) if URL construction uses untrusted input:
- Access internal network resources (169.254.169.254 AWS metadata)
- Port scanning internal infrastructure
- Data exfiltration through DNS tunneling

**Cross-Reference:** Confirms **H-003: WebFetch/WebSearch SSRF** (issues.md, Pipeline #16)

**Severity Assessment:**
- **Exploitability:** Medium (depends on how URLs are constructed)
- **Impact:** High (internal network exposure)
- **Actual Risk:** Medium (most URLs use trusted API base URLs + validated query params)

**Example Vulnerable Pattern:**
```python
# KEGG API example
base_url = "http://rest.kegg.jp/get/"
gene_id = user_input  # If user_input = "../../../../../../etc/passwd@attacker.com"
url = base_url + gene_id
urllib.request.urlopen(url)
```

**Recommendation:**
1. **Validate URL construction:**
   - Use `urllib.parse.urljoin()` for safe URL joining
   - Validate gene_id/query params against allowlist patterns (alphanumeric + underscore)
   - Block private IP ranges: `10.x.x.x`, `172.16-31.x.x`, `192.168.x.x`, `127.x.x.x`, `169.254.x.x`

2. **Add timeout and size limits:**
   ```python
   import socket
   socket.setdefaulttimeout(10)  # 10 second timeout
   response = urllib.request.urlopen(url)
   response.read(1024 * 1024)  # 1MB size limit
   ```

3. **Use requests library with validation:**
   ```python
   import requests
   response = requests.get(url, timeout=10, allow_redirects=False)
   ```

**Estimated Remediation Time:** 4-6 hours (URL validation + testing)

**Priority:** **P1** - Aligns with H-003 from Pipeline #16

---

### 4. Other Findings (5 Total)

#### 4.1 Insecure Hash Algorithm (MD5)

**File:** `skills/scientific-skills/skills/scientific-workflows/scripts/workflow_execution.py`

**Finding:** `python.lang.security.insecure-hash-algorithms-md5.insecure-hash-algorithm-md5`

**Risk:** MD5 is cryptographically broken. Should not be used for security purposes.

**Context:** Need to inspect usage (likely for content hashing, not crypto).

**Recommendation:**
- If for file integrity: replace with SHA-256
- If for non-crypto hashing: acceptable but document intent

**Priority:** P3 (depends on usage context)

#### 4.2 Pickle Deserialization

**File:** `skills/scientific-skills/skills/ml-model-integration/scripts/model_operations.py`

**Finding:** `python.lang.security.deserialization.pickle.avoid-pickle`

**Risk:** Pickle can execute arbitrary code during deserialization.

**Recommendation:**
- Use JSON for data serialization
- If ML models require pickle: validate source trust, use `RestrictedUnpickler`

**Priority:** P2 (depends on pickle source)

#### 4.3 Nginx `$http_host` Usage

**File:** `.claude/skills/k8s-manifest-generator/assets/configmap-template.yaml:100`

**Finding:** `generic.nginx.security.request-host-used.request-host-used`

**Risk:** `$http_host` and `$host` variables may contain attacker-controlled values from Host header.

**Recommendation:**
- Use explicitly configured host value instead of `$http_host`
- Or validate against allowlist before use

**Priority:** P2 (if template deployed to production)

---

## Cross-Reference with Existing Issues

### Confirmed Existing Findings

1. **SEC-LIB-001 (CRITICAL)** - Command injection via `execSync` in `hybrid-lazy-indexer.cjs`
   **Semgrep Confirmation:** Pattern appears in 3 additional files (pre-completion-validation, contextual-memory, run-workflow-tests)

2. **SEC-TOOL-002 (MEDIUM)** - Command injection in `eslint-batch-fix.cjs` (archived)
   **Semgrep Confirmation:** Same pattern (now archived, not actionable)

3. **H-003: WebFetch/WebSearch SSRF** (issues.md, Pipeline #16)
   **Semgrep Confirmation:** 22 findings of dynamic urllib usage in scientific-skills

### New Critical Findings (Not Previously Documented)

1. **NEW: XXE Vulnerabilities in Scientific Skills (19 findings)**
   - Not covered by previous security reviews (Pipelines #11-16 did not audit scientific-skills)
   - **Recommendation:** Add to issues.md as SEC-SKILL-001 (HIGH)

2. **NEW: Command Injection in pre-completion-validation.cjs**
   - Not covered by SEC-LIB-001 (different file)
   - **Recommendation:** Add to issues.md as SEC-HOOK-005 (HIGH)

3. **NEW: Command Injection in contextual-memory.cjs**
   - Part of memory subsystem (not audited in Pipeline #12 Context review)
   - **Recommendation:** Add to issues.md as SEC-MEM-001 (HIGH)

---

## Remediation Plan

### Phase 1: Critical (P1) - MUST FIX

**Estimated Time:** 8-12 hours

1. **XXE Vulnerabilities (19 findings)**
   - Replace `xml.etree.ElementTree` with `defusedxml.ElementTree`
   - Add `defusedxml` to scientific-skills requirements.txt
   - Test all affected scripts
   - **Owner:** developer + security-architect review
   - **Time:** 2-4 hours

2. **SSRF in Scientific Skills (22 findings)**
   - Add URL validation (domain allowlist, block private IPs)
   - Add timeout (10s) and size limits (1MB)
   - **Owner:** developer + security-architect review
   - **Time:** 4-6 hours

3. **Command Injection in Hooks/Lib (3 findings)**
   - `pre-completion-validation.cjs` - migrate to spawnSync
   - `contextual-memory.cjs` - migrate to spawnSync
   - `run-workflow-tests.cjs` - migrate to spawnSync
   - **Owner:** developer (aligns with SEC-LIB-001 remediation)
   - **Time:** 2-3 hours

### Phase 2: Medium (P2) - SHOULD FIX

**Estimated Time:** 4-6 hours

1. **Command Injection in Tools (2 findings)**
   - `git-notes-verify.cjs` (2 instances)
   - `skill-creator/convert.cjs` (2 instances)
   - **Owner:** developer
   - **Time:** 2-3 hours

2. **Pickle Deserialization (1 finding)**
   - Assess usage context
   - Implement RestrictedUnpickler or migrate to JSON
   - **Owner:** developer
   - **Time:** 1-2 hours

3. **Nginx $http_host (1 finding)**
   - Update k8s-manifest-generator template
   - **Owner:** devops
   - **Time:** 1 hour

### Phase 3: Low (P3) - NICE TO HAVE

**Estimated Time:** 1-2 hours

1. **MD5 Usage (1 finding)**
   - Assess context (crypto vs content hashing)
   - Migrate to SHA-256 if security-relevant
   - **Owner:** developer
   - **Time:** 1-2 hours

---

## Testing Verification

**For each remediation:**

1. **Unit Tests:** Add test case for the specific vulnerability
2. **Integration Tests:** Verify scientific skills still work with external APIs
3. **Regression Tests:** Run existing test suites
4. **Security Tests:** Attempt to exploit the fixed vulnerability (penetration testing)

**Test Evidence Required:**
- Pre-fix: Demonstrate vulnerability (e.g., XXE file read)
- Post-fix: Confirm vulnerability is mitigated
- Regression: Confirm functionality still works

---

## Issues.md Updates

**Add the following entries:**

### SEC-SKILL-001: XXE Vulnerabilities in Scientific Skills (HIGH)

**Date:** 2026-02-07

**Impact:** HIGH -- 19 instances of unsafe XML parsing in scientific skills

**Description:**

Scientific skills use Python's native `xml.etree.ElementTree` without defusedxml protection. This creates XML External Entity (XXE) vulnerability allowing:
- Arbitrary file read from filesystem
- Denial of service (XML bombs)
- SSRF attacks to internal network

**Affected Files:**
- `.claude/skills/scientific-skills/skills/document-skills/docx/ooxml/scripts/validation/redlining.py` (5 instances)
- `.claude/skills/scientific-skills/skills/document-skills/pptx/ooxml/scripts/validation/redlining.py` (5 instances)
- `.claude/skills/scientific-skills/skills/kegg-database/scripts/kegg_api.py`
- `.claude/skills/scientific-skills/skills/string-database/scripts/string_api.py`
- `.claude/skills/scientific-skills/skills/gene-database/scripts/*.py` (6 instances)
- `.claude/skills/scientific-skills/skills/citation-management/scripts/extract_metadata.py`

**Workaround:** Do not use scientific skills with untrusted XML input.

**Resolution:** Replace all `xml.etree.ElementTree` imports with `defusedxml.ElementTree`. Add `defusedxml` to requirements.txt.

**Priority:** P1 -- Scientific skills fetch XML data from external APIs (KEGG, STRING, NCBI).

---

### SEC-HOOK-005: Command Injection in pre-completion-validation.cjs (HIGH)

**Date:** 2026-02-07

**Impact:** HIGH -- Command injection via git diff with unsanitized artifactPath

**Description:**

`.claude/hooks/validation/pre-completion-validation.cjs` line 95 uses `execSync(\`git diff --exit-code ${artifactPath}\`)` with string interpolation. While current risk is low (artifactPath from internal sanitization), the pattern is dangerous and violates command injection best practices.

**Workaround:** None needed (low exploitability in current usage).

**Resolution:** Migrate to `spawnSync(['git', 'diff', '--exit-code', artifactPath], { shell: false })`. Validate artifactPath against PROJECT_ROOT.

**Priority:** P1 -- Part of SEC-LIB-001 command injection remediation sweep.

---

### SEC-MEM-001: Command Injection in contextual-memory.cjs (HIGH)

**Date:** 2026-02-07

**Impact:** HIGH -- Command injection via version check with unsanitized binPath

**Description:**

`.claude/lib/memory/contextual-memory.cjs` line 645 uses `execSync(\`"${binPath}" --version\`)` with string interpolation. If binPath is derived from untrusted configuration or user input, this enables arbitrary command execution.

**Workaround:** Ensure binPath only comes from trusted package manager detection.

**Resolution:** Migrate to `spawnSync([binPath, '--version'], { shell: false })`. Validate binPath is absolute and within expected locations (/usr/bin, /usr/local/bin, node_modules/.bin).

**Priority:** P1 -- Part of SEC-LIB-001 command injection remediation sweep.

---

## Appendix A: Full Finding List

**JavaScript Command Injection (9 findings):**
1. `.claude/hooks/validation/pre-completion-validation.cjs:95` (ERROR)
2. `.claude/lib/memory/contextual-memory.cjs:645` (ERROR)
3. `.claude/lib/workflow/run-workflow-tests.cjs:139` (ERROR)
4. `.claude/tools/cli/git-notes-verify.cjs:XX` (ERROR, 2 instances)
5. `.claude/skills/skill-creator/scripts/convert.cjs:XX` (ERROR, 2 instances)
6. `.claude/hooks/_archive/audit/git-notes-audit.cjs:XX` (ERROR, ARCHIVED)
7. `.claude/lib/_archive/scheduler/modules/scheduler-tick.cjs:XX` (ERROR, ARCHIVED)

**Python XXE Vulnerabilities (19 findings):**
8-13. `docx/ooxml/scripts/validation/redlining.py` (5 instances, ERROR)
14-19. `pptx/ooxml/scripts/validation/redlining.py` (5 instances, ERROR)
20-26. `kegg-database`, `string-database`, `gene-database` scripts (7 instances, ERROR)
27. `citation-management/scripts/extract_metadata.py` (ERROR)

**Python Dynamic urllib (22 findings):**
28-49. Same files as XXE findings (WARNING)

**Other (5 findings):**
50. MD5 hash usage (WARNING)
51. Pickle deserialization (WARNING)
52. Nginx $http_host (WARNING)

---

## Appendix B: Semgrep Command

**Command used:**
```bash
set PYTHONIOENCODING=utf-8 && semgrep scan --config "p/security-audit" --config "p/owasp-top-ten" .claude/ --json -o .claude/context/reports/security/semgrep-security-audit-2026-02-07.json
```

**Additional scan (JavaScript-only):**
```bash
set PYTHONIOENCODING=utf-8 && semgrep scan --config "p/javascript" --config "p/nodejs" .claude/ --json -o .claude/context/reports/security/semgrep-results-2026-02-07.json
```

**Rulesets used:**
- `p/javascript` (68 rules, 712 files)
- `p/nodejs` (74 rules)
- `p/security-audit` (194 Python rules, 15 multilang rules)
- `p/owasp-top-ten` (674 total rules)

---

## Conclusion

**Security Posture:** MODERATE with HIGH-priority gaps in scientific-skills subsystem.

**Key Takeaways:**
1. **Scientific Skills:** 41 findings (XXE + SSRF) require immediate remediation before external API usage
2. **Command Injection:** 9 findings confirm SEC-LIB-001 is systemic across hooks/lib/tools
3. **Cross-Reference:** Confirms H-003 (SSRF) from Pipeline #16, extends to Python urllib

**Next Steps:**
1. Update issues.md with 3 new findings (SEC-SKILL-001, SEC-HOOK-005, SEC-MEM-001)
2. Create P1 remediation tasks (XXE, SSRF, command injection)
3. Schedule security review for scientific-skills subsystem (not covered in Pipelines #11-16)
4. Run regression tests after all P1 fixes applied

**Estimated Total Remediation Time:** 13-20 hours (P1: 8-12h, P2: 4-6h, P3: 1-2h)

**Report Generated:** 2026-02-07
**Agent:** security-architect
**Task:** #131 (Pipeline Phase 6: Semgrep Security Scan)
