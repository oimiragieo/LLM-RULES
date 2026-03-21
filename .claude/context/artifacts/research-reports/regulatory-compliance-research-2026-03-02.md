<!-- Agent: developer | Task: #18 | Session: 2026-03-02 -->

# Research Report: Regulatory Compliance Skill

## Executive Summary

Regulatory compliance for software systems requires a multi-layered approach covering GDPR/CCPA data privacy, privacy-by-design principles, ADA/WCAG accessibility standards, data processing agreements (DPAs), and ongoing regulatory monitoring. A regulatory-compliance skill for agent-studio will provide validation checklists, gap analysis, and remediation guidance across these domains, assigned to the `compliance-checker` agent.

## Research Methodology

| # | Query | Source Type |
|---|-------|-------------|
| 1 | GDPR/CCPA compliance patterns best practices 2025 | WebSearch |
| 2 | Privacy by design, ADA/WCAG, AI agents 2025 | WebSearch |
| 3 | Data processing agreement template DPA checklist 2025 | WebSearch |
| 4 | Existing codebase patterns | Glob + Read |

**Sources Consulted:**
- [SecurePrivacy: GDPR & CCPA Best Practices 2025](https://secureprivacy.ai/blog/first-party-data-collection-compliance-gdpr-ccpa-2025)
- [Drata: CCPA Compliance Checklist](https://drata.com/blog/ccpa-compliance-checklist-2026)
- [Siteimprove: Agentic Accessibility](https://www.siteimprove.com/blog/agentic-accessibility/)
- [Rock Law: ADA/WCAG for AI Interfaces](https://www.rock.law/accessibility-laws-ai-interfaces-products-ada-section-508-wcag/)
- [TechGDPR: Privacy by Design and AI](https://techgdpr.com/blog/how-to-build-trustworthy-ai-from-the-ground-up-with-privacy-by-design/)
- [Complydog: DPA Guide](https://complydog.com/blog/data-processing-agreement-template-free-dpa-guide)
- [GDPR.eu: DPA Template](https://gdpr.eu/data-processing-agreement/)
- [Vendorfi: GDPR DPA Checklist](https://vendorfi.io/blog/gdpr-data-processing-agreement-checklist/)

## Detailed Findings

### GDPR/CCPA Compliance Patterns

- **Data inventory & mapping** is the foundation: catalog all personal data, processing purposes, and data flows
- **Consent management differs**: GDPR requires explicit granular upfront consent; CCPA uses opt-out model with transparency requirements
- **Consumer rights processing**: document all data subject requests (DSRs) for 24+ months; support deletion, portability, access rights
- **Third-party processor management**: require signed DPAs with all vendors processing personal data; continuously monitor vendor compliance
- **Breach notification**: GDPR requires 72-hour notification to supervisory authority; CCPA triggers private right of action for breaches
- **Multi-jurisdiction**: 20+ US states have CCPA-equivalent laws (Virginia VCDPA, Colorado CPA, Connecticut CTDPA); unified compliance approach needed

### Privacy by Design

- 7 foundational principles (Ann Cavoukian): proactive, privacy as default, embedded into design, full functionality, end-to-end security, visibility/transparency, respect for user privacy
- AI systems require privacy impact assessments (PIAs) before deploying data-processing models
- Data minimization: collect only what is necessary for stated purpose
- Purpose limitation: data collected for one purpose must not be repurposed

### ADA/WCAG Accessibility Standards

- WCAG 2.1 AA is the de facto standard (WCAG 2.2 released 2023, WCAG 3.0 in development)
- Four principles (POUR): Perceivable, Operable, Understandable, Robust
- AI interfaces (chatbots, voice UIs) must comply: keyboard accessibility, screen reader compatibility, alt text for AI-generated content, proper semantic structure
- ADA lawsuits surged 37% in H1 2025; non-compliance is an active litigation risk
- Section 508 applies to US federal agencies and their contractors

### Data Processing Agreements

- Required under GDPR Article 28 for all controller-processor relationships
- Essential DPA elements: processing purpose/scope, data categories, data subject types, security measures, sub-processor rules, breach notification procedures, data return/deletion on termination
- Update DPAs annually or when processing activities change significantly
- Standard Contractual Clauses (SCCs) required for international transfers
- Transfer Impact Assessments (TIAs) needed alongside SCCs for high-risk countries

### Regulatory Monitoring

- Regulatory landscape changes frequently: new state privacy laws quarterly, GDPR enforcement actions monthly
- Automated compliance monitoring reduces manual overhead by 70%+
- Continuous compliance monitoring vs. point-in-time audits is the modern standard
- Organizations should track: regulatory bulletins, enforcement actions, guidance updates from supervisory authorities

## Existing Codebase Patterns

**Similar Artifacts Found:**
- `.claude/skills/compliance-policy-check/SKILL.md` — framework policy compliance checker; uses structured PASS/CONDITIONAL/FAIL output; tools: Read, Glob, Grep, Skill; agents: planner, technical-program-manager, reflection-agent
- `.claude/skills/security-architect/SKILL.md` — security architecture skill; includes compliance notes for SOC2/GDPR/HIPAA; uses structured findings by severity (CRITICAL/HIGH/MEDIUM/LOW); tools: Read, Write, Edit, Bash, Glob, Grep

**Conventions Identified:**
- Naming: kebab-case, descriptive purpose in name
- Structure: frontmatter with name/description/version/model/tools/agents → Overview → When to Use → Iron Laws → Workflow (numbered steps) → Anti-Patterns → Memory Protocol
- Tools: typically Read, Glob, Grep, Skill for analysis-only skills; add Write for reporting skills
- Output: structured JSON or markdown with severity levels, remediation steps

## Best Practices Identified

| # | Practice | Source | Confidence | Rationale |
|---|----------|--------|------------|-----------|
| 1 | Structured checklist output with PASS/CONDITIONAL/FAIL | Existing compliance-policy-check skill | High | Consistent with framework patterns |
| 2 | Severity-based findings (CRITICAL/HIGH/MEDIUM/LOW) | security-architect skill | High | Actionable prioritization |
| 3 | Specific remediation steps per finding | GDPR enforcement guidance | High | Vague findings don't produce fixes |
| 4 | Coverage across all applicable regulations (not just GDPR) | SecurePrivacy 2025 | High | Multi-jurisdiction reality |
| 5 | Privacy-by-design as embedded principle, not checklist | TechGDPR | Medium | Proactive vs. reactive compliance |
| 6 | Continuous monitoring, not one-time audit | Hoggo DPA 2025 | High | Regulatory landscape changes frequently |

## Design Decisions

| Decision | Rationale | Source | Alternatives Considered |
|----------|-----------|--------|------------------------|
| Output shape mirrors compliance-policy-check (PASS/CONDITIONAL/FAIL) | Consistency with existing framework patterns | Existing skill | Custom output format |
| Tools: Read, Write, Glob, Grep, Skill | Needs Write for generating compliance reports | security-architect pattern | Read-only (insufficient for report generation) |
| Assign to compliance-checker agent | Explicitly specified in task requirements | Task #18 | planner or technical-program-manager |
| Category: domain-specific | Regulatory compliance is a specialized domain | Task #18 | general |
| Cover GDPR+CCPA+WCAG+DPA in single skill | Unified compliance assessment reduces context switching | SecurePrivacy multi-jurisdiction guidance | Separate skills per regulation |
| Include regulatory monitoring section | Regulations change; static checklists become outdated | Hoggo DPA 2025 | Static checklist only |

## Risk Assessment

| Risk | Impact | Probability | Mitigation |
|------|--------|-------------|------------|
| Regulatory information becomes outdated | High | High | Include disclaimer + recommend periodic review; link to authoritative sources |
| Skill covers too many regulations superficially | Medium | Medium | Focus on actionable checklists; link out to detailed regulation text |
| Compliance-checker agent not yet registered | Medium | Low | Task #12 confirms compliance-checker was created; verify in registry |
| Over-claiming compliance (false PASS) | High | Medium | Iron Law: PASS requires all items verified, not estimated |

## Implementation Roadmap

1. **Invoke skill-creator** with regulatory-compliance as the skill name
2. **Key sections to include**: GDPR/CCPA checklist, privacy-by-design review, WCAG/ADA audit steps, DPA validation, regulatory monitoring guidance
3. **Output format**: structured PASS/CONDITIONAL/FAIL with severity-rated findings and remediation tasks
4. **Assign to**: compliance-checker agent
5. **Tools**: Read, Write, Glob, Grep, Skill

## Research Handoff to: skill-creator

**Report Location**: `.claude/context/artifacts/research-reports/regulatory-compliance-research-2026-03-02.md`

**Summary**: Regulatory compliance requires checklists and gap analysis across GDPR/CCPA, privacy-by-design, ADA/WCAG, DPAs, and ongoing monitoring. The skill should use the PASS/CONDITIONAL/FAIL output pattern from compliance-policy-check, severity levels from security-architect, and assign to the compliance-checker agent.

**Critical Decisions**:
1. Output shape: PASS/CONDITIONAL/FAIL with severity-rated findings (matches framework pattern)
2. Tools: Read, Write, Glob, Grep, Skill (Write needed for report output)
3. Assign to compliance-checker agent; category: domain-specific

**Proceed with creation**: YES
**Confidence Level**: High
