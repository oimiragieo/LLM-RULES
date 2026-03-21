# Workflow System Comparison: CrewAI vs Agent Studio

## Executive Summary

**Analysis Date**: 2026-01-28
**Task ID**: 12
**Framework Versions**: CrewAI (Python) vs Agent Studio v2.2.1 (JavaScript/TypeScript)

This analysis provides a deep comparative evaluation of workflow orchestration systems between CrewAI and Agent Studio. The findings reveal distinct architectural philosophies - CrewAI favors declarative, decorator-based workflows while Agent Studio uses imperative, Router-mediated orchestration. Each approach has trade-offs in flexibility, developer experience, and scalability.

---

## Comparison Matrix

| Dimension | CrewAI | Agent Studio | Winner | Gap Analysis |
|-----------|--------|--------------|--------|--------------|
| **Orchestration Model** | Declarative (Crew + Flow) | Imperative (Router) | **Tie** | Different paradigms, each optimal for different use cases |
| **Process Types** | 3 types (Sequential, Hierarchical, Consensual) | Router-mediated routing | **CrewAI** | Agent Studio lacks explicit process type abstraction |
| **Workflow Definition** | Decorators (@start, @listen, @router) | Markdown + Task() tool | **CrewAI** | Decorators provide compile-time validation; Markdown is more accessible |
| **State Management** | Pydantic models + SQLite persistence | TaskUpdate metadata + Memory files | **CrewAI** | Agent Studio lacks formal state machines and persistence |
| **Context Propagation** | Automatic task-to-task chaining | Manual via Task() prompts | **CrewAI** | Manual propagation error-prone; context can be lost |
| **Async Execution** | Built-in (asyncio, futures) | Task spawn parallel | **Tie** | Both support parallelism; different implementations |
| **Conditional Logic** | @router decorator with method-based routing | Imperative if/else in Router | **CrewAI** | Declarative conditionals easier to visualize and test |
| **Persistence** | SQLite snapshots with restore | Memory files (no checkpointing) | **CrewAI** | Agent Studio cannot resume from interruption point |
| **Observability** | Event bus + OpenTelemetry tracing | Hook system | **Agent Studio** | Hooks are simpler; CrewAI event bus more powerful |
| **Flexibility** | Structured, predictable | Highly flexible, dynamic | **Agent Studio** | Flexibility vs structure trade-off |
| **Agent Specialization** | 3 base agent types | 45+ specialized agents | **Agent Studio** | More domain expertise available |
| **Enforcement** | Runtime validation | Blocking hooks (routing-guard, creator-guard) | **Agent Studio** | Pre-execution blocking prevents violations |

---

## Detailed Analysis

### 1. Orchestration Model

#### CrewAI: Declarative Crew + Flow

CrewAI provides two orchestration primitives:

**Crew Orchestration** (`crew.py`):
```python
@CrewBase
class MyCrew:
    agents_config = 'config/agents.yaml'
    tasks_config = 'config/tasks.yaml'

    @agent
    def researcher(self) -> Agent:
        return Agent(config=self.agents_config['researcher'])

    @task
    def research_task(self) -> Task:
        return Task(
            config=self.tasks_config['research_task'],
            agent=self.researcher()
        )

    @crew
    def crew(self) -> Crew:
        return Crew(
            agents=self.agents,
            tasks=self.tasks,
            process=Process.sequential,  # or hierarchical, consensual
            memory=True,
            verbose=True
        )
```

**Flow Framework** (`flow/flow.py`):
```python
class MyFlow(Flow[MyState]):
    @start()
    def initial_step(self):
        return "started"

    @listen("initial_step")
    def process_step(self, previous_output):
        # Automatic context propagation
        return self.state.process(previous_output)

    @router(process_step)
    def route_decision(self):
        if self.state.condition:
            return "path_a"
        return "path_b"
```

**Characteristics**:
- Declarative: Workflow structure defined at class level
- Static analysis: Decorators enable compile-time validation
- Automatic chaining: Method outputs flow to next method inputs
- State machines: Explicit state management via Pydantic models

#### Agent Studio: Imperative Router-Mediated

