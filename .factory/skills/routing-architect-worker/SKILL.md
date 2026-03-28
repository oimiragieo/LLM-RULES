---
name: routing-architect-worker
description: Implements hierarchical routing architecture (sub-routers, routing tables, hook updates)
---

# Routing Architect Worker

NOTE: Startup and cleanup are handled by `worker-base`. This skill defines the WORK PROCEDURE.

## When to Use This Skill

Use for features that build the hierarchical routing architecture: creating sub-router agent definitions, building the hierarchical routing table, updating hooks to support domain-based dispatch, and ensuring backward compatibility. Reference the design doc at `.claude/designs/hierarchical-routing-architecture.md`.

## Work Procedure

1. **Read the feature description** — it specifies which part of the hierarchy to build.

2. **Read the design document** — `.claude/designs/hierarchical-routing-architecture.md` is the authoritative design. Follow it exactly for domain groupings, agent assignments, and architecture.

3. **Read existing patterns** — Before creating new files or modifying existing ones:
   - Read 1-2 existing orchestrator agents in `.claude/agents/orchestrators/` for the agent definition pattern
   - Read `.claude/lib/routing/routing-table-core-map.cjs` for the routing table pattern
   - Read `.claude/lib/routing/intent-classifier.cjs` for the classification pattern

4. **Write tests FIRST (red)** — For each component:
   - Sub-router agents: test YAML frontmatter parsing, agent roster completeness, disambiguation rules
   - Routing table: test keyword coverage, domain classification, target count
   - Hook updates: test sub-router dispatch recognition, depth limit, payload contract
   - Feature flag: test on/off/default behavior

5. **Implement (green)** — Build the component following the design doc:
   - Sub-router agents: Create `.md` files in `.claude/agents/orchestrators/` with YAML frontmatter, agent roster, disambiguation rules, and default gateway
   - Routing table: Create `routing-table-hierarchical.cjs` (additive, do NOT modify `routing-table-core-map.cjs`)
   - Feature flag: Check `process.env.HIERARCHICAL_ROUTING` with default `'off'`
   - Hook updates: Modify hooks to check feature flag and branch to hierarchical path

6. **CRITICAL: Preserve all existing agents** — Do NOT modify any file in `.claude/agents/`. Sub-routers are NEW files alongside existing orchestrator agents.

7. **CRITICAL: Feature flag everything** — All new code paths must be gated behind `HIERARCHICAL_ROUTING=on`. When off, behavior must be identical to pre-change.

8. **Run tests** — `node --test tests/lib/routing/` and `pnpm validate:routing`.

9. **Run backward compatibility check** — With `HIERARCHICAL_ROUTING=off`, run `pnpm test:framework` to confirm no regressions.

## Example Handoff

```json
{
  "salientSummary": "Created 9 domain sub-router agent definitions in .claude/agents/orchestrators/. Each includes YAML frontmatter with Task tool, complete agent roster per design doc, default gateway agent, and disambiguation rules for overlapping specializations. Added 15 unit tests covering frontmatter validation, roster completeness, and disambiguation logic.",
  "whatWasImplemented": "9 domain sub-router agent files: domain-router-web-frontend.md (5 agents), domain-router-backend.md (14 agents), domain-router-mobile.md (5 agents), domain-router-ai-ml.md (11 agents), domain-router-infra.md (10 agents), domain-router-security.md (8 agents), domain-router-arch-data.md (11 agents), domain-router-product.md (15 agents), domain-router-niche.md (7 agents). Total 86 domain agents assigned, all 109 agents reachable.",
  "whatWasLeftUndone": "",
  "verification": {
    "commandsRun": [
      {
        "command": "node --test tests/lib/routing/sub-router-agents.test.cjs",
        "exitCode": 0,
        "observation": "15 tests passing: 9 frontmatter checks, 9 roster completeness checks, 5 disambiguation checks"
      },
      {
        "command": "pnpm validate:routing",
        "exitCode": 0,
        "observation": "Routing consistency validated with sub-routers included"
      },
      {
        "command": "HIERARCHICAL_ROUTING=off pnpm test:framework",
        "exitCode": 0,
        "observation": "All framework tests pass with flag off, no regressions"
      }
    ],
    "interactiveChecks": [
      {
        "action": "Verified all 109 agents reachable: union of direct routes + meta-orchestration + sub-router rosters",
        "observed": "109/109 agents covered. No orphaned agents."
      },
      {
        "action": "Verified no agent in multiple sub-routers",
        "observed": "All pairwise intersections empty."
      }
    ]
  },
  "tests": {
    "added": [
      {
        "file": "tests/lib/routing/sub-router-agents.test.cjs",
        "cases": [
          {
            "name": "all 9 sub-router files exist with valid frontmatter",
            "verifies": "VAL-HIER-001, VAL-HIER-002"
          },
          { "name": "each sub-router has complete agent roster", "verifies": "VAL-HIER-003" },
          { "name": "each sub-router declares default gateway", "verifies": "VAL-HIER-004" }
        ]
      }
    ]
  },
  "discoveredIssues": []
}
```

## When to Return to Orchestrator

- The design doc has ambiguities about agent assignment (which domain does an agent belong to?)
- Existing routing hooks cannot accommodate the feature flag cleanly
- Agent registry generation scripts need modification beyond the routing scope
- The hierarchical routing conflicts with an existing orchestrator pattern
