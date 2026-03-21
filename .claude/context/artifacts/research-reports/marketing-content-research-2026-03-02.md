<!-- Agent: developer | Task: #13 | Session: 2026-03-02 -->

# Research Report: marketing-content Skill

## Executive Summary

Marketing content creation in 2025 is defined by AI-assisted production pipelines, structured copywriting frameworks (AIDA, PAS, BAB, 4Ps, FAB), data-driven A/B testing, and platform-specific optimization. The most effective content teams combine AI for research/drafts/optimization with human editorial oversight for strategy and quality control.

## Research Methodology

| # | Query | Source Type |
|---|-------|-------------|
| 1 | content marketing strategy frameworks AI-assisted copywriting 2025 | WebSearch |
| 2 | content marketing A/B testing audience targeting platform-specific 2025 | WebSearch |
| 3 | content campaign planning KPI measurement framework 2025 | WebSearch |

**Sources Consulted:**
- [AI Content Marketing Survival Guide – First Movers](https://firstmovers.ai/ai-content-marketing-survival-guide/)
- [Copywriting Frameworks 2025 – Medium](https://medium.com/@ninaalexkotova/copywriting-frameworks-without-myths-insights-for-2025-bd846c45a473)
- [AI and Content Marketing – Copy.ai](https://www.copy.ai/blog/future-of-content-marketing-ai)
- [A/B Testing in Digital Marketing – Mailchimp](https://mailchimp.com/marketing-glossary/ab-tests/)
- [Audience Targeting Effectiveness – madgicx](https://madgicx.com/blog/audience-targeting)
- [Content Marketing KPIs 2025 – hellobonsai](https://www.hellobonsai.com/blog/kpis-content-marketing)
- [Marketing Measurement Framework – eliya.io](https://www.eliya.io/blog/marketing-measurement/measurement-framework)

## Existing Codebase Patterns

**Similar Skills Found:**
- `.claude/skills/brainstorming/SKILL.md` — Cognitive/prompt-driven, structured process with sections, iron laws, anti-patterns; uses `tools: [Read, Write, Bash]`; assigned to `[developer, planner, architect]`
- `.claude/skills/doc-generator/SKILL.md` — Cognitive/prompt-driven, step-by-step execution process, XML-tagged sections (`<identity>`, `<capabilities>`, `<instructions>`, `<examples>`); model: sonnet

**Conventions Identified:**
- Naming: kebab-case (e.g., `doc-generator`, `brainstorming`)
- Structure: YAML frontmatter → `<identity>` → `<capabilities>` → `<instructions>` → `<examples>` → Iron Laws → Anti-Patterns → Memory Protocol
- Tools: `[Read, Write, Bash]` for content generation skills; `model: sonnet` for domain skills
- Agent assignment: domain-specific skills go to the matching domain agent
- Category: `domain-specific` for non-engineering capabilities

## Detailed Findings

### Copywriting Frameworks (High Confidence)
- **AIDA** (Attention → Interest → Desire → Action): Best for cold audiences; proven conversion framework
- **PAS** (Problem → Agitate → Solution): Combines empathy with urgency; strong for pain-point content
- **BAB** (Before → After → Bridge): Demonstrates transformation; ideal for testimonials and case studies
- **4Ps** (Problem → Promise → Proof → Proposal): Evidence-based; best for warm/informed audiences
- **FAB** (Features → Advantages → Benefits): Translates product specs into user value
- AI assistance: JP Morgan Chase saw 450% CTR lift using AI-generated copy (Persado)

### A/B Testing & Optimization (High Confidence)
- Test messaging, offers, subject lines, CTAs, and visual elements
- Track: opens, clicks, assisted conversions, time-on-page, scroll depth
- Modern platforms enable multivariate testing beyond simple A/B
- Winning variants should update editorial calendar/content templates

### Audience Targeting (High Confidence)
- Segment by: demographic, behavioral, psychographic, intent signals
- Platform-specific targeting: Facebook detailed targeting, Google intent signals, TikTok discovery algorithm
- AI-driven: automates segmentation and optimization; predicts buying behavior
- Micro-moment targeting (intent signals) outperforms demographic-only approaches

### Platform-Specific Content (High Confidence)
- **TikTok/Instagram Reels**: Short-form video, hooks in first 3s, trending audio
- **LinkedIn**: Long-form professional articles, thought leadership, case studies
- **Facebook**: Carousel posts, community building, event-driven content
- **Email**: Personalized subject lines, segmented lists, A/B test cadence
- **Blog/SEO**: Long-form evergreen content, keyword targeting, internal linking

### Editorial Calendar Management (High Confidence)
- Treat each content piece as an experiment; log results (opens, clicks, conversions, hours saved)
- AI handles: research, drafts, optimization suggestions, scheduling
- Human oversight: strategy, brand voice, final quality control
- Cadence: consistent publishing schedule tied to campaign goals

### Content KPI Framework (High Confidence)
- **Engagement**: Engaged sessions (>10s with interaction), scroll depth, time-on-page
- **Conversion**: CTR, conversion rate, cost-per-acquisition, assisted conversions
- **Lead Quality**: Sales-readiness score, ICP alignment, CRM integration
- **Retention**: Return visits, repeat content interactions, brand affinity
- **ROI**: 68% of companies report growth in content ROI since deploying AI tools

## Design Decisions

| Decision | Rationale | Source | Alternatives Considered |
|----------|-----------|--------|------------------------|
| Include all 5 copywriting frameworks | Each serves different audience awareness stages | Medium/Mailchimp | Only AIDA — too narrow |
| Separate platform-specific guidance | Each platform has unique algorithm/format requirements | Copy.ai | Generic cross-platform — loses specificity |
| Include A/B testing workflow | Critical for optimization loop; 38% CTR improvement | Mailchimp | Only mention testing — not actionable |
| KPI tier structure (Engagement/Conversion/Retention/ROI) | Matches measurement framework best practice | eliya.io | Single KPI list — harder to prioritize |
| Assign to marketing-strategist | Domain match; marketing-strategist is the primary consumer | CLAUDE.md routing table | developer — wrong specialty |

## Best Practices Identified

| # | Practice | Source | Confidence | Rationale |
|---|----------|--------|------------|-----------|
| 1 | Human-AI collaboration: AI drafts, humans approve | Copy.ai, First Movers | High | Multiple sources confirm this model maximizes quality + efficiency |
| 2 | Audience awareness drives framework selection | Medium copywriting article | High | Cold audiences → AIDA/PAS; warm audiences → 4Ps/FAB |
| 3 | Platform-specific content strategy (not one-size-fits-all) | madgicx, symphonicdigital | High | Each platform's algorithm rewards native format |
| 4 | A/B test every content variant before scale | Mailchimp, Optimizely | High | Data-backed iteration outperforms intuition alone |
| 5 | Track engaged sessions (not just pageviews) | hellobonsai | High | Engaged sessions measure real attention; pageviews measure traffic only |

## Risk Assessment

| Risk | Impact | Probability | Mitigation |
|------|--------|-------------|------------|
| Skill too broad — becomes generic advice | Medium | Medium | Scope to specific workflows: brief → draft → optimize → measure |
| Platform-specific guidance becomes stale | Low | High | Note platforms as examples, not exhaustive; focus on principles |
| A/B testing section too technical for content teams | Medium | Low | Keep at methodology level; reference dedicated testing tools |

## Recommended Implementation

**File Location**: `.claude/skills/marketing-content/`
**Model**: `sonnet` (matches domain skill convention)
**Tools**: `[Read, Write, Bash]`
**Agents**: `[marketing-strategist]`
**Category**: `domain-specific`

**Sections to Include:**
1. Content Strategy Framework (audience mapping, funnel stages, channel selection)
2. Copywriting Patterns (AIDA, PAS, BAB, 4Ps, FAB with examples)
3. Editorial Calendar Management (planning, scheduling, workflow)
4. Platform-Specific Content (TikTok/Reels, LinkedIn, Facebook, Email, Blog)
5. A/B Testing Workflow (hypothesis → test → measure → iterate)
6. Campaign Planning (objective → audience → content → distribution → measure)
7. Content Performance KPIs (engagement, conversion, retention, ROI)
8. Iron Laws + Anti-Patterns + Memory Protocol

## Quality Gate Checklist

- [x] 3 research queries executed
- [x] 7 external sources consulted
- [x] 2 existing codebase patterns documented (brainstorming, doc-generator)
- [x] All design decisions have rationale and source
- [x] Risk assessment completed (3 risks with mitigations)
- [x] Recommended implementation path documented
- [x] Report saved to correct location
- [x] Provenance header included

## Next Steps

1. **Invoke creator skill**: `Skill({ skill: "skill-creator" })`
2. Reference this report for design decisions
3. Assign to `marketing-strategist` agent
4. Category: `domain-specific`
