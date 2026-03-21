# Executable Workflow Patterns for AI Agent Systems

**Research Report**
**Date**: 2026-01-25
**Researcher**: RESEARCHER Agent
**Sources Consulted**: 15+ (Exa searches, documentation, code examples)

---

## Executive Summary

This research synthesizes best practices from production AI agent frameworks (LangGraph, CrewAI, Temporal, Strands Agents) and distributed systems patterns (Saga, Event Sourcing) to inform the design of executable workflows for our creator skills system. The key finding is that **state machine-based workflows with validation gates, compensating transactions, and explicit state persistence** are the gold standard for production systems.

---

## 1. State Machine Patterns for Workflows

### 1.1 Core Concept: Graphs Over Chains

Modern AI agent frameworks have converged on **graph-based state machines** rather than simple chains:

| Framework | State Model | Key Insight |
|-----------|-------------|-------------|
| **LangGraph** | `StateGraph` with typed state | Explicit nodes + edges with conditional routing |
| **CrewAI** | `Process.sequential` / `Process.hierarchical` | Task-based with agent delegation |
| **Temporal** | Workflow + Activities | Durable execution with replay |
| **Strands Agents** | Agent Graph | Wired expert agents with explicit transitions |

**LangGraph State Machine Example** (from research):
```python
from langgraph.graph import StateGraph, START, END

class WorkflowState(TypedDict):
    current_phase: str
    research_complete: bool
    validation_passed: bool
    artifacts_created: list[str]

# Define the graph
workflow = StateGraph(WorkflowState)

# Add nodes (steps)
workflow.add_node("research", research_step)
workflow.add_node("validate", validation_step)
workflow.add_node("create", creation_step)
workflow.add_node("verify", verification_step)

# Add edges with conditions
workflow.add_edge(START, "research")
workflow.add_conditional_edges(
    "research",
    should_proceed_to_create,
    {"validated": "create", "needs_more": "research", "failed": END}
)
workflow.add_edge("create", "verify")
workflow.add_edge("verify", END)
```

### 1.2 State Persistence Patterns

**Critical Insight**: Production workflows MUST persist state to survive interruptions.

| Pattern | Implementation | Use Case |
|---------|----------------|----------|
| **Checkpointing** | Save state after each step | Long-running workflows |
| **Event Sourcing** | Log all state transitions | Audit trails, replay |
| **Snapshot + Log** | Periodic snapshots + incremental logs | Balance of speed + durability |

**Temporal's Approach** (gold standard):
- Workflows are **deterministic** - same inputs = same outputs
- State is **event-sourced** - every transition logged
- Activities (side effects) are **retried automatically**
- Workflows can **sleep for years** and resume

**Recommendation for Our System**:
```json
// .claude/context/workflow-state.json
{
  "workflowId": "evolve-agent-creator-2026-01-25",
  "currentPhase": "obtain",
  "phaseHistory": [
    { "phase": "evaluate", "completedAt": "...", "result": "passed" },
    { "phase": "validate", "completedAt": "...", "result": "no_conflicts" }
  ],
  "stateSnapshot": {
    "researchQueries": ["query1", "query2"],
    "sourcesConsulted": 3,
    "artifactPath": null
  },
  "canResume": true
}
```

---

## 2. Step Execution with Validation Gates

### 2.1 Gate Pattern

Every step should have **entry conditions** and **exit validation**:

```
┌─────────────────────────────────────────────────────┐
│                    STEP: Research                    │
├─────────────────────────────────────────────────────┤
│ ENTRY GATE:                                         │
│   - Previous phase completed                        │
│   - No blocking errors                              │
│                                                     │
│ EXECUTION:                                          │
│   - Execute 3+ Exa searches                         │
│   - Consult 3+ external sources                     │
│   - Generate research report                        │
│                                                     │
│ EXIT GATE (Validation):                             │
│   - researchQueries.length >= 3                     │
│   - sourcesConsulted >= 3                           │
│   - researchReport exists                           │
│   - researchReport.wordCount >= 500                 │
└─────────────────────────────────────────────────────┘
         │
         ▼ (only if EXIT GATE passes)
┌─────────────────────────────────────────────────────┐
│                    STEP: Create                      │
└─────────────────────────────────────────────────────┘
```

### 2.2 Validation Approaches

