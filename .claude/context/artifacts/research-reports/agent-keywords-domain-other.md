# Agent Intent Keywords Research Report - Domain & Orchestrator Agents

**Generated**: 2026-01-25
**Research Sources**: Exa web search, agent definition files, industry best practices
**Purpose**: Router intent matching keywords for remaining domain agents and orchestrators

---

## 1. frontend-pro (Frontend/React/Vue Development)

### Agent Description
Frontend development expert for React, Vue, modern CSS, component libraries, and UI/UX implementation. Use for building user interfaces, component libraries, responsive designs, accessibility, and frontend architecture.

### Primary Intent Keywords
| Category | Keywords |
|----------|----------|
| **Core Technologies** | react, vue, svelte, angular, frontend, front-end, ui, user interface |
| **Frameworks** | next.js, nextjs, nuxt, sveltekit, remix, astro, vite, gatsby |
| **Styling** | css, tailwind, styled-components, sass, scss, emotion, css modules, styling |
| **Components** | component, shadcn, radix, headless ui, chakra, material ui, mui, ant design |
| **State Management** | zustand, redux, jotai, recoil, tanstack query, react query, pinia |

### Task Description Patterns
| Pattern | Example Phrases |
|---------|-----------------|
| **Build/Create** | "build a component", "create a form", "implement a modal", "design a button" |
| **Styling** | "style the page", "add responsive design", "fix css", "update theme" |
| **Performance** | "optimize bundle size", "lazy load", "code splitting", "improve performance" |
| **Accessibility** | "a11y audit", "accessibility fix", "wcag compliance", "screen reader support" |
| **Testing** | "test component", "storybook", "vitest", "jest", "testing library" |

### Problem Indicators
| Indicator | Trigger Phrases |
|-----------|-----------------|
| **Visual Issues** | "doesn't look right", "layout broken", "responsive issue", "not centered" |
| **UX Problems** | "confusing navigation", "bad user experience", "hard to use" |
| **Performance** | "slow render", "too many re-renders", "large bundle", "slow load" |
| **State Issues** | "state not updating", "props drilling", "context issues" |

### Routing Priority Keywords
```json
{
  "high_confidence": ["react component", "vue component", "frontend", "ui component", "shadcn", "tailwind"],
  "medium_confidence": ["responsive", "css", "styling", "button", "form", "modal"],
  "low_confidence": ["design", "interface", "visual"]
}
```

---

## 2. data-engineer (ETL, Data Pipelines, Data Warehouse)

### Agent Description
Data engineering expert for ETL pipelines, data validation, analytics, and data infrastructure. Use for building data pipelines, data quality checks, data transformations, and analytics workflows.

### Primary Intent Keywords
| Category | Keywords |
|----------|----------|
| **Core Concepts** | etl, elt, data pipeline, data warehouse, data lake, data lakehouse |
| **Processing** | batch processing, stream processing, data transformation, data ingestion |
| **Orchestration** | airflow, prefect, dagster, luigi, temporal, dag, workflow orchestration |
| **Transformation** | dbt, sql, data modeling, dimensional modeling, star schema, snowflake schema |
| **Quality** | data quality, data validation, great expectations, soda, data profiling |

### Task Description Patterns
| Pattern | Example Phrases |
|---------|-----------------|
| **Pipeline Creation** | "build etl pipeline", "create data pipeline", "set up airflow dag" |
| **Data Integration** | "ingest data from", "extract data", "load data into", "sync data" |
| **Transformation** | "transform data", "dbt model", "sql transformation", "data cleaning" |
| **Quality** | "validate data", "data quality check", "schema validation", "null check" |
| **Optimization** | "optimize query", "partition table", "improve pipeline performance" |

