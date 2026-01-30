# Error Logging System Architecture Diagrams

**Document:** Error Logging System Architecture
**Date:** 2026-01-29
**Related Design:** `.claude/context/artifacts/error-logging-system-design.md`

---

## 1. High-Level System Architecture

```mermaid
flowchart TB
    subgraph Capture["Error Capture Layer"]
        H1[Hook Failures<br/>PreToolUse/PostToolUse]
        H2[Tool Failures<br/>Bash exit != 0]
        H3[Validation Errors<br/>Schema violations]
        H4[Agent Failures<br/>TaskUpdate errors]
        H5[Memory Errors<br/>File I/O failures]
    end

    subgraph Processing["Error Processing Layer"]
        C1[Error Classifier]
        C2[Severity Evaluator]
        C3[Context Enricher]
        C4[Sensitive Data Masker]
        C5[Correlation Builder]
    end

    subgraph Storage["Error Storage Layer"]
        S1[errors.jsonl<br/>Real-time append]
        S2[error-report-YYYY-MM-DD.json<br/>Daily aggregation]
        S3[error-patterns.json<br/>Pattern tracking]
    end

    subgraph Consumers["Error Consumers"]
        R1[Reflection Workflow]
        R2[Anomaly Detector]
        R3[Error Dashboard CLI]
        R4[Self-Healing Triggers]
    end

    H1 --> C1
    H2 --> C1
    H3 --> C1
    H4 --> C1
    H5 --> C1

    C1 --> C2
    C2 --> C3
    C3 --> C4
    C4 --> C5

    C5 --> S1
    S1 --> S2
    S1 --> S3

    S1 --> R1
    S2 --> R2
    S3 --> R3
    S1 --> R4
```

---

## 2. Detailed Error Flow

```mermaid
flowchart TB
    subgraph AgentExecution["Agent Execution"]
        A1[Router spawns Agent]
        A2[Agent executes Tools]
        A3[Agent completes Task]
    end

    subgraph HookLayer["Hook Layer"]
        H1[PreToolUse Hooks]
        H2[PostToolUse Hooks]
        H3[error-tracker.cjs]
        H4[error-capture.cjs]
    end

    subgraph ErrorProcessing["Error Processing"]
        E1[Error Classifier]
        E2[Severity Evaluator]
        E3[Sensitive Data Masker]
        E4[Correlation Builder]
        E5[Context Enricher]
    end

    subgraph ErrorStorage["Error Storage"]
        S1[errors.jsonl<br/>Real-time append]
        S2[Daily Reports<br/>JSON aggregation]
        S3[Pattern Tracker<br/>Recurring patterns]
    end

    subgraph EventSystem["Event System"]
        EV1[EventBus]
        EV2[AGENT_FAILED event]
        EV3[TOOL_FAILED event]
    end

    subgraph ReflectionSystem["Reflection System"]
        R1[Reflection Queue]
        R2[Reflection Agent]
        R3[Memory Updates]
    end

    subgraph Monitoring["Monitoring & Dashboard"]
        M1[error-report.cjs CLI]
        M2[Anomaly Detector]
        M3[Self-Healing Triggers]
    end

    A1 --> A2
    A2 --> H1
    H1 --> A2
    A2 --> H2
    H2 --> H3
    H3 --> H4

    H4 --> E1
    E1 --> E2
    E2 --> E3
    E3 --> E4
    E4 --> E5

    E5 --> S1
    S1 --> S2
    S1 --> S3

    E5 --> EV1
    EV1 --> EV2
    EV1 --> EV3

    S1 --> R1
    R1 --> R2
    R2 --> R3

    S2 --> M1
    S3 --> M2
    M2 --> M3

    A2 -.-> A3
```

---

## 3. Error Categories and Severity Matrix

