<!-- Agent: developer | Task: #10 | Session: 2026-03-02 -->

# Research Report: UX Researcher Agent

## Executive Summary

The ux-researcher agent will serve as a specialized domain agent for user experience research, bridging user behavior analysis with product design decisions. Research confirms that effective UX research agents require: mixed-method research capabilities (qualitative + quantitative), structured deliverable frameworks (personas, journey maps, usability reports), and ethical research protocol enforcement. The agent-studio pattern (domain agent with skill composition) is well-suited for this role.

## Research Methodology

| # | Query | Source |
|---|-------|--------|
| 1 | agency-agents design-ux-researcher.md | github.com/msitarzewski/agency-agents |
| 2 | NNGroup: Usability 101 (usability testing methodology) | nngroup.com |
| 3 | NNGroup: Which UX Research Methods | nngroup.com |

## Existing Codebase Patterns

**Similar Agents Found:**
- `.claude/agents/domain/mobile-ux-reviewer.md` — UX/UI review agent with accessibility focus, heuristic evaluation, WebSearch/WebFetch tools, design-and-user-experience-guidelines skill
- `.claude/agents/domain/frontend-pro.md` — Frontend expert with accessibility skill, webapp-testing, web-design-guidelines-vercel
- `.claude/agents/domain/pm-coordinator.md` — Domain agent with research/WebSearch tools, structured deliverable format

**Conventions Identified:**
- Naming: lowercase kebab-case (e.g., `mobile-ux-reviewer`, `pm-coordinator`)
- Structure: frontmatter YAML → `<!-- agent-template-contract:v1 -->` → Enforcement Hooks table → Related Workflows → Core Persona → Responsibilities → Workflow → Output Protocol → Skill Invocation Protocol → Memory Protocol
- Tools: Domain agents needing web research include WebSearch + WebFetch
- Skills: `accessibility`, `design-and-user-experience-guidelines`, `verification-before-completion`, `task-management-protocol`, `ripgrep`, `code-semantic-search`, `context-compressor`, `context-compressor`, `memory-search`
- Model: `sonnet` (standard for domain specialists)
- Temperature: `0.4` (balanced creativity/precision)
- Output locations: `.claude/context/reports/backend/`, `.claude/context/artifacts/`

## Detailed Findings

### From Source Agent (agency-agents/design/design-ux-researcher.md)

**Core Identity:**
- Expert user experience researcher specializing in user behavior analysis, usability testing, and data-driven design insights
- Evidence-based decision-making ("Based on 25 interviews, 80% of users...")
- Institutional memory for successful research frameworks

**Primary Responsibilities:**
- Mixed-method approaches (qual + quant)
- Empirically-grounded persona creation
- User journey mapping
- Translating findings into implementable recommendations
- Accessibility research and inclusive design testing

**Essential Protocols:**
- Clear research questions before method selection
- Appropriate sample sizing
- Bias mitigation
- Triangulation across multiple data sources
- Ethical standards: informed consent, participant privacy, diverse recruitment

**Deliverable Framework:**
- Structured research study plans
- Detailed user personas with behavioral insights
- Usability testing protocols with task scenarios
- Findings reports with priority-segmented recommendations + success metrics

### From NNGroup Research (authoritative UX methodology sources)

**UX Research Method Taxonomy (3 dimensions):**
1. Attitudinal vs. Behavioral (what people say vs. what they do)
2. Qualitative vs. Quantitative
3. Context of use (natural, scripted, decontextualized)

