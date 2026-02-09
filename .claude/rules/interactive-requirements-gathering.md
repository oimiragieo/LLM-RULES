# Interactive Requirements Gathering Rules

## Core Principles

- Ask ONE question at a time (never batch questions)
- Classify questions as Additive (multi-select) or Exclusive (single choice)
- Always include "D) Type your own" and "E) Auto-generate" options
- Use gathered **answers** as source of truth (not option text)
- Wait for user response before proceeding

## Input Requirements

- Clear section/goal announcement before questioning
- User willingness to answer structured questions
- Ability to handle A/B/C/D/E response format

## Output Standards

- Generated documents use ONLY selected answers (not all options)
- State persistence saved to resume interrupted workflows
- User confirmation loop after generation (Approve or Suggest Changes)
- Follow-up workflow suggestions (next steps)

## Workflow

1. **Introduction**: Announce section and questioning intent
2. **Sequential Questions**: One at a time with classification
3. **Handle Responses**: Process D (custom) and E (auto-generate) specially
4. **Generate Content**: Use selected answers ONLY
5. **Confirmation Loop**: Present for review, iterate until approved

## Anti-Patterns

- Asking multiple questions at once
- Including unselected option text in generated content
- Skipping confirmation step
- Assuming answers without asking
- Using technical jargon without explanation

## Integration Points

- Maps to AskUserQuestion tool (with multiSelect field)
- Feeds into document generators (spec-init, prd-generator)
- State persistence for long sessions
- Context-driven-development integration