### Problem Indicators
| Indicator | Trigger Phrases |
|-----------|-----------------|
| **Pipeline Failures** | "pipeline failed", "dag stuck", "job timed out", "extraction error" |
| **Quality Issues** | "data inconsistent", "missing values", "duplicate records", "schema drift" |
| **Performance** | "query too slow", "pipeline taking too long", "memory issues" |
| **Integration** | "can't connect to source", "api rate limited", "connection timeout" |

### Routing Priority Keywords
```json
{
  "high_confidence": ["etl", "data pipeline", "airflow", "dbt", "data warehouse", "data engineering"],
  "medium_confidence": ["data transformation", "sql query", "data ingestion", "data quality"],
  "low_confidence": ["analytics", "batch job", "scheduled task"]
}
```

### Technology Stack References
- **Orchestration**: Apache Airflow, Prefect, Dagster, Luigi, Temporal
- **Processing**: Apache Spark (PySpark), Pandas, Polars, DuckDB, Ray
- **Transformation**: dbt, SQLMesh
- **Quality**: Great Expectations, Soda, Pydantic, Pandera
- **Storage**: PostgreSQL, DuckDB, BigQuery, Snowflake, Delta Lake, Iceberg
- **Formats**: Parquet, Avro, ORC
- **Cloud**: AWS (S3, Glue, Redshift), GCP (BigQuery, Dataflow), Azure (Synapse)

---

## 3. mobile-ux-reviewer (Mobile UX/UI Review)

### Agent Description
UX/UI expert for reviewing mobile applications on iOS and Android. Use for design critiques, accessibility audits, Human Interface Guidelines compliance, and user experience evaluations.

### Primary Intent Keywords
| Category | Keywords |
|----------|----------|
| **Core Concepts** | ux review, ui review, mobile ux, usability, user experience, heuristic evaluation |
| **Platforms** | ios, android, mobile app, native app, cross-platform, react native, flutter |
| **Guidelines** | hig, human interface guidelines, material design, accessibility, wcag |
| **Evaluation** | audit, critique, review, assessment, evaluation, compliance check |
| **Accessibility** | voiceover, talkback, a11y, screen reader, color contrast, touch targets |

### Task Description Patterns
| Pattern | Example Phrases |
|---------|-----------------|
| **UX Audit** | "review the app ux", "ux audit", "evaluate user experience", "usability review" |
| **Design Critique** | "critique the design", "review ui", "design feedback", "visual assessment" |
| **Compliance** | "check hig compliance", "material design review", "platform guidelines" |
| **Accessibility** | "accessibility audit", "a11y review", "wcag check", "screen reader test" |
| **User Flow** | "review user flow", "navigation assessment", "task completion analysis" |

### Problem Indicators
| Indicator | Trigger Phrases |
|-----------|-----------------|
| **Usability Issues** | "confusing navigation", "hard to find", "users complain", "poor experience" |
| **Accessibility** | "not accessible", "fails contrast", "can't use voiceover", "touch target small" |
| **Compliance** | "doesn't follow guidelines", "apple rejected", "hig violation" |
| **Visual** | "inconsistent design", "looks outdated", "doesn't match brand" |

### Routing Priority Keywords
```json
{
  "high_confidence": ["ux review", "ui review", "mobile ux", "heuristic evaluation", "accessibility audit"],
  "medium_confidence": ["usability", "hig compliance", "material design", "mobile accessibility"],
  "low_confidence": ["app design", "user testing", "design feedback"]
}
```

### Heuristic Evaluation Framework (Nielsen's 10)
1. Visibility of system status
2. Match between system and real world
3. User control and freedom
4. Consistency and standards
5. Error prevention
6. Recognition rather than recall
7. Flexibility and efficiency of use
8. Aesthetic and minimalist design
9. Help users recognize, diagnose, and recover from errors
10. Help and documentation

### Platform-Specific Keywords
| Platform | Keywords |
|----------|----------|
| **iOS** | hig, safe area, notch, dynamic type, sf symbols, haptic feedback, 44pt touch target |
| **Android** | material design, navigation drawer, bottom navigation, fab, 48dp touch target, predictive back |

