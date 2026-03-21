# Workflow Engine Implementation Research Report

**Date**: 2026-01-25  
**Researcher**: Claude Code RESEARCHER Agent  
**Objective**: Research workflow engine implementations for the agent-studio framework

---

## Executive Summary

This research analyzed multiple workflow engine implementations to identify patterns suitable for our multi-agent orchestration system. The findings recommend a **lightweight state machine approach** with YAML-based workflow definitions, step-by-step execution with hooks, and checkpoint/resume capabilities.

---

## 1. State Machine Implementations

### 1.1 Simple State Machine (Kent C. Dodds Pattern)

The simplest and most adaptable pattern. Highly recommended for our system.

```javascript
function createMachine(stateMachineDefinition) {
  const machine = {
    value: stateMachineDefinition.initialState,
    transition(currentState, event) {
      const currentStateDefinition = stateMachineDefinition[currentState];
      const destinationTransition = currentStateDefinition.transitions[event];
      
      if (!destinationTransition) {
        return; // Invalid transition
      }
      
      const destinationState = destinationTransition.target;
      const destinationStateDefinition = stateMachineDefinition[destinationState];
      
      // Execute transition actions in order
      destinationTransition.action?.();
      currentStateDefinition.actions?.onExit?.();
      destinationStateDefinition.actions?.onEnter?.();
      
      machine.value = destinationState;
      return machine.value;
    },
  };
  return machine;
}

// Usage
const machine = createMachine({
  initialState: 'idle',
  idle: {
    actions: {
      onEnter() { console.log('Entered idle'); },
      onExit() { console.log('Exited idle'); }
    },
    transitions: {
      START: {
        target: 'running',
        action() { console.log('Starting workflow'); }
      }
    }
  },
  running: {
    actions: {
      onEnter() { console.log('Running'); }
    },
    transitions: {
      COMPLETE: { target: 'completed' },
      FAIL: { target: 'failed' }
    }
  },
  completed: { type: 'final' },
  failed: { type: 'final' }
});
```

**Pros**: Minimal code, easy to understand, no dependencies  
**Cons**: Manual state management, no built-in persistence

### 1.2 XState (Production-Grade)

Industry standard for complex state machines with advanced features.

```javascript
import { createMachine, createActor } from 'xstate';

const workflowMachine = createMachine({
  id: 'workflow',
  initial: 'pending',
  context: {
    stepResults: {},
    attempts: {},
    currentStep: null
  },
  states: {
    pending: {
      on: { START: 'running' }
    },
    running: {
      initial: 'executing',
      states: {
        executing: {
          invoke: {
            src: 'executeStep',
            onDone: { target: 'checkNext', actions: 'saveResult' },
            onError: { target: 'handleError' }
          }
        },
        checkNext: {
          always: [
            { guard: 'hasNextStep', target: 'executing' },
            { target: '#workflow.completed' }
          ]
        },
        handleError: {
          always: [
            { guard: 'canRetry', target: 'executing' },
            { target: '#workflow.failed' }
          ]
        }
      }
    },
    completed: { type: 'final' },
    failed: { type: 'final' }
  }
});
```

**Pros**: Full statechart support, visualization, TypeScript support, actor model  
**Cons**: Larger bundle size, learning curve

### 1.3 javascript-state-machine (Jake Gordon)

Lightweight alternative with factory pattern and history plugin.

```javascript
const StateMachine = require('javascript-state-machine');

const fsm = new StateMachine({
  init: 'pending',
  transitions: [
    { name: 'start', from: 'pending', to: 'step1' },
    { name: 'next', from: 'step1', to: 'step2' },
    { name: 'next', from: 'step2', to: 'step3' },
    { name: 'complete', from: 'step3', to: 'completed' },
    { name: 'fail', from: '*', to: 'failed' }
  ],
  methods: {
    onStep1() { console.log('Executing step 1'); },
    onStep2() { console.log('Executing step 2'); },
    onStep3() { console.log('Executing step 3'); },
    onEnterFailed(lifecycle) {
      console.log(`Failed transitioning from ${lifecycle.from}`);
    }
  },
  plugins: [
    new StateMachineHistory() // Track state history
  ]
});
```

