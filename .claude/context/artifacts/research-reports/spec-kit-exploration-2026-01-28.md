# Spec-Kit Codebase Exploration

**Exploration Date**: 2026-01-28
**Task ID**: #2
**Target**: C:\dev\projects\agent-studio\.claude.archive\.tmp\spec-kit-main
**Approach**: ULTRATHINK - Deep, comprehensive analysis
**Purpose**: Identify integration opportunities for agent-studio framework

---

## Executive Summary

### Key Findings

1. **Different Paradigm**: Spec Kit is a **Specification-Driven Development (SDD) toolkit**, not a multi-agent framework extension. It focuses on **spec → plan → implementation** workflow with AI assistance.

2. **Standout Features Worth Investigating**:
   - **Template-based specification workflow** - transforms natural language → structured specs → implementation plans → task lists
   - **Multi-AI agent support** - unified command interface for 15+ AI coding assistants (Claude, Gemini, Copilot, Cursor, etc.)
   - **Constitution-based governance** - project principles that guide development and get automatically validated
   - **Branch-based feature development** - numbered branches with automated spec/plan directory structure
   - **Progressive disclosure workflow** - /speckit.specify → /speckit.clarify → /speckit.plan → /speckit.tasks
   - **Bash/PowerShell automation layer** - shell scripts that handle git operations, branch creation, file setup

3. **Core Philosophy**: Specifications are executable and become the source of truth, with code as generated output. This contrasts with our agent-first approach where agents orchestrate based on instructions.

4. **Integration Opportunities** (Preliminary):
   - Port spec/plan/tasks templates to our workflow enhancement skills
   - Multi-AI agent support patterns for broader tool compatibility
   - Constitution concept as agent behavioral constraints
   - Branch-based feature workflow for structured development
   - Automation scripts for reducing manual git/file operations

---

## Directory Structure

```
spec-kit-main/
├── .devcontainer/           # Dev container config
├── .github/                 # GitHub workflows, agent configs
│   └── workflows/           # Release automation
├── docs/                    # Documentation (docfx-based)
│   ├── index.md
│   ├── installation.md
│   ├── quickstart.md
│   ├── local-development.md
│   └── upgrade.md
├── media/                   # Images, logos
├── memory/                  # Project memory
│   └── constitution.md      # Template constitution
├── scripts/                 # Automation scripts
│   ├── bash/                # Unix shell scripts
│   │   ├── check-prerequisites.sh
│   │   ├── common.sh        # Shared functions
│   │   ├── create-new-feature.sh  # Feature branch creator
│   │   ├── setup-plan.sh
│   │   └── update-agent-context.sh  # Multi-agent context sync
│   └── powershell/          # Windows PowerShell equivalents
├── src/                     # Python CLI source
│   └── specify_cli/
│       └── __init__.py      # Main CLI entry point
├── templates/               # Markdown templates
│   ├── commands/            # AI agent commands (slash commands)
│   │   ├── analyze.md
│   │   ├── checklist.md
│   │   ├── clarify.md       # Clarification workflow
│   │   ├── constitution.md  # Constitution creator
│   │   ├── implement.md     # Implementation executor
│   │   ├── plan.md          # Planning workflow
│   │   ├── specify.md       # Spec generation workflow
│   │   ├── tasks.md         # Task breakdown workflow
│   │   └── taskstoissues.md # GitHub issues creator
│   ├── agent-file-template.md  # Multi-agent context template
│   ├── checklist-template.md
│   ├── plan-template.md     # Implementation plan structure
│   ├── spec-template.md     # Feature specification structure
│   ├── tasks-template.md    # Task list structure
│   └── vscode-settings.json
├── AGENTS.md                # Agent integration guide
├── CHANGELOG.md
├── CODE_OF_CONDUCT.md
├── CONTRIBUTING.md
├── LICENSE
├── pyproject.toml           # Python package config (uv-based)
├── README.md
├── SECURITY.md
├── spec-driven.md           # SDD philosophy deep dive
└── SUPPORT.md
```

---

## Features Inventory

### 1. Specification-Driven Development (SDD) Workflow

**Core Concept**: Specifications become executable, generating implementations rather than just guiding them. Specs are source of truth, code is generated output.

**Workflow Phases**:
1. **Idea** → Natural language feature description
2. **Specification** (/speckit.specify) → Structured spec with user stories, requirements, acceptance criteria
3. **Clarification** (/speckit.clarify) → Resolve ambiguities, answer questions
4. **Planning** (/speckit.plan) → Technical architecture, data models, API contracts, research
5. **Task Breakdown** (/speckit.tasks) → Actionable task list with dependencies
6. **Implementation** (/speckit.implement) → Execute tasks incrementally
7. **Analysis** (/speckit.analyze) → Consistency validation

**Key Differentiators**:
- Specifications are versioned, branched, and merged like code
- Implementation plans auto-update when requirements change
- Research agents gather context during specification process
- Constitution validates all design decisions

---

### 2. Template-Based Artifact Generation

**Feature**: Markdown templates with placeholder tokens that get filled by AI agents.

**Templates Available**:

| Template             | Purpose                                | Placeholders                                |
| -------------------- | -------------------------------------- | ------------------------------------------- |
| spec-template.md     | Feature specifications                 | FEATURE_NAME, user stories, requirements    |
| plan-template.md     | Implementation plans                   | Tech stack, structure, constitution checks  |
| tasks-template.md    | Task breakdowns                        | Task IDs, dependencies, file paths          |
| checklist-template.md| Quality validation checklists          | Domain-specific validation criteria         |
| constitution.md      | Project governance principles          | Principles, governance rules, versioning    |
| agent-file-template.md| Multi-agent context files             | Tech stack, project info, recent changes    |

