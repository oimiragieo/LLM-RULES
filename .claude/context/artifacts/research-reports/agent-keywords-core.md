# Agent Keywords Research Report - Core Agents

**Generated**: 2026-01-25
**Purpose**: Intent keywords for Router agent matching
**Methodology**: Web research on industry-standard terminology, common task descriptions, and role responsibilities

---

## Agent: architect

**Description**: System designer. Makes high-level technical decisions, chooses stacks, and ensures scalability and maintainability.

### High-Confidence Keywords (unique to this agent)
- system design, system architecture, architecture blueprint, technical architecture
- technology selection, tech stack, technology choices, platform selection
- scalability, scaling strategy, horizontal scaling, vertical scaling
- design patterns, architectural patterns, microservices, monolith
- ADR, architecture decision record, technical decision
- component interaction, system structure, API design
- non-functional requirements, architectural characteristics
- cloud architecture, infrastructure design
- data modeling, database design (high-level)
- technical strategy, long-term viability

### Medium-Confidence Keywords (may overlap with planner/developer)
- design, blueprint, structure, architecture
- integration, integration points
- trade-offs, pros and cons
- standards, best practices, coding standards
- technical debt, technical risk
- resilience, availability, reliability

### Action Verbs
- design, architect, structure, model
- evaluate, assess, analyze trade-offs
- select, choose (technology), decide
- define, establish, standardize
- review (architecture), validate (design)
- diagram, document (architecture)

### Problem Indicators
- "how should we structure...", "what technology should we use..."
- "scalability concerns", "performance at scale"
- "system design for...", "architecture for..."
- "technical debt accumulating", "need to refactor architecture"
- "microservices vs monolith", "which database should..."
- "API design", "interface design", "contract design"
- "non-functional requirements", "NFRs"
- "high availability", "fault tolerance", "disaster recovery"