**Pros**: Simple API, history tracking, lifecycle hooks  
**Cons**: Less TypeScript support

---

## 2. YAML Workflow Definition Patterns

### 2.1 Dagu-Style (Recommended)

Clean, declarative format with dependencies and handlers.

```yaml
# Workflow metadata
name: agent-orchestration
description: "Multi-agent task execution workflow"
tags: [production, orchestration]

# Environment
env:
  - LOG_LEVEL: info
  - PROJECT_ROOT: ${PWD}

# Parameters with defaults
params:
  - TASK_ID: ""
  - AGENT_TYPE: developer

# Workflow steps
steps:
  - name: validate-input
    command: echo "Validating input for task ${TASK_ID}"
    
  - name: spawn-agent
    command: claude task spawn ${AGENT_TYPE}
    depends: validate-input
    env:
      - AGENT_ID: ${TASK_ID}-agent
    
  - name: execute-task
    command: claude task execute
    depends: spawn-agent
    continueOn:
      failure: false
    
  - name: collect-results
    command: echo "Collecting results"
    depends: execute-task

  - name: cleanup
    command: echo "Cleanup"
    depends: [collect-results]

# Lifecycle handlers
handlerOn:
  success:
    command: echo "Workflow completed successfully"
  failure:
    command: echo "Workflow failed" | notify
  exit:
    command: echo "Cleanup resources"
```

### 2.2 Conductor-Style (Step Types)

More structured with explicit step types and inputs/outputs.

```yaml
Id: AgentWorkflow
Steps:
  - Id: ValidateInput
    StepType: Validate
    Inputs:
      taskId: data.taskId
      agentType: data.agentType
    NextStepId: SpawnAgent
    
  - Id: SpawnAgent
    StepType: SpawnAgent
    Inputs:
      type: data.agentType
      taskId: data.taskId
    Outputs:
      agentId: step.agentId
    NextStepId: ExecuteTask
    
  - Id: ExecuteTask
    StepType: ExecuteTask
    Inputs:
      agentId: data.agentId
      instructions: data.instructions
    Outputs:
      result: step.result
    NextStepId: Decision
    
  - Id: Decision
    StepType: If
    Condition: data.result.success == true
    TrueStepId: CollectResults
    FalseStepId: HandleError
```

### 2.3 GitHub Actions-Style (Jobs and Steps)

Familiar format for developers, good for CI/CD-like workflows.

```yaml
name: agent-task-workflow
on:
  trigger:
    - task_created
    - manual

jobs:
  validate:
    steps:
      - name: Validate task input
        run: validate-input ${{ inputs.taskId }}
        
  execute:
    needs: validate
    steps:
      - name: Spawn agent
        id: spawn
        run: spawn-agent ${{ inputs.agentType }}
        
      - name: Execute task
        run: execute-task ${{ steps.spawn.outputs.agentId }}
        
  cleanup:
    needs: execute
    if: always()
    steps:
      - name: Cleanup resources
        run: cleanup-resources
```

---

## 3. Step Execution with Hook Patterns

### 3.1 Before/After Hook Pattern (Recommended)

Simple and effective pattern for step lifecycle.

