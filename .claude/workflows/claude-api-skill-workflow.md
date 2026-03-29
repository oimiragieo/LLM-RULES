# Claude API Skill Workflow

## Skill Location

`.claude/skills/claude-api/SKILL.md`

## Invocation

- /claude-api
- node .claude/skills/claude-api/scripts/main.cjs --help

## Prerequisites

Set environment variable:
- ANTHROPIC_API_KEY

## Common Workflows

### Single LLM Call
- Classification, summarization, extraction
- Q&A, simple completions

### Streaming
- Long-form generation
- Real-time output display

### Tool Use
- Function calling
- Agentic loops

### Agent SDK
- Built-in web search
- Code execution
- Multi-session agents

## Default Model

Use `claude-opus-4-6` unless user specifies otherwise.
