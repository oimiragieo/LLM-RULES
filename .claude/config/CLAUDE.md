# Config

Runtime configuration files that control agent behavior, routing, model selection, and tool access. These are JSON files loaded at startup and referenced by hooks, agents, and the routing engine.

## Files

| File                          | Purpose                                                                                                    |
| ----------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `agent-config.json`           | Master agent configuration — default models, tool restrictions, spawn limits per agent type.               |
| `agent-config.json.backup`    | Backup of agent-config.json for recovery.                                                                  |
| `capability-routing.json`     | Maps agent capabilities to routing keywords for semantic matching.                                         |
| `code-index-config.json`      | Code search configuration — embedding model, chunk size, index paths, search weights (BM25 vs semantic).   |
| `intent-feedback.json`        | Stores routing intent feedback for continuous improvement of routing accuracy.                             |
| `model-registry.json`         | Available models and their properties — context window, cost, speed, capability tier.                      |
| `phase-models.json`           | Model assignments per pipeline phase — which model to use for planning, implementation, review, etc.       |
| `presets.json`                | Reusable configuration presets for common task types (quick-fix, deep-research, full-pipeline).            |
| `required-status-checks.json` | CI/CD status checks that must pass before task completion — lint, test, format, validate.                  |
| `routing-prototypes.json`     | Prototype routing patterns used for testing new routing strategies.                                        |
| `skill-index.json`            | Master skill registry — maps skill names to file paths, descriptions, categories, and invocation patterns. |
| `task-output-contracts.json`  | Defines expected output schemas for different task types.                                                  |
| `tool-manifest.json`          | Tool registry — available tools, their descriptions, parameter schemas.                                    |
| `tool-stub-policy.json`       | Policies for tool stubs — which tools can be stubbed in testing, fallback behavior.                        |
| `trusted-sources.json`        | Allowlist of trusted external sources (URLs, repos, APIs) for artifact integration.                        |