```javascript
// Router Decision Workflow (router-decision.md)
// Step 1: Check existing tasks
TaskList();

// Step 2: Classify request
// Intent, Complexity, Domain, Risk analysis

// Step 3: Agent Selection from routing table
// Based on classification, select appropriate agent(s)

// Step 4: Spawn agents
Task({
  task_id: 'task-1',
  subagent_type: 'general-purpose',
  description: 'Planner designing feature',
  prompt: `You are the PLANNER agent.

  ## Instructions
  1. Read your agent definition
  2. Invoke skills: Skill({ skill: "plan-generator" })
  3. Execute task
  4. TaskUpdate() with results
  `,
});

// Step 5: Monitor and coordinate
TaskList();
```

**Characteristics**:
- Imperative: Explicit Task() calls control flow
- Dynamic: Routing decisions made at runtime
- Manual chaining: Context passed via prompt text
- Flexible: Any agent can spawn any other agent

#### Verdict: **Tie (Different Paradigms)**

| Approach | Best For | Weakness |
|----------|----------|----------|
| **Declarative (CrewAI)** | Predictable workflows, visual documentation, state machine validation | Less flexible, harder to modify at runtime |
| **Imperative (Agent Studio)** | Dynamic workflows, ad-hoc coordination, maximum flexibility | Harder to visualize, easier to create invalid workflows |

---

### 2. Process Types

#### CrewAI: Three Explicit Process Types

```python
from crewai import Process

# Sequential: Tasks execute in order, output chains to next input
crew = Crew(process=Process.sequential)

# Hierarchical: Manager agent delegates to workers via tools
crew = Crew(process=Process.hierarchical, manager_agent=manager)

# Consensual (planned): Multiple agents vote on decisions
crew = Crew(process=Process.consensual)  # Not yet fully implemented
```

**Sequential Process Flow**:
```
Task1 -> output1 -> Task2(context=output1) -> output2 -> Task3(context=output2)
```

**Hierarchical Process Flow**:
```
Manager Agent
├── analyze task
├── delegate to Worker1 (via tool call)
├── delegate to Worker2 (via tool call)
├── synthesize results
└── return final output
```

#### Agent Studio: Router-Mediated Orchestration

Agent Studio uses the Router as implicit orchestrator:

```markdown
## Step 7: Spawn Decision (from router-decision.md)

### 7.1 Single Agent Spawn
When: Trivial to Low complexity, Low to Medium risk

### 7.2 Parallel Agent Spawn
When: Medium to High complexity, Multiple independent perspectives

### 7.3 Phased Multi-Agent Spawn
When: Epic complexity, Cross-cutting changes
Phase 1: Exploration
Phase 2: Planning
Phase 3: Review (parallel)
Phase 4: Consolidation
```

**Phased Orchestration Matrix**:
| Task Type | Phase 1 | Phase 2 | Phase 3 | Phase 4 |
|-----------|---------|---------|---------|---------|
| New feature | Explore | Planner | Architect + Security | Consolidate |
| Architecture change | Explore | Architect | Security | Implement |
| Auth/Security change | Explore | Planner | Security (mandatory) | Consolidate |

#### Gap Analysis: **CrewAI Wins**

Agent Studio lacks:
1. **Explicit process type abstraction** - Phased orchestration is documented but not formalized
2. **Manager delegation pattern** - No built-in hierarchical coordination
3. **Consensus process** - Party Mode provides voting but not integrated into workflow engine

**Recommendation**: Add process type configuration to Task spawning:

```javascript
// Proposed enhancement
Task({
  task_id: 'task-2',
  process: 'sequential' | 'hierarchical' | 'consensual',
  manager: 'planner',  // For hierarchical
  consensusMode: 'majority-vote',  // For consensual
});
```

---

### 3. Workflow Definition

#### CrewAI: Decorator-Based DSL

**@start decorator**: Marks workflow entry point
```python
@start()
def initialize(self):
    return {"initialized": True}
```

**@listen decorator**: Subscribes to method completion events
```python
@listen("initialize")
def process_after_init(self, previous_result):
    # Automatically receives output from initialize()
    return self.transform(previous_result)
```

**@router decorator**: Enables conditional branching
```python
@router(process_after_init)
def decide_path(self):
    if self.state.needs_review:
        return "review"
    return "deploy"
```

**Benefits**:
- Self-documenting: Workflow structure visible at class level
- Type safety: Pydantic models validate state transitions
- IDE support: Autocomplete for state properties

#### Agent Studio: Markdown Workflows + Task() Tool

**Workflow Files** (`.claude/workflows/**/*.md`):
```markdown
# Feature Development Workflow

## Phase 1: Discovery & Requirements Planning
### Step 1: Business Analysis & Requirements
**Agent**: Planner with brainstorming skill
**Task Spawn**:
\`\`\`javascript
Task({
  task_id: 'task-3',
  subagent_type: 'general-purpose',
  prompt: `You are the PLANNER agent...`
});
\`\`\`
```

