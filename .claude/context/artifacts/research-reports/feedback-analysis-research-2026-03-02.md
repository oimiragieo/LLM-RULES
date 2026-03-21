<!-- Agent: developer | Task: #17 | Session: 2026-03-02 -->

# Research Report: feedback-analysis Skill

**Date:** 2026-03-02
**Artifact Type:** skill
**Domain:** Customer Feedback Analysis

---

## Executive Summary

Customer feedback analysis has matured into an AI-driven discipline combining NLP-based sentiment detection, clustering, predictive churn modeling, and automated roadmap translation. Key 2025 practices emphasize multi-channel data unification, mismatch detection between numerical scores and textual sentiment, hierarchical taxonomy design (30-50 tags), and agentic AI patterns that trigger real-time retention playbooks. The feedback-analysis skill should encapsulate all six capability areas: sentiment analysis, feature request clustering, NPS/CSAT frameworks, support ticket triage, churn signal detection, and feedback-to-roadmap translation.

---

## Research Methodology

| # | Query | Tool | Results |
|---|-------|------|---------|
| 1 | Customer feedback analysis NPS CSAT sentiment analysis best practices 2025 AI | WebSearch | 10 sources |
| 2 | Feature request clustering churn detection feedback-to-roadmap translation AI agent patterns 2025 | WebSearch | 10 sources |
| 3 | Support ticket triage categorization AI NLP taxonomy best practices 2025 | WebSearch | 10 sources |

