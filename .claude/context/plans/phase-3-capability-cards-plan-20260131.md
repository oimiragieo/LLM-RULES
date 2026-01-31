# Plan: Phase 3 - Agent Capability Cards (Orchestrator-Level Agent Discovery)

## Executive Summary

Design and implement an Agent Capability Card system that enables orchestrators to dynamically discover agent capabilities, health status, and constraints at runtime. This transforms static agent routing (hardcoded in CLAUDE.md routing table) into dynamic capability-based discovery, enabling self-healing, hot-swapping, and intelligent load distribution.

**Core Value Proposition**: Orchestrators transition from "which agent do I spawn?" (hardcoded lookup) to "which agents can handle this capability?" (dynamic discovery with health awareness).

**Phase Summary**:
- **Phase 1** (53 tests): Agents know their tools (static pre-spawn injection)
- **Phase 2** (50 tests): Agents discover skills (dynamic runtime queries)
- **Phase 3** (this plan): Orchestrators discover agents (capability-based routing with health tracking)

**Total System Tests Target**: 103 existing + 35 new = 138+ tests

---

## Objectives

1. **Define Agent Capability Card Specification** - Standardized format for agents to publish their capabilities, constraints, and health status
2. **Implement Agent Registry** - Centralized registry for storing and querying agent capability cards
3. **Create AvailableAgents() Discovery Service** - Tool for orchestrators to query agents by capability, domain, or health status
4. **Implement Health Tracking** - Real-time monitoring of agent success/failure rates with automatic isolation
5. **Integrate with Router and Orchestrators** - Update routing logic to use capability discovery instead of hardcoded tables
6. **Enable Self-Healing** - Automatic isolation of failed agents and failover to alternatives

## Success Criteria

- [ ] Agent capability card schema defined (JSON Schema v7)
- [ ] Agent registry (`agent-registry.json`) auto-generated from agent definitions
- [ ] AvailableAgents() tool implemented with capability/domain/health filters
- [ ] Health tracking functional (spawn success/failure tracking)
- [ ] Router uses capability discovery for agent selection
- [ ] Failed agents automatically isolated after 3 consecutive failures
- [ ] 35+ tests for Phase 3 (unit + integration + health tracking)
- [ ] Zero regressions in Phase 1-2 (103 tests still passing)
- [ ] ADR-071 created documenting Agent Capability Cards pattern

---

## Phases

### Phase 0: Research & Planning (FOUNDATION)

**Purpose**: Research agent capability patterns, validate technical approach, assess integration risks
**Duration**: 6-8 hours
**Parallel OK**: No (blocking for subsequent phases)

#### Research Requirements (MANDATORY)

Before implementing Agent Capability Cards:

- [ ] Minimum 3 WebSearch queries executed on agent capability patterns
- [ ] Minimum 3 external sources consulted (service mesh, microservices patterns, actor model frameworks)
- [ ] Research report generated comparing capability discovery approaches
- [ ] Design decisions documented with rationale (ADR-071)

**Research Topics**:

1. **Service Capability Discovery Patterns**: How do microservices/service meshes handle capability registration?
   - Kubernetes service discovery and health checks
   - Consul/Eureka service registries
   - Actor model frameworks (Akka, Orleans) agent capabilities
   - gRPC service reflection

2. **Health Check Patterns**: Best practices for health monitoring and circuit breakers
   - Circuit breaker patterns (Hystrix, resilience4j)
   - Health check strategies (liveness, readiness, startup)
   - Failure isolation and recovery patterns

3. **Agent Registry Design**: Centralized vs distributed capability registries
   - Single source of truth vs distributed caches
   - Registry invalidation strategies
   - Hot reload of capability cards

**Research Output**: `.claude/context/artifacts/research-reports/phase-3-capability-cards-research.md`

#### Constitution Checkpoint

**CRITICAL VALIDATION**: Before proceeding to Phase 3A, ALL of the following MUST pass:

1. **Research Completeness**
   - [ ] Research report contains minimum 3 external sources with citations
   - [ ] All capability discovery patterns compared (centralized vs distributed)
   - [ ] ADR-071 created: Agent Capability Cards Pattern

2. **Technical Feasibility**
   - [ ] Capability card schema validated (JSON Schema v7)
   - [ ] Agent registry approach confirmed (centralized `.claude/context/agent-registry.json`)
   - [ ] No blocking issues with health tracking implementation

3. **Integration Review**
   - [ ] Backward compatibility with Phase 1-2 confirmed
   - [ ] Migration path for router documented
   - [ ] No breaking changes to existing agent definitions

4. **Specification Quality**
   - [ ] Capability card format is clear and comprehensive
   - [ ] AvailableAgents() tool signature defined
   - [ ] Health tracking thresholds specified (3 failures = isolation)

**If ANY item fails, return to research phase. DO NOT proceed to implementation.**

#### Phase 0 Tasks

- [ ] **0.1** Research capability discovery patterns in service mesh and actor systems (~3 hours)
  - **Queries**: "Kubernetes service discovery patterns", "Actor model agent capabilities", "microservice health check circuit breaker"
  - **Output**: `.claude/context/artifacts/research-reports/phase-3-capability-cards-research.md`
  - **Verify**: Research report exists with 3+ sources

- [ ] **0.2** Document capability card design decisions (~2 hours)
  - **ADR**: ADR-071: Agent Capability Cards Pattern
  - **Output**: `.claude/context/memory/decisions.md`
  - **Verify**: ADR includes registry location, health tracking thresholds, and failover strategy

- [ ] **0.3** Validate backward compatibility with Phase 1-2 (~1 hour)
  - **Test**: Verify SkillCatalog (Phase 2) and AvailableAgents (Phase 3) can coexist
  - **Test**: Verify tool-manifest.json (Phase 1) is not affected
  - **Output**: Compatibility test results documented
  - **Verify**: No breaking changes to existing functionality

**Success Criteria**: Research complete, ADR-071 created, constitution checkpoint passed (all 4 gates green)

---

### Phase 3A: Agent Capability Card Specification (2 days)

**Purpose**: Define the standardized format for agent capability cards
**Dependencies**: Phase 0 complete
**Duration**: 8-12 hours
**Parallel OK**: No (foundation for 3B-3E)

#### 3A.1 Capability Card Schema Design

