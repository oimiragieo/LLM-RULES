# Hook System Flow Diagram

> Generated: 2026-01-27
> Purpose: Visualizes the hook execution lifecycle and categories

## Overview

This diagram shows how hooks intercept tool calls at various lifecycle points (UserPromptSubmit, PreToolUse, PostToolUse, SessionEnd) to enforce safety, routing, and quality rules.

## Hook Execution Flow

```mermaid
flowchart TB
    subgraph UserInput["User Input Phase"]
        UP[User Prompt]
        UPH["UserPromptSubmit Hooks<br/>(1 unified hook)"]
    end

    subgraph PreExecution["Pre-Execution Phase"]
        direction TB
        TOOL[Tool Call<br/>Requested]
        PRE{"PreToolUse<br/>Hooks"}

        subgraph PreHooks["PreToolUse Hook Categories"]
            direction LR
            BASH_V["Bash Hooks<br/>- windows-null-sanitizer<br/>- bash-command-validator"]
            ROUTE["Routing Hooks<br/>- routing-guard<br/>- pre-task-unified"]
            SAFE["Safety Hooks<br/>- file-placement-guard<br/>- tdd-check"]
            EVOL["Evolution Hooks<br/>- unified-evolution-guard<br/>- plan-evolution-guard"]
            VALID["Validation Hooks<br/>- validate-skill-invocation"]
        end
    end

    subgraph Execution["Execution Phase"]
        EXEC[Tool Executes]
        RESULT[Tool Result]
    end

    subgraph PostExecution["Post-Execution Phase"]
        POST{"PostToolUse<br/>Hooks"}

        subgraph PostHooks["PostToolUse Hook Categories"]
            direction LR
            HEAL["Self-Healing<br/>- anomaly-detector<br/>- auto-rerouter"]
            MEM["Memory<br/>- format-memory<br/>- enforce-claude-md"]
            TASK["Task Tracking<br/>- post-task-unified<br/>- task-update-tracker"]
            REFL["Reflection<br/>- task-completion-reflection<br/>- error-recovery-reflection"]
        end
    end

    subgraph SessionEnd["Session End Phase"]
        SES{"SessionEnd<br/>Hooks"}

        subgraph SesHooks["SessionEnd Hook Categories"]
            direction LR
            SES_MEM["Memory<br/>- session-end-recorder"]
            SES_REF["Reflection<br/>- session-end-reflection<br/>- reflection-queue-processor"]
        end
    end

    subgraph Decision["Hook Decision"]
        ALLOW{Allow?}
        BLOCK[BLOCK<br/>with error]
        WARN[WARN<br/>but allow]
        PASS[PASS<br/>continue]
    end

    %% Flow
    UP --> UPH
    UPH --> TOOL
    TOOL --> PRE

    PRE --> BASH_V
    PRE --> ROUTE
    PRE --> SAFE
    PRE --> EVOL
    PRE --> VALID

    BASH_V --> ALLOW
    ROUTE --> ALLOW
    SAFE --> ALLOW
    EVOL --> ALLOW
    VALID --> ALLOW

    ALLOW -->|No| BLOCK
    ALLOW -->|Warn| WARN
    ALLOW -->|Yes| PASS
    WARN --> EXEC
    PASS --> EXEC

    EXEC --> RESULT
    RESULT --> POST

    POST --> HEAL
    POST --> MEM
    POST --> TASK
    POST --> REFL

    HEAL --> SES
    MEM --> SES
    TASK --> SES
    REFL --> SES

    SES --> SES_MEM
    SES --> SES_REF

    %% Styling
    classDef input fill:#e1f5fe,stroke:#01579b,stroke-width:2px
    classDef pre fill:#fff3e0,stroke:#e65100,stroke-width:2px
    classDef exec fill:#e8f5e9,stroke:#1b5e20,stroke-width:2px
    classDef post fill:#f3e5f5,stroke:#4a148c,stroke-width:2px
    classDef session fill:#fce4ec,stroke:#880e4f,stroke-width:2px
    classDef decision fill:#fff8e1,stroke:#ff6f00,stroke-width:2px
    classDef block fill:#ffcdd2,stroke:#b71c1c,stroke-width:2px
    classDef warn fill:#fff9c4,stroke:#f57f17,stroke-width:2px
    classDef pass fill:#c8e6c9,stroke:#2e7d32,stroke-width:2px

    class UP,UPH input
    class TOOL,PRE,BASH_V,ROUTE,SAFE,EVOL,VALID pre
    class EXEC,RESULT exec
    class POST,HEAL,MEM,TASK,REFL post
    class SES,SES_MEM,SES_REF session
    class ALLOW decision
    class BLOCK block
    class WARN warn
    class PASS pass
```

## Hook Categories and Files

### UserPromptSubmit Hooks (1 hook)

Triggered when user submits a prompt, before any processing.

| Hook                      | Purpose                                         |
| ------------------------- | ----------------------------------------------- |
| `user-prompt-unified.cjs` | Classifies complexity, initializes router state |

### PreToolUse Hooks (By Matcher)

#### Bash Matcher

| Hook                         | Purpose                      | Enforcement |
| ---------------------------- | ---------------------------- | ----------- |
| `windows-null-sanitizer.cjs` | Sanitizes Windows null bytes | Block       |
| `bash-command-validator.cjs` | Validates shell commands     | Block       |

#### Glob/Grep/WebSearch Matcher

| Hook                | Purpose                  | Enforcement |
| ------------------- | ------------------------ | ----------- |
| `routing-guard.cjs` | Router tool restrictions | Block       |

