---
description: Extract reusable patterns from current session into memory
disable-model-invocation: true
---

Invoke the context-compressor skill to extract patterns from the current session, then record findings to the appropriate memory files:

1. Review the current session for extractable patterns
2. For error resolution patterns and debugging techniques, append to `.claude/context/memory/learnings.md`
3. For architectural decisions made, append to `.claude/context/memory/decisions.md`
4. For known issues and workarounds discovered, append to `.claude/context/memory/issues.md`
5. Ask user to confirm before writing

Focus on patterns that will save time in future sessions. Skip trivial fixes.
