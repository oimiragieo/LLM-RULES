# Research Report: scientific-research-expert Agent

**Date**: 2026-01-25
**Researcher**: evolution-orchestrator (research-synthesis skill)
**Artifact Type**: agent
**Domain**: Scientific research, computational biology, data analysis, research methodology

---

## Research Scope Definition

**Artifact Type**: agent
**Domain/Capability**: Dedicated agent to leverage 139 scientific sub-skills for research workflows
**Key Questions**:
1. What are the best practices for AI agents in scientific research?
2. What workflow patterns exist for computational biology and data analysis?
3. What tools/frameworks should be used for reproducibility?
4. What are the common pitfalls in AI-assisted research?

**Existing Patterns to Examine**:
- `.claude/agents/domain/python-pro.md` - Python expertise with scientific-skills reference
- `.claude/agents/domain/data-engineer.md` - Data engineering patterns
- `.claude/skills/scientific-skills/SKILL.md` - The 139 sub-skills catalog

---

## Research Queries Executed

| # | Query | Tool | Sources Found | Key Finding |
|---|-------|------|---------------|-------------|
| 1 | "research methodology workflow agent Claude AI scientific computing" | Exa | 5 | K-Dense scientific skills, Anthropic Claude for Life Sciences |
| 2 | "scientific research assistant agent design patterns reproducibility" | Exa | 5 | Multi-agent patterns (ReAct, CodeAct), autonomous research workflows |
| 3 | "scientific research AI agent best practices reproducibility data analysis 2025" | WebSearch | 10 | Reproducibility crisis, structured workflows, experiment tracking |
| 4 | "computational biology AI workflow agent patterns hypothesis generation" | WebSearch | 10 | CellVoyager, SciAgents, agentic bioinformatics paradigm |

---

## External Sources Consulted