| Approach | Description | Best For |
|----------|-------------|----------|
| **Schema Validation** | JSON Schema for outputs | Structured data |
| **Assertions** | Programmatic checks | Business rules |
| **LLM-as-Judge** | AI evaluates quality | Content quality |
| **Human-in-the-Loop** | Manual approval | High-risk steps |

**CrewAI's Conditional Task Pattern**:
```python
from crewai.tasks.conditional_task import ConditionalTask

def is_research_sufficient(output: TaskOutput) -> bool:
    return len(output.pydantic.sources) >= 3

conditional_task = ConditionalTask(
    description="Fetch more sources if insufficient",
    condition=is_research_sufficient,  # Skip if True
    agent=researcher
)
```

### 2.3 Recommended Validation Schema

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "title": "WorkflowStepValidation",
  "type": "object",
  "properties": {
    "stepId": { "type": "string" },
    "entryConditions": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "condition": { "type": "string" },
          "operator": { "enum": ["equals", "gte", "lte", "exists", "notEmpty"] },
          "value": {}
        }
      }
    },
    "exitValidation": {
      "type": "object",
      "properties": {
        "schema": { "type": "object" },
        "assertions": { "type": "array" },
        "llmCheck": { "type": "boolean" }
      }
    }
  }
}
```

---

## 3. Workflow Composition and Chaining

### 3.1 Patterns for Workflow Triggering

| Pattern | Description | Example |
|---------|-------------|---------|
| **Nested Workflows** | Parent spawns child workflow | EVOLVE triggers agent-creator |
| **Workflow Handoff** | One workflow completes, triggers another | Research -> Creation -> Verification |
| **Fan-Out/Fan-In** | Parallel sub-workflows, merge results | Multi-agent parallel research |
| **Event-Driven** | Workflows react to events | On artifact created, trigger tests |

**AWS Strands Multi-Agent Pattern**:
```
Manager Agent
    ├── Tool: spawn_researcher(topic)
    ├── Tool: spawn_validator(artifact)
    └── Tool: spawn_publisher(artifact)

# Manager orchestrates, specialists execute
```

**LangGraph Subgraph Composition**:
```python
# Define sub-workflows as separate graphs
research_graph = StateGraph(ResearchState)
creation_graph = StateGraph(CreationState)

# Compose into parent workflow
parent_graph = StateGraph(ParentState)
parent_graph.add_node("research", research_graph.compile())
parent_graph.add_node("creation", creation_graph.compile())
parent_graph.add_edge("research", "creation")
```

### 3.2 Recommended Composition for Creator Skills

```yaml
# evolve-workflow.yaml
name: EVOLVE
description: Self-evolution workflow for creating new artifacts

phases:
  evaluate:
    description: Confirm need for new artifact
    triggers: ["user_request", "router_no_match"]
    next: validate

  validate:
    description: Check for conflicts and duplicates
    validation:
      - no_name_conflicts
      - no_duplicate_functionality
    next: obtain

  obtain:
    description: Research phase (MANDATORY)
    subWorkflow: research-synthesis
    validation:
      - research_queries >= 3
      - sources_consulted >= 3
      - report_generated
    next: lock

  lock:
    description: Create artifact with schema validation
    subWorkflow: "{artifact-type}-creator"  # Dynamic: agent-creator, skill-creator, etc.
    validation:
      - schema_valid
      - required_fields_present
    next: verify

  verify:
    description: Quality verification
    validation:
      - syntax_valid
      - integration_test_passed
    next: enable

  enable:
    description: Register and activate artifact
    actions:
      - update_catalog
      - notify_router
    next: COMPLETE
```

---

## 4. Error Handling and Rollback

### 4.1 The Saga Pattern

For distributed transactions (multi-step workflows), the **Saga Pattern** is the gold standard:

```
Forward Transaction:
  Step 1: Create research report      → Success
  Step 2: Create agent file           → Success
  Step 3: Update catalog              → FAILURE!