```javascript
class WorkflowExecutor {
  constructor(hooks = {}) {
    this.hooks = {
      onWorkflowStart: hooks.onWorkflowStart || (() => {}),
      onWorkflowEnd: hooks.onWorkflowEnd || (() => {}),
      onStepStart: hooks.onStepStart || (() => {}),
      onStepEnd: hooks.onStepEnd || (() => {}),
      onStepError: hooks.onStepError || (() => {}),
      onCheckpoint: hooks.onCheckpoint || (() => {})
    };
  }

  async executeWorkflow(workflow, context = {}) {
    const state = {
      workflowId: workflow.id,
      status: 'running',
      currentStep: null,
      stepResults: {},
      errors: [],
      startedAt: Date.now()
    };

    await this.hooks.onWorkflowStart(state);

    try {
      for (const step of workflow.steps) {
        state.currentStep = step.name;
        await this.hooks.onStepStart(step, state);

        try {
          const result = await this.executeStep(step, context, state);
          state.stepResults[step.name] = result;
          await this.hooks.onStepEnd(step, result, state);
          await this.hooks.onCheckpoint(state);
        } catch (error) {
          await this.hooks.onStepError(step, error, state);
          if (!step.continueOnError) throw error;
        }
      }

      state.status = 'completed';
    } catch (error) {
      state.status = 'failed';
      state.errors.push(error);
    } finally {
      state.endedAt = Date.now();
      await this.hooks.onWorkflowEnd(state);
    }

    return state;
  }

  async executeStep(step, context, state) {
    // Step execution logic
    if (step.type === 'command') {
      return await this.runCommand(step.command, context);
    } else if (step.type === 'function') {
      return await step.execute(context, state);
    }
  }
}

// Usage
const executor = new WorkflowExecutor({
  onStepStart: (step, state) => {
    console.log(`Starting step: ${step.name}`);
  },
  onStepEnd: (step, result, state) => {
    console.log(`Completed step: ${step.name}`, result);
  },
  onCheckpoint: async (state) => {
    await saveCheckpoint(state);
  }
});
```

### 3.2 Middleware Pattern (Express-Style)

Composable hooks with next() function.

```javascript
const createWorkflowEngine = () => {
  const beforeHooks = [];
  const afterHooks = [];

  const use = (hook) => {
    if (hook.before) beforeHooks.push(hook.before);
    if (hook.after) afterHooks.push(hook.after);
    return engine;
  };

  const executeStep = async (step, context) => {
    // Run before hooks
    for (const hook of beforeHooks) {
      const result = await hook(step, context);
      if (result === false) return { skipped: true };
    }

    // Execute step
    const result = await step.execute(context);

    // Run after hooks
    for (const hook of afterHooks) {
      await hook(step, result, context);
    }

    return result;
  };

  const engine = { use, executeStep };
  return engine;
};

// Usage
const engine = createWorkflowEngine();

engine.use({
  before: async (step, context) => {
    console.log(`[${new Date().toISOString()}] Starting: ${step.name}`);
    context.startTime = Date.now();
  },
  after: async (step, result, context) => {
    const duration = Date.now() - context.startTime;
    console.log(`[${new Date().toISOString()}] Completed: ${step.name} (${duration}ms)`);
  }
});

engine.use({
  before: async (step, context) => {
    if (step.condition && !step.condition(context)) {
      return false; // Skip step
    }
  }
});
```

### 3.3 VoltAgent-Style Hooks

Comprehensive hook system for production workflows.

```javascript
const workflow = createWorkflowChain({
  id: "agent-orchestration",
  input: z.object({ taskId: z.string(), agentType: z.string() }),
  hooks: {
    onStart: async (state) => {
      await metrics.trackWorkflowStart(state.workflowId);
    },
    onStepStart: async (state) => {
      await metrics.trackStepStart(state.stepId);
    },
    onStepEnd: async (state) => {
      await metrics.trackStepEnd(state.stepId, state.duration);
    },
    onFinish: async (info) => {
      if (info.status === "completed") {
        await notifySuccess(info.state.data);
      } else if (info.status === "error") {
        await alertTeam(info.error);
      }
    }
  }
})
.andThen({ id: "validate", execute: validateInput })
.andThen({ id: "spawn", execute: spawnAgent })
.andThen({ id: "execute", execute: executeTask });
```

---

## 4. Checkpoint and Resume Patterns