#### Edit/Write/NotebookEdit Matcher

| Hook                          | Purpose                       | Enforcement    |
| ----------------------------- | ----------------------------- | -------------- |
| `file-placement-guard.cjs`    | Enforces file placement rules | Warn (default) |
| `routing-guard.cjs`           | Router tool restrictions      | Block          |
| `tdd-check.cjs`               | Enforces TDD workflow         | Warn           |
| `plan-evolution-guard.cjs`    | Validates plan modifications  | Warn           |
| `unified-evolution-guard.cjs` | Enforces EVOLVE workflow      | Block          |

#### Read Matcher

| Hook                            | Purpose                     | Enforcement |
| ------------------------------- | --------------------------- | ----------- |
| `validate-skill-invocation.cjs` | Validates skill invocations | Advisory    |

#### TaskCreate Matcher

| Hook                | Purpose                   | Enforcement |
| ------------------- | ------------------------- | ----------- |
| `routing-guard.cjs` | Planner-first enforcement | Block       |

#### Task Matcher

| Hook                   | Purpose                              | Enforcement |
| ---------------------- | ------------------------------------ | ----------- |
| `pre-task-unified.cjs` | Consolidated PreToolUse(Task) checks | Block       |

### PostToolUse Hooks (By Matcher)

#### All Tools (Empty Matcher)

| Hook                   | Purpose                    |
| ---------------------- | -------------------------- |
| `anomaly-detector.cjs` | Detects anomalous patterns |

#### Task Matcher

| Hook                    | Purpose                        |
| ----------------------- | ------------------------------ |
| `auto-rerouter.cjs`     | Reroutes failed tasks          |
| `post-task-unified.cjs` | Consolidated PostToolUse(Task) |

#### Edit/Write Matcher

| Hook                           | Purpose                         |
| ------------------------------ | ------------------------------- |
| `format-memory.cjs`            | Formats memory file writes      |
| `enforce-claude-md-update.cjs` | Ensures CLAUDE.md stays updated |

#### TaskUpdate Matcher

| Hook                             | Purpose                         |
| -------------------------------- | ------------------------------- |
| `task-update-tracker.cjs`        | Tracks task status changes      |
| `task-completion-reflection.cjs` | Queues reflection on completion |

#### Bash Matcher

| Hook                            | Purpose                     |
| ------------------------------- | --------------------------- |
| `error-recovery-reflection.cjs` | Queues reflection on errors |

### SessionEnd Hooks

| Hook                             | Purpose                           |
| -------------------------------- | --------------------------------- |
| `session-end-recorder.cjs`       | Records session summary to memory |
| `session-end-reflection.cjs`     | Queues session reflection         |
| `reflection-queue-processor.cjs` | Processes queued reflections      |

## Hook Directory Structure

```
hooks/
├── evolution/           # Evolution workflow enforcement (6 hooks)
│   ├── conflict-detector.cjs
│   ├── evolution-audit.cjs
│   ├── evolution-state-guard.cjs
│   ├── evolution-trigger-detector.cjs
│   ├── quality-gate-validator.cjs
│   ├── research-enforcement.cjs
│   └── unified-evolution-guard.cjs
├── memory/              # Memory management (active hooks)
│   ├── format-memory.cjs
│   ├── memory-health-check.cjs
│   ├── session-end-recorder.cjs
│   └── (archived: extract-workflow-learnings.cjs, session-memory-extractor.cjs)
├── reflection/          # Reflection queue (4 hooks)
│   ├── error-recovery-reflection.cjs
│   ├── reflection-queue-processor.cjs
│   ├── session-end-reflection.cjs
│   └── task-completion-reflection.cjs
├── routing/             # Router enforcement (14 hooks)
│   ├── agent-context-pre-tracker.cjs
│   ├── agent-context-tracker.cjs
│   ├── documentation-routing-guard.cjs
│   ├── post-task-unified.cjs
│   ├── pre-task-unified.cjs
│   ├── router-enforcer.cjs
│   ├── router-mode-reset.cjs
│   ├── router-state.cjs
│   ├── routing-guard.cjs
│   ├── task-completion-guard.cjs
│   ├── task-update-tracker.cjs
│   ├── user-prompt-unified.cjs
│   └── _legacy/         # Consolidated hooks (reference only)
├── safety/              # Safety guardrails (14 hooks)
│   ├── bash-command-validator.cjs
│   ├── enforce-claude-md-update.cjs
│   ├── file-placement-guard.cjs
│   ├── router-write-guard.cjs
│   ├── security-trigger.cjs
│   ├── tdd-check.cjs
│   ├── validate-skill-invocation.cjs
│   ├── windows-null-sanitizer.cjs
│   └── validators/      # Command validators
├── self-healing/        # Self-healing (3 hooks)
│   ├── anomaly-detector.cjs
│   ├── auto-rerouter.cjs
│   └── loop-prevention.cjs
├── session/             # Session lifecycle (1 hook)
│   └── memory-reminder.cjs
└── validation/          # Input/output validation (1 hook)
    └── plan-evolution-guard.cjs
```

## Enforcement Modes

Most hooks support three enforcement modes via environment variables:

| Mode    | Behavior                       | When to Use                       |
| ------- | ------------------------------ | --------------------------------- |
| `block` | Prevents action, returns error | Production (default for security) |
| `warn`  | Logs warning, allows action    | Development, debugging            |
| `off`   | Disables hook entirely         | Emergency override only           |

Example: `PLANNER_FIRST_ENFORCEMENT=warn claude`