**Key Methods:**
- User Interviews: Attitudinal/Qualitative — generative research, discovery phase
- Usability Testing: Behavioral/Qualitative — design phase, task completion observation
- A/B Testing: Behavioral/Quantitative — launch/assess phase, measuring design performance
- Card Sorting: Attitudinal — information architecture, mental models
- Heuristic Evaluation: Expert review (Nielsen's 10 heuristics)
- Journey Mapping: Cross-touchpoint experience documentation
- Persona Development: Empirically-grounded user archetypes

**Core Usability Components (Nielsen):**
1. Learnability
2. Efficiency
3. Memorability
4. Error frequency/severity/recovery
5. Satisfaction

**Efficient Testing Insight:** 5 users identify major usability problems; frequent iterations over large studies.

## Best Practices Identified

| # | Practice | Source | Confidence | Rationale |
|---|----------|--------|------------|-----------|
| 1 | Mixed-method research (qual + quant) | NNGroup | High | Qual answers why; quant answers how many |
| 2 | Test with 5 users for major issues | NNGroup | High | Cost-effective, frequent iteration beats large studies |
| 3 | Include accessibility in all research | agency-agents source | High | Inclusive design is non-negotiable |
| 4 | Evidence-based communication style | agency-agents source | High | Quantified findings drive stakeholder buy-in |
| 5 | Ethical protocol (informed consent, privacy) | agency-agents source | High | Standard research ethics apply to AI-assisted research |
| 6 | Research question before method selection | agency-agents source | High | Method follows question, not vice versa |

## Design Decisions

| Decision | Rationale | Source | Alternatives Considered |
|----------|-----------|--------|------------------------|
| Include WebSearch + WebFetch tools | UX researcher needs to gather current platform guidelines, literature, competitive benchmarks | mobile-ux-reviewer pattern | Read-only — insufficient for live research |
| Use `design-and-user-experience-guidelines` skill | Core skill for UX domain, already used by mobile-ux-reviewer | codebase pattern | Custom skill — unnecessary duplication |
| Use `accessibility` skill | All UX research must include inclusive design | agent-creator guidance + source agent | Optional — accessibility is non-negotiable |
| Model: sonnet | Standard for domain specialists; balanced cost/quality | codebase convention (mobile-ux-reviewer, pm-coordinator) | opus — over-engineered for research tasks |
| Include `brainstorming` skill | UX research involves ideation for research protocol design | agent-creator guidance | Not needed — research is analytical |
| No `code-semantic-search` or `code-structural-search` | UX researcher doesn't write code; search tools are for code-reading agents | domain analysis | Include — not relevant to UX domain |
| Include `diagram-generator` | Journey maps and user flow diagrams are core UX deliverables | mobile-ux-reviewer pattern | Not included — diagrams are essential UX artifacts |

## Recommended Implementation

**File Location:** `.claude/agents/domain/ux-researcher.md`
**Model:** sonnet
**Temperature:** 0.4
**maxTurns:** 18

**Tools:**
- Read, Write, Edit, Bash, Grep, Glob (standard)
- WebSearch, WebFetch (needed for current platform guidelines, literature)
- TaskUpdate, TaskList, TaskCreate, TaskGet, Skill (standard)

**Skills:**
- `accessibility` — WCAG compliance, inclusive design testing
- `design-and-user-experience-guidelines` — UX best practices
- `diagram-generator` — Journey maps, user flows, persona visuals
- `doc-generator` — Structured research reports
- `task-management-protocol` — Task tracking
- `verification-before-completion` — Quality gates
- `context-compressor` — Context management
- `context-compressor` — Token efficiency
- `ripgrep` — Fast search when needed
- `memory-search` — Cross-session research knowledge
- `brainstorming` — Research protocol ideation
- `checklist-generator` — Research methodology checklists

## Risk Assessment

| Risk | Impact | Probability | Mitigation |
|------|--------|-------------|------------|
| Hallucinating research data | High | Medium | Enforce evidence-based output format with citations |
| Missing accessibility considerations | High | Low | Make accessibility skill always-invoke |
| Persona stereotyping / bias | Medium | Medium | Include bias mitigation protocol in agent body |
| Over-broad scope creep | Medium | Medium | Clear routing keywords: "user research", "usability", "persona" |
| Routing conflict with mobile-ux-reviewer | Low | Low | Different scope: ux-researcher = research methods; mobile-ux-reviewer = mobile UI review |

## Implementation Roadmap

1. Agent file created at `.claude/agents/domain/ux-researcher.md` via agent-creator
2. Wired into agent-registry via agents:registry command
3. Routing keywords added to routing-table-intent-keywords-data.cjs
4. Proactive audit run after creation

## Quality Gate Checklist

- [x] 3+ research queries executed (3 queries)
- [x] 3+ external sources consulted (nngroup x2, agency-agents x1)
- [x] Existing codebase patterns documented (mobile-ux-reviewer, frontend-pro, pm-coordinator)
- [x] All design decisions have rationale and source
- [x] Risk assessment completed with mitigations
- [x] Recommended implementation path documented
- [x] Report saved with correct naming: `ux-researcher-agent-research-2026-03-02.md`
- [x] Provenance header included

## Research Handoff to: agent-creator

**Report Location:** `.claude/context/artifacts/research-reports/ux-researcher-agent-research-2026-03-02.md`

**Summary:** The ux-researcher agent should be a domain specialist for user research methodology using mixed-method approaches. Key differentiators: WebSearch/WebFetch for live research, accessibility as always-invoke skill, evidence-based communication style, and structured deliverable framework (personas, journey maps, usability reports).

**Critical Decisions:**
1. Include WebSearch + WebFetch (needed for current literature, guidelines)
2. Use `design-and-user-experience-guidelines` + `accessibility` as core skills
3. No code search skills (not a code-reading agent)

**Proceed with creation:** YES
**Confidence Level:** High