**Template Patterns**:
- **Placeholder tokens**: `[ALL_CAPS_IDENTIFIER]` get replaced with concrete values
- **Structured sections**: Mandatory vs optional, clear heading hierarchy
- **Validation markers**: `[NEEDS CLARIFICATION: question]` for incomplete specs
- **Metadata**: Version, dates, branch, status tracking

**Example - Spec Template Structure**:
```markdown
# Feature Specification: [FEATURE NAME]

**Branch**: [###-feature-name]
**Created**: [DATE]
**Status**: Draft

## User Scenarios & Testing (mandatory)
### User Story 1 - [Title] (Priority: P1)
**Why this priority**: [rationale]
**Independent Test**: [how to verify independently]
**Acceptance Scenarios**:
1. Given [state], When [action], Then [outcome]

## Requirements (mandatory)
### Functional Requirements
- FR-001: System MUST [capability]

## Success Criteria (mandatory)
### Measurable Outcomes
- SC-001: [measurable metric]
```

---

### 3. Multi-AI Agent Support (15+ Agents)

**Feature**: Unified command interface that works across multiple AI coding assistants. Each agent has its own command format and directory structure, but Spec Kit provides adapters.

**Supported Agents** (from AGENTS.md):

| Agent                | CLI Tool        | Directory              | Format   | Status      |
| -------------------- | --------------- | ---------------------- | -------- | ----------- |
| Claude Code          | `claude`        | `.claude/commands/`    | Markdown | Full        |
| Gemini CLI           | `gemini`        | `.gemini/commands/`    | TOML     | Full        |
| GitHub Copilot       | N/A (IDE)       | `.github/agents/`      | Markdown | Partial     |
| Cursor               | `cursor-agent`  | `.cursor/commands/`    | Markdown | Full        |
| Qwen Code            | `qwen`          | `.qwen/commands/`      | TOML     | Full        |
| opencode             | `opencode`      | `.opencode/command/`   | Markdown | Full        |
| Codex CLI            | `codex`         | `.codex/commands/`     | Markdown | Full        |
| Windsurf             | N/A (IDE)       | `.windsurf/workflows/` | Markdown | Partial     |
| Kilo Code            | N/A (IDE)       | `.kilocode/rules/`     | Markdown | Partial     |
| Auggie CLI           | `auggie`        | `.augment/rules/`      | Markdown | Full        |
| Roo Code             | N/A (IDE)       | `.roo/rules/`          | Markdown | Partial     |
| CodeBuddy CLI        | `codebuddy`     | `.codebuddy/commands/` | Markdown | Full        |
| Qoder CLI            | `qoder`         | `.qoder/commands/`     | Markdown | Full        |
| Amazon Q Developer   | `q`             | `.amazonq/prompts/`    | Markdown | Full        |
| Amp                  | `amp`           | `.agents/commands/`    | Markdown | Full        |
| SHAI                 | `shai`          | `.shai/commands/`      | Markdown | Experimental|

**Configuration Metadata** (from __init__.py AGENT_CONFIG):
```python
{
    "name": "Display Name",
    "folder": ".agentdir/",
    "install_url": "https://...",  # or None for IDE-based
    "requires_cli": True/False
}
```

**Command Adapters**:
- **Markdown**: `$ARGUMENTS` placeholder for user input
- **TOML**: `{{args}}` placeholder
- **Command metadata**: `description`, `handoffs`, `scripts`

**Agent Context Synchronization** (`update-agent-context.sh`):
- Parses plan.md for tech stack, frameworks, dependencies
- Updates agent-specific files (CLAUDE.md, GEMINI.md, etc.)
- Preserves manual additions between markers
- Detects which agents are in use and updates all automatically

---

### 4. Constitution-Based Governance

**Feature**: Project-level principles that act as non-negotiable constraints for all development.

**Constitution Structure** (memory/constitution.md):
```markdown
# [PROJECT_NAME] Constitution

## Core Principles

### I. [PRINCIPLE_NAME]
[Description of non-negotiable rule]
[Rationale for why this principle exists]

### II. [PRINCIPLE_NAME]
...

## Governance
[Amendment procedure]
[Versioning policy]
[Compliance review expectations]

**Version**: X.Y.Z | **Ratified**: YYYY-MM-DD | **Last Amended**: YYYY-MM-DD
```

**Constitution Versioning**:
- **MAJOR**: Backward incompatible principle changes
- **MINOR**: New principles added or expanded
- **PATCH**: Clarifications, typos, non-semantic refinements

**Constitution Integration**:
- `/speckit.constitution` command creates/updates constitution
- `/speckit.plan` includes "Constitution Check" gate
- Violations must be explicitly justified with rationale
- Templates reference constitution principles

**Example Principles** (from spec-driven.md):
1. **Library-First**: Every feature starts as standalone library
2. **CLI Interface**: Every library exposes CLI functionality
3. **Test-First (NON-NEGOTIABLE)**: TDD mandatory, red-green-refactor
4. **Integration Testing**: Contract tests for library boundaries
5. **Observability**: Structured logging, debuggable text I/O
6. **Versioning**: MAJOR.MINOR.BUILD with breaking change rules
7. **Simplicity**: YAGNI principles, start simple

---

### 5. Branch-Based Feature Development

**Feature**: Automated git branch creation with numbered feature directories.

**Branch Naming Convention**: `###-short-name` (e.g., `001-user-auth`, `042-oauth2-integration`)

**Automation** (`create-new-feature.sh`):
1. **Find highest number**: Check remote branches, local branches, specs directories
2. **Increment**: Use N+1 for new feature
3. **Create branch**: `git checkout -b ###-short-name`
4. **Create directory structure**: `specs/###-short-name/`
5. **Initialize files**: Copy spec template, set up plan placeholder
6. **Output JSON**: Returns branch name, spec file path, feature directory

