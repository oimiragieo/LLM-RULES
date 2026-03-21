<!-- Agent: developer | Task: #7 | Session: 2026-03-02 -->

# Research Report: Marketing Strategist Agent

**Date**: 2026-03-02
**Artifact Type**: Agent (domain specialist)
**Domain**: Marketing strategy, content creation, growth hacking, social media management
**Task**: Create `marketing-strategist` agent consolidating marketing-content-creator, marketing-growth-hacker, marketing-social-media-strategist from github.com/msitarzewski/agency-agents

---

## Executive Summary

The marketing-strategist agent should consolidate three complementary marketing roles into a unified domain specialist: content creation, growth hacking, and social media management. Research confirms AI agents are transforming all three domains in 2025-26, with 85% of enterprises deploying AI agents for marketing and 60%+ of AI-generated value coming from marketing/sales workflows. The agent must cover the full marketing funnel — awareness through conversion — using platform-specific strategies, data-driven A/B testing, and brand voice consistency across channels.

---

## Research Methodology

| # | Query | Sources |
|---|-------|---------|
| 1 | AI agent marketing strategy best practices 2025 | McKinsey, Aprimo, Lyzr AI, Glowtify, Demand Gen Report |
| 2 | Digital marketing campaign planning, A/B testing, audience targeting 2025 | TheDigitalBloom, Britopian, Improvado, Adobe |
| 3 | Social media platform optimization (LinkedIn, Twitter/X, Instagram, TikTok) 2025 | Buffer, Adobe Express, Sprout Social, Solucru |
| 4 | Growth hacking, viral marketing, conversion optimization, KPI analytics 2025 | Dashly, Hopmann, ScienceDirect, AI Digital |

---

## Existing Codebase Patterns

**Similar Agents Examined:**

- `.claude/agents/domain/pm-coordinator.md` — domain agent pattern: rich capabilities sections, behavioral traits, example interactions, model: sonnet, temperature: 0.3, context_strategy: lazy_load, maxTurns: 18
- `.claude/agents/domain/prompt-engineer.md` — domain agent with identity/backstory block, routing exclusions table, code search integration, model: sonnet, temperature: 0.5, skills include ripgrep/code-semantic-search/verification-before-completion

**Conventions Identified:**

- Naming: kebab-case (`pm-coordinator`, `prompt-engineer`)
- Frontmatter: name, version, description, model, temperature, context_strategy, maxTurns, permissionMode, tools, skills, context_files
- Structure: Enforcement Hooks table → Related Workflows → Core Persona → Routing Exclusions → Workflow → Capabilities → Behavioral Traits → Example Interactions → Skill Invocation Protocol → Memory Protocol → Hybrid Search Policy
- Tools: Standard set includes Read, Write, Edit, Bash, Grep, Glob, WebSearch, WebFetch, TaskUpdate, TaskList, TaskCreate, TaskGet, Skill
- Skills: Domain agents typically include: ripgrep, code-semantic-search, context-compressor, context-compressor, verification-before-completion, task-management-protocol, memory-search + domain-specific skills
- Temperature: 0.3-0.5 for domain specialists; higher for creative roles
- Context files: `@.claude/context/memory/learnings.md`

---

## Detailed Findings

### Marketing AI Agent Capabilities (2025-26)

- AI marketing agents now operate across the full go-to-market lifecycle: research, content creation, campaign execution, optimization
- McKinsey: Agentic AI will power 60%+ of increased marketing/sales AI value
- 85% of enterprises plan to deploy marketing AI agents by 2025 (Lyzr AI)
- Personalization at scale: 71% of consumers expect personalized interactions; AI-driven personalization enhances satisfaction 15-20%, revenue 5-8% (M1-Project)
- Key agent types: Listener agents (monitor pain points), Topic agents (content ideas), Campaign agents (execution), Analytics agents (measurement)

### Campaign Planning Framework

- SOSTAC® + STP: Situation, Objectives, Strategy, Tactics, Action, Control + Segmentation, Targeting, Positioning
- SMART objectives tied to business outcomes
- Content calendar with buyer journey mapping, platform-specific tactics, budget allocation, team ownership, KPIs
- AI-powered A/B testing: auto-deploys 10+ variations simultaneously, auto-selects winners
- AARRR model: Acquisition, Activation, Retention, Referral, Revenue (Dave McClure)

### Social Media Platform-Specific (2025)

- **LinkedIn**: AI-assisted post drafting; short 30-90s videos for testimonials/case studies; industry-trending topics
- **Instagram**: SEO-optimized captions (now indexed by Google), keyword-rich alt text, Reels for discovery
- **TikTok**: Hook in first 2-3 seconds; sound/trend integration; micro-virality through interest clustering
- **Twitter/X**: Real-time engagement, thread formats for depth, hashtag research
- Universal: 3-5 posts/week per platform; focus on 2-3 core platforms; authentic/value-driven content