---

## 4. master-orchestrator (Project Lifecycle Management)

### Agent Description
The "CEO" agent. Manages the project lifecycle, coordinates subagents, and handles high-level user requests. Never implements code directly.

### Primary Intent Keywords
| Category | Keywords |
|----------|----------|
| **Orchestration** | orchestrate, coordinate, manage project, oversee, lifecycle |
| **Planning** | project plan, roadmap, milestone, phase, sprint, epic |
| **Delegation** | delegate, assign, spawn agents, task distribution, workload |
| **Review** | approve, gate, sign off, quality gate, review plan |
| **Synthesis** | summarize, consolidate, aggregate, final report, status update |

### Task Description Patterns
| Pattern | Example Phrases |
|---------|-----------------|
| **High-Level Requests** | "build the feature", "implement the system", "create the app" |
| **Project Management** | "manage the project", "coordinate development", "oversee implementation" |
| **Multi-Agent Work** | "need multiple specialists", "complex project", "end-to-end delivery" |
| **Strategic Planning** | "plan the architecture", "design the system", "create roadmap" |
| **Status/Progress** | "project status", "overall progress", "what's the state" |

### Problem Indicators
| Indicator | Trigger Phrases |
|-----------|-----------------|
| **Scope Issues** | "large project", "complex feature", "multi-team effort" |
| **Coordination** | "need to coordinate", "multiple agents needed", "parallel work" |
| **Strategic** | "important decision", "architectural choice", "technology selection" |

### Routing Priority Keywords
```json
{
  "high_confidence": ["orchestrate project", "manage project", "coordinate agents", "end-to-end"],
  "medium_confidence": ["complex project", "large feature", "multi-phase", "strategic"],
  "low_confidence": ["build system", "create app", "implement feature"]
}
```

### Characteristic Behaviors
- **Delegates**: Never implements directly, spawns specialized agents
- **Gates**: Enforces planning, architecture, and QA gates
- **Synthesizes**: Combines agent outputs into cohesive results
- **Monitors**: Tracks progress, updates dashboard
- **Forbidden Actions**: Write, Edit, Bash (except for status updates)

---

## 5. swarm-coordinator (Multi-Agent Swarms)

### Agent Description
Manages multi-agent swarms (Queen/Worker topology). Handles consensus, task distribution, and result aggregation.

### Primary Intent Keywords
| Category | Keywords |
|----------|----------|
| **Topology** | swarm, hierarchical, mesh, ring, distributed, parallel agents |
| **Coordination** | consensus, voting, byzantine fault tolerance, coordination, synchronization |
| **Distribution** | task distribution, load balancing, parallel execution, divide and conquer |
| **Aggregation** | result aggregation, consolidation, synthesis, merge outputs |
| **Memory** | shared memory, session state, swarm state, collective knowledge |

### Task Description Patterns
| Pattern | Example Phrases |
|---------|-----------------|
| **Parallel Work** | "run agents in parallel", "distributed task", "multiple perspectives" |
| **Brainstorming** | "brainstorm ideas", "multiple viewpoints", "creative exploration" |
| **Voting/Consensus** | "decide together", "vote on approach", "reach consensus" |
| **Aggregation** | "combine results", "merge outputs", "synthesize findings" |
| **Fault Tolerance** | "handle failures", "redundant agents", "resilient execution" |

### Problem Indicators
| Indicator | Trigger Phrases |
|-----------|-----------------|
| **Scale** | "need multiple agents", "parallel execution", "distributed work" |
| **Consensus Needed** | "need agreement", "conflicting outputs", "multiple opinions" |
| **Complex Coordination** | "complex workflow", "interdependent tasks", "synchronization needed" |

### Routing Priority Keywords
```json
{
  "high_confidence": ["swarm", "multi-agent", "consensus voting", "parallel agents", "byzantine"],
  "medium_confidence": ["distributed task", "multiple perspectives", "coordinate workers"],
  "low_confidence": ["parallel work", "combined effort", "team task"]
}
```

