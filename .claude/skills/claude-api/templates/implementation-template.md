# claude-api Implementation Template

## Goal

- Integrate Claude API for LLM calls
- Implement streaming for large responses
- Build tool use and agent loops
- Support multiple programming languages

## TDD

1. Red - Write tests for API calls, streaming, tool use
2. Green - Implement SDK integrations for Python and TypeScript
3. Refactor - Add error handling, retry logic, cost optimization

## Verification

- lint
- format
- targeted tests
- Integration tests with real API (mocked in CI)

## Implementation Checklist

1. Set up authentication with ANTHROPIC_API_KEY
2. Implement single message API calls
3. Implement streaming with final message helper
4. Implement tool use with agentic loop
5. Implement batch processing
6. Add context compaction for long sessions
