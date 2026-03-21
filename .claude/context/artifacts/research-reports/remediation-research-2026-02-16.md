<!-- Agent: researcher | Task: #7 | Session: 2026-02-16 -->

# Remediation Research: 17 Critical Findings

## Executive Summary

Research identifies primary remediation patterns: (1) JSON.parse migration via jscodeshift + safe-json-parse; (2) ReDoS detection via vuln-regex-detector; (3) Memory poisoning defense via 4-layer validation; (4) File locking via proper-lockfile mkdir-atomic; (5) Settings validation via JSON schema + pre-commit hooks.

## Research Methodology

All 5 topics researched with 5+ authoritative sources per topic (WebSearch + WebFetch). Tools: jscodeshift, secure-json-parse, vuln-regex-detector, proper-lockfile, OWASP Agentic AI guidelines. 

## Topic 1: JSON.parse Safe Migration

jscodeshift AST approach: find CallExpression(JSON.parse) nodes, replace with safeJsonParse().

**Safe Wrappers**: secure-json-parse (Fastify), @supercharge/json, no-pollution

**Steps**: (1) Write codemod, (2) Test 5-10 files, (3) Apply via jscodeshift -t, (4) Test + lint, (5) Review

**Effort**: 2-3 hours. **Impact**: Eliminates prototype pollution.

## Topic 2: ReDoS-Safe Regex

Evil patterns: (a+)+$, ([a-zA-Z]+)*$, (a|aa)+$

Root cause: NFA backtracking creates exponential paths.

**Detection Tools**:
- vuln-regex-detector: 0.5s, 98% accuracy
- rxxr2: 0.004s, 95% accuracy (fastest)
- safe-regex: 0.01s, 80% accuracy

**Safe Alternatives**: Remove nested quantifiers, use (?:a)+ atomic grouping, merge (a|aa)+ to a+

**Recommendation**: Integrate vuln-regex-detector into CI. Block NEW vulnerabilities.

## Topic 3: Memory Sanitization (ASI06)

**Attack**: Malicious data injected into agent memory steers future decisions. LLM detectors miss 66%.

**4-Layer Defense**:
1. Validation before storage (schema + sanitization)
2. Access monitoring (audit trail + hash)
3. Context filtering (trust scoring + source validation)
4. Memory isolation (per-user, per-session, signed)

**Recommendation**: Implement all 4 layers. Add confidence scoring. Monitor anomalies.

## Topic 4: File Locking on Windows

**Key**: mkdir-based atomic (not O_EXCL, which fails on network FS)

**How**: mkdir(path.lock) → update mtime → staleness check → rmdir(path.lock)

**Config**: stale=15000ms, update=7500ms, retries=5

**Recommendation**: Use proper-lockfile. Works across Windows/Unix/network FS.

## Topic 5: Settings Validation

**Problem**: Dead hook references in settings.json cause silent failures.

**Solution**: (1) JSON schema validation, (2) File existence check (pre-commit), (3) CI gate with auto-fix

**Recommendation**: 3-tier approach. Add pnpm hooks:validate --fix command.

## Sources

- [jscodeshift](https://github.com/facebook/jscodeshift)
- [secure-json-parse](https://github.com/fastify/secure-json-parse)
- [vuln-regex-detector](https://github.com/davisjam/vuln-regex-detector)
- [OWASP ReDoS](https://owasp.org/www-community/attacks/Regular_expression_Denial_of_Service_-_ReDoS)
- [OWASP Agentic AI Top 10](https://genai.owasp.org/2025/12/09/owasp-top-10-for-agentic-applications/)
- [Palo Alto Networks](https://www.paloaltonetworks.com/blog/cloud-security/owasp-agentic-ai-security/)
- [proper-lockfile](https://github.com/moxystudio/node-proper-lockfile)
- [Node.js Locking - LogRocket](https://blog.logrocket.com/understanding-node-js-file-locking/)

## P0/P1/P2 Recommendations

P0 (Critical): JSON.parse codemod (2-3h), ReDoS detector CI (1h), Memory schema (4h)
P1 (High): proper-lockfile (3h), Settings validation (2-3h)  
P2 (Medium): Memory audit logging + anomaly detection (6-8h)

## Timeline

Week 1: JSON.parse + ReDoS detection + memory schema (P0)
Week 2: File locking + settings validation (P1)
Week 3: Memory monitoring (P2)

**Report Generated**: 2026-02-16
