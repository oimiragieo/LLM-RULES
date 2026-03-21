<!-- Agent: developer | Task: #12 | Session: 2026-03-02 -->

# Research Report: Compliance Checker Agent

**Date**: 2026-03-02
**Artifact Type**: Agent
**Domain**: Legal/Regulatory Compliance

## Executive Summary

The compliance-checker agent will specialize in GDPR/CCPA compliance validation, privacy policy review, terms of service analysis, ADA/WCAG accessibility compliance, data processing agreement review, and regulatory change monitoring. Research is based on codebase analysis of 3 existing domain agents (medical-research-triage, pm-coordinator, kubernetes-specialist) and knowledge of GDPR/CCPA/WCAG standards. The agent follows the established domain agent pattern with sonnet model and comprehensive compliance skill set.

## Research Methodology

| Query | Method | Source |
|-------|--------|--------|
| Existing domain agent patterns | Codebase read | medical-research-triage.md, pm-coordinator.md, kubernetes-specialist.md |
| GDPR/CCPA compliance best practices | Domain knowledge | GDPR Regulation 2016/679, CCPA Cal. Civ. Code §1798 |
| ADA/WCAG accessibility compliance | Domain knowledge | WCAG 2.2, ADA Section 508 |
| Source agent specification | WebFetch (404 - unavailable) | github.com/msitarzewski/agency-agents |

**Note**: GitHub source unavailable (404); agent designed from task specification + domain knowledge + codebase patterns.

## Existing Codebase Patterns

**Similar Domain Agents Found:**

- `medical-research-triage.md` — Uses opus model, extended_thinking, arxiv-mcp/scientific-skills, identity persona, structured triage/research protocol, agent-memory path
- `pm-coordinator.md` — Uses sonnet model (matching target), lazy_load context strategy, comprehensive capabilities by domain, maxTurns: 18, structured workflow steps
- `kubernetes-specialist.md` — Uses opus model, comprehensive capabilities listing, Problem Indicator Recognition section, Hybrid Search Policy block, extensive skills list

**Conventions Identified:**

- Naming: lowercase kebab-case (compliance-checker)
- Frontmatter: name, version, description, model, temperature, context_strategy, maxTurns, permissionMode, tools, skills, context_files
- Structure: Enforcement Hooks → Related Workflows → Core Persona → Purpose → Capabilities → Workflow → Behavioral Traits → Example Interactions → Skill Invocation Protocol → Token Saver Rule → Memory Protocol → Hybrid Search Policy → Memory Tooling Protocol
- Tools: Standard set (Read, Write, Edit, Bash, Grep, Glob, WebSearch, WebFetch, MemoryRecord, TaskUpdate, TaskList, TaskCreate, TaskGet, Skill)
- Context files: `@.claude/context/memory/learnings.md`
- Temperature: 0.3 (used by compliance-heavy agents requiring precision)
- context_strategy: lazy_load
- version: 1.0.0 for new agents
- `<!-- agent-template-contract:v1 -->` marker required
- Skills always include: task-management-protocol, verification-before-completion, context-compressor, context-compressor, ripgrep, code-semantic-search, memory-search
- Domain agents with Web access need: WebSearch, WebFetch in tools

## Compliance Domain Knowledge Synthesized

### GDPR Key Requirements
- Lawful basis for processing (Article 6) — consent, legitimate interest, contract, legal obligation
- Data subject rights: access, erasure (right to be forgotten), portability, rectification, restriction, objection
- Privacy by design and default (Article 25)
- Data breach notification (72-hour rule, Article 33/34)
- Data Protection Impact Assessments (DPIA, Article 35)
- International transfers: SCCs, BCRs, adequacy decisions
- Processor vs. controller distinction
- DPA (Data Processing Agreement) requirements (Article 28)

### CCPA/CPRA Key Requirements
- Consumer rights: know, delete, opt-out, non-discrimination, correct, limit sensitive data use
- Privacy notice requirements: categories collected, purposes, third-party sharing
- "Do Not Sell or Share" requirement
- Sensitive Personal Information (SPI) handling
- Service Provider vs. Third Party distinction (vs. GDPR processor/controller)
- 30-day cure period and Attorney General enforcement

### ADA/WCAG Accessibility Compliance
- WCAG 2.2 principles: Perceivable, Operable, Understandable, Robust (POUR)
- Conformance levels: A, AA (legal standard), AAA
- Section 508 (US federal) — WCAG 2.0 AA minimum
- ADA Title III — public accommodations (websites as places of public accommodation per circuit split)
- Common failure patterns: missing alt text, insufficient contrast, keyboard traps, missing ARIA labels
- Accessibility Statement requirements

