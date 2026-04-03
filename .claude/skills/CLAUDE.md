# Skills

330+ reusable capabilities invoked by agents via `Skill({ skill: 'name' })`. Each skill is a directory containing a `SKILL.md` file with frontmatter (description, category, triggers) and detailed instructions.

## How Skills Work

1. Agent identifies a need (e.g., "run TDD cycle")
2. Agent calls `Skill({ skill: 'tdd' })`
3. The skill's `SKILL.md` is loaded into the agent's context
4. Agent follows the skill's instructions to complete the task
5. Output is validated against the skill's schema (`.claude/schemas/skill-{name}-output.schema.json`)

## Skill Categories

### Framework Management (Creators & Updaters)
`skill-creator`, `agent-creator`, `hook-creator`, `workflow-creator`, `template-creator`, `schema-creator`, `command-creator`, `tool-creator`, `rule-creator` — Create new framework artifacts.
`skill-updater`, `agent-updater`, `workflow-updater`, `eval-harness-updater` — Update existing artifacts.
`artifact-lifecycle`, `artifact-integrator`, `recommend-evolution`, `creation-feasibility-gate` — Lifecycle management.

### Development & Testing
`tdd`, `debugging`, `smart-debug`, `test-generator`, `qa-workflow`, `de-sloppify`, `code-analyzer`, `code-quality-expert`, `code-style-validator`, `property-based-testing`, `comprehensive-unit-testing-with-pytest` — Development workflow.

### Code Search & Navigation
`ripgrep`, `code-semantic-search`, `code-structural-search`, `code-graph-context`, `lsp-navigator`, `tool-search`, `codebase-exploration`, `codebase-cleaner`, `stale-module-pruner` — Code intelligence.

### Security & Compliance
`security-architect`, `auth-security-expert`, `insecure-defaults`, `differential-review`, `commit-security-scan`, `content-security-scan`, `fix-review`, `variant-analysis`, `static-analysis`, `semgrep-rule-creator`, `building-secure-contracts`, `medusa-security`, `gemini-cli-security`, `security-scanning`, `yara-authoring` — Security analysis.

### Architecture & Planning
`architecture-review`, `brainstorming`, `plan-generator`, `plan-quality-verifier`, `complexity-assessment`, `implementation-readiness`, `spec-gathering`, `spec-critique`, `spec-init`, `spec-to-code-compliance`, `prd-generator`, `sparc-methodology` — Design and planning.

### Documentation & Content
`doc-generator`, `readme`, `writing-skills`, `doc-coauthoring`, `diagram-generator`, `enhance-prompt`, `marketing-content`, `style-analyzer`, `voice-clone-generator` — Content creation.

### DevOps & Infrastructure
`docker-compose`, `terraform-infra`, `kubernetes-flux`, `cloud-run`, `gcloud-cli`, `aws-cloud-ops`, `azure-devops`, `gitops-workflow`, `helm-chart-scaffolding`, `k8s-manifest-generator`, `k8s-security-policies`, `vercel-deploy`, `cloudflare-workers`, `ci-cd-implementation-rule`, `containerization-rules` — Infrastructure.

### Git & Version Control
`git-expert`, `github-ops`, `github-mcp`, `commit-validator`, `smart-revert`, `finishing-a-development-branch`, `using-git-worktrees`, `track-management` — Version control.

### Research & External
`deep-research`, `research-synthesis`, `arxiv-mcp`, `arxiv-monitor`, `exa-monitor`, `reddit-researcher`, `forum-monitor`, `wikipedia` — External research.

### Telegram & Channels
`setup-telegram` — Verify bot config (token, owner, allowlist, MCP). Read-only, no Bash.
`enable-telegram` — Start the channel daemon. Auto-detects voice pipeline if TTS keys are present.
`disable-telegram` — Stop the channel daemon via developer agent.
`setup-telegram-voice` — Verify voice pipeline config (Whisper, ElevenLabs/OpenAI TTS keys).
`check-telegram-voice` — Check voice pipeline status and dependencies.

### Multi-Agent Orchestration
`team-orchestration`, `subagent-driven-development`, `dispatching-parallel-agents`, `swarm-coordination`, `consensus-voting`, `llm-council`, `ralph-loop`, `wave-executor`, `task-delegation`, `task-management-protocol` — Agent coordination.

### Context & Memory
`context-compressor`, `context-degradation`, `context-driven-development`, `context-attribution`, `memory-search`, `memory-audit`, `memory-quality-auditor`, `memory-forensics`, `perpetual-memory`, `auto-recall`, `token-saver-adaptive-ratio`, `token-saver-context-compression`, `token-saver-memory-dedup` — Context management.

### Session & Recovery
`session-handoff`, `session-log-analyzer`, `session-transcript-analyzer`, `recovery`, `compaction-detector`, `heartbeat`, `scheduled-tasks`, `cron-decision`, `cron-runner` — Session lifecycle.

### Framework Health
`proactive-audit`, `ecosystem-integrity-scanner`, `gap-detection`, `system-health-check`, `behavioral-loop-detection`, `error-recovery-escalation`, `troubleshooting-regression`, `pipeline-evaluator`, `pipeline-reflection-ux`, `sharp-edges`, `instinct-learning`, `insight-extraction`, `outcome-reflection` — Quality assurance.

### External Tool Integration
`chrome-browser`, `browser-automation`, `webapp-testing`, `figma`, `design-systems`, `slack-notifications`, `slack-expert`, `jira-pm`, `linear-pm`, `atlassian-integration`, `google-workspace`, `sentry-monitoring`, `huggingface`, `imagen-generation`, `pptx`, `xlsx`, `transcription`, `tts-generation`, `markitdown-converter`, `text-to-sql` — Tool wrappers.

### Language/Framework Experts
`react-expert`, `nextjs-expert`, `angular-expert`, `vue-expert`, `svelte-expert`, `astro-expert`, `qwik-expert`, `solidjs-expert`, `htmx-expert`, `python-backend-expert`, `nodejs-expert`, `go-expert`, `rust-expert`, `java-expert`, `elixir-expert`, `php-expert`, `flutter-expert`, `ios-expert`, `android-expert`, `gamedev-expert`, `typescript-expert`, `cpp`, `powershell-expert`, `modern-python`, and many more — Technology expertise.

### LLM Integration
`omega-claude-cli`, `omega-codex-cli`, `omega-cursor-cli`, `omega-gemini-cli`, `claude-api`, `prompt-engineer`, `model-benchmark`, `dynamic-api-integration`, `webmcp-browser-tools`, `mcp-builder`, `mcp-catalog` — LLM tools.