### 4.1 Snapshot-Based Persistence (Recommended)

Full state snapshot at each checkpoint.

```javascript
class CheckpointManager {
  constructor(storage) {
    this.storage = storage; // MemoryStorage, FileStorage, RedisStorage
  }

  async createCheckpoint(workflowId, runId, state) {
    const checkpoint = {
      id: `${workflowId}-${runId}-${Date.now()}`,
      workflowId,
      runId,
      timestamp: Date.now(),
      state: {
        currentStep: state.currentStep,
        stepResults: state.stepResults,
        context: state.context,
        attempts: state.attempts
      }
    };
    
    await this.storage.save(checkpoint.id, checkpoint);
    return checkpoint.id;
  }

  async loadLatestCheckpoint(workflowId, runId) {
    const checkpoints = await this.storage.list({ workflowId, runId });
    if (checkpoints.length === 0) return null;
    
    const latest = checkpoints.sort((a, b) => b.timestamp - a.timestamp)[0];
    return await this.storage.load(latest.id);
  }

  async resume(workflowId, runId, workflow) {
    const checkpoint = await this.loadLatestCheckpoint(workflowId, runId);
    if (!checkpoint) {
      throw new Error('No checkpoint found');
    }

    // Find the step to resume from
    const stepIndex = workflow.steps.findIndex(
      s => s.name === checkpoint.state.currentStep
    );

    return {
      startFromStep: stepIndex,
      state: checkpoint.state
    };
  }
}

// Storage implementations
class MemoryStorage {
  constructor() { this.data = new Map(); }
  async save(id, data) { this.data.set(id, data); }
  async load(id) { return this.data.get(id); }
  async list(filter) { 
    return Array.from(this.data.values())
      .filter(c => c.workflowId === filter.workflowId); 
  }
}

class FileStorage {
  constructor(dir) { this.dir = dir; }
  async save(id, data) {
    await fs.writeFile(
      path.join(this.dir, `${id}.json`),
      JSON.stringify(data)
    );
  }
  async load(id) {
    const content = await fs.readFile(
      path.join(this.dir, `${id}.json`), 'utf8'
    );
    return JSON.parse(content);
  }
}
```

### 4.2 Event Sourcing Pattern

For complex workflows requiring full audit trail.

```javascript
class EventSourcedWorkflow {
  constructor(workflowId) {
    this.workflowId = workflowId;
    this.events = [];
    this.state = this.getInitialState();
  }

  getInitialState() {
    return {
      status: 'pending',
      currentStep: null,
      stepResults: {},
      context: {}
    };
  }

  apply(event) {
    this.events.push({ ...event, timestamp: Date.now() });
    this.state = this.reduce(this.state, event);
  }

  reduce(state, event) {
    switch (event.type) {
      case 'WORKFLOW_STARTED':
        return { ...state, status: 'running' };
      case 'STEP_STARTED':
        return { ...state, currentStep: event.stepName };
      case 'STEP_COMPLETED':
        return {
          ...state,
          stepResults: {
            ...state.stepResults,
            [event.stepName]: event.result
          }
        };
      case 'STEP_FAILED':
        return { ...state, status: 'failed', error: event.error };
      case 'WORKFLOW_COMPLETED':
        return { ...state, status: 'completed' };
      default:
        return state;
    }
  }

  async persist(storage) {
    await storage.saveEvents(this.workflowId, this.events);
  }

  static async restore(storage, workflowId) {
    const events = await storage.loadEvents(workflowId);
    const workflow = new EventSourcedWorkflow(workflowId);
    for (const event of events) {
      workflow.state = workflow.reduce(workflow.state, event);
    }
    workflow.events = events;
    return workflow;
  }
}
```

### 4.3 Step-Based Checkpointing (Medusa Pattern)

Checkpoint at specific points with transaction support.

