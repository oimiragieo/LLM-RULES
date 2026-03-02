# llm-council Rules

## Purpose

Orchestrate multi-LLM parallel debate and synthesis. Dispatches prompts to available omega CLI wrappers in parallel, collects independent responses, runs anonymized peer review ranking, and synthesizes via a chairman model. No server required.

## Best Practices

- Always check available CLIs before dispatching (run verify-setup.mjs for each)
- Use at least 3 models for meaningful peer review rankings
- Set --timeout-ms per model to prevent one slow model from blocking the council
- Anonymize responses before peer review to prevent model identity bias
- Store council results in .claude/context/tmp/ for downstream consumption

## Integration Points

See SKILL.md for complete documentation.