Each agent publishes a capability card with the following structure:

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "agent-capability-card.schema.json",
  "title": "Agent Capability Card",
  "type": "object",
  "required": ["id", "version", "capabilities", "metadata"],
  "properties": {
    "id": {
      "type": "string",
      "description": "Unique agent identifier (e.g., 'code-reviewer', 'developer')",
      "pattern": "^[a-z][a-z0-9-]*$"
    },
    "version": {
      "type": "string",
      "description": "Agent definition version (semver)",
      "pattern": "^\\d+\\.\\d+\\.\\d+$"
    },
    "displayName": {
      "type": "string",
      "description": "Human-readable agent name"
    },
    "description": {
      "type": "string",
      "description": "Brief agent description"
    },
    "category": {
      "type": "string",
      "enum": ["core", "domain", "specialized", "orchestrator"],
      "description": "Agent category directory"
    },
    "model": {
      "type": "string",
      "enum": ["haiku", "sonnet", "opus"],
      "default": "sonnet",
      "description": "Recommended model for this agent"
    },
    "capabilities": {
      "type": "array",
      "description": "List of capabilities this agent provides",
      "items": {
        "$ref": "#/$defs/capability"
      },
      "minItems": 1
    },
    "requiredTools": {
      "type": "array",
      "description": "Tools required for this agent to function",
      "items": { "type": "string" }
    },
    "optionalTools": {
      "type": "array",
      "description": "Optional tools that enhance agent capabilities",
      "items": { "type": "string" }
    },
    "skills": {
      "type": "array",
      "description": "Skills this agent should use",
      "items": { "type": "string" }
    },
    "constraints": {
      "$ref": "#/$defs/constraints"
    },
    "metadata": {
      "$ref": "#/$defs/metadata"
    },
    "health": {
      "$ref": "#/$defs/health"
    }
  },
  "$defs": {
    "capability": {
      "type": "object",
      "required": ["name", "domain"],
      "properties": {
        "name": {
          "type": "string",
          "description": "Capability name (e.g., 'code-review', 'bug-fix', 'testing')"
        },
        "domain": {
          "type": "string",
          "description": "Domain this capability belongs to (e.g., 'code', 'testing', 'research')"
        },
        "description": {
          "type": "string",
          "description": "What this capability does"
        },
        "triggerPhrases": {
          "type": "array",
          "description": "Phrases that trigger this capability",
          "items": { "type": "string" }
        },
        "requiredTools": {
          "type": "array",
          "description": "Tools required for this specific capability",
          "items": { "type": "string" }
        },
        "requiredSkills": {
          "type": "array",
          "description": "Skills required for this specific capability",
          "items": { "type": "string" }
        },
        "inputs": {
          "type": "object",
          "description": "Expected inputs for this capability",
          "additionalProperties": {
            "type": "string",
            "enum": ["required", "optional"]
          }
        },
        "outputs": {
          "type": "object",
          "description": "Expected outputs from this capability",
          "additionalProperties": { "type": "string" }
        },
        "priority": {
          "type": "integer",
          "description": "Priority for this capability (1=highest)",
          "minimum": 1,
          "maximum": 10,
          "default": 5
        }
      }
    },
    "constraints": {
      "type": "object",
      "properties": {
        "maxConcurrentTasks": {
          "type": "integer",
          "description": "Maximum concurrent tasks (0 = unlimited)",
          "default": 0
        },
        "maxTaskSize": {
          "type": "string",
          "description": "Maximum task size (e.g., '50KB', '1MB')",
          "default": "unlimited"
        },
        "timeout": {
          "type": "integer",
          "description": "Task timeout in seconds (0 = no limit)",
          "default": 0
        },
        "exclusions": {
          "type": "array",
          "description": "Task types this agent should NOT handle",
          "items": { "type": "string" }
        },
        "routeTo": {
          "type": "object",
          "description": "Routing overrides for specific task types",
          "additionalProperties": { "type": "string" }
        }
      }
    },
    "metadata": {
      "type": "object",
      "required": ["lastUpdated"],
      "properties": {
        "author": {
          "type": "string",
          "default": "anthropic"
        },
        "lastUpdated": {
          "type": "string",
          "format": "date-time"
        },
        "definitionPath": {
          "type": "string",
          "description": "Path to agent definition file"
        },
        "status": {
          "type": "string",
          "enum": ["active", "deprecated", "experimental"],
          "default": "active"
        }
      }
    },
    "health": {
      "type": "object",
      "properties": {
        "status": {
          "type": "string",
          "enum": ["healthy", "degraded", "unavailable"],
          "default": "healthy"
        },
        "lastHealthCheck": {
          "type": "string",
          "format": "date-time"
        },
        "consecutiveFailures": {
          "type": "integer",
          "default": 0
        },
        "totalSpawns": {
          "type": "integer",
          "default": 0
        },
        "successfulSpawns": {
          "type": "integer",
          "default": 0
        },
        "failedSpawns": {
          "type": "integer",
          "default": 0
        },
        "successRate": {
          "type": "number",
          "minimum": 0,
          "maximum": 1,
          "default": 1
        },
        "isolatedAt": {
          "type": "string",
          "format": "date-time",
          "description": "When agent was isolated (if unavailable)"
        },
        "isolationReason": {
          "type": "string",
          "description": "Why agent was isolated"
        }
      }
    }
  }
}
```

#### 3A.2 Example Capability Cards

**Example 1: code-reviewer**

```json
{
  "id": "code-reviewer",
  "version": "1.0.0",
  "displayName": "Code Reviewer",
  "description": "Reviews code for quality, security, and best practices",
  "category": "specialized",
  "model": "sonnet",
  "capabilities": [
    {
      "name": "code-review",
      "domain": "code",
      "description": "Review code changes for quality and issues",
      "triggerPhrases": ["review code", "code review", "PR review", "review this"],
      "requiredTools": ["Read", "Grep"],
      "requiredSkills": ["code-reviewer"],
      "inputs": {
        "codeSnippet": "required",
        "language": "optional",
        "context": "optional"
      },
      "outputs": {
        "review": "Code review feedback",
        "issues": "List of found issues",
        "suggestions": "Improvement suggestions"
      },
      "priority": 1
    },
    {
      "name": "code-quality-analysis",
      "domain": "code",
      "description": "Analyze code quality metrics and patterns",
      "triggerPhrases": ["analyze code quality", "code metrics", "quality check"],
      "requiredTools": ["Read", "Grep", "Glob"],
      "requiredSkills": ["code-quality-expert"],
      "inputs": {
        "codeBase": "required",
        "language": "optional"
      },
      "outputs": {
        "metrics": "Quality metrics",
        "report": "Analysis report"
      },
      "priority": 2
    }
  ],
  "requiredTools": ["Read", "Grep", "Glob"],
  "optionalTools": [],
  "skills": ["code-reviewer", "code-quality-expert", "code-analyzer"],
  "constraints": {
    "maxConcurrentTasks": 5,
    "exclusions": ["implementation", "bug-fix", "write-code"]
  },
  "metadata": {
    "author": "anthropic",
    "lastUpdated": "2026-01-31T00:00:00Z",
    "definitionPath": ".claude/agents/specialized/code-reviewer.md",
    "status": "active"
  },
  "health": {
    "status": "healthy",
    "lastHealthCheck": "2026-01-31T12:00:00Z",
    "consecutiveFailures": 0,
    "totalSpawns": 15,
    "successfulSpawns": 15,
    "failedSpawns": 0,
    "successRate": 1.0
  }
}
```

**Example 2: developer**

```json
{
  "id": "developer",
  "version": "1.1.0",
  "displayName": "Developer",
  "description": "TDD-focused implementer. Writes code, runs tests, and refactors.",
  "category": "core",
  "model": "sonnet",
  "capabilities": [
    {
      "name": "implementation",
      "domain": "code",
      "description": "Implement features and write code",
      "triggerPhrases": ["implement", "write code", "code this", "build", "create"],
      "requiredTools": ["Read", "Write", "Edit", "Bash"],
      "requiredSkills": ["tdd"],
      "inputs": {
        "requirements": "required",
        "codebase": "optional"
      },
      "outputs": {
        "code": "Implemented code",
        "tests": "Unit tests"
      },
      "priority": 1
    },
    {
      "name": "bug-fix",
      "domain": "code",
      "description": "Fix bugs and resolve issues",
      "triggerPhrases": ["fix bug", "debug", "resolve issue", "fix this"],
      "requiredTools": ["Read", "Write", "Edit", "Bash", "Grep"],
      "requiredSkills": ["debugging"],
      "inputs": {
        "bugDescription": "required",
        "errorMessage": "optional",
        "stackTrace": "optional"
      },
      "outputs": {
        "fix": "Bug fix code",
        "rootCause": "Root cause analysis"
      },
      "priority": 1
    },
    {
      "name": "refactoring",
      "domain": "code",
      "description": "Refactor and improve code quality",
      "triggerPhrases": ["refactor", "improve code", "clean up", "optimize"],
      "requiredTools": ["Read", "Write", "Edit", "Bash"],
      "requiredSkills": ["code-quality-expert"],
      "inputs": {
        "codeToRefactor": "required"
      },
      "outputs": {
        "refactoredCode": "Improved code",
        "changes": "List of changes"
      },
      "priority": 2
    }
  ],
  "requiredTools": ["Read", "Write", "Edit", "Bash", "Glob", "Grep", "TaskUpdate"],
  "optionalTools": [],
  "skills": ["tdd", "debugging", "git-expert", "code-quality-expert"],
  "constraints": {
    "maxConcurrentTasks": 3,
    "exclusions": ["documentation", "security-review", "architecture-design", "qa-process"],
    "routeTo": {
      "documentation": "technical-writer",
      "security-review": "security-architect",
      "architecture-design": "architect",
      "qa-process": "qa"
    }
  },
  "metadata": {
    "author": "anthropic",
    "lastUpdated": "2026-01-31T00:00:00Z",
    "definitionPath": ".claude/agents/core/developer.md",
    "status": "active"
  },
  "health": {
    "status": "healthy",
    "lastHealthCheck": "2026-01-31T12:00:00Z",
    "consecutiveFailures": 0,
    "totalSpawns": 50,
    "successfulSpawns": 48,
    "failedSpawns": 2,
    "successRate": 0.96
  }
}
```

**Example 3: researcher**

```json
{
  "id": "researcher",
  "version": "1.0.0",
  "displayName": "Researcher",
  "description": "Conducts research and fact-finding using web search and analysis",
  "category": "specialized",
  "model": "sonnet",
  "capabilities": [
    {
      "name": "research",
      "domain": "research",
      "description": "Research topics and gather information",
      "triggerPhrases": ["research", "find out", "investigate", "look up", "gather information"],
      "requiredTools": ["Read", "WebSearch", "WebFetch"],
      "requiredSkills": ["research-synthesis"],
      "inputs": {
        "topic": "required",
        "depth": "optional"
      },
      "outputs": {
        "findings": "Research findings",
        "sources": "Source citations"
      },
      "priority": 1
    },
    {
      "name": "fact-check",
      "domain": "research",
      "description": "Verify facts and claims",
      "triggerPhrases": ["fact check", "verify", "is this true", "confirm"],
      "requiredTools": ["Read", "WebSearch", "WebFetch"],
      "requiredSkills": ["research-synthesis"],
      "inputs": {
        "claim": "required"
      },
      "outputs": {
        "verdict": "True/False/Partially True",
        "evidence": "Supporting evidence"
      },
      "priority": 2
    }
  ],
  "requiredTools": ["Read", "Glob", "Grep", "WebSearch", "WebFetch"],
  "optionalTools": [],
  "skills": ["research-synthesis", "arxiv-mcp"],
  "constraints": {
    "maxConcurrentTasks": 3,
    "exclusions": ["implementation", "code-review"]
  },
  "metadata": {
    "author": "anthropic",
    "lastUpdated": "2026-01-31T00:00:00Z",
    "definitionPath": ".claude/agents/specialized/researcher.md",
    "status": "active"
  },
  "health": {
    "status": "healthy",
    "lastHealthCheck": "2026-01-31T12:00:00Z",
    "consecutiveFailures": 0,
    "totalSpawns": 10,
    "successfulSpawns": 10,
    "failedSpawns": 0,
    "successRate": 1.0
  }
}
```

#### Tasks

- [ ] **3A.1** Create agent capability card JSON schema (~3 hours)
  - **File**: `.claude/schemas/agent-capability-card.schema.json`
  - **Verify**: Schema validates example capability cards

- [ ] **3A.2** Create example capability cards for 5 key agents (~3 hours)
  - **Agents**: code-reviewer, developer, researcher, security-architect, qa
  - **Output**: Examples in plan document (above)
  - **Verify**: Examples validate against schema

- [ ] **3A.3** Define capability extraction rules from agent definitions (~2 hours)
  - **Rules**:
    - `id` = agent filename without extension
    - `version` = frontmatter version field
    - `capabilities` = extracted from "Workflow" section + trigger phrases
    - `requiredTools` = frontmatter tools array
    - `skills` = frontmatter skills array
    - `constraints.exclusions` = "Routing Exclusions" section
  - **Output**: Extraction rules documented in plan
  - **Verify**: Rules cover all agent definition patterns

#### Phase 3A Verification Gate

```bash
# Schema validates
npx ajv validate -s .claude/schemas/agent-capability-card.schema.json -d examples/code-reviewer.json
# Expected: valid
```

**Success Criteria**: Agent capability card schema created and validated with examples

---

### Phase 3B: Agent Registry Service (2 days)

**Purpose**: Create centralized registry for storing and querying agent capability cards
**Dependencies**: Phase 3A complete
**Duration**: 10-14 hours
**Parallel OK**: No (foundation for 3C-3D)

#### 3B.1 Registry Structure

```json
{
  "version": "1.0.0",
  "generatedAt": "2026-01-31T00:00:00Z",
  "metadata": {
    "totalAgents": 48,
    "healthyAgents": 46,
    "degradedAgents": 1,
    "unavailableAgents": 1,
    "lastUpdated": "2026-01-31T00:00:00Z"
  },
  "agents": {
    "code-reviewer": { /* capability card */ },
    "developer": { /* capability card */ },
    "researcher": { /* capability card */ },
    "security-architect": { /* capability card */ },
    "qa": { /* capability card */ },
    "architect": { /* capability card */ },
    "planner": { /* capability card */ },
    "technical-writer": { /* capability card */ },
    /* ... 48 total agents ... */
  },
  "indexes": {
    "byCapability": {
      "code-review": ["code-reviewer", "code-simplifier"],
      "implementation": ["developer"],
      "bug-fix": ["developer", "devops-troubleshooter"],
      "testing": ["qa", "developer"],
      "research": ["researcher", "scientific-research-expert"],
      "security-review": ["security-architect"],
      "documentation": ["technical-writer"],
      "architecture": ["architect"],
      "planning": ["planner"]
    },
    "byDomain": {
      "code": ["code-reviewer", "developer", "code-simplifier"],
      "testing": ["qa", "developer"],
      "research": ["researcher", "scientific-research-expert"],
      "security": ["security-architect"],
      "documentation": ["technical-writer"],
      "infrastructure": ["devops", "devops-troubleshooter"],
      "python": ["python-pro"],
      "javascript": ["nodejs-pro", "frontend-pro", "nextjs-pro"],
      "mobile": ["ios-pro", "android-pro", "expo-mobile-developer"]
    },
    "byCategory": {
      "core": ["developer", "qa", "architect", "planner", "technical-writer", "pm", "reflection-agent", "context-compressor"],
      "specialized": ["code-reviewer", "code-simplifier", "security-architect", "devops", "researcher"],
      "domain": ["python-pro", "rust-pro", "golang-pro", "typescript-pro", "frontend-pro", "nodejs-pro"],
      "orchestrator": ["master-orchestrator", "swarm-coordinator", "evolution-orchestrator", "party-orchestrator"]
    }
  },
  "health": {
    "healthy": ["code-reviewer", "developer", "qa", "architect", /* ... */],
    "degraded": ["security-architect"],
    "unavailable": ["scientific-research-expert"]
  }
}
```

#### 3B.2 Registry Generator

Create a script to auto-generate `agent-registry.json` from agent definition files:

```javascript
// .claude/lib/tools/agent-registry-generator.cjs