**Benefits**:
- Human-readable: Anyone can understand workflow without code knowledge
- Versionable: Markdown in git, easy to diff
- Flexible: Agents interpret instructions, not rigid execution

**Drawbacks**:
- No compile-time validation
- Manual context propagation
- Harder to visualize complex branching

#### Gap Analysis: **CrewAI Wins for Structure, Agent Studio Wins for Accessibility**

**Missing in Agent Studio**:
1. Decorator-based workflow definition
2. Automatic method chaining
3. Compile-time workflow validation

**Agent Studio Advantages**:
1. Workflows readable by non-developers
2. Easy to modify without code changes
3. Natural language instructions give agents flexibility

**Recommendation (Hybrid Approach)**:

```javascript
// Option A: TypeScript decorators (Stage 3 proposal)
class FeatureWorkflow extends Workflow {
  @start()
  async requirements() {
    return await this.spawn('planner', { skill: 'brainstorming' });
  }

  @listen('requirements')
  async design(requirementsOutput) {
    return await this.spawn('architect', { context: requirementsOutput });
  }
}

// Option B: Higher-order functions (no decorator dependency)
const FeatureWorkflow = createWorkflow({
  start: 'requirements',
  steps: {
    requirements: {
      agent: 'planner',
      skill: 'brainstorming',
      next: 'design'
    },
    design: {
      agent: 'architect',
      listensTo: 'requirements',
      next: ['securityReview', 'architectureReview']  // Parallel
    }
  }
});
```

---

### 4. State Management

#### CrewAI: Pydantic + SQLite Persistence

**Flow State** (`flow/flow.py`):
```python
class MyFlowState(BaseModel):
    """Pydantic model for type-safe state"""
    counter: int = 0
    messages: list[str] = []
    current_phase: str = "init"

class MyFlow(Flow[MyFlowState]):
    def __init__(self):
        super().__init__(persistence=SQLitePersistence())

    @start()
    def begin(self):
        self.state.counter += 1  # Type-checked
        self.state.current_phase = "processing"
        return self.state
```

**Persistence Features**:
- **Checkpoint snapshots**: Save state at any point
- **Resume from failure**: Restore state and continue
- **State history**: Track all state transitions
- **SQLite storage**: Local file-based persistence

#### Agent Studio: TaskUpdate Metadata + Memory Files

**TaskUpdate Metadata**:
```javascript
TaskUpdate({
  taskId: "12",
  status: "in_progress",
  metadata: {
    progress: "40%",
    discoveries: ["Found pattern X", "Dependency Y required"],
    keyFiles: ["src/auth.ts", "src/validate.ts"]
  }
});
```

**Memory Files** (`.claude/context/memory/`):
- `learnings.md`: Patterns and solutions
- `decisions.md`: Architecture Decision Records
- `issues.md`: Blockers and workarounds

**Limitations**:
1. No formal state machine
2. No checkpoint/restore capability
3. Memory files are append-only, no structured queries
4. State lost on context reset

#### Gap Analysis: **CrewAI Wins**

**Critical gaps in Agent Studio**:
1. **No state persistence** - Cannot resume interrupted workflows
2. **No state validation** - No schema for task metadata
3. **No state history** - Cannot audit state transitions
4. **Manual state propagation** - Context must be passed in prompts

**Recommendation (P1 Priority)**:

```javascript
// Add workflow state management
const WorkflowState = createStateSchema({
  phase: z.enum(['requirements', 'design', 'implementation', 'testing']),
  outputs: z.record(z.string(), z.any()),
  checkpoints: z.array(z.object({
    phase: z.string(),
    timestamp: z.string(),
    state: z.any()
  }))
});

// Persistence layer
const workflowPersistence = new SQLiteWorkflowPersistence({
  dbPath: '.claude/context/workflow-state.db',
  autoCheckpoint: true
});

// Checkpoint and restore
await workflowPersistence.checkpoint(workflowId, currentState);
const restored = await workflowPersistence.restore(workflowId);
```

---

### 5. Context Propagation

#### CrewAI: Automatic Task-to-Task Chaining