```mermaid
flowchart LR
    subgraph Categories["Error Categories"]
        direction TB
        CAT1[SECURITY_VIOLATION]
        CAT2[EXECUTION_ERROR]
        CAT3[MEMORY_ERROR]
        CAT4[TOOL_FAILURE]
        CAT5[VALIDATION_ERROR]
        CAT6[HOOK_FAILURE]
        CAT7[TIMEOUT_ERROR]
        CAT8[RESOURCE_ERROR]
    end

    subgraph Severity["Severity Levels"]
        direction TB
        SEV1[CRITICAL]
        SEV2[HIGH]
        SEV3[MEDIUM]
        SEV4[LOW]
    end

    CAT1 --> SEV1
    CAT2 --> SEV2
    CAT3 --> SEV2
    CAT4 --> SEV3
    CAT5 --> SEV3
    CAT6 --> SEV2
    CAT7 --> SEV3
    CAT8 --> SEV2
```

---

## 4. Reflection Workflow Integration

```mermaid
sequenceDiagram
    participant Agent
    participant ErrorCapture
    participant ErrorLog
    participant ReflectionQueue
    participant ReflectionAgent
    participant Memory

    Agent->>ErrorCapture: Tool/Task fails
    ErrorCapture->>ErrorCapture: Mask sensitive data
    ErrorCapture->>ErrorCapture: Generate correlation IDs
    ErrorCapture->>ErrorLog: Write error entry (errors.jsonl)
    ErrorCapture->>ReflectionQueue: Queue for reflection

    Note over ReflectionQueue: Batch errors by session/task

    ReflectionQueue->>ReflectionAgent: Process error batch
    ReflectionAgent->>ErrorLog: Read error context
    ReflectionAgent->>ReflectionAgent: Analyze patterns
    ReflectionAgent->>ReflectionAgent: Generate learnings
    ReflectionAgent->>Memory: Write to learnings.md
    ReflectionAgent->>ErrorLog: Mark errors as reflected
```

---

## 5. Correlation Across Parallel Agents

```mermaid
flowchart TB
    subgraph Session["Claude Code Session (CLAUDE_SESSION_ID)"]
        direction TB

        subgraph Task1["Task #1"]
            A1[Developer Agent]
            E1[Error ERR-A1B2]
        end

        subgraph Task2["Task #2"]
            A2[QA Agent]
            E2[Error ERR-C3D4]
        end

        subgraph Task3["Task #3"]
            A3[Security Agent]
            E3[Error ERR-E5F6]
        end
    end

    subgraph Correlation["Correlation Layer"]
        COR1[Session ID: sess-123]
        COR2[Trace ID: trace-abc]
        COR3[Temporal Proximity<br/>5 second window]
    end

    subgraph ErrorLog["Correlated Error Log"]
        LOG1["ERR-A1B2<br/>session: sess-123<br/>related: [ERR-C3D4]"]
        LOG2["ERR-C3D4<br/>session: sess-123<br/>parent: ERR-A1B2"]
        LOG3["ERR-E5F6<br/>session: sess-123"]
    end

    A1 --> E1
    A2 --> E2
    A3 --> E3

    E1 --> COR1
    E2 --> COR1
    E3 --> COR1

    COR1 --> LOG1
    COR1 --> LOG2
    COR1 --> LOG3

    E1 -.->|cascade| E2
```

---

## 6. Error Storage Hierarchy

```mermaid
flowchart TB
    subgraph Active["Active Storage (7 days)"]
        direction TB
        A1[errors.jsonl<br/>Real-time, append-only]
        A2[error-patterns.json<br/>Pattern tracking]
    end

    subgraph Daily["Daily Aggregation"]
        direction TB
        D1[error-report-2026-01-29.json]
        D2[error-report-2026-01-28.json]
        D3[error-report-2026-01-27.json]
    end

    subgraph Archive["Archive (30 days, compressed)"]
        direction TB
        AR1[archive/2026-01/errors-2026-01-01.jsonl.gz]
        AR2[archive/2026-01/error-report-2026-01-01.json.gz]
        AR3[archive/2026-01/monthly-summary-2026-01.json]
    end

    A1 -->|EOD rollup| D1
    A1 -->|7 day rotation| AR1
    D1 -->|30 day retention| AR2
    D2 --> AR2
    D3 --> AR2

    AR1 -->|aggregate| AR3
```