/**
 * Generate agent-registry.json from agent definition files
 *
 * Algorithm:
 * 1. Scan .claude/agents/**/*.md for agent definitions
 * 2. Parse YAML frontmatter from each file
 * 3. Extract capabilities from:
 *    - Frontmatter tools, skills, model
 *    - "Workflow" section (capability names)
 *    - "Routing Exclusions" section (exclusions)
 * 4. Generate capability card for each agent
 * 5. Build indexes (byCapability, byDomain, byCategory)
 * 6. Initialize health tracking (all healthy, 0 failures)
 * 7. Write agent-registry.json
 */
function generateAgentRegistry() {
  // Implementation in Phase 3B
}
```

#### Tasks

- [ ] **3B.1** Create agent registry generator script (~4 hours)
  - **File**: `.claude/lib/tools/agent-registry-generator.cjs`
  - **Features**:
    - Scan `.claude/agents/**/*.md` for definitions
    - Parse YAML frontmatter
    - Extract capabilities (from workflow sections)
    - Build capability/domain/category indexes
    - Initialize health tracking
  - **Verify**: `node .claude/lib/tools/agent-registry-generator.cjs`

- [ ] **3B.2** Generate initial agent-registry.json (~2 hours)
  - **Output**: `.claude/context/agent-registry.json`
  - **Verify**: Registry contains all 48 agents

- [ ] **3B.3** Create AvailableAgents() query tool (~4 hours)
  - **File**: `.claude/lib/tools/available-agents.cjs`
  - **Signature**:
    ```javascript
    AvailableAgents({
      capability?: string,     // 'code-review', 'implementation', etc.
      domain?: string,         // 'code', 'testing', 'research', etc.
      category?: string,       // 'core', 'specialized', 'domain', 'orchestrator'
      excludeFailed?: boolean, // Skip agents with status !== 'healthy' (default: true)
      minSuccessRate?: number, // Minimum success rate (0-1, default: 0)
      limit?: number           // Max results (default: 10, max: 50)
    }): AgentResult[]
    ```
  - **Returns**:
    ```javascript
    {
      success: boolean,
      agents: [{
        id: string,
        displayName: string,
        capabilities: string[],  // Capability names this agent provides
        health: { status, successRate, consecutiveFailures },
        model: string,
        recommended: boolean     // Best match for the query
      }],
      count: number,
      query: object,
      suggestions?: { /* if count === 0 */ }
    }
    ```
  - **Verify**: Unit tests pass

- [ ] **3B.4** Add CLI command for registry generation (~1 hour)
  - **Command**: `npm run agents:registry`
  - **Script**: Add to package.json
  - **Verify**: CLI generates registry correctly

#### Phase 3B Verification Gate

```bash
# Registry generates successfully
node .claude/lib/tools/agent-registry-generator.cjs && \
cat .claude/context/agent-registry.json | jq '.metadata.totalAgents' | grep -E "^4[0-9]$" && \
echo "✓ Registry generated with 40+ agents"