```python
@crew
def my_crew(self):
    return Crew(
        tasks=[
            self.research_task(),   # Output: research_result
            self.analysis_task(),   # Receives research_result automatically
            self.report_task()      # Receives analysis_result automatically
        ],
        process=Process.sequential
    )

# In task definition
@task
def analysis_task(self) -> Task:
    return Task(
        description="Analyze the research findings",
        # No explicit context needed - previous task output injected
    )
```

**How it works**:
1. Task1 completes, returns output
2. CrewAI injects output into Task2's context automatically
3. Agent sees: "Here are the results from previous task: {output}"

#### Agent Studio: Manual via Task() Prompts

```javascript
// Phase 1: Planner creates plan
Task({
  task_id: 'task-4',
  subagent_type: 'general-purpose',
  prompt: `Create plan for feature X.
  Save output to: .claude/context/plans/feature-x-plan.md`
});

// Phase 2: Developer must read plan explicitly
Task({
  task_id: 'task-5',
  subagent_type: 'general-purpose',
  prompt: `You are DEVELOPER.

  ## Instructions
  1. Read plan: .claude/context/plans/feature-x-plan.md  // Manual reference
  2. Implement according to plan
  `
});
```

**Problems**:
1. Context can be forgotten if prompt doesn't include file reference
2. No guarantee previous phase completed successfully
3. File paths can be wrong, leading to stale context

#### Gap Analysis: **CrewAI Wins**

**Recommendation**:

```javascript
// Option A: Context chaining via Task dependencies
Task({
  task_id: 'task-6',
  taskId: "design",
  dependsOn: ["requirements"],  // Automatically inject requirements output
  prompt: `Design system based on requirements.
  [CONTEXT: {{requirements.output}}]`  // Template variable
});

// Option B: Workflow context object
const workflow = new Workflow({ id: 'feature-x' });
await workflow.phase('requirements', plannerAgent);
await workflow.phase('design', architectAgent, {
  context: workflow.output('requirements')  // Explicit but type-safe
});
```

---

### 6. Async Execution

Both frameworks support parallel execution, but with different approaches:

#### CrewAI: Python asyncio + Futures

```python
# Parallel task execution
crew = Crew(
    agents=[agent1, agent2, agent3],
    tasks=[task1, task2, task3],  # Independent tasks
    process=Process.sequential,
    async_execution=True  # Enable async
)

# Futures for async management
result = crew.kickoff_async()
# Continue other work...
final = await result
```

#### Agent Studio: Parallel Task() Spawning

```javascript
// Spawn multiple agents in SINGLE message for parallel execution
TaskList();

Task({ task_id: 'task-7', description: 'Architect reviewing API', prompt: '...' });
Task({ task_id: 'task-8', description: 'Security reviewing API', prompt: '...' });
Task({ task_id: 'task-9', description: 'Performance reviewing API', prompt: '...' });

// All 3 agents execute in parallel
```

**Key difference**: Agent Studio's parallelism is at spawn-time (multiple Task() in one message), while CrewAI's is at execution-time (asyncio).

#### Verdict: **Tie**

Both support parallelism effectively. Agent Studio's approach is simpler (just add more Task() calls), while CrewAI's provides more control (async/await, futures).

---

### 7. Conditional Logic

#### CrewAI: @router Decorator

```python
@router(analyze_step)
def decide_next_step(self):
    """Declarative conditional routing"""
    if self.state.critical_issues:
        return "emergency_fix"
    elif self.state.needs_review:
        return "human_review"
    else:
        return "deploy"

@listen("emergency_fix")
def handle_emergency(self):
    # This method triggered only when router returns "emergency_fix"
    pass
```

**Benefits**:
- Workflow branches visible at class level
- IDE can show all possible paths
- Unit testable (mock state, assert routing decision)

#### Agent Studio: Imperative if/else in Router

```markdown
## Step 4: Self-Check Protocol (router-decision.md)

### Question 1: Am I about to use a blacklisted tool?
- **YES**: STOP. Spawn appropriate agent.
- **NO**: Continue to Question 2.

### Question 2: Is this a multi-step task?
- **YES**: STOP. Spawn PLANNER first.
- **NO**: Continue to Question 3.
```

```javascript
// In Router execution
if (complexity === 'HIGH' && riskLevel === 'HIGH') {
  // Spawn planner + security architect in parallel
  Task({ task_id: 'task-10', description: 'Planner', ... });
  Task({ task_id: 'task-11', description: 'Security Architect', ... });
} else if (complexity === 'MEDIUM') {
  // Single agent
  Task({ task_id: 'task-12', description: 'Developer', ... });
}
```

