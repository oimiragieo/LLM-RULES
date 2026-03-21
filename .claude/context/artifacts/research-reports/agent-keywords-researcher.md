# Keyword Research: researcher Agent

**Agent**: researcher
**Category**: specialized
**Date**: 2026-01-27
**Research Method**: Domain analysis and task requirements review

## Research Summary

Conducted keyword analysis for general-purpose researcher agent focused on web research, fact-finding, and information gathering tasks.

## High-Confidence Keywords (Unique to This Agent)

These keywords strongly indicate a need for the researcher agent:

- `research`
- `investigate`
- `find out`
- `look up`
- `fact-check`
- `gather information`
- `web search`
- `external sources`

## Medium-Confidence Keywords (May Overlap)

These keywords suggest researcher but may overlap with other agents:

- `best practices`
- `industry standards`
- `documentation`
- `analyze options`
- `compare`
- `verify`
- `validate`

## Action Verbs

Common verbs for researcher tasks:

- research
- investigate
- search
- find
- gather
- collect
- verify
- fact-check
- look up
- explore
- discover

## Problem Indicators

Phrases users say when needing researcher:

- "I need to research..."
- "Can you look up..."
- "Find information about..."
- "What are the best practices for..."
- "How does X work?"
- "Compare X and Y"
- "Is this the industry standard?"
- "Verify that..."
- "Fact-check..."

## Routing Priority

**Primary Use Cases**:
- Pre-creation research (before agent-creator, skill-creator, etc.)
- Technology comparison and evaluation
- Best practice discovery
- External documentation gathering
- Competitive analysis

**Secondary Use Cases**:
- General fact-finding
- Verification of claims
- Industry standard research

## Integration with Creator Ecosystem

**CRITICAL**: The researcher agent should be invoked BEFORE any creator skill when creating new artifacts. This aligns with the research-synthesis requirement in the EVOLVE workflow.

**Workflow Pattern**:
```
User: "Create an analytics expert agent"
Router: Spawn researcher → Gather best practices
        researcher → Complete research report
Router: Spawn agent-creator → Use research for agent design
```

## Notes

- This agent complements but does not replace scientific-research-expert (which focuses on computational biology)
- Should have access to WebSearch, WebFetch, and Exa tools for external information gathering
- Primary output: research reports saved to `.claude/context/artifacts/research-reports/`