# AvailableAgents query works
node -e "require('.claude/lib/tools/available-agents.cjs').AvailableAgents({ capability: 'code-review' }).agents.length > 0 || process.exit(1)"
```

**Success Criteria**: Agent registry generated, AvailableAgents() tool functional

---

### Phase 3C: Orchestrator Integration (1 day)

**Purpose**: Update router and orchestrators to use capability discovery
**Dependencies**: Phase 3B complete
**Duration**: 6-8 hours
**Parallel OK**: Partial

#### 3C.1 Router Integration Pattern

Update router to use AvailableAgents() for agent selection:

```javascript
// Current approach (hardcoded routing table)
const agentTable = {
  'code review': 'code-reviewer',
  'bug fix': 'developer',
  'research': 'researcher'
};
const agent = agentTable[intent];

// Phase 3 approach (capability discovery)
const agents = AvailableAgents({
  capability: intent,     // e.g., 'code-review'
  excludeFailed: true     // Skip unhealthy agents
});

// Select best agent (recommended flag or first healthy)
const agent = agents.find(a => a.recommended) || agents[0];

// Fallback to routing table if no agents found
if (!agent) {
  const fallback = agentTable[intent];
  console.warn(`[ROUTER] No healthy agents for '${intent}', falling back to ${fallback}`);
}
```

#### 3C.2 Master Orchestrator Integration

Update master-orchestrator to use capability discovery:

```javascript
// In master-orchestrator workflow
// Instead of hardcoded agent selection:

