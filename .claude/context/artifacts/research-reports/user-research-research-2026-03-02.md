<!-- Agent: developer | Task: #16 | Session: 2026-03-02 -->

# Research Report: User Research Skill

**Date**: 2026-03-02
**Task**: #16 — Create user-research skill for agent-studio
**Artifact Type**: skill
**Domain**: UX research methods

---

## Executive Summary

The `user-research` skill will provide a comprehensive, structured workflow for the `ux-researcher` agent covering seven core UX research methods: usability heuristics (Nielsen's 10), persona frameworks grounded in behavioral segments, journey mapping, interview synthesis via affinity diagramming, A/B test analysis with statistical rigor, accessibility evaluation (WCAG 2.1/2.2), and cognitive walkthroughs. Research confirms these methods are timeless, well-standardized, and remain the dominant practice in 2025-2026. AI-assisted synthesis (80% adoption in 2025) is an emerging acceleration layer. Framework patterns follow the `marketing-content` and `seo-optimization` SKILL.md structure.

---

## Research Methodology

| # | Query | Tool | Focus |
|---|-------|------|-------|
| 1 | UX research methods best practices 2025 Nielsen Norman | WebSearch | Heuristics, cognitive walkthroughs |
| 2 | UX interview synthesis affinity mapping A/B test AI 2025 | WebSearch | Synthesis methods, quantitative methods |
| 3 | Existing codebase: ux-researcher agent | Glob + Read | Agent capabilities to match |
| 4 | Existing codebase: marketing-content, seo-optimization | Read | Skill structure patterns |

---

## Key Findings

### UX Research Methods (2025-2026 State)

**Usability Heuristics (Nielsen's 10)**
- 3-5 independent evaluators recommended per evaluation
- Severity ratings 0-4 on each violation
- Stretches limited research budget — no user participants needed
- Applied to: UI flows, information architecture, error messages, forms

**Persona Frameworks**
- Behavioral segmentation (NOT demographic stereotypes) per NNGroup 2025
- Each persona grounded in observable behavioral data
- Jobs-to-be-Done (JTBD) framework increasingly preferred over traditional personas
- Must include: goals, frustrations, behaviors, mental models, context of use

**Journey Mapping**
- Stages, actions, thoughts, emotional arc, pain points, moments of truth
- Service blueprints extend journey maps to internal/backstage processes
- Opportunity scoring: Impact × Confidence × Effort at each touchpoint

**Interview Synthesis**
- Affinity diagramming is gold standard for thematic synthesis
- AI tools (80% researcher adoption 2025) accelerate tagging and clustering
- Best practice: AI assists; human sense-making is irreplaceable
- Output: thematic clusters → top insights with frequency counts → Jobs-to-be-Done

**A/B Test Analysis**
- Required: statistical significance (p < 0.05), practical significance (effect size)
- Minimum detectable effect (MDE) must be defined before experiment launch
- Segment analysis: check for Simpson's Paradox across user segments
- Flag accessibility regressions in test variants

**Accessibility Evaluation**
- WCAG 2.1 AA is current legal standard; WCAG 2.2 adds 9 new SC
- POUR framework: Perceivable, Operable, Understandable, Robust
- Tools: axe DevTools, WAVE, VoiceOver/NVDA/TalkBack testing
- Integration with `accessibility` skill (already in ux-researcher frontmatter)

**Cognitive Walkthrough**
- Workshop-based learnability evaluation (no users needed)
- Questions per step: Can the user tell what to do? Can they see how? Can they tell they succeeded?
- Produces: friction points, discoverability issues, mental model mismatches

---

## Existing Codebase Patterns

**Similar Artifacts Found:**
- `.claude/agents/domain/ux-researcher.md` — Full agent with NNGroup methodology, HEART framework, PURE
- `.claude/agents/domain/mobile-ux-reviewer.md` — Mobile UX with Nielsen heuristics + platform HIG
- `.claude/skills/marketing-content/SKILL.md` — Reference skill structure: YAML frontmatter + phases + anti-patterns + iron laws
- `.claude/skills/seo-optimization/SKILL.md` — Reference for domain-specific skill with workflow phases

**Conventions Identified:**
- Naming: `lowercase-kebab-case`, `category: domain-specific`
- Structure: YAML frontmatter → Overview → When to Use → Core Workflow (phases) → Anti-Patterns → Iron Laws → Memory Protocol
- Tools in frontmatter: `[Read, Write, Edit, Bash, WebSearch, WebFetch, Glob, Grep, TaskUpdate, Skill]`
- Agents: `[ux-researcher]` (primary)
- Hooks: reference `schemas/input.schema.json` and `schemas/output.schema.json`

---

## Best Practices Identified

| # | Practice | Source | Confidence | Rationale |
|---|----------|--------|------------|-----------|
| 1 | Heuristic evaluations by 3-5 independent evaluators | NNGroup | High | Reduces evaluator bias; catches more violations |
| 2 | Behavioral personas (not demographic) | NNGroup 2025 | High | Demographics don't predict behavior; behavioral data does |
| 3 | Triangulate across ≥2 methods before conclusions | NNGroup | High | Single-source findings are unreliable |
| 4 | Severity ratings 0-4 on every heuristic violation | NNGroup | High | Enables prioritization by impact |
| 5 | Define MDE before launching A/B test | Statistical practice | High | Underpowered tests produce false negatives |
| 6 | AI for synthesis acceleration (not replacement) | UserInterviews 2025 | High | 80% adoption; humans still own sense-making |
| 7 | Jobs-to-be-Done frame for persona goals | JTBD theory | Medium | More actionable than needs statements |
| 8 | Opportunity scoring (Impact×Confidence×Effort) | Opportunity Scoring | High | Prioritizes research findings for product teams |

---

## Design Decisions

| Decision | Rationale | Source | Alternatives Considered |
|----------|-----------|--------|------------------------|
| Single skill covering 7 methods | Cohesive UX research workflow; ux-researcher agent already scoped to all 7 | ux-researcher.md capabilities list | Separate skill per method (rejected — fragmented) |
| Phase-based workflow (1 method per phase) | Mirrors seo-optimization pattern; clear escalation path | seo-optimization SKILL.md | Free-form guidelines only (rejected — too loose) |
| Assign to `ux-researcher` only | Specialist agent; not a general-purpose skill | Agent specialization principle | Also assign to developer (rejected — not dev domain) |
| Include AI-assisted synthesis section | 80% adoption in 2025; agents should leverage AI acceleration | UserInterviews 2025 survey | Skip AI section (rejected — misses modern practice) |
| severity ratings 0-4 scale (not 1-5) | NNGroup standard; 0 = cosmetic, 4 = usability catastrophe | NNGroup heuristic evaluation guide | 1-5 scale (rejected — not NNGroup standard) |

---

## Risk Assessment

| Risk | Impact | Probability | Mitigation |
|------|--------|-------------|------------|
| Skill too broad — agent loses focus | Medium | Low | Phase structure keeps each method bounded |
| A/B test analysis requires actual data | Medium | Medium | Skill provides analysis templates; agent requests data if missing |
| Heuristic evaluation without real UI | Medium | Medium | Skill guides cognitive evaluation from descriptions/screenshots |
| WCAG version drift (2.1 vs 2.2 vs 3.0) | Low | Medium | Recommend 2.1 AA as floor; note 2.2 additions explicitly |

---

## Recommended Implementation

**File Location**: `.claude/skills/user-research/`

**Files to Create**:
- `SKILL.md` — Main skill document
- `commands/user-research.md` — Slash command delegation
- `rules/user-research.md` — Standalone rules reference
- `schemas/input.schema.json` — Input validation
- `schemas/output.schema.json` — Output contract

**Skills to Invoke by Agent**:
- `accessibility` — Already in ux-researcher frontmatter; invoked for accessibility phase
- `design-and-user-experience-guidelines` — Already in ux-researcher frontmatter
- `diagram-generator` — For journey maps, affinity diagrams
- `doc-generator` — For research reports

**Category**: `domain-specific`
**Tags**: `ux-research`, `usability`, `heuristics`, `personas`, `journey-mapping`, `a/b-testing`, `accessibility`, `cognitive-walkthrough`, `user-interviews`, `affinity-mapping`

---

## Quality Gate Checklist

- [x] 4 research queries executed (within 3-5 limit)
- [x] At least 3 external sources consulted (NNGroup, UserInterviews, maze.co)
- [x] Existing codebase patterns documented (2 agents + 2 skills)
- [x] All design decisions have rationale and source
- [x] Risk assessment completed with mitigations
- [x] Recommended implementation path documented

---

## Research Handoff to: skill-creator

**Report Location**: `.claude/context/artifacts/research-reports/user-research-research-2026-03-02.md`

**Summary**: The user-research skill should provide a 7-phase workflow for the ux-researcher agent covering: heuristic evaluation (Nielsen's 10 + severity 0-4), behavioral personas (JTBD-framed), journey mapping (with emotional arc + opportunity scoring), interview synthesis (affinity diagramming + AI acceleration), A/B test analysis (statistical + practical significance), accessibility evaluation (WCAG 2.1/2.2 POUR), and cognitive walkthrough (learnability assessment).

**Critical Decisions**:
1. Category: `domain-specific`, assigned to `ux-researcher` agent only
2. Phase-based workflow mirroring seo-optimization SKILL.md pattern
3. Include AI-assisted synthesis section (80% researcher adoption in 2025)
4. Heuristic severity ratings 0-4 (NNGroup standard)
5. Include iron laws and anti-patterns sections

**Proceed with creation**: YES
**Confidence Level**: High

---

## Sources

- [NNGroup — 10 Usability Heuristics](https://www.nngroup.com/articles/ten-usability-heuristics/)
- [NNGroup — Heuristic Evaluation Guide](https://www.nngroup.com/articles/how-to-conduct-a-heuristic-evaluation/)
- [UserInterviews — Affinity Mapping](https://www.userinterviews.com/blog/affinity-mapping-ux-research-data-synthesis)
- [Maze — AI Tools for User Research 2025](https://maze.co/blog/ai-tools-user-research/)
- [GreatQuestion — Card Sorting 2025](https://greatquestion.co/ux-research/card-sorting)
- [UserInterviews — How to Choose a Research Method](https://www.userinterviews.com/ux-research-field-guide-chapter/how-to-choose-a-research-method)