**Benefits**:
- Full programming flexibility
- Can make decisions based on runtime data
- Complex nested conditions possible

**Drawbacks**:
- Harder to visualize all possible paths
- Logic scattered across Router implementation
- Not unit testable in isolation

#### Gap Analysis: **CrewAI Wins**

**Recommendation**: Add declarative routing DSL

```javascript
// Proposed: Declarative routing rules
const routingRules = defineRoutes({
  "high-complexity + security": {
    parallel: ['planner', 'security-architect']
  },
  "medium-complexity": {
    single: 'developer'
  },
  "documentation": {
    single: 'technical-writer'
  },
  default: {
    single: 'developer'
  }
});

// Router uses rules
const agents = routingRules.resolve({ complexity: 'HIGH', domain: 'security' });
```

---

### 8. Persistence

#### CrewAI: SQLite Snapshots

```python
# Persistence configuration
from crewai.flow.persistence import SQLitePersistence

class MyFlow(Flow):
    def __init__(self):
        super().__init__(persistence=SQLitePersistence(
            db_path="./flow_state.db"
        ))

    @start()
    def begin(self):
        # State automatically persisted after each step
        self.state.phase = "started"
```

**Features**:
- Automatic checkpoint after each step
- Manual checkpoint capability
- Restore from any checkpoint
- State history query

#### Agent Studio: Memory Files (No Checkpointing)

```javascript
// Current approach: Append-only memory files
Edit('.claude/context/memory/learnings.md', {
  new_string: `## New Learning\n${learning}\n`
});

// No checkpoint/restore capability
// If context resets, must start from scratch
```

#### Gap Analysis: **CrewAI Wins (Critical Gap)**

**Impact**:
- Long-running workflows (>1 hour) cannot survive context resets
- No way to resume interrupted work
- No audit trail of state transitions

**Recommendation (P1 Priority)**:

```javascript
// Add SQLite-based workflow persistence
class WorkflowPersistence {
  constructor(dbPath) {
    this.db = new SQLiteDatabase(dbPath);
    this.createTables();
  }

  async checkpoint(workflowId, state) {
    await this.db.run(`
      INSERT INTO checkpoints (workflow_id, timestamp, state)
      VALUES (?, ?, ?)
    `, [workflowId, new Date().toISOString(), JSON.stringify(state)]);
  }

  async restore(workflowId) {
    const row = await this.db.get(`
      SELECT state FROM checkpoints
      WHERE workflow_id = ?
      ORDER BY timestamp DESC LIMIT 1
    `, [workflowId]);
    return JSON.parse(row.state);
  }
}
```

---

## Agent Studio Advantages

Despite gaps in workflow orchestration, Agent Studio excels in several areas:

### 1. 45+ Specialized Agents

CrewAI provides generic agents; users must configure specialization. Agent Studio ships with domain experts:

| Category | Agent Studio | CrewAI |
|----------|--------------|--------|
| Core | developer, planner, architect, qa, technical-writer | Generic Agent class |
| Domain | python-pro, rust-pro, golang-pro, typescript-pro, fastapi-pro, java-pro, nodejs-pro, php-pro | Manual configuration |
| Specialized | security-architect, database-architect, devops, incident-responder | Manual configuration |
| Orchestrators | master-orchestrator, swarm-coordinator, party-orchestrator | Crew class |

### 2. Enforcement Hooks (Blocking)

Agent Studio prevents violations before they happen:

```javascript
// routing-guard.cjs - blocks invalid routing
// unified-creator-guard.cjs - blocks direct artifact writes
// research-enforcement.cjs - blocks creation without research
```

CrewAI validates at runtime but doesn't block pre-execution.

### 3. Flexible Routing with Keyword Matching

```markdown
## Routing Table (from router-decision.md)