// 1. Discover agents for capability
const codeAgents = AvailableAgents({
  capability: 'implementation',
  excludeFailed: true,
  minSuccessRate: 0.9
});

const testAgents = AvailableAgents({
  capability: 'testing',
  excludeFailed: true
});

// 2. Select best agents based on health
const developer = codeAgents.agents[0];
const qa = testAgents.agents[0];

// 3. Spawn with discovered agents
Task({ subagent_type: developer.id, ... });
Task({ subagent_type: qa.id, ... });
```

#### Tasks

- [ ] **3C.1** Update router documentation with AvailableAgents usage (~2 hours) [⚡ parallel OK]
  - **File**: `.claude/workflows/core/router-decision.md`
  - **Section**: Add "Capability-Based Agent Selection" with AvailableAgents example
  - **Verify**: `grep "AvailableAgents" .claude/workflows/core/router-decision.md`

- [ ] **3C.2** Update master-orchestrator to use capability discovery (~2 hours) [⚡ parallel OK]
  - **File**: `.claude/agents/orchestrators/master-orchestrator.md`
  - **Section**: Update "Agent Selection" to use AvailableAgents
  - **Verify**: `grep "AvailableAgents" .claude/agents/orchestrators/master-orchestrator.md`

- [ ] **3C.3** Update evolution-orchestrator to use capability discovery (~2 hours) [⚡ parallel OK]
  - **File**: `.claude/agents/orchestrators/evolution-orchestrator.md`
  - **Section**: Add capability-based agent discovery for evolution
  - **Verify**: `grep "AvailableAgents" .claude/agents/orchestrators/evolution-orchestrator.md`

- [ ] **3C.4** Register AvailableAgents in CLAUDE.md Section 1.4 (~1 hour)
  - **File**: `.claude/CLAUDE.md`
  - **Entry**:
    ```markdown
    | **AvailableAgents** | Agent Discovery | Query available agents by capability/domain/health | ✅ Orchestrators ONLY |
    ```
  - **Verify**: `grep "AvailableAgents" .claude/CLAUDE.md | grep "Agent Discovery"`

#### Phase 3C Verification Gate

```bash
# All orchestrator documentation updated
grep "AvailableAgents" .claude/workflows/core/router-decision.md && \
grep "AvailableAgents" .claude/agents/orchestrators/master-orchestrator.md && \
grep "AvailableAgents" .claude/CLAUDE.md && \
echo "✓ Orchestrator integration complete"
```

**Success Criteria**: Router and orchestrators documented with AvailableAgents usage

---

### Phase 3D: Health Tracking & Self-Healing (1 day)

**Purpose**: Implement real-time health tracking with automatic agent isolation
**Dependencies**: Phase 3B complete
**Duration**: 6-8 hours
**Parallel OK**: No (sequential implementation)

#### 3D.1 Health Tracking Algorithm

```javascript
// .claude/lib/tools/agent-health-tracker.cjs

const FAILURE_THRESHOLD = 3;  // Consecutive failures to trigger isolation
const RECOVERY_COOLDOWN = 300000;  // 5 minutes before re-enabling isolated agent

/**
 * Track agent spawn success/failure
 * Called by Task tool hook after agent completes
 */
function trackAgentHealth(agentId, success, error = null) {
  const registry = loadRegistry();
  const agent = registry.agents[agentId];

  if (!agent) return;  // Unknown agent, skip

  // Update statistics
  agent.health.totalSpawns++;
  if (success) {
    agent.health.successfulSpawns++;
    agent.health.consecutiveFailures = 0;
    agent.health.status = 'healthy';
  } else {
    agent.health.failedSpawns++;
    agent.health.consecutiveFailures++;

    // Check isolation threshold
    if (agent.health.consecutiveFailures >= FAILURE_THRESHOLD) {
      agent.health.status = 'unavailable';
      agent.health.isolatedAt = new Date().toISOString();
      agent.health.isolationReason = error || 'Consecutive failures exceeded threshold';

      // Update indexes
      registry.health.unavailable.push(agentId);
      registry.health.healthy = registry.health.healthy.filter(id => id !== agentId);

      console.warn(`[HEALTH] Agent '${agentId}' isolated: ${agent.health.isolationReason}`);
    } else if (agent.health.consecutiveFailures >= 1) {
      agent.health.status = 'degraded';

      // Update indexes
      if (!registry.health.degraded.includes(agentId)) {
        registry.health.degraded.push(agentId);
        registry.health.healthy = registry.health.healthy.filter(id => id !== agentId);
      }
    }
  }

  // Calculate success rate
  agent.health.successRate = agent.health.totalSpawns > 0
    ? agent.health.successfulSpawns / agent.health.totalSpawns
    : 1;

  agent.health.lastHealthCheck = new Date().toISOString();

  saveRegistry(registry);
}

