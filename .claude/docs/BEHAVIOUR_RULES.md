# Behaviour Rules

Dynamic behaviour rules are optional, user-editable guidance injected into Router/spawn prompts.

## Location

`.claude/context/memory/behaviour.md`

## Format

- One rule per line or short paragraphs.
- Lines starting with `#` are treated as comments and ignored during injection.

## How it is used

- When present and non-empty, the contents are injected into the spawn prompt under the section:
  `## Dynamic behaviour rules`
- If the file is missing or empty, no behaviour rules are injected.

## Notes

This file is intended to be safe to edit by hand. If a future BehaviourAdjustment tool is added,
it will write into this file rather than changing prompts directly.
