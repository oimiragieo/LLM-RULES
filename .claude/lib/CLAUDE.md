# Library (lib/)

Shared JavaScript/CJS modules consumed by hooks, scripts, agents, and tools. These are the building blocks of the agent-studio framework. All modules use CommonJS (`.cjs`) for hook compatibility.

## Module Groups

### Core Infrastructure
| Directory | Files | Purpose |
|-----------|-------|---------|
| `routing/` | 30 | **Routing engine** — routing tables (flat + hierarchical), semantic embeddings, keyword matching, model selection, domain router logic. |
| `memory/` | 53 | **Memory system** — STM/MTM/LTM tiers, LanceDB vector store, memory pruning, consolidation, query, and retrieval. |
| `utils/` | 85 | **Utility belt** — safe JSON parsing, file helpers, path normalization, retry logic, template rendering, hash functions. |
| `config/` | 2 | Configuration loading — `config.yaml` parser, env var resolution. |

### Agent Orchestration
| Directory | Files | Purpose |
|-----------|-------|---------|
| `orchestration/` | 18 | Multi-agent orchestration — pipeline coordination, phase gates, approval workflows. |
| `spawn/` | 10 | Agent spawning — worktree creation, context injection, spawn memory management. |
| `agents/` | 2 | Agent configuration — schema validation, capability card parsing. |
| `consensus/` | 1 | Byzantine consensus voting for multi-agent decisions. |

### Code Intelligence
| Directory | Files | Purpose |
|-----------|-------|---------|
| `code-indexing/` | 28 | **Code search** — BM25, semantic embeddings (LanceDB/FastEmbed), hybrid search, Merkle tree indexing. |
| `tools/` | 14 | Tool registration — manifest loading, tool discovery, tool stub policies. |
| `discovery/` | 1 | Artifact discovery — file scanning, registry building. |

### Quality & Safety
| Directory | Files | Purpose |
|-----------|-------|---------|
| `validation/` | 4 | Schema validation — JSON schema checks, contract enforcement. |
| `verification/` | 2 | Output verification — goal-backward checks, completion validation. |
| `safety/` | 1 | Safety checks — input sanitization, injection prevention. |
| `guardrails/` | 1 | Guardrail enforcement — output filtering, policy checks. |
| `qa/` | 3 | QA criteria — test coverage analysis, quality scoring. |
| `quality/` | 1 | Code quality metrics — complexity analysis. |
| `review/` | 4 | Code review — multi-layer review orchestration. |

### Workflow & Lifecycle
| Directory | Files | Purpose |
|-----------|-------|---------|
| `workflow/` | 25 | Workflow engine — state machines, phase advancement, workflow execution. |
| `plan/` | 2 | Plan management — progress tracking, plan file updates. |
| `state/` | 1 | State management — persistent state across sessions. |
| `events/` | 3 | Event system — publish/subscribe, event logging. |
| `hooks/` | 1 | Hook utilities — helper functions for hook scripts. |

### DevOps & Operations
| Directory | Files | Purpose |
|-----------|-------|---------|
| `monitoring/` | 15 | Monitoring — health checks, SLO tracking, alert management, metrics collection. |
| `metrics/` | 5 | Metrics — token counting, cost estimation, performance tracking. |
| `heartbeat/` | 1 | Heartbeat — liveness probes, health status. |
| `diagnostics/` | 6 | Diagnostics — debug logging, session analysis, error reporting. |
| `self-healing/` | 1 | Self-healing — automatic recovery from known failure patterns. |
| `readiness/` | 5 | Readiness checks — production readiness reviews, deployment gates. |
| `runtime/` | 1 | Runtime utilities — process management, environment detection. |

### External Integration
| Directory | Files | Purpose |
|-----------|-------|---------|
| `a2a/` | 7 | Agent-to-agent protocol — A2A server, client, message passing. |
| `github/` | 5 | GitHub integration — PR creation, issue management, Actions. |
| `git/` | 1 | Git operations — commit, branch, worktree helpers. |
| `clients/` | 1 | External API clients — HTTP wrappers, auth helpers. |
| `export/` | 1 | Export utilities — data format conversion. |
| `plugins/` | 6 | Plugin system — extension loading, plugin lifecycle. |

### Framework Evolution
| Directory | Files | Purpose |
|-----------|-------|---------|
| `evolution/` | 6 | Evolution engine — capability gap detection, evolution queue, artifact creation. |
| `creators/` | 6 | Creator utilities — skill/agent/hook/workflow creation helpers. |
| `creation/` | 1 | Creation pipeline — feasibility gates, creation workflow. |
| `artifacts/` | 1 | Artifact management — manifests, dependency graphs. |

### Specialized
| Directory | Files | Purpose |
|-----------|-------|---------|
| `reflection/` | 2 | Reflection system — RECE loop, output scoring, pattern extraction. |
| `mission/` | 13 | Mission system — long-running task orchestration, mission state. |
| `ml/` | 1 | ML utilities — model loading, inference helpers. |
| `compression/` | 1 | Context compression — token reduction, evidence preservation. |
| `worktree/` | 1 | Worktree management — creation, cleanup, isolation. |
| `workers/` | 6 | Worker pool — parallel task execution, thread management. |
| `context/` | 4 | Context management — context window tracking, budget enforcement. |
| `ui/` | 1 | UI utilities — terminal output formatting. |
| `services/` | 2 | Service layer — shared service abstractions. |