/**
 * Attempt to recover isolated agent
 * Called periodically or manually
 */
function attemptRecovery(agentId) {
  const registry = loadRegistry();
  const agent = registry.agents[agentId];

  if (!agent || agent.health.status !== 'unavailable') return false;

  const isolatedAt = new Date(agent.health.isolatedAt);
  const now = new Date();

  if (now - isolatedAt < RECOVERY_COOLDOWN) {
    console.log(`[HEALTH] Agent '${agentId}' still in cooldown`);
    return false;
  }

  // Reset health for recovery attempt
  agent.health.status = 'healthy';
  agent.health.consecutiveFailures = 0;
  agent.health.isolatedAt = null;
  agent.health.isolationReason = null;

  // Update indexes
  registry.health.unavailable = registry.health.unavailable.filter(id => id !== agentId);
  registry.health.healthy.push(agentId);

  saveRegistry(registry);
  console.log(`[HEALTH] Agent '${agentId}' recovered and re-enabled`);
  return true;
}
```

#### 3D.2 PostToolUse Hook for Health Tracking

```javascript
// .claude/hooks/routing/agent-health-hook.cjs

/**
 * PostToolUse(Task) hook to track agent health
 * Called after every Task spawn completes
 */
module.exports = async function agentHealthHook(input) {
  const { tool_input, result, error } = input;

  // Only track Task tool
  if (input.tool_name !== 'Task') return { allow: true };

  const agentId = tool_input.subagent_type;
  const success = !error && result?.status !== 'error';

  const { trackAgentHealth } = require('../../../lib/tools/agent-health-tracker.cjs');
  trackAgentHealth(agentId, success, error?.message);

  return { allow: true };  // Always allow (we're just tracking)
};
```

#### Tasks

- [ ] **3D.1** Implement agent health tracker (~3 hours)
  - **File**: `.claude/lib/tools/agent-health-tracker.cjs`
  - **Functions**:
    - `trackAgentHealth(agentId, success, error)` - Track spawn outcome
    - `attemptRecovery(agentId)` - Attempt to recover isolated agent
    - `getHealthSummary()` - Return health status of all agents
  - **Verify**: Unit tests pass

- [ ] **3D.2** Create PostToolUse(Task) health tracking hook (~2 hours)
  - **File**: `.claude/hooks/routing/agent-health-hook.cjs`
  - **Registration**: Add to settings.json PostToolUse(Task) hooks
  - **Verify**: Hook triggers on Task completion

- [ ] **3D.3** Add health CLI commands (~1 hour)
  - **Commands**:
    - `npm run agents:health` - Show health summary
    - `npm run agents:recover <agentId>` - Attempt recovery
  - **Verify**: CLI commands work

- [ ] **3D.4** Integrate health tracking with AvailableAgents (~1 hour)
  - **Update**: `available-agents.cjs` to use real-time health from registry
  - **Update**: `excludeFailed: true` filters by health.status !== 'unavailable'
  - **Verify**: AvailableAgents excludes unhealthy agents

#### Phase 3D Verification Gate

```bash
# Health tracking functional
node -e "
  const tracker = require('.claude/lib/tools/agent-health-tracker.cjs');
  tracker.trackAgentHealth('test-agent', true);
  tracker.trackAgentHealth('test-agent', false, 'Test error');
  tracker.trackAgentHealth('test-agent', false, 'Test error');
  tracker.trackAgentHealth('test-agent', false, 'Test error');
  const health = tracker.getHealthSummary();
  health.unavailable.includes('test-agent') || process.exit(1);
  console.log('✓ Health tracking with isolation works');
"
```

**Success Criteria**: Health tracking functional, agents isolated after 3 failures

---

### Phase 3E: Testing & Validation (1 day)

**Purpose**: Create comprehensive tests for Phase 3 functionality
**Dependencies**: Phase 3D complete
**Duration**: 6-8 hours
**Parallel OK**: Partial (unit and integration tests can run in parallel)

#### Tasks

- [ ] **3E.1** Create unit tests for agent registry generator (~2 hours) [⚡ parallel OK]
  - **File**: `tests/lib/tools/agent-registry-generator.test.cjs`
  - **Tests**:
    - Parses agent definition frontmatter correctly
    - Extracts capabilities from workflow sections
    - Builds capability/domain/category indexes
    - Handles missing fields gracefully
    - Generates valid JSON output
  - **Target**: 10+ tests
  - **Verify**: `node --test tests/lib/tools/agent-registry-generator.test.cjs`

- [ ] **3E.2** Create unit tests for AvailableAgents tool (~2 hours) [⚡ parallel OK]
  - **File**: `tests/lib/tools/available-agents.test.cjs`
  - **Tests**:
    - Capability filter (exact match)
    - Domain filter (exact match)
    - Category filter (exact match)
    - Health filter (excludeFailed)
    - Success rate filter (minSuccessRate)
    - Limit parameter
    - Empty query (returns all healthy agents)
    - No results (returns suggestions)
  - **Target**: 15+ tests
  - **Verify**: `node --test tests/lib/tools/available-agents.test.cjs`

- [ ] **3E.3** Create unit tests for health tracker (~2 hours) [⚡ parallel OK]
  - **File**: `tests/lib/tools/agent-health-tracker.test.cjs`
  - **Tests**:
    - Track success increments stats
    - Track failure increments consecutive failures
    - 3 consecutive failures triggers isolation
    - Recovery resets health
    - Cooldown period enforced
    - Success rate calculation accurate
  - **Target**: 10+ tests
  - **Verify**: `node --test tests/lib/tools/agent-health-tracker.test.cjs`

- [ ] **3E.4** Create integration tests (~2 hours)
  - **File**: `tests/integration/phase-3-capability-cards.test.cjs`
  - **Tests**:
    - Router uses AvailableAgents for agent selection
    - Orchestrator discovers agents by capability
    - Failed agent is excluded from discovery
    - Recovered agent is included in discovery
    - Phase 1-2 tests still pass (no regressions)
  - **Target**: 5+ tests
  - **Verify**: `node --test tests/integration/phase-3-capability-cards.test.cjs`

#### Phase 3E Verification Gate

```bash
# All tests passing
node --test tests/lib/tools/agent-registry-generator.test.cjs && \
node --test tests/lib/tools/available-agents.test.cjs && \
node --test tests/lib/tools/agent-health-tracker.test.cjs && \
node --test tests/integration/phase-3-capability-cards.test.cjs && \
echo "✓ All Phase 3 tests passing (35+ tests)"