Compensating Transactions (Rollback):
  Undo Step 2: Delete agent file
  Undo Step 1: Archive research report (don't delete - audit trail)
```

**Two Saga Approaches**:

| Approach | Description | Best For |
|----------|-------------|----------|
| **Choreography** | Each step triggers next via events | Loosely coupled systems |
| **Orchestration** | Central coordinator manages flow | Complex workflows, our use case |

### 4.2 Compensating Actions Table

For each workflow step, define the compensating action:

| Step | Action | Compensating Action |
|------|--------|---------------------|
| Create file | Write to `.claude/agents/` | Delete file, restore from backup |
| Update catalog | Add entry to skill-catalog.md | Remove entry |
| Register hook | Add to hooks directory | Remove hook, update settings |
| Modify config | Update config.yaml | Restore from snapshot |

### 4.3 Implementation Pattern

```python
class WorkflowStep:
    def __init__(self, name: str, execute: Callable, compensate: Callable):
        self.name = name
        self.execute = execute
        self.compensate = compensate
        self.completed = False

class SagaOrchestrator:
    def __init__(self):
        self.steps: list[WorkflowStep] = []
        self.completed_steps: list[WorkflowStep] = []

    def run(self, context: dict):
        try:
            for step in self.steps:
                step.execute(context)
                step.completed = True
                self.completed_steps.append(step)
                self.persist_state()  # Checkpoint after each step
        except Exception as e:
            self.rollback()
            raise WorkflowFailedError(f"Step {step.name} failed: {e}")

    def rollback(self):
        # Execute compensating actions in reverse order
        for step in reversed(self.completed_steps):
            try:
                step.compensate()
            except Exception as e:
                log.error(f"Compensation failed for {step.name}: {e}")
                # Continue with other compensations
```

### 4.4 Temporal's Retry and Recovery

Temporal provides automatic retry with exponential backoff:

```python
@activity.defn
async def create_agent_file(spec: AgentSpec) -> str:
    # Temporal automatically retries on failure
    # State is persisted, workflow resumes after crash
    pass

@workflow.defn
class CreateAgentWorkflow:
    @workflow.run
    async def run(self, input: CreateAgentInput) -> str:
        # If this crashes mid-execution, Temporal replays
        # from the last checkpoint automatically
        research = await workflow.execute_activity(
            research_best_practices,
            start_to_close_timeout=timedelta(minutes=5),
            retry_policy=RetryPolicy(maximum_attempts=3)
        )

        agent_path = await workflow.execute_activity(
            create_agent_file,
            args=[research.spec],
            start_to_close_timeout=timedelta(minutes=2)
        )

        return agent_path
```

---

## 5. Best Practices for Our Creator Skills System

### 5.1 Design Principles

1. **State Machine First**: Model every workflow as a state machine with explicit phases
2. **Mandatory Research**: The "Obtain" phase is NEVER optional
3. **Schema Validation**: Every artifact must pass JSON Schema validation
4. **Compensating Actions**: Every creation step must have a rollback
5. **Checkpoint Everything**: Persist state after every phase transition
6. **Audit Trail**: Log all transitions for debugging and learning

### 5.2 Recommended Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    EVOLUTION ORCHESTRATOR                    │
│  (Central coordinator - spawned by Router)                   │
└─────────────────────────────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────────────────────────┐
│                    WORKFLOW ENGINE                           │
│  - State machine executor                                    │
│  - Phase transition management                               │
│  - Validation gate enforcement                               │
│  - Rollback coordinator                                      │
└─────────────────────────────────────────────────────────────┘
         │
         ├──────────────────┬──────────────────┬───────────────┐
         ▼                  ▼                  ▼               ▼
┌─────────────┐    ┌─────────────┐    ┌─────────────┐  ┌─────────────┐
│  Research   │    │   Agent     │    │   Skill     │  │   Schema    │
│  Synthesis  │    │   Creator   │    │   Creator   │  │   Creator   │
│   Skill     │    │   Skill     │    │   Skill     │  │   Skill     │
└─────────────┘    └─────────────┘    └─────────────┘  └─────────────┘
```

### 5.3 State File Structure

```json
// .claude/context/evolution-state.json
{
  "version": "1.0",
  "activeWorkflows": [
    {
      "id": "evolve-agent-analytics-expert",
      "type": "EVOLVE",
      "startedAt": "2026-01-25T10:30:00Z",
      "currentPhase": "obtain",
      "phaseResults": {
        "evaluate": { "status": "completed", "result": "needed" },
        "validate": { "status": "completed", "result": "no_conflicts" }
      },
      "context": {
        "requestedCapability": "Analytics and data visualization expert",
        "researchQueries": [
          "analytics dashboard best practices",
          "data visualization agent patterns"
        ],
        "sourcesConsulted": 2
      },
      "checkpoints": [
        { "phase": "evaluate", "timestamp": "...", "stateHash": "abc123" },
        { "phase": "validate", "timestamp": "...", "stateHash": "def456" }
      ]
    }
  ],
  "completedWorkflows": [],
  "failedWorkflows": []
}
```

### 5.4 Validation Gate Implementation

```javascript
// .claude/hooks/evolution/phase-gate.cjs
const PHASE_REQUIREMENTS = {
  obtain: {
    entry: ['evaluate.completed', 'validate.completed'],
    exit: {
      researchQueries: { min: 3 },
      sourcesConsulted: { min: 3 },
      researchReport: { exists: true, minWords: 500 }
    }
  },
  lock: {
    entry: ['obtain.completed'],
    exit: {
      artifactPath: { exists: true },
      schemaValid: { equals: true }
    }
  }
};

function validatePhaseTransition(fromPhase, toPhase, state) {
  const requirements = PHASE_REQUIREMENTS[toPhase];

  // Check entry conditions
  for (const condition of requirements.entry) {
    if (!evaluateCondition(condition, state)) {
      return { allowed: false, reason: `Entry condition failed: ${condition}` };
    }
  }

  return { allowed: true };
}

function validatePhaseCompletion(phase, state) {
  const requirements = PHASE_REQUIREMENTS[phase].exit;
  const failures = [];

  for (const [field, rules] of Object.entries(requirements)) {
    if (!evaluateRules(state[field], rules)) {
      failures.push(`${field} failed validation: ${JSON.stringify(rules)}`);
    }
  }

  return failures.length === 0
    ? { valid: true }
    : { valid: false, failures };
}
```

---

## 6. Implementation Recommendations

### 6.1 Phase 1: State Machine Foundation

1. Create `evolution-state.json` schema and initial structure
2. Implement `WorkflowEngine` class with phase transitions
3. Add checkpoint persistence after each phase
4. Create `phase-gate.cjs` hook for validation enforcement

### 6.2 Phase 2: Research Enforcement

1. Update `research-synthesis` skill to be workflow-aware
2. Add research tracking to state file
3. Create `research-enforcement.cjs` hook to block creation without research
4. Implement minimum source requirement validation

### 6.3 Phase 3: Rollback System

1. Define compensating actions for each creator skill
2. Implement `RollbackCoordinator` class
3. Add transaction logging for audit trail
4. Test rollback scenarios end-to-end

### 6.4 Phase 4: Workflow Composition

1. Enable EVOLVE to spawn appropriate creator skill
2. Implement sub-workflow state passing
3. Add parallel workflow support for multi-artifact creation
4. Create workflow monitoring/status reporting

---

## 7. Key Takeaways

| Insight | Source | Application |
|---------|--------|-------------|
| State machines > simple chains | LangGraph, Azure | Use explicit phases with transitions |
| Checkpoints are mandatory | Temporal | Persist state after every phase |
| Validation gates prevent bad transitions | CrewAI ConditionalTask | Entry/exit conditions per phase |
| Saga pattern for rollback | Microservices best practices | Compensating actions for each step |
| Research cannot be skipped | Our requirement | Enforce minimum queries/sources |
| Workflow composition enables reuse | All frameworks | EVOLVE spawns specific creators |

---

## References

1. AWS Blog: "Customize agent workflows with advanced orchestration techniques using Strands Agents" (2025-12-15)
2. Acceli: "AI Agent Workflow Patterns: Building Reliable Multi-Step AI Systems" (2025-11-19)
3. Azure Architecture Center: "AI Agent Orchestration Patterns" (2025-07-18)
4. LangChain Blog: "Choosing the Right Multi-Agent Architecture" (2026-01-14)
5. Temporal.io: "Best Practice Guides" and "Workflow Engine Design Principles"
6. JetThoughts: "Mastering LangGraph: Building Complex AI Agent Workflows with State Machines"
7. ByteByteGo: "Top AI Agentic Workflow Patterns" (2025-12-15)
8. Google Developers Blog: "Developer's guide to multi-agent patterns in ADK" (2025-12-16)
9. CrewAI Documentation: Tasks, Flows, Conditional Tasks, Sequential Processes
10. Microservices.io: "Saga Pattern"
11. Microsoft Azure: "Saga Design Pattern"
12. Medium: "Building a Reliable Rollback System with SAGA, Event Sourcing and Outbox Patterns"
13. Vercel AI SDK: "Agents: Workflow Patterns"
14. IBM Think: "What is AI Agent Orchestration?"
15. Temporal Blog: "Mastering Saga patterns for distributed transactions in microservices"