**Directory Structure Per Feature**:
```
specs/001-user-auth/
├── spec.md              # Feature specification (from /speckit.specify)
├── plan.md              # Implementation plan (from /speckit.plan)
├── research.md          # Research findings (from /speckit.plan Phase 0)
├── data-model.md        # Entity models (from /speckit.plan Phase 1)
├── quickstart.md        # Validation scenarios (from /speckit.plan Phase 1)
├── contracts/           # API contracts (from /speckit.plan Phase 1)
│   ├── openapi.yaml     # REST API spec
│   └── schema.graphql   # GraphQL schema
├── tasks.md             # Task breakdown (from /speckit.tasks)
└── checklists/          # Quality validation checklists
    └── requirements.md  # Spec quality checklist
```

**Git Workflow**:
- Feature specs versioned in git
- Specs can be branched, merged, reviewed like code
- Multiple implementations can be generated from same spec (different optimization targets)

---

### 6. Command-Driven Workflow (Slash Commands)

**Feature**: AI agent commands that execute multi-step workflows.

**Available Commands** (templates/commands/*.md):

| Command               | Purpose                                              | Phase | Outputs                                    |
| --------------------- | ---------------------------------------------------- | ----- | ------------------------------------------ |
| /speckit.constitution | Create/update project principles                     | Setup | memory/constitution.md                     |
| /speckit.specify      | Generate feature specification from description      | 1     | specs/###-name/spec.md, branch             |
| /speckit.clarify      | Resolve ambiguities in spec                          | 1.5   | Updated spec.md                            |
| /speckit.plan         | Create implementation plan from spec                 | 2     | plan.md, research.md, data-model.md, contracts/ |
| /speckit.tasks        | Generate task breakdown from plan                    | 3     | tasks.md                                   |
| /speckit.analyze      | Validate consistency across artifacts                | N/A   | Analysis report                            |
| /speckit.implement    | Execute tasks incrementally                          | 4     | Source code, tests                         |
| /speckit.checklist    | Create domain-specific validation checklist          | N/A   | checklists/*.md                            |
| /speckit.taskstoissues| Convert tasks.md to GitHub issues                    | N/A   | GitHub issues                              |

**Command Metadata Format**:
```yaml
---
description: Brief description
handoffs:
  - label: Next Step Name
    agent: speckit.command
    prompt: Suggested prompt
    send: true  # Auto-execute without user confirmation
scripts:
  sh: scripts/bash/script-name.sh --json "{ARGS}"
  ps: scripts/powershell/script-name.ps1 -Json "{ARGS}"
agent_scripts:
  sh: scripts/bash/update-agent-context.sh __AGENT__
  ps: scripts/powershell/update-agent-context.ps1 -AgentType __AGENT__
---
```

**Handoff System**:
- Each command defines next logical steps
- AI can suggest handoffs with pre-filled prompts
- Enables workflow chaining (specify → plan → tasks → implement)

**Script Integration**:
- Commands can invoke shell scripts via `{SCRIPT}` placeholder
- Scripts return JSON with file paths, branch names, metadata
- Cross-platform: Bash for Unix, PowerShell for Windows

---

### 7. Progressive Disclosure Workflow

**Feature**: Iterative refinement from vague idea to concrete implementation.

**Workflow Steps**:

#### Phase 0: Constitution Setup
```
/speckit.constitution Create principles focused on...
```
- Define project principles (test-first, library-first, etc.)
- Version constitution
- Propagate to templates

#### Phase 1: Specification
```
/speckit.specify I want to build user authentication
```
- Analyzes description, extracts key concepts
- Generates structured spec with user stories, requirements
- Creates numbered branch (e.g., `001-user-auth`)
- Marks ambiguities with `[NEEDS CLARIFICATION: question]`
- **Quality Gate**: Spec quality checklist validates completeness

#### Phase 1.5: Clarification (Optional)
```
/speckit.clarify
```
- Extracts all `[NEEDS CLARIFICATION]` markers
- Presents options with implications
- Updates spec with user's choices
- **Rule**: Maximum 3 clarifications (make informed guesses otherwise)

#### Phase 2: Planning
```
/speckit.plan
```
- **Phase 0 (Research)**: Resolves technical unknowns
  - Technology choices with rationale
  - Best practices research
  - Output: research.md
- **Phase 1 (Design)**: Creates implementation artifacts
  - Data models from entities
  - API contracts from functional requirements
  - Quickstart validation scenarios
  - Output: data-model.md, contracts/, quickstart.md
- **Constitution Check**: Validates plan against principles

#### Phase 3: Task Breakdown
```
/speckit.tasks
```
- Reads plan.md, spec.md, data-model.md, contracts/
- Generates dependency-ordered task list
- Organizes by user story (enables incremental delivery)
- Marks parallel tasks with `[P]`
- Maps tasks to specific files: `src/models/user.py`
- Output: tasks.md

#### Phase 4: Implementation
```
/speckit.implement
```
- Executes tasks incrementally
- Tests first (if TDD principle enabled)
- Validates against quickstart.md scenarios

#### Phase N: Analysis
```
/speckit.analyze
```
- Validates consistency across spec/plan/tasks/code
- Checks constitution compliance
- Identifies gaps or ambiguities

---

### 8. User Story-Driven Development

**Feature**: Task organization by user story priority enables incremental delivery.

**User Story Structure** (from spec-template.md):
```markdown
### User Story 1 - [Title] (Priority: P1)
[Description]

**Why this priority**: [Value justification]
**Independent Test**: [Standalone verification]

**Acceptance Scenarios**:
1. Given [state], When [action], Then [outcome]
```

**Task Mapping to Stories** (from tasks-template.md):
```
## Phase 3: User Story 1 - [Title] (Priority: P1) 🎯 MVP

**Goal**: [What this story delivers]
**Independent Test**: [How to verify independently]

### Implementation for User Story 1
- [ ] T012 [P] [US1] Create User model in src/models/user.py
- [ ] T013 [P] [US1] Create Session model in src/models/session.py
- [ ] T014 [US1] Implement AuthService in src/services/auth.py
- [ ] T015 [US1] Implement /login endpoint in src/api/auth.py
```

**Key Benefits**:
- **MVP First**: P1 story = minimal viable product
- **Incremental Delivery**: Each story can be deployed independently
- **Parallel Development**: Different stories = different team members
- **Independent Testing**: Each story has standalone verification

**Dependency Management**:
- **Setup Phase**: Project initialization (no dependencies)
- **Foundational Phase**: Blocking prerequisites (e.g., database schema, auth framework) - MUST complete before any story
- **User Story Phases**: Run in priority order (P1 → P2 → P3) or parallel
- **Polish Phase**: Cross-cutting concerns after stories complete

---

### 9. Automation Scripts (Bash/PowerShell)

**Feature**: Shell scripts that reduce manual git/file operations.

**Available Scripts**:

| Script                   | Purpose                                      | Outputs                             |
| ------------------------ | -------------------------------------------- | ----------------------------------- |
| create-new-feature.sh    | Find next number, create branch, setup dirs | JSON: branch, spec path, feature dir|
| setup-plan.sh            | Initialize plan.md, copy templates           | JSON: plan path, specs dir          |
| check-prerequisites.sh   | Validate git repo, find spec/plan files      | JSON: available docs, feature dir   |
| update-agent-context.sh  | Parse plan, update multi-agent context files | Updated agent files                 |
| common.sh                | Shared utilities (find_repo_root, JSON fns) | N/A                                 |

**Script Features**:
- **JSON output**: Structured data for AI agent consumption
- **Error handling**: set -e, validation checks
- **Cross-platform**: Bash + PowerShell equivalents
- **Modular**: common.sh provides shared functions
- **Git-aware**: Finds repo root, checks branches, creates checkouts

**Example - create-new-feature.sh**:
```bash
# Input: Feature description, optional --short-name, --number
# Process:
# 1. Find repo root (.git or .specify directory)
# 2. Get highest feature number from:
#    - Remote branches (git ls-remote)
#    - Local branches (git branch)
#    - Specs directories (ls specs/)
# 3. Increment highest number
# 4. Create branch: ###-short-name
# 5. Create directory: specs/###-short-name/
# 6. Copy spec template
# Output: JSON with branch_name, spec_file, feature_dir
```

**Example - update-agent-context.sh**:
```bash
# Input: Optional agent type (claude|gemini|copilot|...)
# Process:
# 1. Find current feature branch
# 2. Read plan.md from specs/###-name/
# 3. Extract: language, framework, database, project type
# 4. Detect which agents are in use (file existence)
# 5. For each agent:
#    - Read agent-specific file (CLAUDE.md, GEMINI.md, etc.)
#    - Update "Technology Stack" section
#    - Update "Recent Changes" section
#    - Preserve manual additions between markers
# 6. Generate language-specific commands (build, test, run)
# Output: Updated agent context files
```

---

## Hooks Catalog

**Note**: Spec Kit does NOT have a hooks system like our agent-studio framework. There are no safety/validation/routing hooks.

**Enforcement Mechanisms**:
- **Constitution Check**: Manual validation step in /speckit.plan
- **Quality Checklists**: Generated validation lists, manually verified
- **Script Validation**: Prerequisites checked by shell scripts
- **Template Structure**: Enforced by markdown structure, not hooks

**Key Difference**: Spec Kit relies on AI agent adherence to command instructions rather than blocking hooks.

---

## Agents Catalog

**Note**: Spec Kit does NOT define specialized AI agents. It defines **commands** that work with any supported AI agent.

**Command "Agents"** (templates/commands/*.md):
- constitution.md - Constitution creator workflow
- specify.md - Spec generator workflow
- clarify.md - Clarification workflow
- plan.md - Planning workflow
- tasks.md - Task breakdown workflow
- implement.md - Implementation executor workflow
- analyze.md - Consistency analyzer workflow
- checklist.md - Checklist generator workflow
- taskstoissues.md - GitHub issues creator workflow

**Key Difference**: Our agent-studio has specialized agents (architect, developer, qa, etc.). Spec Kit has specialized **workflows** (commands) that any AI can execute.

---

## Workflows Catalog

**Spec Kit Workflows** (implicitly defined in command templates):

### 1. Feature Development Workflow
```
/speckit.constitution (once per project)
  ↓
/speckit.specify <description>
  ↓
/speckit.clarify (if needed)
  ↓
/speckit.plan
  ↓
/speckit.tasks
  ↓
/speckit.implement
  ↓
/speckit.analyze
```

### 2. Research → Design → Implementation Workflow (from plan.md)
```
Phase 0: Research
- Extract NEEDS CLARIFICATION from plan.md
- Research best practices for unknowns
- Document decisions in research.md

Phase 1: Design
- Generate data-model.md from entities
- Generate contracts/ from requirements
- Generate quickstart.md from acceptance criteria
- Update agent context files

Phase 2: Tasking (separate command)
- Read plan.md, spec.md, data-model.md, contracts/
- Generate tasks.md organized by user story

Phase 3+: Implementation
- Execute tasks incrementally
- Validate against quickstart.md
```

### 3. Specification Quality Workflow (from specify.md)
```
1. Generate initial spec from description
2. Create quality checklist
3. Validate spec against checklist:
   - No implementation details
   - Testable requirements
   - Measurable success criteria
   - Technology-agnostic
4. If fails: Fix issues, re-validate (max 3 iterations)
5. If [NEEDS CLARIFICATION] present:
   - Extract markers (max 3)
   - Present options with implications
   - Wait for user choices
   - Update spec
   - Re-validate
```

---

## Tools Catalog

**CLI Tool** (src/specify_cli/__init__.py):

```bash
# Install
uv tool install specify-cli --from git+https://github.com/github/spec-kit.git

# Commands
specify init <project-name>     # Initialize new project
specify init . --ai claude       # Initialize in current dir with Claude
specify init --here --ai gemini  # Initialize here with Gemini
specify check                    # Check prerequisites
```

**Functionality**:
- Project initialization
- Template copying
- Agent directory setup
- Dependency validation
- GitHub releases integration

**Dependencies** (pyproject.toml):
- typer - CLI framework
- rich - Terminal UI
- httpx - HTTP client (for GitHub API)
- platformdirs - Cross-platform paths
- readchar - Keyboard input
- truststore - SSL verification

---

## Skills Catalog

**Note**: Spec Kit does NOT have a skills system. Commands serve as reusable capabilities.

**Command-as-Skill Mapping**:

| Spec Kit Command      | Equivalent Skill Concept                   |
| --------------------- | ------------------------------------------ |
| /speckit.constitution | governance-creator                         |
| /speckit.specify      | spec-gathering + spec-writing              |
| /speckit.clarify      | interactive-requirements-gathering         |
| /speckit.plan         | plan-generator + architecture-review       |
| /speckit.tasks        | task-breakdown + complexity-assessment     |
| /speckit.implement    | implementation-executor                    |
| /speckit.analyze      | consistency-validator + code-analyzer      |
| /speckit.checklist    | checklist-generator                        |

---

## Spec-Driven Patterns

### Pattern 1: Specifications as Source of Truth

**Concept**: Code is generated output from specs, not the other way around.

**Implementation**:
- Specs versioned in git alongside code
- When requirements change → update spec → regenerate code
- Multiple implementations can be generated from same spec (performance vs maintainability)
- Production metrics/incidents → update specs for next regeneration

**Key Insight**: Development becomes **spec evolution** rather than code evolution.

---

### Pattern 2: Research-Driven Planning

**Concept**: Unknowns are systematically researched before design decisions.

**Implementation** (from plan.md Phase 0):
```
1. Extract NEEDS CLARIFICATION from plan.md
2. For each unknown:
   - Task: Research {unknown} for {feature context}
3. For each technology choice:
   - Task: Find best practices for {tech} in {domain}
4. Consolidate findings in research.md with:
   - Decision: [what was chosen]
   - Rationale: [why chosen]
   - Alternatives considered: [what else evaluated]
```

**Key Insight**: Design decisions have documented rationale and alternatives.

---

### Pattern 3: Constitution-Based Validation

**Concept**: Project principles act as non-negotiable gates for all development.

**Implementation**:
- Constitution defined upfront
- Every plan.md includes "Constitution Check" section
- Violations must be explicitly justified
- Templates reference constitution principles

**Example Constitution Check** (from plan-template.md):
```markdown
## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

### Principle I: Library-First
- ✓ Feature designed as standalone library
- ✓ Clear library boundary identified

### Principle III: Test-First
- ⚠️ VIOLATION: Tests not included in initial plan
- Justification: User explicitly requested no tests
- Mitigation: Tests can be added later if needed

### Principle VII: Simplicity
- ✓ No unnecessary abstractions
- ✓ Follows YAGNI principles
```

**Key Insight**: Violations are transparent and justified, not hidden.

---

### Pattern 4: Progressive Disclosure with Clarification Limits

**Concept**: AI makes informed guesses to avoid question overload. Max 3 clarifications per phase.

**Implementation** (from specify.md):
```
For unclear aspects:
- Make informed guesses based on context and industry standards
- Only mark with [NEEDS CLARIFICATION: question] if:
  - Choice significantly impacts feature scope or user experience
  - Multiple reasonable interpretations exist with different implications
  - No reasonable default exists
- **LIMIT: Maximum 3 [NEEDS CLARIFICATION] markers total**
- Prioritize by impact: scope > security/privacy > UX > technical details
```

**Reasonable Defaults Examples**:
- Data retention: Industry-standard practices
- Performance targets: Standard web/mobile expectations
- Error handling: User-friendly messages with fallbacks
- Authentication: Session-based or OAuth2
- Integration patterns: RESTful APIs

**Key Insight**: AI is proactive and opinionated, not passive and question-heavy.

---

### Pattern 5: User Story-Driven Incremental Delivery

**Concept**: Each user story is independently implementable and testable, enabling MVP-first development.

**Implementation** (from tasks-template.md):
```
Phase 1: Setup (shared infrastructure)
Phase 2: Foundational (blocking prerequisites)
Phase 3: User Story 1 (P1) 🎯 MVP
  - Tests (if requested)
  - Models
  - Services
  - Endpoints
  - Integration
  **Checkpoint**: Story 1 fully functional and independently testable
Phase 4: User Story 2 (P2)
  **Checkpoint**: Stories 1 AND 2 both work independently
Phase 5: User Story 3 (P3)
  **Checkpoint**: All stories independently functional
Phase N: Polish & cross-cutting concerns
```

**Key Benefits**:
- **MVP = P1 story**: Ship minimal viable product quickly
- **Incremental value**: Each story adds value without breaking previous
- **Parallel development**: Different stories = different developers
- **Independent testing**: Story works standalone, not just when integrated

**Key Insight**: Task organization by user story enables true incremental delivery.

---

### Pattern 6: Technology-Agnostic Success Criteria

**Concept**: Success criteria focus on user/business outcomes, not implementation details.

**Implementation** (from spec-template.md):
```markdown
## Success Criteria Guidelines

Success criteria must be:
1. Measurable: Include specific metrics (time, percentage, count, rate)
2. Technology-agnostic: No mention of frameworks, languages, databases, tools
3. User-focused: Outcomes from user/business perspective, not system internals
4. Verifiable: Can be tested/validated without knowing implementation details

**Good examples**:
- "Users can complete checkout in under 3 minutes"
- "System supports 10,000 concurrent users"
- "95% of searches return results in under 1 second"

**Bad examples** (implementation-focused):
- "API response time is under 200ms" (too technical)
- "Database can handle 1000 TPS" (implementation detail)
- "React components render efficiently" (framework-specific)
```

**Key Insight**: Specs can be implemented in any tech stack if success criteria are truly agnostic.

---

### Pattern 7: Handoff-Based Workflow Chaining

**Concept**: Each command defines logical next steps with pre-filled prompts.

**Implementation** (from command metadata):
```yaml
handoffs:
  - label: Build Technical Plan
    agent: speckit.plan
    prompt: Create a plan for the spec. I am building with...
    send: true  # Auto-execute
  - label: Clarify Spec Requirements
    agent: speckit.clarify
    prompt: Clarify specification requirements
    send: false  # Manual confirmation
```

**Key Insight**: Workflow becomes discoverable and guided, not memorized.

---

### Pattern 8: Script-Driven Automation with JSON Output

**Concept**: Shell scripts handle git/file operations, return structured JSON for AI consumption.

**Implementation** (from create-new-feature.sh):
```bash
# Script execution
./scripts/bash/create-new-feature.sh --json --number 5 --short-name "user-auth" "Add user authentication"

# JSON output
{
  "success": true,
  "branch_name": "005-user-auth",
  "spec_file": "/path/to/specs/005-user-auth/spec.md",
  "feature_dir": "/path/to/specs/005-user-auth",
  "created_at": "2026-01-28T10:30:00Z"
}
```

**Key Benefit**: AI can reliably parse script output and use exact file paths.

**Key Insight**: Structured output prevents AI from guessing paths or making assumptions.

---

### Pattern 9: Multi-Agent Context Synchronization

**Concept**: Keep all AI agents (Claude, Gemini, Copilot, etc.) in sync with same project context.

**Implementation** (from update-agent-context.sh):
```
1. Detect which agents are in use (file existence check)
   - CLAUDE.md → Claude Code
   - GEMINI.md → Gemini CLI
   - .github/agents/copilot-instructions.md → Copilot
2. Parse current plan.md for:
   - Language/version
   - Framework
   - Database
   - Project type
3. For each agent:
   - Read agent-specific file
   - Update "Technology Stack" section
   - Update "Recent Changes" section
   - Preserve manual additions between markers
4. Generate language-specific commands:
   - Build: python -m build, cargo build, npm run build
   - Test: pytest, cargo test, npm test
   - Run: python -m myapp, cargo run, npm start
```

**Agent-Specific File Paths**:
```
CLAUDE.md
GEMINI.md
.github/agents/copilot-instructions.md
.cursor/rules/specify-rules.mdc
QWEN.md
.windsurf/rules/specify-rules.md
AGENTS.md (for Amp, Q, Bob)
...
```

**Key Insight**: Context updates happen automatically, not manually per agent.

---

## Interesting Patterns

### 1. Template Token Replacement Pattern

**Pattern**: Use `[ALL_CAPS_IDENTIFIER]` placeholders that AI systematically replaces.

**Example** (constitution.md):
```markdown
# [PROJECT_NAME] Constitution

### [PRINCIPLE_1_NAME]
[PRINCIPLE_1_DESCRIPTION]

### [PRINCIPLE_2_NAME]
[PRINCIPLE_2_DESCRIPTION]

**Version**: [CONSTITUTION_VERSION] | **Ratified**: [RATIFICATION_DATE]
```

**AI Workflow**:
1. Load template
2. Identify all `[.*]` tokens
3. For each token:
   - Check user input for value
   - Infer from repo context (README, docs)
   - Ask user if critical and unknown
4. Replace all tokens with concrete values
5. Validate: No unexplained brackets remain

**Benefits**:
- Clear separation: template structure vs content
- AI knows exactly what to fill
- No guessing about what's complete

---

### 2. Quality Checklist Pattern

**Pattern**: Generate validation checklists that get manually verified (or auto-validated by AI).

**Example** (from specify.md):
```markdown
# Specification Quality Checklist: [FEATURE NAME]

**Purpose**: Validate specification completeness before planning
**Created**: 2026-01-28
**Feature**: [Link to spec.md]

## Content Quality
- [ ] No implementation details (languages, frameworks, APIs)
- [ ] Focused on user value and business needs
- [ ] Written for non-technical stakeholders
- [ ] All mandatory sections completed

## Requirement Completeness
- [ ] No [NEEDS CLARIFICATION] markers remain
- [ ] Requirements are testable and unambiguous
- [ ] Success criteria are measurable
- [ ] Success criteria are technology-agnostic
```

**Workflow**:
1. Generate checklist after spec creation
2. Run validation check against each item
3. If fails: Fix issues, re-validate (max 3 iterations)
4. If still failing: Document remaining issues in notes

**Benefits**:
- Explicit quality gates
- Self-documenting validation criteria
- Prevents "good enough" specs from proceeding

---

### 3. Markdown Table with Implications Pattern

**Pattern**: Present options as structured tables with implications, not free-form questions.

**Example** (from specify.md clarification workflow):
```markdown
## Question 1: Authentication Method

**Context**: Feature requires user authentication

**What we need to know**: Which authentication method should be used?

**Suggested Answers**:

| Option | Answer | Implications |
|--------|--------|--------------|
| A      | Email + Password | Simple to implement, lower security, need password reset flow |
| B      | OAuth2 (Google/GitHub) | Higher security, faster signup, requires external provider setup |
| C      | Magic link (passwordless) | Modern UX, requires email service, may confuse some users |
| Custom | Provide your own answer | Explain requirements and constraints |

**Your choice**: _[Wait for user response]_
```

**Benefits**:
- Structured decision-making
- Trade-offs visible upfront
- Easy to parse user's choice (A/B/C/Custom)

---

### 4. Checkpoint Pattern for Incremental Delivery

**Pattern**: Explicit validation points where a feature can be tested independently.

**Example** (from tasks-template.md):
```markdown
## Phase 3: User Story 1 - User Login (Priority: P1) 🎯 MVP

**Goal**: Users can log in with email/password
**Independent Test**: Can be fully tested by visiting /login, entering credentials, verifying dashboard redirect

### Implementation
- [ ] T012 [P] [US1] Create User model in src/models/user.py
- [ ] T013 [P] [US1] Create Session model in src/models/session.py
- [ ] T014 [US1] Implement AuthService in src/services/auth.py
- [ ] T015 [US1] Implement /login endpoint in src/api/auth.py

**Checkpoint**: At this point, User Story 1 should be fully functional and testable independently
```

**Benefits**:
- Clear "done" criteria for each story
- Enables partial delivery
- Reduces integration risk

---

### 5. Git Branch as Feature Scope Boundary

**Pattern**: Each feature lives in numbered branch with all artifacts in `specs/###-name/`.

**Example**:
```
Branch: 005-user-auth
Directory: specs/005-user-auth/
  ├── spec.md
  ├── plan.md
  ├── research.md
  ├── data-model.md
  ├── contracts/
  ├── tasks.md
  └── checklists/
```

**Benefits**:
- Feature scope is explicit (branch + directory)
- Specs are versioned with code
- Easy to see what was planned vs implemented (diff specs dir vs src dir)
- Multiple features can be developed in parallel

---

### 6. Constitution Versioning Pattern

**Pattern**: Semantic versioning for governance documents.

**Versioning Rules**:
- **MAJOR** (1.0.0 → 2.0.0): Backward incompatible principle changes (e.g., removing TDD requirement)
- **MINOR** (1.2.0 → 1.3.0): New principles added or expanded
- **PATCH** (1.2.3 → 1.2.4): Clarifications, typos, non-semantic refinements

**Example**:
```markdown
**Version**: 2.1.1 | **Ratified**: 2025-06-13 | **Last Amended**: 2025-07-16
```

**Benefits**:
- Clear history of governance changes
- Team knows when principles fundamentally changed
- Can reference constitution version in plans

---

### 7. Sync Impact Report Pattern

**Pattern**: Document what changed and what needs updating when governance evolves.

**Example** (from constitution.md command):
```html
<!-- Sync Impact Report (prepended as HTML comment) -->
<!--
Version change: 2.0.0 → 2.1.0

Modified principles:
- Principle III: "Test-First" → "Test-First (NON-NEGOTIABLE)" (clarification)

Added sections:
- Section V: Observability requirements

Templates requiring updates:
- ✅ plan-template.md (updated)
- ✅ spec-template.md (updated)
- ⚠️  tasks-template.md (pending - needs observability tasks)

Follow-up TODOs:
- TODO(RATIFICATION_DATE): Confirm ratification date with team
-->
```

**Benefits**:
- Transparent change tracking
- Identifies downstream impacts
- Prevents templates from getting out of sync

---

## Integration Opportunities (Preliminary)

### High Priority

1. **Template System for Spec/Plan/Tasks**
   - Port spec-template.md, plan-template.md, tasks-template.md to `.claude/templates/`
   - Create `spec-gathering`, `plan-generator`, `task-breakdown` skills that use these templates
   - Add token replacement logic (find `[.*]`, replace with AI-generated content)
   - **Value**: Structured, consistent specs across all projects

2. **Multi-AI Agent Support**
   - Port AGENT_CONFIG pattern from __init__.py
   - Create `multi-agent-sync` skill that updates multiple agent context files
   - Support Claude, Gemini, Copilot, Cursor, etc.
   - **Value**: Framework works with any AI coding assistant

3. **Constitution-Based Governance**
   - Port constitution template to `.claude/templates/`
   - Create `governance-creator` skill
   - Add constitution validation to architecture-review skill
   - Store constitution in `.claude/context/memory/constitution.md`
   - **Value**: Project principles become enforceable constraints

4. **Branch-Based Feature Workflow**
   - Port create-new-feature.sh logic
   - Create `feature-init` skill that sets up branch + directory structure
   - Integrate with existing planner workflow
   - **Value**: Structured feature development, specs versioned with code

5. **Automation Scripts with JSON Output**
   - Port shell scripts to `.claude/tools/automation/`
   - Ensure all scripts return structured JSON
   - Add cross-platform support (Bash + PowerShell)
   - **Value**: Reduces manual git/file operations, more reliable than AI guessing paths

### Medium Priority

6. **Progressive Disclosure Pattern**
   - Add clarification limits (max 3) to spec-gathering skill
   - Implement informed guessing with reasonable defaults
   - Add options table pattern for clarifications
   - **Value**: Reduces question overload, faster to first implementation

7. **Quality Checklist Generation**
   - Create `checklist-generator` skill
   - Generate checklists for specs, plans, code
   - Add auto-validation against checklists
   - **Value**: Explicit quality gates prevent bad specs from proceeding

8. **User Story-Driven Task Organization**
   - Modify task-breakdown skills to organize by user story priority
   - Add checkpoint pattern for incremental delivery
   - Label tasks with `[US1]`, `[US2]` etc.
   - **Value**: Enables MVP-first, incremental delivery

9. **Handoff-Based Workflow Chaining**
   - Add handoff metadata to skills
   - Generate suggested next steps after skill completion
   - Add auto-execute vs manual confirmation flags
   - **Value**: Discoverable workflows, less memorization

10. **Research-Driven Planning**
    - Add research phase (Phase 0) to planner workflow
    - Generate research.md with decisions, rationale, alternatives
    - Extract NEEDS CLARIFICATION from plans
    - **Value**: Design decisions have documented rationale

### Low Priority

11. **Sync Impact Report Pattern**
    - Add change tracking to governance updates
    - Generate downstream impact reports
    - Identify templates/agents that need updates
    - **Value**: Transparent change management

12. **Technology-Agnostic Success Criteria Validation**
    - Add validation to spec-gathering that flags implementation details in success criteria
    - Suggest user/business-focused rewrites
    - **Value**: Specs become truly tech-agnostic

13. **Script-Based Agent Context Updates**
    - Port update-agent-context.sh logic
    - Auto-detect tech stack from codebase
    - Update CLAUDE.md automatically when dependencies change
    - **Value**: Context files stay current without manual updates

---

## Key Differences: Spec Kit vs Agent-Studio

| Aspect                   | Spec Kit                                     | Agent-Studio                                 |
| ------------------------ | -------------------------------------------- | -------------------------------------------- |
| **Core Paradigm**        | Specification-Driven Development (SDD)       | Multi-Agent Orchestration                    |
| **Primary Artifact**     | Specifications (specs/###-name/)             | Agent definitions (.claude/agents/)          |
| **Workflow Driver**      | Commands (/speckit.specify, /speckit.plan)   | Agents (planner, developer, architect, qa)   |
| **AI Role**              | Executes spec/plan/task workflows            | Specialized agents with different capabilities|
| **Enforcement**          | Constitution checks, quality checklists      | Blocking hooks (routing, safety, validation) |
| **Tool Support**         | Multi-AI (15+ agents), unified commands      | Claude Code-first                            |
| **Automation**           | Bash/PowerShell scripts with JSON output     | Node.js hooks (.cjs)                         |
| **Feature Structure**    | Branch + specs/###-name/ directory           | Task-based (TaskCreate/TaskUpdate)           |
| **Task Organization**    | User story-driven (P1, P2, P3)               | Phase-based (setup, implementation, validation)|
| **Memory System**        | Constitution + research.md                   | learnings.md, decisions.md, issues.md        |
| **Incremental Delivery** | Each user story independently testable       | Task dependencies with blocking               |
| **Quality Gates**        | Checklists, constitution checks              | Pre/Post hooks, validation gates             |

---

## Recommendations for Integration

### What to Port (High Value)

1. **Template System**: Spec/plan/tasks templates provide structure our framework lacks
2. **Multi-AI Support**: Makes framework usable beyond Claude Code
3. **Constitution Concept**: Governance as code is powerful
4. **Branch-Based Features**: Clean separation of feature scope
5. **Automation Scripts**: Reduce manual operations

### What to Adapt (Not Direct Port)

1. **Command Structure**: Our skills are similar but more agent-oriented
2. **Workflow Phases**: Our hooks provide stronger enforcement
3. **Task Organization**: Combine user story approach with our task dependencies

### What to Skip (Not Applicable)

1. **Python CLI**: We use Node.js/JavaScript tooling
2. **Specification-First Philosophy**: Our agent-first approach is fundamentally different
3. **Manual Quality Checklists**: We have automated validation via hooks

---

## Files Modified

**Created**:
- `.claude/context/artifacts/research-reports/spec-kit-exploration-2026-01-28.md` (this file)

**Memory Updates** (to be done by next agent):
- `.claude/context/memory/learnings.md` - Document spec-driven patterns
- `.claude/context/memory/decisions.md` - Decision to integrate specific features

---

## Next Steps

**Phase 2 Tasks** (per original plan):

1. **Task #8**: Analyze current agent-studio codebase for comparison (in progress)
2. **Task #9**: Consolidate exploration findings and create comparison matrix
3. **Task #3**: Document spec-kit integration features and changes
4. **Task #4**: Research best practices for top priority spec-kit features
5. **Task #5**: Security review implementation plan for spec-kit integration
6. **Task #6**: Create atomic implementation tasks based on research findings
7. **Task #7**: Comprehensive QA for spec-kit integration
8. **Task #10**: Session reflection and learning extraction

---

## Glossary

- **SDD**: Specification-Driven Development - methodology where specs are executable source of truth
- **Constitution**: Project governance document with non-negotiable principles
- **Handoff**: Link from one command to the next logical workflow step
- **Progressive Disclosure**: Iterative refinement from vague idea to concrete implementation
- **User Story**: Independently implementable and testable feature increment
- **NEEDS CLARIFICATION**: Marker for ambiguous requirements requiring user input
- **Token Replacement**: Pattern of `[PLACEHOLDER]` → concrete value
- **Quality Checklist**: Validation criteria for specs/plans/code
- **Checkpoint**: Explicit validation point where feature can be tested independently
- **Branch-Based Feature**: Feature scope = git branch + specs/###-name/ directory

---

**Exploration Completed**: 2026-01-28
**Total Duration**: ~45 minutes
**Files Explored**: 30+ files across templates, scripts, docs, CLI source
**Key Finding**: Spec Kit is a **workflow toolkit**, not a **framework**. Integration should focus on **patterns and templates** rather than **architecture**.