# No regressions
npm test 2>&1 | grep -E "pass.*103" && echo "✓ Phase 1-2 tests still passing"
```

**Success Criteria**: 35+ Phase 3 tests passing, 0 regressions in Phase 1-2

---

### Phase 3F: Documentation (1 day)

**Purpose**: Create ADR, guides, and update framework documentation
**Dependencies**: Phase 3E complete
**Duration**: 4-6 hours
**Parallel OK**: Yes (all documentation tasks independent)

#### Tasks

- [ ] **3F.1** Create ADR-071: Agent Capability Cards Pattern (~2 hours) [⚡ parallel OK]
  - **File**: `.claude/context/memory/decisions.md`
  - **Sections**:
    - **Context**: Phase 1-2 limitations for orchestrator agent selection
    - **Decision**: Implement Agent Capability Cards with centralized registry
    - **Alternatives Considered**: Distributed registry (rejected), on-demand parsing (rejected)
    - **Consequences**: +Self-healing, +Hot-swapping, -Registry maintenance overhead
  - **Verify**: `grep -A 10 "ADR-071" .claude/context/memory/decisions.md`

- [ ] **3F.2** Update learnings.md with Phase 3 patterns (~1 hour) [⚡ parallel OK]
  - **Entry**:
    ```markdown
    ## Phase 3: Agent Capability Cards (2026-01-31)

    ### Pattern: Capability-based agent discovery for orchestrators
    - Agents publish capability cards with health status
    - Orchestrators query agents by capability/domain/health
    - Failed agents automatically isolated after 3 consecutive failures
    - Recovery mechanism with 5-minute cooldown

    ### Key Learnings
    - Centralized registry preferred over distributed (simplicity + consistency)
    - Health tracking critical for self-healing
    - Backward compatible with Phase 1-2 (layered architecture)
    ```
  - **Verify**: `grep "Phase 3: Agent Capability Cards" .claude/context/memory/learnings.md`

- [ ] **3F.3** Create AGENT_CAPABILITY_CARDS_GUIDE.md (~2 hours) [⚡ parallel OK]
  - **File**: `.claude/docs/AGENT_CAPABILITY_CARDS_GUIDE.md`
  - **Content**:
    - Overview of capability card system
    - How to add capabilities to an agent
    - How orchestrators query agents
    - Health tracking and self-healing
    - Troubleshooting guide
  - **Verify**: `ls .claude/docs/AGENT_CAPABILITY_CARDS_GUIDE.md`

- [ ] **3F.4** Update CLAUDE.md with Phase 3 references (~1 hour) [⚡ parallel OK]
  - **Sections to Update**:
    - Section 1.4: Add AvailableAgents to Core Tools table
    - Section 3: Add note about capability-based routing
  - **Verify**: `grep "AvailableAgents" .claude/CLAUDE.md`

#### Phase 3F Verification Gate

```bash
# All documentation complete
grep "ADR-071" .claude/context/memory/decisions.md && \
grep "Phase 3: Agent Capability Cards" .claude/context/memory/learnings.md && \
ls .claude/docs/AGENT_CAPABILITY_CARDS_GUIDE.md && \
grep "AvailableAgents" .claude/CLAUDE.md && \
echo "✓ Documentation complete"
```

**Success Criteria**: ADR-071 created, learnings updated, guide created, CLAUDE.md updated

---

### Phase [FINAL]: Evolution & Reflection Check

**Purpose**: Quality assessment and learning extraction

**Tasks**:

1. Spawn reflection-agent to analyze completed work
2. Extract learnings and update memory files
3. Check for evolution opportunities (new agents/skills needed)

**Spawn Command**:

```javascript
Task({
  subagent_type: "reflection-agent",
  description: "Session reflection and learning extraction",
  prompt: "You are REFLECTION-AGENT. Read .claude/agents/core/reflection-agent.md. Analyze the completed work from this plan (Phase 3: Agent Capability Cards), extract learnings to memory files, and check for evolution opportunities (patterns that suggest new agents or skills should be created)."
})
```

**Success Criteria**:

- Reflection-agent spawned and completed
- Learnings extracted to `.claude/context/memory/learnings.md`
- Evolution opportunities logged if any detected

---

## Key Design Decisions

| Decision | Options | Recommendation | Rationale |
|----------|---------|----------------|-----------|
| **Registry Location** | Centralized vs Distributed | **Centralized** (`.claude/context/agent-registry.json`) | Single source of truth, simpler consistency, easier debugging |
| **Capability Definition** | Static (JSON) vs Dynamic (Code) | **Static (JSON)** | Versioned, human-readable, git-trackable |
| **Health Tracking** | In-memory vs File-based | **Both** | In-memory for speed, periodic disk writes for persistence |
| **Update Frequency** | Real-time vs Periodic | **Real-time** (on spawn/failure) | Immediate isolation of failed agents |
| **Failure Threshold** | 3 vs 5 vs 10 | **3 consecutive failures** | Balance between tolerance and quick isolation |
| **Recovery Cooldown** | 1min vs 5min vs 15min | **5 minutes** | Enough time for transient issues to resolve |
| **Capability Matching** | Exact match vs Fuzzy | **Exact match** | Predictable, no false positives |
| **Index Structure** | Single index vs Multiple indexes | **Multiple** (byCapability, byDomain, byCategory) | Fast queries for different use cases |

---

## Comparison: Phase 1 vs 2 vs 3

| Aspect | Phase 1 | Phase 2 | Phase 3 |
|--------|---------|---------|---------|
| **Who discovers** | Router (hardcoded) | Agents (runtime) | **Orchestrators (capability-based)** |
| **What discovers** | Tools | Skills | **Agents** |
| **Discovery method** | Static pre-injection | Query (SkillCatalog) | **Query (AvailableAgents) + health** |
| **Data source** | tool-manifest.json | skill-index.json | **agent-registry.json** |
| **Scaling** | Limited (hardcoded) | Good (query-based) | **Excellent (capability + health)** |
| **Hot-swapping** | No | N/A | **Yes (discover alternative agents)** |
| **Self-healing** | No | N/A | **Yes (isolate failed agents)** |
| **When needed** | Always (tool awareness) | Medium complexity (skill discovery) | **High complexity (orchestration)** |
| **Target user** | All agents | All agents | **Orchestrators only** |

---

## Impact on Existing System

**Phase 1 (Foundation)**: No changes

- tool-manifest.json remains source of truth for tool definitions
- Pre-spawn validator unchanged
- All 53 tests still pass

**Phase 2 (SkillCatalog)**: No changes

- SkillCatalog() still works for agent skill discovery
- skill-index.json unchanged
- All 50 tests still pass

**Phase 3 (Capability Cards)**: Additive

- Agents gain health tracking (optional)
- Orchestrators gain capability discovery (new feature)
- Router can optionally use AvailableAgents (backward compatible)
- Backward compatible (Phase 1-2 unchanged)

---

## Risks

| Risk | Impact | Mitigation | Rollback |
|------|--------|-----------|----------|
| Registry out of sync with agent definitions | High | Auto-regenerate on agent changes + CI validation | Manual registry regeneration |
| Health tracking overhead | Medium | Async file writes, batched updates | Disable health hook |
| False positive isolations | High | 3-failure threshold + 5-min cooldown + manual recovery | Manual agent recovery |
| Circular dependencies in discovery | Medium | Detect cycles, fail safely | Fallback to routing table |
| Registry file corruption | High | Atomic writes, backup on regeneration | Regenerate from agent definitions |
| Performance degradation | Low | In-memory caching, lazy index loading | Revert to hardcoded routing |

---

## Timeline Summary

| Phase | Tasks | Est. Time | Parallel? |
|-------|-------|-----------|-----------|
| 0 (Research) | 3 | 6-8 hours | No |
| 3A (Schema) | 3 | 8-12 hours | No |
| 3B (Registry) | 4 | 10-14 hours | No |
| 3C (Integration) | 4 | 6-8 hours | Partial |
| 3D (Health) | 4 | 6-8 hours | No |
| 3E (Testing) | 4 | 6-8 hours | Partial |
| 3F (Documentation) | 4 | 4-6 hours | Yes |
| FINAL (Reflection) | 1 | 1-2 hours | No |
| **Total** | **27** | **~48-66 hours** | |

**Calendar Time**: ~8-10 days (1 developer) or ~4-5 days (2 developers)

---

## Files Created Summary

### New Files

| File | Purpose | Phase |
|------|---------|-------|
| `.claude/schemas/agent-capability-card.schema.json` | Capability card JSON schema | 3A |
| `.claude/lib/tools/agent-registry-generator.cjs` | Registry generation script | 3B |
| `.claude/context/agent-registry.json` | Agent capability registry | 3B |
| `.claude/lib/tools/available-agents.cjs` | AvailableAgents() query tool | 3B |
| `.claude/lib/tools/agent-health-tracker.cjs` | Health tracking module | 3D |
| `.claude/hooks/routing/agent-health-hook.cjs` | PostToolUse health hook | 3D |
| `.claude/docs/AGENT_CAPABILITY_CARDS_GUIDE.md` | Usage guide | 3F |
| `tests/lib/tools/agent-registry-generator.test.cjs` | Unit tests | 3E |
| `tests/lib/tools/available-agents.test.cjs` | Unit tests | 3E |
| `tests/lib/tools/agent-health-tracker.test.cjs` | Unit tests | 3E |
| `tests/integration/phase-3-capability-cards.test.cjs` | Integration tests | 3E |

### Modified Files

| File | Change | Phase |
|------|--------|-------|
| `.claude/CLAUDE.md` | Add AvailableAgents to Section 1.4 | 3C |
| `.claude/workflows/core/router-decision.md` | Add capability-based selection | 3C |
| `.claude/agents/orchestrators/master-orchestrator.md` | Add AvailableAgents usage | 3C |
| `.claude/agents/orchestrators/evolution-orchestrator.md` | Add AvailableAgents usage | 3C |
| `.claude/context/memory/decisions.md` | Add ADR-071 | 3F |
| `.claude/context/memory/learnings.md` | Add Phase 3 learnings | 3F |
| `package.json` | Add agents:registry, agents:health CLI commands | 3B |

---

## Acceptance Criteria (Final Validation)

Before marking this plan complete, verify:

- [ ] Agent capability card schema created and validated
- [ ] Agent registry auto-generated with all 48 agents
- [ ] AvailableAgents() tool implemented with all filters
- [ ] Health tracking functional (spawn success/failure)
- [ ] Failed agents isolated after 3 consecutive failures
- [ ] Router documentation includes capability-based selection
- [ ] Master-orchestrator uses AvailableAgents
- [ ] 35+ Phase 3 tests passing
- [ ] 103 Phase 1-2 tests still passing (0 regressions)
- [ ] ADR-071 created and documented
- [ ] AGENT_CAPABILITY_CARDS_GUIDE.md created
- [ ] Learnings documented in learnings.md

---

## Next Steps After Phase 3

With all 3 phases complete, the system provides:

1. **Phase 1**: Agents know their tools (static awareness)
2. **Phase 2**: Agents discover skills (dynamic skill queries)
3. **Phase 3**: Orchestrators discover agents (capability-based routing with health)

**Future Enhancements** (not in scope):

- **Phase 4**: Dynamic agent creation (evolution-orchestrator creates new agents on-demand)
- **Phase 5**: Agent performance optimization (model selection based on task complexity)
- **Phase 6**: Multi-agent workflow templates (pre-defined agent collaboration patterns)

---

**Plan Status**: Draft
**Created**: 2026-01-31
**Author**: PLANNER (Claude Opus 4.5)
**Framework Version**: Agent-Studio v2.2.1
**Dependencies**: Phase 1 (53 tests) + Phase 2 (50 tests) complete