### Growth Hacking Patterns

- Viral loops: shareable content that evokes emotion or humor; referral programs
- Scarcity marketing, FOMO triggers
- Conversion optimization: chatbots, triggered emails, pop-ups, live chat
- Cross-channel marketing automation
- Hypothesis-driven: test → measure → iterate cycle
- Product-led growth (PLG): freemium, viral features, in-product sharing

### KPIs and Analytics

- AARRR metrics: CAC, CLV, conversion rates, engagement, referral rates
- Platform analytics + Google Analytics 4 integration
- Engagement rate, reach, website clicks, conversions, community growth
- Influencer KPIs: reach frequency, engagement rate, mentions, conversions
- Brand voice: consistency tracking, optimal cadence, avoid oversaturation

---

## Best Practices Identified

| # | Practice | Source | Confidence | Rationale |
|---|----------|--------|------------|-----------|
| 1 | Use AARRR funnel as KPI framework | McClure/Dashly | High | Industry-standard growth metric model |
| 2 | Platform-specific content optimization | Buffer/Sprout Social | High | Each platform has distinct algorithm and format requirements |
| 3 | AI-powered A/B testing automation | Adobe/DigitalBloom | High | 10x faster than manual testing |
| 4 | Authentic content + brand voice consistency | Adobe Express | High | Algorithm favors authentic engagement |
| 5 | SOSTAC® strategic planning framework | Britopian | Medium | Comprehensive but needs customization per brand |
| 6 | Content calendar with buyer journey mapping | Improvado | High | Ensures content reaches right person at right time |
| 7 | Growth hacking: viral loops + product-led growth | ScienceDirect | High | Evidence-based viral coefficient improvement |
| 8 | Cross-channel automation + personalization at scale | McKinsey/M1-Project | High | 5-8% revenue lift from AI personalization |

---

## Design Decisions

| Decision | Rationale | Source | Alternatives Considered |
|----------|-----------|--------|------------------------|
| Consolidate 3 agents into 1 | Reduces routing complexity; marketing strategy is holistic | Task spec | Keep separate; chose consolidation for coherence |
| model: sonnet | Creative/strategic tasks benefit from sonnet balance | pm-coordinator, prompt-engineer patterns | haiku (too shallow), opus (overkill for content) |
| temperature: 0.7 | Marketing copy requires creative variation | Higher than pm-coordinator (0.3) due to creative output | 0.3 (too rigid for copy), 1.0 (too random) |
| Include WebSearch/WebFetch | Marketing requires real-time trend research | Research findings on platform changes | Read-only (insufficient for trend monitoring) |
| Skills: brainstorming, enhance-prompt, research-synthesis | Task spec requirement + creative marketing alignment | Task spec | Marketing-specific skills not yet in catalog |

---

## Recommended Implementation

**File Location**: `.claude/agents/domain/marketing-strategist.md`
**Template to Use**: `.claude/templates/spawn/universal-agent-spawn.md` pattern
**Creator Skill**: `agent-creator`

**Skills to Include:**
- `brainstorming` — ideation for campaigns and content
- `enhance-prompt` — refine marketing copy and prompts
- `research-synthesis` — research trends and competitors
- `ripgrep` — search codebase for context
- `context-compressor` — manage long marketing briefs
- `verification-before-completion` — quality gate
- `context-compressor` — context efficiency

**Provenance:** Source: github.com/msitarzewski/agency-agents (marketing-content-creator, marketing-growth-hacker, marketing-social-media-strategist)

---

## Risk Assessment

| Risk | Impact | Probability | Mitigation |
|------|--------|-------------|------------|
| Scope too broad (3 roles) | Medium — may produce shallow responses | Low | Structure capabilities into clear subsections |
| Platform API changes | Medium — advice may become stale | Medium | Include WebSearch for real-time research |
| Brand safety | High — off-brand copy could damage clients | Low | Include brand voice consistency section |
| Overpromising viral results | Medium — viral is unpredictable | Medium | Frame viral tactics as probabilistic, not guaranteed |

---

## Implementation Roadmap

1. Invoke `agent-creator` skill with research report as backing
2. Create `.claude/agents/domain/marketing-strategist.md` with frontmatter + full capabilities
3. Verify in agent-registry.json post-creation
4. Update task-7 as completed

---

## Quality Gate Checklist

- [x] 4 research queries executed (within 3-5 budget)
- [x] At least 3 external sources per query
- [x] Existing codebase patterns documented (pm-coordinator, prompt-engineer)
- [x] All design decisions have rationale and source
- [x] Risk assessment completed with mitigations
- [x] Recommended implementation path documented
- [x] Report size <10 KB
- [x] Provenance header included

**Proceed with creation**: YES
**Confidence Level**: High
