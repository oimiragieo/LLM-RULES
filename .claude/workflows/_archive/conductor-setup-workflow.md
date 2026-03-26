# Conductor Setup Workflow

Orchestrates the full project setup using Context-Driven Development methodology. Guides users through product definition, tech stack selection, workflow customization, and initial track generation.

## When to Use

- Setting up a new project with CDD methodology
- Initializing Conductor context for existing projects
- Onboarding a codebase to the multi-agent framework

## Prerequisites

- Git repository initialized (or will be created)
- User available for interactive Q&A

## Workflow Phases

### Phase 1: Project Discovery

**Agent**: Router (spawns Explore agent)

**Purpose**: Determine if project is greenfield or brownfield, analyze existing code if present.

```javascript
Task({
  task_id: 'task-1',
  subagent_type: 'developer',
  description: 'Analyze project for setup',
  prompt: `You are the EXPLORER agent.

## Instructions
1. Invoke skills: Skill({ skill: 'project-onboarding' })

## Task
Analyze the current directory to determine project state.

## Checks
1. Is there a .git directory? Run: git status --porcelain
2. Are there package manifests? (package.json, requirements.txt, etc.)
3. Are there source directories with code?

## Classification
- BROWNFIELD: Any of the above exist
- GREENFIELD: Directory empty or only has README.md

## For Brownfield
- Check for .gitignore/.claudeignore
- List key files respecting ignores
- Infer tech stack from manifests
- Identify frameworks from dependencies

## Output
Report: { classification, tech_stack_detected, frameworks, key_files }
`,
});
```

### Phase 2: Product Definition

**Agent**: Planner (with interactive-requirements-gathering skill)

**Purpose**: Create product.md and product-guidelines.md through interactive Q&A.

```javascript
Task({
  task_id: 'task-2',
  subagent_type: 'developer',
  description: 'Define product vision',
  prompt: `You are the PLANNER agent.

## Instructions
1. Invoke skills: Skill({ skill: 'interactive-requirements-gathering' }), Skill({ skill: 'context-driven-development' })

## Task
Guide user through product definition:

1. **Product Vision** (3-5 questions max)
   - What are you building?
   - Who are the target users?
   - What problem does it solve?
   - What are the core features?

2. **Product Guidelines** (3-5 questions max)
   - What tone/voice should the product use?
   - Any specific terminology?
   - Error message style?

## Output
Create:
- .claude/context/product.md
- .claude/context/product-guidelines.md

Use A/B/C/D/E question format from interactive-requirements-gathering skill.
`,
});
```

### Phase 3: Tech Stack Configuration

**Agent**: Planner or Architect

**Purpose**: Create tech-stack.md, select code style guides.

```javascript
Task({
  task_id: 'task-3',
  subagent_type: 'developer',
  description: 'Configure tech stack',
  prompt: `You are the PLANNER agent. Read .claude/agents/core/planner.md

## Instructions
1. Invoke skills: Skill({ skill: 'interactive-requirements-gathering' })

## Task
Configure the technology stack.

## For Brownfield
- Present DETECTED stack for confirmation
- Ask: "Is this correct? A) Yes B) No, let me specify"

## For Greenfield
- Ask about languages, frameworks, databases
- Use interactive-requirements-gathering format

## Code Style Guides
Based on tech stack, recommend style guides from:
.claude/templates/code-styles/
- python.md, typescript.md, javascript.md, go.md
- dart.md, csharp.md, html-css.md, general.md

## Output
Create:
- .claude/context/tech-stack.md
- Copy relevant style guides to project if desired
`,
});
```

### Phase 4: Workflow Setup

**Agent**: Planner

**Purpose**: Create workflow.md with development practices.

```javascript
Task({
  task_id: 'task-4',
  subagent_type: 'developer',
  description: 'Configure development workflow',
  prompt: `You are the PLANNER agent. Read .claude/agents/core/planner.md

## Instructions
1. Invoke skills: Skill({ skill: 'workflow-patterns' })