```javascript
const workflowWithCheckpoints = createWorkflow(
  "resilient-workflow",
  async function(input, context) {
    // Step 1: Checkpoint after validation
    const validated = await context.checkpoint({
      key: 'validation',
      fn: () => validateInput(input)
    });

    // Step 2: Checkpoint after agent spawn
    const agent = await context.checkpoint({
      key: 'spawn-agent',
      fn: () => spawnAgent(validated.agentType)
    });

    // Step 3: Checkpoint after task execution
    const result = await context.checkpoint({
      key: 'execute-task',
      fn: () => executeTask(agent, validated.taskId)
    });

    return result;
  }
);

// Resume from checkpoint
const resumePoint = await getLastCheckpoint(runId);
await workflowWithCheckpoints.resume(resumePoint);
```

---

## 5. Recommended Approach for Agent-Studio

### 5.1 Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                    Workflow Engine                          │
├─────────────────────────────────────────────────────────────┤
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐ │
│  │   YAML      │  │   State     │  │    Checkpoint       │ │
│  │   Parser    │──│   Machine   │──│    Manager          │ │
│  └─────────────┘  └─────────────┘  └─────────────────────┘ │
│         │                │                    │             │
│         ▼                ▼                    ▼             │
│  ┌─────────────────────────────────────────────────────────┤
│  │                 Step Executor                           │ │
│  │  ┌──────────┐  ┌──────────┐  ┌──────────┐             │ │
│  │  │ Before   │─▶│ Execute  │─▶│ After    │             │ │
│  │  │ Hooks    │  │ Step     │  │ Hooks    │             │ │
│  │  └──────────┘  └──────────┘  └──────────┘             │ │
│  └─────────────────────────────────────────────────────────┤
│                           │                                 │
│         ┌─────────────────┼─────────────────┐              │
│         ▼                 ▼                 ▼              │
│  ┌───────────┐     ┌───────────┐     ┌───────────┐        │
│  │ Command   │     │ Function  │     │ SubAgent  │        │
│  │ Step      │     │ Step      │     │ Step      │        │
│  └───────────┘     └───────────┘     └───────────┘        │
└─────────────────────────────────────────────────────────────┘
```

### 5.2 Proposed Workflow Definition Format

```yaml
# .claude/workflows/example-workflow.yaml
apiVersion: v1
kind: Workflow
metadata:
  name: feature-development
  description: End-to-end feature development workflow
  
spec:
  # Input validation
  input:
    schema:
      type: object
      properties:
        taskId:
          type: string
        featureDescription:
          type: string
      required: [taskId, featureDescription]
  
  # Environment variables
  env:
    LOG_LEVEL: info
    
  # Workflow steps
  steps:
    - id: plan
      name: Create Development Plan
      agent: planner
      inputs:
        description: "{{ input.featureDescription }}"
      outputs:
        - plan
      hooks:
        before:
          - validate-input
        after:
          - save-plan-artifact
          
    - id: implement
      name: Implement Feature
      agent: developer
      depends: [plan]
      inputs:
        plan: "{{ steps.plan.outputs.plan }}"
      outputs:
        - code
        - files
      continueOn:
        failure: false
        
    - id: test
      name: Run Tests
      agent: qa
      depends: [implement]
      inputs:
        files: "{{ steps.implement.outputs.files }}"
      gate:
        condition: "{{ steps.test.outputs.passed == true }}"
        onFailure: retry
        maxRetries: 3
        
    - id: review
      name: Security Review
      agent: security-architect
      depends: [test]
      parallel: true  # Can run in parallel with other reviews
      
  # Lifecycle handlers
  handlers:
    onStart:
      - log-workflow-start
    onComplete:
      - notify-success
      - update-task-status
    onError:
      - notify-failure
      - save-error-state
    onCheckpoint:
      - persist-state
```

### 5.3 Minimal Implementation

```javascript
// workflow-engine.js
const yaml = require('yaml');
const fs = require('fs');

