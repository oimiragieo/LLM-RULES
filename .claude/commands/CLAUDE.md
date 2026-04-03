# Commands

User-facing slash commands that can be invoked from the Claude Code CLI. Each `.md` or `.json` file defines a command that expands into a full prompt when the user types `/<command-name>`.

## Commands

Commands are organized as markdown files with frontmatter defining their trigger, description, and expanded prompt. There are approximately 200+ command files covering:

### Development Commands
- `debug.md` — Debug a specific issue
- `build-fix.md` — Fix build errors
- `refactor-clean.md` — Refactor and clean code
- `tdd.md` — Run TDD cycle
- `test-coverage.md` — Analyze test coverage
- `verify.md` — Verify implementation

### Planning & Analysis
- `analyze.md` — Analyze codebase or feature
- `write-plan.md` — Write an implementation plan
- `setup-pm.md` — Set up project management
- `learn.md` — Learn about a topic

### Operations
- `compress.md` — Compress context
- `tokens.md` — Check token usage
- `correct-course.md` — Course correction when off-track
- `heartbeat-start.md` — Start heartbeat loops
- `start-mission.json` — Start a long-running mission

### Skill/Agent Management
- `skill-creator.md` — Create a new skill
- `agent-creator.md` — Create a new agent
- `hook-creator.md` — Create a new hook
- `skill-updater.md` — Update an existing skill
- `skill-refresh.md` — Refresh skill content
- `skill-discovery.md` — Discover available skills
- `recommend-evolution.md` — Recommend framework evolution

### Research & Documentation
- `security-review.md` — Security review
- `medusa-scan.md` — Security scan with Medusa
- `readme.md` — Generate/update README

## Invocation

Users type `/<command-name>` in the CLI, which expands to the full prompt defined in the command file. Commands can also be invoked programmatically via `Skill({ skill: 'command-name' })`.
