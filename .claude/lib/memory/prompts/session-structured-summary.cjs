'use strict';

function getSessionStructuredSummaryPrompt(sessionContext) {
  const safeContext = sessionContext ? String(sessionContext) : '';
  const template = `Analyze the following session and generate a structured summary.

Session content:
{{ messages }}

Please output the summary directly in Markdown format:

# Session Summary

**One-sentence overview**: [Topic]: [Intent] | [Result] | [Status: Completed/In Progress/Pending]

## Analysis
Chronological conversation progress (2-4 key milestones):
1. ...
2. ...

## Primary Request and Intent
User's core objectives:
- ...

## Key Concepts
Key technical concepts/terms:
- ...

## Context References
Context referenced in the session (project paths, file paths, tool names, skill names, viking:// URIs, external links, etc.):
- ...

## Errors and Fixes
Problems encountered and solutions (write "None" if none):
- Problem → Solution

## User Messages
Key user quotes (preserve important expressions):
- "..."

## Pending Tasks
Incomplete tasks (write "None" if none):
- ...

## Current Work
Work in progress at the end of the conversation.

## Next Step
Recommended next actions.

---

Notes:
- Analysis should reflect the complete timeline
- User Messages should preserve original quotes
- Keep overall length within 1000 words
`;

  return {
    system: 'You generate structured session summaries for a memory system.',
    user: template.replace('{{ messages }}', safeContext),
  };
}

module.exports = { getSessionStructuredSummaryPrompt };