class WorkflowEngine {
  constructor(options = {}) {
    this.hooks = options.hooks || {};
    this.checkpointManager = options.checkpointManager || new MemoryCheckpointManager();
    this.stepExecutors = new Map();
    
    // Register default step executors
    this.registerStepExecutor('agent', this.executeAgentStep.bind(this));
    this.registerStepExecutor('command', this.executeCommandStep.bind(this));
    this.registerStepExecutor('function', this.executeFunctionStep.bind(this));
  }

  registerStepExecutor(type, executor) {
    this.stepExecutors.set(type, executor);
  }

  async loadWorkflow(path) {
    const content = fs.readFileSync(path, 'utf8');
    return yaml.parse(content);
  }

  async execute(workflow, input, options = {}) {
    const runId = options.runId || this.generateRunId();
    const state = await this.initializeState(workflow, input, runId);
    
    await this.callHook('onStart', state);
    
    try {
      // Check for resume point
      if (options.resumeFrom) {
        const checkpoint = await this.checkpointManager.load(runId, options.resumeFrom);
        Object.assign(state, checkpoint.state);
      }

      // Execute steps
      for (const step of this.getExecutableSteps(workflow, state)) {
        if (state.completedSteps.has(step.id)) continue;
        
        await this.executeStep(step, state);
        await this.checkpointManager.save(runId, step.id, state);
      }
      
      state.status = 'completed';
      await this.callHook('onComplete', state);
      
    } catch (error) {
      state.status = 'failed';
      state.error = error;
      await this.callHook('onError', state, error);
      throw error;
    }
    
    return state;
  }

  async executeStep(step, state) {
    state.currentStep = step.id;
    await this.callHook('onStepStart', step, state);
    
    try {
      // Run before hooks
      for (const hookName of step.hooks?.before || []) {
        await this.runHook(hookName, step, state);
      }
      
      // Check gate condition
      if (step.gate?.condition) {
        const shouldProceed = await this.evaluateCondition(step.gate.condition, state);
        if (!shouldProceed) {
          throw new Error(`Gate condition failed for step ${step.id}`);
        }
      }
      
      // Execute step
      const executor = this.stepExecutors.get(step.agent ? 'agent' : step.type || 'function');
      const result = await executor(step, state);
      
      // Store outputs
      state.stepResults[step.id] = result;
      state.completedSteps.add(step.id);
      
      // Run after hooks
      for (const hookName of step.hooks?.after || []) {
        await this.runHook(hookName, step, state, result);
      }
      
      await this.callHook('onStepEnd', step, state, result);
      
    } catch (error) {
      if (step.continueOn?.failure) {
        state.stepErrors[step.id] = error;
        state.completedSteps.add(step.id);
      } else {
        throw error;
      }
    }
  }

  async executeAgentStep(step, state) {
    // Spawn agent via Task tool
    const agentDef = await this.loadAgentDefinition(step.agent);
    const inputs = this.resolveInputs(step.inputs, state);
    
    // This would integrate with the Task tool
    return await this.spawnAgent(agentDef, inputs, state);
  }

  getExecutableSteps(workflow, state) {
    // Topological sort based on dependencies
    const steps = workflow.spec.steps;
    const executed = new Set(state.completedSteps);
    const result = [];
    
    while (result.length < steps.length) {
      for (const step of steps) {
        if (executed.has(step.id)) continue;
        
        const deps = step.depends || [];
        if (deps.every(d => executed.has(d))) {
          result.push(step);
          executed.add(step.id);
        }
      }
    }
    
    return result;
  }

  resolveInputs(inputs, state) {
    if (!inputs) return {};
    
    const resolved = {};
    for (const [key, value] of Object.entries(inputs)) {
      resolved[key] = this.interpolate(value, state);
    }
    return resolved;
  }

  interpolate(template, state) {
    if (typeof template !== 'string') return template;
    
    return template.replace(/\{\{\s*(.+?)\s*\}\}/g, (_, path) => {
      return this.getValueByPath(state, path);
    });
  }