### Terms of Service Analysis
- Limitation of liability clauses
- Arbitration and class action waivers
- Jurisdiction and governing law
- Termination provisions
- Intellectual property ownership
- Warranty disclaimers
- Subscription/billing terms (auto-renewal, cancellation)

### Data Processing Agreements (DPAs)
- GDPR Article 28 mandatory clauses
- Subject matter, duration, nature, purpose of processing
- Types of personal data and categories of data subjects
- Controller obligations and processor obligations
- Sub-processor authorization and notification
- Security measures (GDPR Annex)
- Audit rights
- Data return/deletion post-engagement

### Regulatory Change Monitoring
- EU: GDPR enforcement actions (EDPB, national DPAs), AI Act, ePrivacy Regulation
- US: State privacy laws (Virginia VCDPA, Colorado CPA, Texas TDPSA, Washington MHMDA)
- UK GDPR post-Brexit framework
- ICO guidance updates
- FTC enforcement actions and guidance

## Design Decisions

| Decision | Rationale | Source | Alternatives |
|----------|-----------|--------|-------------|
| Model: sonnet | Task spec requires sonnet; matches pm-coordinator pattern for domain specialist | Task spec, pm-coordinator.md | opus (heavier, not required for compliance review) |
| Temperature: 0.3 | Low temperature for precise, consistent regulatory analysis | medical-research-triage pattern | 0.7 (too creative for compliance) |
| context_strategy: lazy_load | Standard for domain agents | pm-coordinator.md pattern | eager_load (memory waste) |
| maxTurns: 18 | Complex compliance reviews need multi-turn depth | pm-coordinator pattern | 10 (too short for full DPA review) |
| No extended_thinking | Sonnet model, not opus | Model constraint | extended_thinking (opus only) |
| No isolation: worktree | Compliance agent reads/reviews docs, doesn't need isolation | Task spec (Write tool needed for reports) | worktree (not needed) |
| Skills: compliance-policy-check, security-architect, content-security-scan | Domain-specific skills for compliance work | Skill catalog review | Generic skills only |

## Practical Recommendations

**P0 (Required):**
- Include WebSearch + WebFetch for regulatory change monitoring (checking regulation text, DPA enforcement news)
- Include compliance-policy-check skill (directly maps to primary capability)
- Include content-security-scan skill (privacy policy / ToS review)
- Include insecure-defaults skill (privacy by design validation)
- Standard: task-management-protocol, verification-before-completion, ripgrep, code-semantic-search, memory-search, context-compressor, context-compressor

**P1 (Important):**
- Structured capabilities sections by compliance domain
- Problem Indicator Recognition section (compliance keywords that should route here)
- Disclaimer guidance (legal information ≠ legal advice)

**P2 (Nice to have):**
- Agent memory path (`.claude/agent-memory/compliance-checker/MEMORY.md`)

## Risk Assessment

| Risk | Impact | Probability | Mitigation |
|------|--------|-------------|------------|
| Agent provides legal advice instead of analysis | High | Medium | Add explicit "legal information not legal advice" disclaimer in behavioral guidelines |
| Outdated regulatory guidance | High | Medium | Use WebSearch for current enforcement guidance; note regulation version in outputs |
| Confusing GDPR vs. CCPA requirements | Medium | Low | Structured per-regulation sections in capabilities |
| Over-broad "compliance" scope | Low | Low | Clear capability sections limit scope to defined areas |

## Research Handoff to agent-creator

**Report Location**: `.claude/context/artifacts/research-reports/compliance-checker-research-2026-03-02.md`

**Summary**: Domain agent following sonnet/lazy_load/maxTurns:18 pattern (matching pm-coordinator). Capabilities organized by compliance domain (GDPR, CCPA, ADA/WCAG, ToS, DPAs, regulatory monitoring). Include WebSearch/WebFetch for live regulatory updates. Skills: compliance-policy-check + content-security-scan + insecure-defaults (domain-specific) + standard set.

**Critical Decisions**:
1. Model: sonnet (per task spec)
2. Include WebSearch/WebFetch (regulatory monitoring requires live lookups)
3. Legal disclaimer in behavioral guidelines (information ≠ legal advice)

**Proceed with creation**: YES
**Confidence Level**: High