**Sources consulted:**
- [Crescendo AI: Customer Sentiment Analysis Guide 2026](https://www.crescendo.ai/blog/customer-sentiment-analysis)
- [SentiSum: Automated Ticket Tagging](https://www.sentisum.com/library/automated-ticket-tagging)
- [Gainsight: Predicting and Preventing Churn with AI](https://www.gainsight.com/blog/predicting-and-preventing-churn-with-ai/)
- [Zonka Feedback: AI Customer Feedback Analysis](https://www.zonkafeedback.com/blog/ai-customer-feedback-analysis)
- [Akira.ai: AI Agents Customer Churn Prediction](https://www.akira.ai/blog/ai-agents-customer-churn-prediction)
- [SentiSum: Ticket Triage](https://www.sentisum.com/customer-service-analytics/ticket-triage)
- [Analytics Vidhya: Automated Ticket Triage](https://www.analyticsvidhya.com/blog/2023/11/enhancing-customer-support-efficiency-through-automated-ticket-triage/)

---

## Detailed Findings

### 1. Sentiment Analysis Patterns

- **Multi-channel coverage**: Unify surveys, support tickets, chat transcripts, product reviews, social mentions
- **Beyond positive/negative/neutral**: Detect nuanced emotions (frustration, satisfaction, urgency) using context and intent analysis
- **Mismatch detection (critical insight)**: A customer scoring 8 (Passive) with deeply negative text is high churn risk; a score of 6 (Detractor) with positive language is recoverable
- **Real-time classification**: NLP + ML pipelines operating on live feedback streams vs. batch processing

### 2. Feature Request Clustering

- **Deep learning clustering**: Auto-group verbatims into emerging and recurring themes without manual tagging
- **Emotional weighting**: Prioritize features with high frequency AND emotional charge
- **Churn correlation**: Identify features whose absence correlates with churn signals
- **Pain point surfacing**: Distinguish bug reports, feature gaps, UX friction, and performance complaints

### 3. NPS/CSAT Frameworks

- **Dual-track analysis**: Numerical scores + open-ended responses processed in parallel
- **Thematic coding + causation analysis**: Why did score change? What drove it?
- **Multi-dimensional segmentation**: By cohort, channel, product area, agent, date range
- **Trend detection**: Rolling averages, anomaly detection on score drops
- **CSAT→CSAT improvement loop**: Sentiment analysis feeds directly into CSAT remediation playbooks

### 4. Support Ticket Triage

- **Taxonomy design**: 30-50 tags optimal (avoid "tag bloat" of 500+ tags)
- **Hierarchical taxonomy**: Multi-layer (category → subcategory → root cause) more useful than flat
- **Three triage modes**: Manual, rule-based, AI-powered (AI achieves 45% faster response times per Zendesk)
- **Priority scoring**: Combine urgency (language cues) + impact (user tier/revenue) + sentiment
- **Routing accuracy**: AI correctly routes ambiguously worded tickets that rule-based systems miss

### 5. Churn Signal Detection

- **Behavioral clustering**: Group users by engagement profile (power users, dabblers, one-feature, trial tourists)
- **Early trajectory detection**: Detect risk signals before explicit churn, not after
- **Reason code generation**: Translate churn signals into human-readable reason codes
- **Playbook triggering**: Auto-trigger retention interventions when churn probability crosses threshold
- **Gartner projection**: AI-based retention systems → up to 25% increase in retention by 2025

### 6. Feedback-to-Roadmap Translation

- **Ranked feature list**: AI ranks feature requests by frequency, emotional intensity, and churn association
- **Pain point prioritization**: Surface actionable to-do list from raw verbatims
- **Stakeholder-ready output**: Translate feedback clusters into product roadmap items with supporting evidence
- **Continuous loop**: Roadmap decisions feed back into feedback collection (did we solve the problem?)

---

## Existing Codebase Patterns

**Similar skill examined:** `.claude/skills/brainstorming/SKILL.md`
- Frontmatter: `name`, `description`, `version`, `model`, `invoked_by`, `user_invocable`, `tools`, `agents`, `category`, `tags`, `verified`, `lastVerifiedAt`, `best_practices`, `error_handling`, `streaming`
- Body sections: Overview, Process, Key Principles, Iron Laws, Anti-Patterns, Memory Protocol
- Uses `Read`, `Write`, `Bash` as tools

**Similar skill examined:** `.claude/skills/memory-search/SKILL.md`
- Same frontmatter structure
- `agents` field is a YAML list
- Category `memory` (lowercase, short)
- Tags are lowercase, descriptive

**Conventions identified:**
- Name: kebab-case, descriptive
- Version: `1.0.0` for new skills
- Model: `sonnet` for analysis/domain skills
- Category: short lowercase string
- Agents: list the agents that will use this skill
- File location: `.claude/skills/{name}/SKILL.md`
- Command file: `.claude/skills/{name}/commands/{name}.md`

---

## Best Practices Identified

| # | Practice | Source | Confidence | Rationale |
|---|----------|--------|------------|-----------|
| 1 | Mismatch detection between score and text sentiment | Crescendo AI, Zonka Feedback | High | Core value differentiator vs. pure score analysis |
| 2 | Hierarchical taxonomy (30-50 tags, multi-layer) | SentiSum | High | Avoids tag bloat, enables root cause analysis |
| 3 | Churn cluster profiling before explicit churn event | Gainsight, Akira.ai | High | Proactive retention vs. reactive damage control |
| 4 | Dual-track NPS (score + open-text) with causation analysis | SentiSum, Sopact | High | Scores alone are insufficient; text reveals why |
| 5 | Feedback → ranked feature list with churn correlation | Zonka Feedback | Medium | Bridges feedback and product roadmap |
| 6 | Multi-channel unification as first step | Multiple sources | High | Single-channel view creates blind spots |

---

## Design Decisions

| Decision | Rationale | Source | Alternatives Considered |
|----------|-----------|--------|------------------------|
| Category: `domain-specific` | Feedback analysis is a product/CX domain concern, not a general dev tool | Task spec | `analysis`, `customer` |
| Assign to `feedback-synthesizer` | The agent created specifically for this domain in Task #11 | Task spec | `researcher`, `planner` |
| Model: `sonnet` | Analysis tasks require reasoning but not opus-level complexity | Codebase convention | `haiku` (too simple), `opus` (over-budget) |
| Include all 6 capability areas in one skill | Related concerns share data pipeline and context; splitting creates fragmentation | Domain analysis | 6 separate micro-skills |
| Iron Law: multi-channel unification first | All 6 capabilities degrade without unified data source | Multiple sources | Process each channel separately |

---

## Risk Assessment

| Risk | Impact | Probability | Mitigation |
|------|--------|-------------|------------|
| Over-analysis without action | High | Medium | Enforce feedback → roadmap output as final step |
| Taxonomy bloat in ticket triage | Medium | Medium | Cap at 50 tags; use hierarchical structure |
| False positive churn signals | High | Medium | Require behavioral + textual evidence before triggering playbook |
| Sentiment model bias toward English | Medium | Low | Document multilingual considerations in skill |
| Context window overflow on large feedback batches | High | Low | Batch processing guidance; use token-saver when needed |

---

## Recommended Implementation

**File location:** `.claude/skills/feedback-analysis/`
- `SKILL.md` — skill definition
- `commands/feedback-analysis.md` — command delegation file

**Frontmatter:**
```yaml
name: feedback-analysis
description: Customer feedback analysis — sentiment, NPS/CSAT, feature clustering, ticket triage, churn signals, roadmap translation
version: 1.0.0
model: sonnet
invoked_by: both
user_invocable: true
tools: [Read, Write, Bash, WebSearch]
agents:
  - feedback-synthesizer
category: domain-specific
tags: [feedback, sentiment, nps, csat, churn, triage, roadmap, clustering]
```

**Body sections:**
1. Overview (purpose + 6 capabilities)
2. When to Invoke
3. The Six-Phase Process (one section per capability)
4. Iron Laws (multi-channel first, mismatch detection, actionable output)
5. Anti-Patterns
6. Memory Protocol

---

## Quality Gate Checklist

- [x] 3-5 research queries executed (3 executed)
- [x] At least 3 external sources consulted (7 sources)
- [x] Existing codebase patterns documented (2 similar skills examined)
- [x] All design decisions have rationale and source
- [x] Risk assessment completed (5 risks with mitigations)
- [x] Recommended implementation path documented
- [x] Report saved with correct naming: `feedback-analysis-research-2026-03-02.md`
- [x] Provenance header included

---

## Research Handoff to: skill-creator

**Report Location:** `.claude/context/artifacts/research-reports/feedback-analysis-research-2026-03-02.md`

**Summary:** Customer feedback analysis encompasses 6 interconnected capabilities (sentiment, NPS/CSAT, feature clustering, ticket triage, churn detection, roadmap translation) that are most effective when operating on unified multi-channel data with mismatch detection and hierarchical taxonomy.

**Critical Decisions:**
1. Model: `sonnet` (analysis domain, not ops)
2. Assign to: `feedback-synthesizer` agent
3. Category: `domain-specific`
4. Include all 6 capabilities in one skill (shared data context)
5. Iron Law: multi-channel unification before any analysis

**Proceed with creation:** YES
**Confidence Level:** High
