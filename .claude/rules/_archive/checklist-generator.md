---
paths:
  - .claude/skills/checklist-generator/**
---

# Checklist Generator Rules

## Core Principles

- IEEE 1028 base standards (80-90% of checklist) for universal quality
- LLM contextual additions (10-20%) based on detected project tech stack
- Context analysis BEFORE generation (detect frameworks, languages, patterns)
- Mark all LLM-generated items with [AI-GENERATED] prefix
- Total items should not exceed 50 (keep focused)

## Input Requirements

- Project context (framework, language, patterns detected)
- Task type (implementation, code review, QA validation)
- Ability to analyze codebase structure

## Output Standards

- Markdown checklist with checkboxes
- Generated timestamp and detected context at top
- IEEE 1028 sections: Code Quality, Testing, Security, Performance, Documentation, Error Handling
- Contextual section with detected tech stack
- Summary: Total items, IEEE base count, contextual count

## Workflow

1. **Analyze Context**: Detect framework, language, patterns (package.json, imports, file structure)
2. **Load IEEE 1028 Base**: Standard checklist items (code quality, tests, security, etc.)
3. **Generate Contextual Items**: Based on detected stack (TypeScript, React, API, Database, etc.)
4. **Assemble Checklist**: IEEE base + contextual with [AI-GENERATED] markers
5. **Validate**: Total items ≤ 50, contextual ≤ 20% of total

## Anti-Patterns

- Generating checklist without context analysis
- Exceeding 20% contextual items
- Forgetting [AI-GENERATED] prefix
- Including non-verifiable items
- Creating overly long checklists (>50 items)

## Integration Points

- Used by `qa` agent for validation
- Used by `verification-before-completion` as pre-completion gate
- Used by `code-reviewer` for PR review criteria
- Feeds into quality reports
