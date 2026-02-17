---
disable-model-invocation: true
---

Invoke the `medusa-security` skill and run the deterministic review entry point:

```bash
node .claude/skills/medusa-security/scripts/security-review.cjs
```

Then summarize findings from:

`/.claude/context/reports/security-review-medusa-scan-2026-02-17.md`

Do not use recursive `Glob` patterns for this command.