### Swarm Topologies
| Topology | Use Case | Description |
|----------|----------|-------------|
| **Hierarchical** | Standard features | Queen coordinates workers directly |
| **Mesh** | Brainstorming | Workers communicate via shared memory |
| **Voting** | Critical decisions | Workers propose, coordinator counts votes |

### Multi-Agent Coordination Patterns (Research Insights)
- **Agent-as-Tools**: Manager delegates to specialized worker agents
- **Swarm Intelligence**: Agents collaborate in real-time for emergent behavior
- **Event-Driven**: Agents react to shared events/messages
- **Ripple Effect Protocol**: Agents share sensitivities for alignment
- **Byzantine Fault Tolerance**: Handling disagreement and failures

---

## 6. evolution-orchestrator (Self-Evolution)

### Agent Description
Meta-agent that orchestrates the EVOLVE workflow for creating new agents, skills, workflows, hooks, and schemas. Ensures research-first, validation-gated artifact creation.

### Primary Intent Keywords
| Category | Keywords |
|----------|----------|
| **Creation** | create agent, create skill, new capability, add workflow, add hook |
| **Evolution** | evolve, self-improvement, capability gap, no matching agent |
| **Research** | research first, best practices, external sources, prior art |
| **Validation** | validate, schema validation, conflict check, naming convention |
| **Lifecycle** | artifact lifecycle, deploy, enable, register, catalog |

### Task Description Patterns
| Pattern | Example Phrases |
|---------|-----------------|
| **Agent Creation** | "create new agent for", "need an agent that", "no agent for this" |
| **Skill Creation** | "add skill for", "create capability", "new skill needed" |
| **Workflow Creation** | "create workflow", "new process", "add multi-agent workflow" |
| **Capability Gap** | "can't find agent for", "no existing solution", "need new capability" |
| **Evolution Request** | "evolve the system", "add new feature type", "extend capabilities" |

### Problem Indicators
| Indicator | Trigger Phrases |
|-----------|-----------------|
| **Capability Gap** | "no matching agent", "doesn't exist", "need new", "missing capability" |
| **Extension Request** | "add new type", "expand system", "new kind of" |
| **Pattern Recognition** | "recurring request", "should automate", "common need" |

### Routing Priority Keywords
```json
{
  "high_confidence": ["create new agent", "create new skill", "no matching agent", "capability gap", "evolve"],
  "medium_confidence": ["need agent for", "add workflow", "new capability", "extend system"],
  "low_confidence": ["new feature", "add to system", "missing"]
}
```

### EVOLVE Workflow Phases
| Phase | Name | Purpose |
|-------|------|---------|
| **E** | Evaluate | Confirm need, define requirements |
| **V** | Validate | Check conflicts, existing solutions |
| **O** | Obtain | Research best practices (MANDATORY - 3+ queries) |
| **L** | Lock | Create artifact with schema validation |
| **V** | Verify | Quality gate before deployment |
| **E** | Enable | Deploy and register in ecosystem |

### Self-Evolution Research Insights
Based on recent academic research on self-evolving AI agents:

**Key Concepts**:
- **Lifelong Learning**: Agents continuously improve from interactions
- **Tool-Integrated Reasoning**: Self-evolution via tool usage patterns
- **Memory-Based Adaptation**: Learning from past decisions and outcomes
- **Self-Improvement Loops**: Autonomous feedback collection and optimization

**Research Papers Referenced**:
- "A Comprehensive Survey of Self-Evolving AI Agents" (arXiv:2508.07407)
- "AgentEvolver: Towards Efficient Self-Evolving Agent System" (arXiv:2511.10395)
- "Agent0: Unleashing Self-Evolving Agents from Zero Data" (arXiv:2511.16043)