## Task
Configure the development workflow.

## Default Workflow Options
1. TDD with >80% coverage (Recommended)
2. Code review requirements
3. Git commit conventions
4. Git notes for task summaries

## Questions (if user wants to customize)
1. Coverage target (default 80%)
2. Commit frequency (per-task or per-phase)
3. Task summary location (git notes or commit message)

## Output
Create: .claude/context/workflow.md

Use workflow-patterns skill as template.
`,
});
```

### Phase 5: Initial Track Generation

**Agent**: Planner

**Purpose**: Create the first track (spec + plan).

```javascript
Task({
  task_id: 'task-5',
  subagent_type: 'developer',
  description: 'Generate initial track',
  prompt: `You are the PLANNER agent. Read .claude/agents/core/planner.md

## Instructions
1. Invoke skills: Skill({ skill: 'track-management' })

## Task
Create the first development track.

## Steps
2. Ask: "What should the first track accomplish?"
3. Generate track ID: shortname_YYYYMMDD
4. Create spec.md with requirements
5. Create plan.md with phased tasks
6. Create tracks.md registry
7. Add metadata.json

## Output
- .claude/context/tracks.md (registry)
- .claude/context/tracks/<track-id>/spec.md
- .claude/context/tracks/<track-id>/plan.md
- .claude/context/tracks/<track-id>/metadata.json
- .claude/context/tracks/<track-id>/index.md
`,
});
```

### Phase 6: Finalization

**Agent**: Developer or Router

**Purpose**: Create index, commit files, announce completion.

```javascript
Task({
  task_id: 'task-6',
  subagent_type: 'developer',
  description: 'Finalize setup',
  prompt: `You are the DEVELOPER agent. Read .claude/agents/core/developer.md

## Instructions
1. Invoke skills: Skill({ skill: 'git-expert' })

## Task
Finalize the Conductor setup.

## Tasks
1. Create .claude/context/index.md linking all artifacts
2. Verify all files created successfully
3. Git add and commit: "conductor(setup): Initialize project context"

## Output
Report summary of what was created and next steps.
`,
});
```

## Context Artifacts Created

| Artifact                | Purpose                   |
| ----------------------- | ------------------------- |
| `product.md`            | Product vision and goals  |
| `product-guidelines.md` | Communication standards   |
| `tech-stack.md`         | Technology preferences    |
| `workflow.md`           | Development practices     |
| `tracks.md`             | Work unit registry        |
| `tracks/<id>/spec.md`   | Track requirements        |
| `tracks/<id>/plan.md`   | Track implementation plan |
| `index.md`              | Context navigation        |

## State Persistence

For resumable setup, save state after each phase:

```json
{
  "last_successful_step": "phase_2_product",
  "classification": "brownfield",
  "detected_stack": ["typescript", "react", "postgresql"]
}
```

Save to: `.claude/context/setup_state.json`

On resume, check state file and skip completed phases.

## Completion Announcement

```
## Conductor Setup Complete

**Project Type**: [Greenfield/Brownfield]
**Tech Stack**: [Languages, Frameworks]

**Artifacts Created**:
- Product definition: .claude/context/product.md
- Guidelines: .claude/context/product-guidelines.md
- Tech stack: .claude/context/tech-stack.md
- Workflow: .claude/context/workflow.md
- Initial track: .claude/context/tracks/<track-id>/

**Next Steps**:
1. Review generated artifacts
2. Run `/implement` to start the first track
3. Use `/status` to check progress
```

## Related Skills

- `interactive-requirements-gathering` - Question framework
- `context-driven-development` - CDD methodology
- `track-management` - Track lifecycle
- `project-onboarding` - Brownfield analysis
- `workflow-patterns` - TDD workflow

## Memory Protocol

Record setup decisions in:

- `.claude/context/memory/decisions.md` - Architecture Decision Records
- `.claude/context/memory/learnings.md` - Project-specific patterns