---

## 7. Sensitive Data Masking Flow

```mermaid
flowchart LR
    subgraph Input["Raw Error Data"]
        I1["password=secret123"]
        I2["Bearer eyJhbGci..."]
        I3["AKIA1234EXAMPLE"]
        I4["Normal error text"]
    end

    subgraph Patterns["Masking Patterns"]
        P1[Password Regex]
        P2[JWT Regex]
        P3[AWS Key Regex]
        P4[Pass-through]
    end

    subgraph Output["Masked Output"]
        O1["password=[REDACTED]"]
        O2["Bearer [REDACTED]"]
        O3["AKIA[REDACTED]"]
        O4["Normal error text"]
    end

    I1 --> P1
    I2 --> P2
    I3 --> P3
    I4 --> P4

    P1 --> O1
    P2 --> O2
    P3 --> O3
    P4 --> O4
```

---

## 8. Circuit Breaker for Error Logging

```mermaid
stateDiagram-v2
    [*] --> CLOSED

    CLOSED --> OPEN: failures >= threshold (5)
    CLOSED --> CLOSED: logging success

    OPEN --> HALF_OPEN: cooldown elapsed (60s)
    OPEN --> OPEN: cooldown not elapsed

    HALF_OPEN --> CLOSED: logging success
    HALF_OPEN --> OPEN: logging failure

    note right of CLOSED
        Normal operation
        All errors logged
    end note

    note right of OPEN
        Logging disabled
        Fallback to stderr
    end note

    note right of HALF_OPEN
        Test single log
        Determine recovery
    end note
```

---

## 9. File Structure

```
.claude/context/artifacts/error-reports/
|
+-- errors.jsonl                    # Real-time append-only log
+-- error-report-2026-01-29.json    # Daily aggregated report
+-- error-report-2026-01-28.json
+-- error-patterns.json             # Recurring pattern tracking
|
+-- archive/
    +-- 2026-01/
        +-- errors-2026-01-01.jsonl.gz
        +-- error-report-2026-01-01.json.gz
        +-- monthly-summary-2026-01.json
```

---

## 10. Component Dependencies

```mermaid
flowchart TB
    subgraph NewComponents["New Components to Create"]
        NC1[error-capture.cjs]
        NC2[sensitive-data-masker.cjs]
        NC3[error-report.cjs CLI]
        NC4[error-schema.json]
    end

    subgraph ExistingComponents["Existing Components to Enhance"]
        EC1[error-tracker.cjs]
        EC2[error-recovery-reflection.cjs]
        EC3[metrics-collector.cjs]
        EC4[unified-reflection-handler.cjs]
    end

    subgraph SharedLibraries["Shared Libraries"]
        SL1[hook-input.cjs]
        SL2[project-root.cjs]
        SL3[safe-json.cjs]
        SL4[atomic-write.cjs]
    end

    NC1 --> SL1
    NC1 --> SL2
    NC1 --> NC2
    NC1 --> NC4

    NC3 --> NC4
    NC3 --> SL3

    EC1 --> NC1
    EC2 --> NC1
    EC4 --> NC1
```

---

## Viewing Instructions

These diagrams use Mermaid syntax. To view them:

1. **GitHub/GitLab:** Renders Mermaid automatically in markdown preview
2. **VS Code:** Install "Markdown Preview Mermaid Support" extension
3. **Online:** Paste code at https://mermaid.live/
4. **CLI:** Use `mmdc` (Mermaid CLI) to generate PNG/SVG

---

_Generated by Architect Agent | 2026-01-29_