### Artifact Creation Output Locations
| Artifact | Location |
|----------|----------|
| Agent | `.claude/agents/<category>/<name>.md` |
| Skill | `.claude/skills/<name>/SKILL.md` |
| Workflow | `.claude/workflows/<category>/<name>.md` |
| Hook | `.claude/hooks/<category>/<name>.cjs` |
| Schema | `.claude/schemas/<name>.json` |
| Template | `.claude/templates/<name>.md` |
| Research Report | `.claude/context/artifacts/research-reports/` |

---

## Cross-Reference Matrix: Domain Agent Disambiguation

When multiple agents could match, use this priority matrix:

| User Request Contains | Primary Agent | Secondary (Review) |
|----------------------|---------------|-------------------|
| "react", "vue", "component" | frontend-pro | - |
| "etl", "pipeline", "dbt" | data-engineer | - |
| "mobile ux", "ios review", "android audit" | mobile-ux-reviewer | - |
| "large project", "coordinate" | master-orchestrator | - |
| "parallel agents", "swarm" | swarm-coordinator | - |
| "create new agent", "no agent exists" | evolution-orchestrator | - |
| "frontend performance" | frontend-pro | qa (testing) |
| "data accessibility" | data-engineer | mobile-ux-reviewer |
| "mobile ui component" | frontend-pro | mobile-ux-reviewer |

---

## Summary Statistics

| Agent | High-Confidence Keywords | Medium-Confidence Keywords | Primary Use Cases |
|-------|-------------------------|---------------------------|-------------------|
| frontend-pro | 6 | 6 | React/Vue development, UI components, styling |
| data-engineer | 6 | 4 | ETL pipelines, dbt models, data quality |
| mobile-ux-reviewer | 5 | 4 | UX audits, accessibility, guideline compliance |
| master-orchestrator | 4 | 4 | Project lifecycle, multi-agent coordination |
| swarm-coordinator | 5 | 3 | Parallel agents, consensus, result aggregation |
| evolution-orchestrator | 5 | 4 | Creating new agents/skills, capability gaps |

---

## Research Sources

### Frontend Development
- roadmap.sh - Frontend Developer Job Description [2026]
- arc.dev - React Developer Job Description Template
- guarana-technologies.com - Role and skills of a Frontend Developer
- coursera.org - Front-End Developer Roles and Responsibilities
- handbook.gitlab.com - Frontend Engineer Roles

### Data Engineering
- getdbt.com - What is Data Engineering
- altexsoft.com - Data Engineering Concepts, Processes, and Tools
- Medium/@maroofashraf987 - Key Responsibilities of a Data Engineer
- ment.tech - A Complete Guide to ETL Pipelines

### Mobile UX/Accessibility
- MDN - Mobile accessibility checklist
- W3C WAI - Mobile Accessibility at W3C / WCAG2Mobile
- BBC - Mobile Accessibility Guidelines
- penpot.app - UX accessibility best practices
- uxplaybook.org - Design for Accessibility Principles

### Multi-Agent Orchestration
- IBM Think - What is AI Agent Orchestration
- project44.com - Multi-Agent Orchestration
- talkdesk.com - What is Multi-Agent Orchestration
- kamiwaza.ai - Multi-Agent Orchestration at Enterprise Scale
- confluent.io - Building Real-Time Multi-Agent AI

### Swarm Coordination
- docs.swarms.world - Multi-Agent Architectures
- Medium/@learning_37638 - Agentic Patterns for Coordinated AI Systems
- aws.amazon.com - Multi-Agent collaboration patterns
- arxiv.org - Multi-Agent Coordination Survey
- MIT Iceberg - Ripple Effect Protocol

### Self-Evolution
- arXiv:2508.07407 - Survey of Self-Evolving AI Agents
- arXiv:2511.10395 - AgentEvolver
- arXiv:2511.16043 - Agent0: Self-Evolving Agents
- terralogic.com - Self-Learning AI Agents
- Medium/@abhilasha.sinha - Smart AI Evolution