1. **Anthropic - Claude for Life Sciences** (https://www.anthropic.com/news/accelerating-scientific-research)
   - Scientists using Claude as collaborator across all research stages
   - Compression of months into hours through automation
   - Pattern finding in massive datasets

2. **K-Dense Claude Scientific Skills** (https://github.com/K-Dense-AI/claude-scientific-skills)
   - 139 ready-to-use scientific skills
   - Multi-step scientific workflow automation
   - Integration patterns for biology, chemistry, medicine

3. **Agentic AI for Scientific Discovery Survey** (https://arxiv.org/html/2503.08979v1)
   - LLMs enabling autonomous hypothesis generation, literature review, experimental design
   - Reproducibility and provenance are non-negotiable
   - Tool versions, parameters, data lineage must be recorded

4. **Sapio Sciences - Agentic AI for Scientific Research** (https://www.sapiosciences.com/blog/agentic-ai-for-scientific-research-autonomous-agents-transforming-experiment-design/)
   - Paradigm shift: agents as active research collaborators
   - Streamlining experimental design, workflow optimization
   - Hypothesis generation, experiment design, data analysis automation

5. **CellVoyager** (https://www.biorxiv.org/content/10.1101/2025.06.03.657517v1)
   - AI agent autonomously exploring scRNA-seq datasets
   - 80% of agent hypotheses deemed scientifically interesting
   - Novel direction conditioning on prior analyses

6. **SciAgents** (https://pmc.ncbi.nlm.nih.gov/articles/PMC12138853/)
   - Multi-agent system with Ontologist, Scientists, Critic roles
   - Large-scale ontological knowledge graphs
   - In-situ learning capabilities

7. **Agentic Bioinformatics** (https://academic.oup.com/bib/article/26/5/bbaf505/8266996)
   - Brainstorming, Experimental Design, Reasoning, Wet-lab, Dry-lab agents
   - System-level rethinking of biological knowledge generation
   - Agents as autonomous collaborators for hypothesis refinement

8. **Reproducibility in AI Research** (https://onlinelibrary.wiley.com/doi/10.1002/aaai.70004)
   - Only 5% of AI researchers share source code
   - Less than a third of AI research is reproducible
   - Need for open science practices, standardized reporting

---

## Existing Codebase Patterns

**Similar Artifacts Found:**
- `python-pro.md` - Uses `scientific-skills` for scientific projects (Skill Invocation Protocol)
- `data-engineer.md` - ETL patterns, data quality validation, monitoring workflows

**Conventions Identified:**
- **Naming**: kebab-case, descriptive (`python-pro`, `data-engineer`)
- **Structure**: YAML frontmatter, Core Persona, Responsibilities, Capabilities, Workflow, Memory Protocol
- **Tools**: Comprehensive tool arrays including Task tools
- **Output**: Standardized output locations in `.claude/context/`

---

## Best Practices Identified

| # | Practice | Source | Confidence | Rationale |
|---|----------|--------|------------|-----------|
| 1 | **Reproducibility-first**: Record tool versions, parameters, data lineage | Agentic AI Survey | High | Enables independent verification of findings |
| 2 | **Multi-phase workflows**: Literature review -> Hypothesis -> Experiment -> Analysis | CellVoyager, SciAgents | High | Mirrors human scientific method |
| 3 | **Structured output formats**: Use templates for reports, notebooks, data artifacts | K-Dense Skills | High | Ensures consistency and traceability |
| 4 | **Citation management**: Track sources, validate references | K-Dense, Anthropic | High | Academic integrity requirement |
| 5 | **Visualization integration**: matplotlib, seaborn, plotly for publication figures | scientific-skills | High | Essential for communication |
| 6 | **Multi-agent collaboration**: Specialist roles for different research phases | SciAgents | Medium | Complex projects benefit from specialization |
| 7 | **Self-reflection checkpoints**: Confidence estimation, methodological flaw detection | Agentic Bioinformatics | Medium | Quality assurance for autonomous workflows |

---

## Design Decisions

| Decision | Rationale | Source | Alternatives Considered |
|----------|-----------|--------|------------------------|
| Create dedicated agent vs enhance python-pro | 139 skills warrant dedicated expertise; clear routing for scientific requests | K-Dense integration, user request | Enhance python-pro (rejected: too broad) |
| Use `scientific-skills` as primary skill | Already integrated, comprehensive coverage | Existing codebase | Create new skills (rejected: duplication) |
| Include research-synthesis skill | Ensures methodology rigor | EVOLVE workflow | Manual research (rejected: inconsistent) |
| Include hypothesis-generation workflow | Core scientific method capability | CellVoyager, SciAgents | Ad-hoc hypothesis (rejected: not systematic) |
| Output to `.claude/context/artifacts/research/` | Follows existing patterns | data-engineer.md | Custom location (rejected: inconsistent) |
| Model: opus | Complex reasoning for scientific analysis | Anthropic guidance | sonnet (acceptable for routine tasks) |
| Include diagram-generator skill | Scientific communication requires figures | scientific-skills references | Manual figure generation (rejected: inefficient) |

---

## Recommended Implementation

**File Location**: `.claude/agents/domain/scientific-research-expert.md`

**Skills to Include**:
- `scientific-skills` (primary - 139 sub-skills)
- `research-synthesis` (methodology rigor)
- `task-management-protocol` (task tracking)
- `diagram-generator` (visualization)
- `doc-generator` (documentation)
- `tdd` (reproducible analysis)
- `verification-before-completion` (quality gates)

**Key Capabilities**:
1. Literature review and synthesis
2. Hypothesis generation and validation
3. Data analysis (genomics, proteomics, cheminformatics)
4. Experimental design assistance
5. Scientific writing and visualization
6. Citation management

**Differentiation from existing agents**:
- `python-pro`: General Python development, uses scientific-skills as contextual skill
- `data-engineer`: ETL pipelines, data infrastructure
- `scientific-research-expert`: Scientific method, hypothesis-driven research, domain expertise

---

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Reproducibility failures | Medium | High | Enforce logging of parameters, versions, data sources |
| Hallucinated citations | Medium | High | Citation validation workflow, use citation-management skill |
| Methodology errors | Low | High | Self-reflection checkpoints, peer review recommendations |
| Overlap with python-pro | Medium | Low | Clear routing table entries, documentation |
| Sub-skill invocation complexity | Medium | Medium | Document common skill chains, provide examples |

---

## Quality Gate Checklist

Before proceeding to artifact creation, verify:

- [x] Minimum 3 research queries executed (4 executed)
- [x] At least 3 external sources consulted (8 sources)
- [x] Existing codebase patterns documented (python-pro, data-engineer)
- [x] All design decisions have rationale and source
- [x] Risk assessment completed with mitigations
- [x] Recommended implementation path documented

---

## Next Steps

1. **Create agent**: `.claude/agents/domain/scientific-research-expert.md`
2. **Update CLAUDE.md**: Add to routing table (Phase 5)
3. **Update router-enforcer.cjs**: Add scientific keywords (Phase 5)
4. **Validate**: Run validate-agents.mjs

---

## Research Handoff to: agent-creator

**Report Location**: `.claude/context/artifacts/research-reports/scientific-research-expert-research.md`

**Summary**:
Scientific research AI agents should follow reproducibility-first principles with multi-phase workflows (literature review -> hypothesis -> experiment -> analysis). The agent should leverage the 139 scientific sub-skills from K-Dense integration while providing structured outputs for academic communication.

**Critical Decisions**:
1. Create dedicated domain agent (not enhance python-pro)
2. Use `scientific-skills` as primary skill with full 139 sub-skill access
3. Include research-synthesis for methodology rigor
4. Model: opus for complex scientific reasoning

**Proceed with creation**: YES
**Confidence Level**: High