| Request Type | Agent | Keywords |
|--------------|-------|----------|
| Bug fixes, coding | developer | "fix", "bug", "error" |
| Security review | security-architect | "security", "auth", "vulnerability" |
| Party Mode | party-orchestrator | "party mode", "consensus", "debate" |
```

### 4. Memory-First Architecture

All agents follow Memory Protocol:
1. **Read** learnings.md before starting
2. **Write** decisions/issues/learnings after completing
3. **Assume interruption** - persist everything

---

## Enhancement Recommendations

### P1 (High Priority - Address Critical Gaps)

| Enhancement | Gap Addressed | Effort | Impact |
|-------------|---------------|--------|--------|
| **Workflow State Persistence** | No checkpoint/restore | Medium | High |
| **Automatic Context Chaining** | Manual propagation error-prone | Medium | High |
| **Declarative Routing DSL** | Imperative conditionals hard to visualize | Low | Medium |

### P2 (Medium Priority - Improve Developer Experience)

| Enhancement | Gap Addressed | Effort | Impact |
|-------------|---------------|--------|--------|
| **TypeScript Workflow Decorators** | No compile-time workflow validation | High | Medium |
| **Process Type Abstraction** | Lacks Sequential/Hierarchical/Consensual | Medium | Medium |
| **State Validation Schema** | No schema for task metadata | Low | Low |

### P3 (Low Priority - Nice to Have)

| Enhancement | Gap Addressed | Effort | Impact |
|-------------|---------------|--------|--------|
| **Flow-like Event-Driven Orchestration** | @listen patterns | High | Medium |
| **Visual Workflow Editor** | Workflows not visual | High | Low |

---

## Trade-off Summary

### Declarative vs Imperative

| Aspect | Declarative (CrewAI) | Imperative (Agent Studio) |
|--------|---------------------|--------------------------|
| **Visualization** | Workflow visible at class level | Distributed across files/Router |
| **Compile-time safety** | Decorators enable validation | No compile-time checks |
| **Flexibility** | Structured, predictable | Highly flexible, dynamic |
| **Learning curve** | Steep (decorators, state models) | Gentle (markdown, prompts) |
| **Modification** | Code changes required | Markdown edits sufficient |

### Recommended Approach: **Hybrid**

1. **Keep imperative Router** for flexibility and dynamic routing
2. **Add declarative workflow DSL** for complex, predictable workflows
3. **Add state persistence** for long-running workflows
4. **Add automatic context chaining** for sequential phases

---

## Conclusion

CrewAI's Flow framework provides superior workflow definition through decorators, automatic state management, and persistence. However, Agent Studio's strengths lie in its extensive agent specialization (45+ agents), enforcement hooks (blocking violations), and human-readable markdown workflows.

**Key Recommendations**:
1. **P1**: Add SQLite-based workflow state persistence
2. **P1**: Implement automatic context chaining between phases
3. **P2**: Create declarative routing DSL as optional layer
4. **P3**: Consider TypeScript decorators for workflow definition

The frameworks serve different needs: CrewAI excels at predictable, repeatable workflows; Agent Studio excels at flexible, ad-hoc coordination with specialized expertise.

---

## Appendix: CrewAI Flow Source Analysis (Reference)

### Key Files Analyzed

| File | Lines | Key Patterns |
|------|-------|--------------|
| `flow/flow.py` | ~2500 | @start, @listen, @router decorators |
| `flow/flow_wrappers.py` | ~300 | Decorator implementations |
| `flow/persistence/` | ~500 | SQLite state persistence |
| `crew.py` | ~1900 | Process.sequential, Process.hierarchical |
| `task.py` | ~1100 | Task chaining, guardrails |

### Decorator Implementation Pattern

```python
def start(method):
    """Mark method as workflow entry point"""
    method._is_start = True
    return method

def listen(trigger):
    """Subscribe method to trigger completion"""
    def decorator(method):
        method._listens_to = trigger
        return method
    return decorator

def router(source_method):
    """Enable conditional branching after method"""
    def decorator(method):
        method._is_router = True
        method._routes_from = source_method.__name__
        return method
    return decorator
```

### State Machine Implementation

```python
class Flow(Generic[StateT]):
    def __init__(self, persistence=None):
        self._state: StateT = self._create_initial_state()
        self._persistence = persistence
        self._method_graph = self._build_method_graph()

    def _build_method_graph(self):
        """Build execution graph from decorated methods"""
        graph = {}
        for name, method in inspect.getmembers(self, predicate=inspect.ismethod):
            if hasattr(method, '_is_start'):
                graph['_start'] = name
            if hasattr(method, '_listens_to'):
                trigger = method._listens_to
                graph.setdefault(trigger, []).append(name)
        return graph

    async def kickoff(self):
        """Execute workflow from start"""
        current = self._method_graph.get('_start')
        while current:
            result = await self._execute_method(current)
            if self._persistence:
                await self._persistence.checkpoint(self._state)
            current = self._get_next_method(current, result)
```

---

**Report Generated**: 2026-01-28
**Architect Agent**: Task #12 Workflow Comparison Analysis