### Sources
- [Indeed - Software Architect Job Description](https://www.indeed.com/hire/job-description/software-architect)
- [Syndicode - The role, skills, and duties of a software architect](https://syndicode.com/blog/the-role-skills-and-duties-of-a-software-architect/)
- [AltexSoft - Who is Software Architect](https://www.altexsoft.com/blog/software-architect-role/)
- [DfE Architecture - Enterprise Architecture Principles](https://dfe-digital.github.io/architecture/principles/enterprise-architecture-principles/)

---

## Agent: context-compressor

**Description**: Intelligently summarizes and compresses context (files, logs, outputs) to save tokens and prevent poisoning.

### High-Confidence Keywords (unique to this agent)
- context compression, compress context, reduce context
- summarize, summarization, summary, executive summary
- token reduction, token savings, token optimization
- prune, pruning, remove duplicates, deduplicate
- context window, context limits, context overflow
- memory compression, conversation compression
- KV cache, key-value compression
- semantic compression, lossless compression

### Medium-Confidence Keywords (may overlap with other agents)
- condense, shorten, abbreviate
- extract key information, key points
- reduce, minimize, optimize
- filter, remove noise, clean up

### Action Verbs
- compress, summarize, condense, distill
- prune, filter, extract, reduce
- synthesize, consolidate, aggregate
- truncate, shorten, abbreviate

### Problem Indicators
- "context too long", "running out of context"
- "too many tokens", "token limit exceeded"
- "summarize this for me", "give me the key points"
- "reduce this to essentials", "what's the gist"
- "compress this conversation", "summarize our progress"
- "extract important information", "filter out noise"
- "context window full", "need to free up context"

### Sources
- [Factory.ai - Evaluating Context Compression for AI Agents](https://factory.ai/news/evaluating-compression)
- [JetBrains Research - Cutting Through the Noise: Smarter Context Management](https://blog.jetbrains.com/research/2025/12/efficient-context-management/)
- [Mem0 - LLM Chat History Summarization Guide](https://mem0.ai/blog/llm-chat-history-summarization-guide-2025)
- [TechXplore - AI tech can compress LLM chatbot conversation memory](https://techxplore.com/news/2025-11-ai-tech-compress-llm-chatbot.html)
- [ArXiv - ACON: Optimizing Context Compression for Long-Horizon LLM Agents](https://arxiv.org/html/2510.00615v1)

---

## Agent: developer

**Description**: TDD-focused implementer. Writes code, runs tests, and refactors. Follows Red-Green-Refactor strictly.

### High-Confidence Keywords (unique to this agent)
- implement, implementation, code, coding
- fix bug, debug, debugging, bugfix
- refactor, refactoring, clean up code
- TDD, test-driven development, red-green-refactor
- write code, write function, write class, write module
- unit test, test case, failing test
- code review, pull request, PR
- Git, commit, push, merge, branch

### Medium-Confidence Keywords (may overlap with QA/architect)
- feature, feature implementation
- error, exception, crash, issue
- performance, optimization (code-level)
- clean code, code quality
- dependency, library, package

### Action Verbs
- implement, code, develop, build
- fix, debug, patch, resolve
- refactor, rewrite, improve, optimize
- test (unit), write (tests), run (tests)
- commit, push, merge, deploy
- review, audit (code)

### Problem Indicators
- "fix this bug", "why is this broken", "not working"
- "implement this feature", "add this functionality"
- "write code for...", "code this up"
- "refactor this", "clean up this code"
- "tests are failing", "make tests pass"
- "syntax error", "runtime error", "type error", "logic error"
- "80% of production bugs trace back to recent changes"
- "add a new endpoint", "create a new component"

### Sources
- [DeVry - What Does a Software Developer Do](https://www.devry.edu/blog/what-does-a-software-developer-do.html)
- [Computer Science.org - Day in the Life of a Software Developer](https://www.computerscience.org/careers/software-developer/day-in-the-life/)
- [UpGrad - Roles and Responsibilities of Software Developer](https://www.upgrad.com/blog/what-does-a-software-developer-do/)
- [Stackify - Troubleshooting vs Debugging](https://stackify.com/troubleshooting-vs-debugging-whats-the-difference-best-practices/)
- [Medium - The Art of Debugging](https://medium.com/@sridinu03/the-art-of-debugging-how-to-fix-bugs-faster-and-smarter-bacbe667ba82)

---

## Agent: planner

**Description**: Strategic thinker. Breaks down complex goals into atomic, actionable steps. Use for new features, large refactors, or ambiguous requests.

### High-Confidence Keywords (unique to this agent)
- plan, planning, create plan, project plan
- breakdown, break down, decompose, split into tasks
- WBS, work breakdown structure
- phases, milestones, steps, stages
- dependencies, sequence, order of operations
- scope, requirements, goals, objectives
- epic, user story (planning level)
- estimate, timeline, schedule
- ambiguous, unclear, complex request

### Medium-Confidence Keywords (may overlap with PM/architect)
- roadmap, strategy (high-level)
- prioritize, sequence
- deliverables, success criteria
- blockers, risks (planning phase)

### Action Verbs
- plan, strategize, organize, structure
- break down, decompose, split, divide
- analyze, scope, estimate
- sequence, prioritize, schedule
- define (steps), identify (dependencies)

### Problem Indicators
- "how do we approach this", "where do we start"
- "break this down", "what are the steps"
- "create a plan for...", "plan out..."
- "this is complex", "this is ambiguous"
- "new feature", "large refactor", "major change"
- "what needs to happen first", "dependencies"
- "estimate this work", "how long will this take"
- "scope this out", "define the work"

### Sources
- [Atlassian - Work Breakdown Structure](https://www.atlassian.com/work-management/project-management/work-breakdown-structure)
- [ProjectManager.com - What Is a Work Breakdown Structure](https://www.projectmanager.com/guides/work-breakdown-structure)
- [workbreakdownstructure.com - What is WBS](https://www.workbreakdownstructure.com/)
- [Productive.io - Work Breakdown Structure in Project Management](https://productive.io/blog/work-breakdown-structure-in-project-management/)

---

## Agent: pm (Product Manager)

**Description**: Product Manager. Manages product backlogs, sprint planning, stakeholder communication, and feature prioritization.

### High-Confidence Keywords (unique to this agent)
- product backlog, backlog management, backlog grooming
- user story, user stories, acceptance criteria
- sprint planning, sprint goal, sprint review
- prioritization, RICE, MoSCoW, prioritize features
- stakeholder, stakeholder update, stakeholder communication
- product roadmap, roadmap, product vision
- OKR, objectives, key results
- velocity, story points, burndown
- epic, feature request, requirements gathering
- agile, scrum, kanban (process-level)

### Medium-Confidence Keywords (may overlap with planner)
- requirements, scope (product level)
- milestone, release, delivery
- metrics, KPIs, success metrics
- customer, user needs, user feedback

### Action Verbs
- prioritize, rank, score (RICE)
- plan (sprint), groom (backlog), refine
- communicate, update, report
- define (stories), write (user stories)
- track, measure, monitor (metrics)
- align, coordinate, facilitate

### Problem Indicators
- "what should we build next", "feature prioritization"
- "update the backlog", "groom the backlog"
- "write user stories for...", "acceptance criteria"
- "sprint planning", "what goes in next sprint"
- "stakeholder update", "status report"
- "product roadmap", "quarterly planning"
- "RICE score", "MoSCoW priority"
- "OKRs", "success metrics", "KPIs"

### Sources
- [Atlassian - Product Backlog Tips](https://www.atlassian.com/agile/scrum/backlogs)
- [Toptal - Product Backlog Step-by-Step Guide](https://www.toptal.com/product-managers/agile/product-backlog-step-by-step-guide)
- [Productboard - Who Owns the Product Backlog](https://www.productboard.com/blog/who-owns-the-product-backlog-a-comprehensive-guide/)
- [Miro - What is a Product Manager](https://miro.com/blog/product-manager/)
- [StoriesOnBoard - Backlog Prioritization](https://storiesonboard.com/blog/backlog-prioritization)

---

## Agent: qa (Quality Assurance)

**Description**: Quality Assurance specialist. Writes comprehensive test suites, performs regression testing, and validates releases.

### High-Confidence Keywords (unique to this agent)
- test, testing, test suite, test coverage
- QA, quality assurance, quality control
- regression, regression testing, regression suite
- edge case, boundary condition, corner case
- test plan, test case, test scenario
- automation, automated testing, test automation
- E2E, end-to-end testing, integration testing
- performance testing, load testing, stress testing
- bug, defect, issue (finding them)
- validation, verification, acceptance testing

### Medium-Confidence Keywords (may overlap with developer)
- unit test (writing vs running)
- CI/CD (testing phase)
- code coverage, coverage report
- mock, stub, fixture

### Action Verbs
- test, validate, verify, check
- automate (tests), write (tests), run (tests)
- identify (bugs), find (defects), discover (issues)
- cover (edge cases), stress (test), load (test)
- regress, re-test, validate (release)
- report, document (bugs)

### Problem Indicators
- "test this", "test coverage", "need more tests"
- "regression testing", "does this break anything"
- "edge cases", "what could go wrong"
- "validate this works", "verify the feature"
- "QA review", "quality check"
- "test automation", "automate these tests"
- "E2E tests", "integration tests", "acceptance tests"
- "test plan", "test strategy"
- "pre-release validation", "release candidate testing"

### Sources
- [AltexSoft - QA Engineering Roles](https://www.altexsoft.com/blog/engineering/qa-engineering-roles-skills-tools-and-responsibilities-within-a-testing-team/)
- [Softteco - QA Roles and Responsibilities](https://softteco.com/blog/roles-and-responsibilities-of-qa-engineer)
- [Pro5.ai - What Does a QA Automation Engineer Do](https://www.pro5.ai/blog/what-does-a-qa-automation-engineer-do)
- [Testomat.io - QA Role in Software Development](https://testomat.io/blog/the-qa-role-in-modern-software-development-lifecycle/)
- [DECODE Agency - QA Engineer Responsibilities](https://decode.agency/article/qa-engineer-responsibilities/)

---

## Agent: router (Meta-Agent)

**Description**: Orchestrates multi-agent system by analyzing requests and spawning appropriate subagents via the Task tool.

### High-Confidence Keywords (unique to this agent)
- route, routing, orchestrate, orchestration
- dispatch, delegate, assign (to agent)
- multi-agent, agent coordination, agent selection
- spawn agent, subagent, task distribution
- centralized orchestration, decentralized handoff
- workflow, pipeline, task flow
- context management, agent management

### Medium-Confidence Keywords (may trigger but need context)
- help, assist (generic - needs classification)
- start, begin (new task)
- who should handle, which agent

### Action Verbs
- route, dispatch, delegate, assign
- spawn, invoke, activate, trigger
- orchestrate, coordinate, manage
- analyze (request), classify, categorize
- select (agent), match, determine

### Problem Indicators
- "who should handle this", "which agent"
- "route this to...", "dispatch to..."
- "orchestrate", "coordinate agents"
- "agent workflow", "multi-step task"
- (Note: Router typically infers from user intent, not explicit requests)

### Orchestration Patterns (from research)
- **Centralized**: Single manager assigns tasks
- **Decentralized/Handoff**: Agents delegate dynamically
- **Linear/Sequential**: Tasks in specific order
- **Adaptive**: On-the-fly decision-making
- **Event-Driven**: Orchestrator-worker, hierarchical, blackboard, market-based

### Sources
- [Microsoft Learn - AI Agent Orchestration Patterns](https://learn.microsoft.com/en-us/azure/architecture/ai-ml/guide/ai-agent-design-patterns)
- [Dynamiq - Agent Orchestration Patterns in Multi-Agent Systems](https://www.getdynamiq.ai/post/agent-orchestration-patterns-in-multi-agent-systems-linear-and-adaptive-approaches-with-dynamiq)
- [AWS - Multi-Agent Orchestration Guidance](https://aws.amazon.com/solutions/guidance/multi-agent-orchestration-on-aws/)
- [OpenAI - Orchestrating Multiple Agents](https://openai.github.io/openai-agents-python/multi_agent/)
- [IBM - What is AI Agent Orchestration](https://www.ibm.com/think/topics/ai-agent-orchestration)
- [Kore.ai - Choosing the Right Orchestration Pattern](https://www.kore.ai/blog/choosing-the-right-orchestration-pattern-for-multi-agent-systems)

---

## Cross-Agent Disambiguation Matrix

| Keyword/Phrase | Primary Agent | Secondary Consideration |
|---------------|---------------|------------------------|
| "design" | architect | planner (if task breakdown) |
| "plan" | planner | pm (if product-level) |
| "test" | qa | developer (if unit test focus) |
| "fix bug" | developer | qa (if test-related) |
| "refactor" | developer | architect (if large-scale) |
| "requirements" | pm | planner (if technical) |
| "prioritize" | pm | planner (if task-level) |
| "user story" | pm | - |
| "architecture" | architect | - |
| "debug" | developer | - |
| "regression" | qa | - |
| "summarize" | context-compressor | - |
| "compress" | context-compressor | - |
| "route" | router | - |
| "orchestrate" | router | - |

---

## Complexity Indicators for Router

### Low Complexity (Single Agent)
- Single-file changes
- Simple bug fixes
- Documentation updates
- Single test additions
- Quick refactors

### Medium Complexity (May Need Review)
- Multi-file changes
- New features (small)
- Performance optimizations
- Test suite expansions

### High Complexity (Spawn Planner First)
- New features (large)
- Architecture changes
- External integrations
- Database changes
- Security-related changes
- Large refactors

### Epic Complexity (Full Orchestration)
- System redesigns
- Major migrations
- New product areas
- Cross-team initiatives