  getValueByPath(obj, path) {
    return path.split('.').reduce((curr, key) => curr?.[key], obj);
  }

  async callHook(name, ...args) {
    if (this.hooks[name]) {
      await this.hooks[name](...args);
    }
  }

  generateRunId() {
    return `run-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  initializeState(workflow, input, runId) {
    return {
      runId,
      workflowId: workflow.metadata.name,
      status: 'running',
      input,
      stepResults: {},
      stepErrors: {},
      completedSteps: new Set(),
      currentStep: null,
      startedAt: Date.now()
    };
  }
}

class MemoryCheckpointManager {
  constructor() {
    this.checkpoints = new Map();
  }

  async save(runId, stepId, state) {
    const key = `${runId}:${stepId}`;
    this.checkpoints.set(key, {
      runId,
      stepId,
      timestamp: Date.now(),
      state: JSON.parse(JSON.stringify({
        ...state,
        completedSteps: Array.from(state.completedSteps)
      }))
    });
  }

  async load(runId, stepId) {
    const key = `${runId}:${stepId}`;
    const checkpoint = this.checkpoints.get(key);
    if (checkpoint) {
      checkpoint.state.completedSteps = new Set(checkpoint.state.completedSteps);
    }
    return checkpoint;
  }

  async getLatest(runId) {
    const checkpoints = Array.from(this.checkpoints.values())
      .filter(c => c.runId === runId)
      .sort((a, b) => b.timestamp - a.timestamp);
    return checkpoints[0];
  }
}

module.exports = { WorkflowEngine, MemoryCheckpointManager };
```

---

## 6. Comparison Matrix

| Feature | Simple State Machine | XState | javascript-state-machine | Recommended Approach |
|---------|---------------------|--------|-------------------------|---------------------|
| Bundle Size | ~1KB | ~50KB | ~10KB | ~5KB |
| TypeScript | Manual | Built-in | Partial | Full |
| Checkpoints | Manual | Via services | Plugin | Built-in |
| YAML Support | No | No | No | Built-in |
| Hooks | Manual | Built-in | Lifecycle | Built-in |
| Visualization | No | Yes | No | Optional |
| Learning Curve | Low | High | Medium | Low |
| Dependencies | None | None | None | yaml (optional) |

---

## 7. Implementation Recommendations

### Priority 1: Core Engine
1. Implement simple state machine for workflow status
2. Add YAML parser for workflow definitions
3. Create step executor with hook support
4. Implement memory-based checkpoint manager

### Priority 2: Integration
1. Connect to Task tool for agent spawning
2. Add file-based checkpoint persistence
3. Implement input/output interpolation
4. Add gate/condition evaluation

### Priority 3: Advanced Features
1. Parallel step execution
2. Retry logic with backoff
3. Workflow composition (sub-workflows)
4. Event-driven triggers

---

## Sources

- [Kent C. Dodds - Simple State Machine](https://kentcdodds.com/blog/implementing-a-simple-state-machine-library-in-javascript)
- [XState Documentation](https://xstate.js.org/docs/)
- [javascript-state-machine](https://github.com/jakesgordon/javascript-state-machine)
- [Dagu Workflow Engine](https://github.com/dagu-org/dagu)
- [Conductor Workflow](https://github.com/danielgerlag/conductor)
- [VoltAgent Workflow Hooks](https://voltagent.dev/docs/workflows/hooks)
- [Mastra Workflow Engine](https://github.com/mastra-ai/mastra)
- [LangGraph Durable Execution](https://docs.langchain.com/oss/javascript/langgraph/durable-execution)
- [Microsoft Agent Framework Checkpointing](https://learn.microsoft.com/en-us/agent-framework/tutorials/workflows/checkpointing-and-resuming)
- [Medusa Workflow SDK](https://docs.medusajs.com/learn/fundamentals/workflows)
