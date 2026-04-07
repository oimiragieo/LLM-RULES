# decisions Archive (2026-04-07)

## ADR-2026-03-13-067: Root-Level Slop Files Are QA Responsibility (2026-03-13)

**Status:** ACCEPTED
**Date:** 2026-03-13
**Trigger:** 19 untracked files accumulated in the project root during the MEGA EPIC session (dump-test.cjs, test-out.txt, errors.json, eslint.json, rename_agent.cjs, revert_rename.cjs, update_frequencies.cjs, update_skill_loops.cjs, update_skill_rigidity.cjs, etc.). The router failed to detect these. User had to manually confront the router about cleanup.

**Decision:** QA agent MUST run `git status -s | grep "^??" | grep -v ".claude/"` as part of its final pipeline check. Any `??` files in the project root (excluding `.claude/` paths) should be flagged as a QA finding. QA must:

1. List all untracked root-level files
2. Categorize them: temp scripts, test outputs, migration scripts, debug files
3. ASK USER before deleting (per file-deletion-safety iron law)
4. Report them as a "workspace hygiene" finding if QA cannot confirm their purpose

**Root Cause:** Developers created temp scripts and test artifacts in project root without cleaning up. QA passed without checking workspace hygiene.

**Consequences:** Adds a "workspace hygiene" check to QA's proactive-audit. QA must NEVER delete untracked files silently — it must list them and report, then ask user. This is distinct from the file-deletion-safety rule which prevents deletion; this ADR mandates QA to _detect_ and _surface_ the problem.