# agent-creator Skill Workflow

1. Step 0: check target existence first.
2. If target exists, route to `agent-updater` (do not create duplicate agents).
3. If target is new, run companion check and research gate (Exa first, fallback WebFetch/arXiv).
4. Generate from template contract via `scripts/main.cjs` (do not create freehand).
5. Add workflow + hook enforcement expectations to agent prompt.
6. Validate integration:
   - `validate-integration.cjs`
   - `generate-agent-registry.cjs`
   - workflow/skill contract validation
7. Update ecosystem references (CLAUDE routing + agent catalogs + memory learnings).
