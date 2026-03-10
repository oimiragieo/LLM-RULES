## Skill Quality Gaps: P0 Skills Needing skill-updater (2026-03-10)

- [ ] session-transcript-analyzer: stub/incomplete implementation — agents invoking this will get no real behavior
- [ ] claude-api: bad frontmatter format — model resolution will fail for agents using this skill
- [ ] 5 skills (names not captured in task 6 summary) missing Iron Laws and Memory Protocol sections
      Source: reflection of tasks 6 and 7 (skill gap audit, 2026-03-10)

---

## Gap-Log Spam from Stale Task Detector — Per-Task Cooldown Missing (2026-03-10)

- [ ] stale-task-detector.cjs has no per-task cooldown, fires on every UserPromptSubmit
- [ ] task-lifecycle-42 generated 40+ gap-log entries in one session (from 179min to 691min stale)
- [ ] This crowds out genuine integration/routing gap signals in reflection agent context
- [ ] Fix: add 30-min per-task cooldown OR deduplicate by taskId before appending to gap-log
      Source: session-gap-log.jsonl analysis from 2026-03-10 reflection batch

---

- [ROUTING WARN] Developer task routing warned. Keyword "research" suggests specialist "researcher". Prompt triggered warning instead of block. Date: 2026-03-09T17:42:56.782Z

- [ROUTING WARN] Developer task routing warned. Keyword "game physics" suggests specialist "gamedev-pro". Prompt triggered warning instead of block. Date: 2026-03-09T17:42:56.795Z

- [ROUTING WARN] Developer task routing warned. Keyword "write documentation" suggests specialist "technical-writer". Prompt triggered warning instead of block. Date: 2026-03-09T17:42:56.806Z

- [ROUTING WARN] Developer task routing warned. Keyword "write tests" suggests specialist "qa". Prompt triggered warning instead of block. Date: 2026-03-09T17:42:56.822Z

- [ROUTING WARN] Developer task routing warned. Keyword "data pipeline" suggests specialist "data-engineer". Prompt triggered warning instead of block. Date: 2026-03-09T17:42:56.846Z

- [ROUTING WARN] Developer task routing warned. Keyword "write tests" suggests specialist "qa". Prompt triggered warning instead of block. Date: 2026-03-09T17:42:56.846Z

- [ROUTING WARN] Developer task routing warned. Keyword "write documentation" suggests specialist "technical-writer". Prompt triggered warning instead of block. Date: 2026-03-09T17:42:56.862Z

- [ROUTING WARN] Developer task routing warned. Keyword "update documentation" suggests specialist "technical-writer". Prompt triggered warning instead of block. Date: 2026-03-09T17:52:34.667Z

- [ROUTING WARN] Developer task routing warned. Keyword "refactor the" suggests specialist "code-simplifier". Prompt triggered warning instead of block. Date: 2026-03-09T17:52:34.701Z

- [ROUTING WARN] Developer task routing warned. Keyword "write tests" suggests specialist "qa". Prompt triggered warning instead of block. Date: 2026-03-09T17:52:34.730Z

- [ROUTING WARN] Developer task routing warned. Keyword "design the system" suggests specialist "architect". Prompt triggered warning instead of block. Date: 2026-03-09T17:52:49.522Z

- [ROUTING WARN] Developer task routing warned. Keyword "break down this" suggests specialist "planner". Prompt triggered warning instead of block. Date: 2026-03-09T17:52:49.571Z

- [ROUTING WARN] Developer task routing warned. Keyword "user stories" suggests specialist "pm". Prompt triggered warning instead of block. Date: 2026-03-09T17:52:49.597Z

- [ROUTING WARN] Developer task routing warned. Keyword "review the pr" suggests specialist "code-reviewer". Prompt triggered warning instead of block. Date: 2026-03-09T17:52:49.629Z

- [ROUTING WARN] Developer task routing warned. Keyword "refactor the" suggests specialist "code-simplifier". Prompt triggered warning instead of block. Date: 2026-03-09T17:52:49.658Z

- [ROUTING WARN] Developer task routing warned. Keyword "security audit" suggests specialist "security-architect". Prompt triggered warning instead of block. Date: 2026-03-09T17:52:49.685Z

- [ROUTING WARN] Developer task routing warned. Keyword "deploy to production" suggests specialist "devops". Prompt triggered warning instead of block. Date: 2026-03-09T17:52:49.714Z

- [ROUTING WARN] Developer task routing warned. Keyword "database schema" suggests specialist "database-architect". Prompt triggered warning instead of block. Date: 2026-03-09T17:52:49.740Z

- [ROUTING WARN] Developer task routing warned. Keyword "troubleshoot the" suggests specialist "devops-troubleshooter". Prompt triggered warning instead of block. Date: 2026-03-09T17:52:49.769Z

- [ROUTING WARN] Developer task routing warned. Keyword "production incident" suggests specialist "incident-responder". Prompt triggered warning instead of block. Date: 2026-03-09T17:52:49.802Z

- [ROUTING WARN] Developer task routing warned. Keyword "api documentation" suggests specialist "technical-writer". Prompt triggered warning instead of block. Date: 2026-03-09T17:52:49.827Z

- [ROUTING WARN] Developer task routing warned. Keyword "ux review" suggests specialist "mobile-ux-reviewer". Prompt triggered warning instead of block. Date: 2026-03-09T17:52:49.858Z

- [ROUTING WARN] Developer task routing warned. Keyword "write documentation" suggests specialist "technical-writer". Prompt triggered warning instead of block. Date: 2026-03-09T17:52:49.871Z

- [ROUTING WARN] Developer task routing warned. Keyword "write tests" suggests specialist "qa". Prompt triggered warning instead of block. Date: 2026-03-09T17:52:49.900Z

- [ROUTING WARN] Developer task routing warned. Keyword "simplify the" suggests specialist "code-simplifier". Prompt triggered warning instead of block. Date: 2026-03-09T17:52:49.901Z

- [ROUTING WARN] Developer task routing warned. Keyword "research" suggests specialist "researcher". Prompt triggered warning instead of block. Date: 2026-03-09T17:52:49.923Z

- [ROUTING WARN] Developer task routing warned. Keyword "review code" suggests specialist "code-reviewer". Prompt triggered warning instead of block. Date: 2026-03-09T17:52:49.924Z

- [ROUTING WARN] Developer task routing warned. Keyword "write tests" suggests specialist "qa". Prompt triggered warning instead of block. Date: 2026-03-09T17:52:49.948Z

- [ROUTING WARN] Developer task routing warned. Keyword "reverse engineer" suggests specialist "reverse-engineer". Prompt triggered warning instead of block. Date: 2026-03-09T17:52:49.949Z

- [ROUTING WARN] Developer task routing warned. Keyword "c4 context diagram" suggests specialist "c4-context". Prompt triggered warning instead of block. Date: 2026-03-09T17:52:49.982Z

- [ROUTING WARN] Developer task routing warned. Keyword "set up docker" suggests specialist "devops". Prompt triggered warning instead of block. Date: 2026-03-09T17:52:49.983Z

- [ROUTING WARN] Developer task routing warned. Keyword "c4 container diagram" suggests specialist "c4-container". Prompt triggered warning instead of block. Date: 2026-03-09T17:52:50.005Z

- [ROUTING WARN] Developer task routing warned. Keyword "database schema" suggests specialist "database-architect". Prompt triggered warning instead of block. Date: 2026-03-09T17:52:50.006Z

- [ROUTING WARN] Developer task routing warned. Keyword "c4 component diagram" suggests specialist "c4-component". Prompt triggered warning instead of block. Date: 2026-03-09T17:52:50.034Z

- [ROUTING WARN] Developer task routing warned. Keyword "research" suggests specialist "researcher". Prompt triggered warning instead of block. Date: 2026-03-09T17:52:50.036Z

- [ROUTING WARN] Developer task routing warned. Keyword "write documentation" suggests specialist "technical-writer". Prompt triggered warning instead of block. Date: 2026-03-09T17:52:50.061Z

- [ROUTING WARN] Developer task routing warned. Keyword "c4 code documentation" suggests specialist "c4-code". Prompt triggered warning instead of block. Date: 2026-03-09T17:52:50.061Z

- [ROUTING WARN] Developer task routing warned. Keyword "data pipeline" suggests specialist "data-engineer". Prompt triggered warning instead of block. Date: 2026-03-09T17:52:50.105Z

- [ROUTING WARN] Developer task routing warned. Keyword "train the" suggests specialist "ai-ml-specialist". Prompt triggered warning instead of block. Date: 2026-03-09T17:52:50.135Z

- [ROUTING WARN] Developer task routing warned. Keyword "data pipeline" suggests specialist "data-engineer". Prompt triggered warning instead of block. Date: 2026-03-09T17:52:50.138Z

- [ROUTING WARN] Developer task routing warned. Keyword "write documentation" suggests specialist "technical-writer". Prompt triggered warning instead of block. Date: 2026-03-09T17:52:50.160Z

- [ROUTING WARN] Developer task routing warned. Keyword "smart contract" suggests specialist "web3-blockchain-expert". Prompt triggered warning instead of block. Date: 2026-03-09T17:52:50.177Z

- [ROUTING WARN] Developer task routing warned. Keyword "genomic analysis" suggests specialist "scientific-research-expert". Prompt triggered warning instead of block. Date: 2026-03-09T17:52:50.207Z

- [ROUTING WARN] Developer task routing warned. Keyword "game physics" suggests specialist "gamedev-pro". Prompt triggered warning instead of block. Date: 2026-03-09T17:52:50.238Z

- [ROUTING WARN] Developer task routing warned. Keyword "write tests" suggests specialist "qa". Prompt triggered warning instead of block. Date: 2026-03-09T17:52:50.301Z

- [ROUTING WARN] Developer task routing warned. Keyword "write tests" suggests specialist "qa". Prompt triggered warning instead of block. Date: 2026-03-09T17:52:50.333Z

- [ROUTING WARN] Developer task routing warned. Keyword "update documentation" suggests specialist "technical-writer". Prompt triggered warning instead of block. Date: 2026-03-09T21:04:10.225Z

- [ROUTING WARN] Developer task routing warned. Keyword "refactor the" suggests specialist "code-simplifier". Prompt triggered warning instead of block. Date: 2026-03-09T21:04:10.296Z

- [ROUTING WARN] Developer task routing warned. Keyword "write tests" suggests specialist "qa". Prompt triggered warning instead of block. Date: 2026-03-09T21:04:10.329Z

- [ROUTING WARN] Developer task routing warned. Keyword "update documentation" suggests specialist "technical-writer". Prompt triggered warning instead of block. Date: 2026-03-09T21:06:00.520Z

- [ROUTING WARN] Developer task routing warned. Keyword "refactor the" suggests specialist "code-simplifier". Prompt triggered warning instead of block. Date: 2026-03-09T21:06:00.541Z

- [ROUTING WARN] Developer task routing warned. Keyword "write tests" suggests specialist "qa". Prompt triggered warning instead of block. Date: 2026-03-09T21:06:00.560Z

- [ROUTING WARN] Developer task routing warned. Keyword "design the system" suggests specialist "architect". Prompt triggered warning instead of block. Date: 2026-03-09T21:07:35.544Z

- [ROUTING WARN] Developer task routing warned. Keyword "break down this" suggests specialist "planner". Prompt triggered warning instead of block. Date: 2026-03-09T21:07:35.566Z

- [ROUTING WARN] Developer task routing warned. Keyword "user stories" suggests specialist "pm". Prompt triggered warning instead of block. Date: 2026-03-09T21:07:35.587Z

- [ROUTING WARN] Developer task routing warned. Keyword "review the pr" suggests specialist "code-reviewer". Prompt triggered warning instead of block. Date: 2026-03-09T21:07:35.607Z

- [ROUTING WARN] Developer task routing warned. Keyword "refactor the" suggests specialist "code-simplifier". Prompt triggered warning instead of block. Date: 2026-03-09T21:07:35.628Z

- [ROUTING WARN] Developer task routing warned. Keyword "security audit" suggests specialist "security-architect". Prompt triggered warning instead of block. Date: 2026-03-09T21:07:35.647Z

- [ROUTING WARN] Developer task routing warned. Keyword "deploy to production" suggests specialist "devops". Prompt triggered warning instead of block. Date: 2026-03-09T21:07:35.665Z

- [ROUTING WARN] Developer task routing warned. Keyword "database schema" suggests specialist "database-architect". Prompt triggered warning instead of block. Date: 2026-03-09T21:07:35.684Z

- [ROUTING WARN] Developer task routing warned. Keyword "troubleshoot the" suggests specialist "devops-troubleshooter". Prompt triggered warning instead of block. Date: 2026-03-09T21:07:35.702Z

- [ROUTING WARN] Developer task routing warned. Keyword "production incident" suggests specialist "incident-responder". Prompt triggered warning instead of block. Date: 2026-03-09T21:07:35.719Z

- [ROUTING WARN] Developer task routing warned. Keyword "api documentation" suggests specialist "technical-writer". Prompt triggered warning instead of block. Date: 2026-03-09T21:07:35.737Z

- [ROUTING WARN] Developer task routing warned. Keyword "ux review" suggests specialist "mobile-ux-reviewer". Prompt triggered warning instead of block. Date: 2026-03-09T21:07:35.756Z

- [ROUTING WARN] Developer task routing warned. Keyword "write tests" suggests specialist "qa". Prompt triggered warning instead of block. Date: 2026-03-09T21:07:35.772Z

- [ROUTING WARN] Developer task routing warned. Keyword "research" suggests specialist "researcher". Prompt triggered warning instead of block. Date: 2026-03-09T21:07:35.793Z

- [ROUTING WARN] Developer task routing warned. Keyword "reverse engineer" suggests specialist "reverse-engineer". Prompt triggered warning instead of block. Date: 2026-03-09T21:07:35.811Z

- [ROUTING WARN] Developer task routing warned. Keyword "c4 context diagram" suggests specialist "c4-context". Prompt triggered warning instead of block. Date: 2026-03-09T21:07:35.828Z

- [ROUTING WARN] Developer task routing warned. Keyword "c4 container diagram" suggests specialist "c4-container". Prompt triggered warning instead of block. Date: 2026-03-09T21:07:35.847Z

- [ROUTING WARN] Developer task routing warned. Keyword "c4 component diagram" suggests specialist "c4-component". Prompt triggered warning instead of block. Date: 2026-03-09T21:07:35.866Z

- [ROUTING WARN] Developer task routing warned. Keyword "c4 code documentation" suggests specialist "c4-code". Prompt triggered warning instead of block. Date: 2026-03-09T21:07:35.884Z

- [ROUTING WARN] Developer task routing warned. Keyword "data pipeline" suggests specialist "data-engineer". Prompt triggered warning instead of block. Date: 2026-03-09T21:07:35.902Z

- [ROUTING WARN] Developer task routing warned. Keyword "train the" suggests specialist "ai-ml-specialist". Prompt triggered warning instead of block. Date: 2026-03-09T21:07:35.921Z

- [ROUTING WARN] Developer task routing warned. Keyword "smart contract" suggests specialist "web3-blockchain-expert". Prompt triggered warning instead of block. Date: 2026-03-09T21:07:35.939Z

- [ROUTING WARN] Developer task routing warned. Keyword "genomic analysis" suggests specialist "scientific-research-expert". Prompt triggered warning instead of block. Date: 2026-03-09T21:07:35.959Z

- [ROUTING WARN] Developer task routing warned. Keyword "game physics" suggests specialist "gamedev-pro". Prompt triggered warning instead of block. Date: 2026-03-09T21:07:35.979Z

- [ROUTING WARN] Developer task routing warned. Keyword "write tests" suggests specialist "qa". Prompt triggered warning instead of block. Date: 2026-03-09T21:07:36.003Z

- [ROUTING WARN] Developer task routing warned. Keyword "write tests" suggests specialist "qa". Prompt triggered warning instead of block. Date: 2026-03-09T21:07:36.019Z

- [ROUTING WARN] Developer task routing warned. Keyword "write documentation" suggests specialist "technical-writer". Prompt triggered warning instead of block. Date: 2026-03-09T21:07:36.427Z

- [ROUTING WARN] Developer task routing warned. Keyword "simplify the" suggests specialist "code-simplifier". Prompt triggered warning instead of block. Date: 2026-03-09T21:07:36.445Z

- [ROUTING WARN] Developer task routing warned. Keyword "review code" suggests specialist "code-reviewer". Prompt triggered warning instead of block. Date: 2026-03-09T21:07:36.466Z

- [ROUTING WARN] Developer task routing warned. Keyword "write tests" suggests specialist "qa". Prompt triggered warning instead of block. Date: 2026-03-09T21:07:36.484Z

- [ROUTING WARN] Developer task routing warned. Keyword "set up docker" suggests specialist "devops". Prompt triggered warning instead of block. Date: 2026-03-09T21:07:36.504Z

- [ROUTING WARN] Developer task routing warned. Keyword "database schema" suggests specialist "database-architect". Prompt triggered warning instead of block. Date: 2026-03-09T21:07:36.524Z

- [ROUTING WARN] Developer task routing warned. Keyword "research" suggests specialist "researcher". Prompt triggered warning instead of block. Date: 2026-03-09T21:07:36.542Z

- [ROUTING WARN] Developer task routing warned. Keyword "write documentation" suggests specialist "technical-writer". Prompt triggered warning instead of block. Date: 2026-03-09T21:07:36.562Z

- [ROUTING WARN] Developer task routing warned. Keyword "data pipeline" suggests specialist "data-engineer". Prompt triggered warning instead of block. Date: 2026-03-09T21:07:36.610Z

- [ROUTING WARN] Developer task routing warned. Keyword "write documentation" suggests specialist "technical-writer". Prompt triggered warning instead of block. Date: 2026-03-09T21:07:36.630Z

- [ROUTING WARN] Developer task routing warned. Keyword "update documentation" suggests specialist "technical-writer". Prompt triggered warning instead of block. Date: 2026-03-09T21:23:42.032Z

- [ROUTING WARN] Developer task routing warned. Keyword "refactor the" suggests specialist "code-simplifier". Prompt triggered warning instead of block. Date: 2026-03-09T21:23:42.059Z

- [ROUTING WARN] Developer task routing warned. Keyword "write tests" suggests specialist "qa". Prompt triggered warning instead of block. Date: 2026-03-09T21:23:42.129Z

- [ROUTING WARN] Developer task routing warned. Keyword "update documentation" suggests specialist "technical-writer". Prompt triggered warning instead of block. Date: 2026-03-09T21:31:34.631Z

- [ROUTING WARN] Developer task routing warned. Keyword "refactor the" suggests specialist "code-simplifier". Prompt triggered warning instead of block. Date: 2026-03-09T21:31:34.651Z

- [ROUTING WARN] Developer task routing warned. Keyword "write tests" suggests specialist "qa". Prompt triggered warning instead of block. Date: 2026-03-09T21:31:34.729Z

- [ROUTING WARN] Developer task routing warned. Keyword "update documentation" suggests specialist "technical-writer". Prompt triggered warning instead of block. Date: 2026-03-09T21:40:21.379Z

- [ROUTING WARN] Developer task routing warned. Keyword "refactor the" suggests specialist "code-simplifier". Prompt triggered warning instead of block. Date: 2026-03-09T21:40:21.393Z

- [ROUTING WARN] Developer task routing warned. Keyword "write tests" suggests specialist "qa". Prompt triggered warning instead of block. Date: 2026-03-09T21:40:21.406Z

- [ROUTING WARN] Developer task routing warned. Keyword "update documentation" suggests specialist "technical-writer". Prompt triggered warning instead of block. Date: 2026-03-09T21:45:07.979Z

- [ROUTING WARN] Developer task routing warned. Keyword "refactor the" suggests specialist "code-simplifier". Prompt triggered warning instead of block. Date: 2026-03-09T21:45:07.997Z

- [ROUTING WARN] Developer task routing warned. Keyword "write tests" suggests specialist "qa". Prompt triggered warning instead of block. Date: 2026-03-09T21:45:08.018Z

- [ROUTING WARN] Developer task routing warned. Keyword "update documentation" suggests specialist "technical-writer". Prompt triggered warning instead of block. Date: 2026-03-10T09:22:39.487Z

- [ROUTING WARN] Developer task routing warned. Keyword "refactor the" suggests specialist "code-simplifier". Prompt triggered warning instead of block. Date: 2026-03-10T09:22:39.503Z

- [ROUTING WARN] Developer task routing warned. Keyword "write tests" suggests specialist "qa". Prompt triggered warning instead of block. Date: 2026-03-10T09:22:39.520Z

- [ROUTING WARN] Developer task routing warned. Keyword "design the system" suggests specialist "architect". Prompt triggered warning instead of block. Date: 2026-03-10T09:24:28.556Z

- [ROUTING WARN] Developer task routing warned. Keyword "break down this" suggests specialist "planner". Prompt triggered warning instead of block. Date: 2026-03-10T09:24:28.570Z

- [ROUTING WARN] Developer task routing warned. Keyword "user stories" suggests specialist "pm". Prompt triggered warning instead of block. Date: 2026-03-10T09:24:28.588Z

- [ROUTING WARN] Developer task routing warned. Keyword "review the pr" suggests specialist "code-reviewer". Prompt triggered warning instead of block. Date: 2026-03-10T09:24:28.603Z

- [ROUTING WARN] Developer task routing warned. Keyword "refactor the" suggests specialist "code-simplifier". Prompt triggered warning instead of block. Date: 2026-03-10T09:24:28.619Z

- [ROUTING WARN] Developer task routing warned. Keyword "security audit" suggests specialist "security-architect". Prompt triggered warning instead of block. Date: 2026-03-10T09:24:28.638Z

- [ROUTING WARN] Developer task routing warned. Keyword "deploy to production" suggests specialist "devops". Prompt triggered warning instead of block. Date: 2026-03-10T09:24:28.656Z

- [ROUTING WARN] Developer task routing warned. Keyword "database schema" suggests specialist "database-architect". Prompt triggered warning instead of block. Date: 2026-03-10T09:24:28.673Z

- [ROUTING WARN] Developer task routing warned. Keyword "troubleshoot the" suggests specialist "devops-troubleshooter". Prompt triggered warning instead of block. Date: 2026-03-10T09:24:28.692Z

- [ROUTING WARN] Developer task routing warned. Keyword "production incident" suggests specialist "incident-responder". Prompt triggered warning instead of block. Date: 2026-03-10T09:24:28.707Z

- [ROUTING WARN] Developer task routing warned. Keyword "api documentation" suggests specialist "technical-writer". Prompt triggered warning instead of block. Date: 2026-03-10T09:24:28.722Z

- [ROUTING WARN] Developer task routing warned. Keyword "ux review" suggests specialist "mobile-ux-reviewer". Prompt triggered warning instead of block. Date: 2026-03-10T09:24:28.737Z

- [ROUTING WARN] Developer task routing warned. Keyword "write tests" suggests specialist "qa". Prompt triggered warning instead of block. Date: 2026-03-10T09:24:28.753Z

- [ROUTING WARN] Developer task routing warned. Keyword "research" suggests specialist "researcher". Prompt triggered warning instead of block. Date: 2026-03-10T09:24:28.767Z

- [ROUTING WARN] Developer task routing warned. Keyword "reverse engineer" suggests specialist "reverse-engineer". Prompt triggered warning instead of block. Date: 2026-03-10T09:24:28.782Z

- [ROUTING WARN] Developer task routing warned. Keyword "c4 context diagram" suggests specialist "c4-context". Prompt triggered warning instead of block. Date: 2026-03-10T09:24:28.800Z

- [ROUTING WARN] Developer task routing warned. Keyword "c4 container diagram" suggests specialist "c4-container". Prompt triggered warning instead of block. Date: 2026-03-10T09:24:28.814Z

- [ROUTING WARN] Developer task routing warned. Keyword "c4 component diagram" suggests specialist "c4-component". Prompt triggered warning instead of block. Date: 2026-03-10T09:24:28.829Z

- [ROUTING WARN] Developer task routing warned. Keyword "c4 code documentation" suggests specialist "c4-code". Prompt triggered warning instead of block. Date: 2026-03-10T09:24:28.843Z

- [ROUTING WARN] Developer task routing warned. Keyword "data pipeline" suggests specialist "data-engineer". Prompt triggered warning instead of block. Date: 2026-03-10T09:24:28.857Z

- [ROUTING WARN] Developer task routing warned. Keyword "train the" suggests specialist "ai-ml-specialist". Prompt triggered warning instead of block. Date: 2026-03-10T09:24:28.871Z

- [ROUTING WARN] Developer task routing warned. Keyword "smart contract" suggests specialist "web3-blockchain-expert". Prompt triggered warning instead of block. Date: 2026-03-10T09:24:28.885Z

- [ROUTING WARN] Developer task routing warned. Keyword "genomic analysis" suggests specialist "scientific-research-expert". Prompt triggered warning instead of block. Date: 2026-03-10T09:24:28.899Z

- [ROUTING WARN] Developer task routing warned. Keyword "game physics" suggests specialist "gamedev-pro". Prompt triggered warning instead of block. Date: 2026-03-10T09:24:28.913Z

- [ROUTING WARN] Developer task routing warned. Keyword "write tests" suggests specialist "qa". Prompt triggered warning instead of block. Date: 2026-03-10T09:24:28.930Z

- [ROUTING WARN] Developer task routing warned. Keyword "write tests" suggests specialist "qa". Prompt triggered warning instead of block. Date: 2026-03-10T09:24:28.944Z

- [ROUTING WARN] Developer task routing warned. Keyword "write documentation" suggests specialist "technical-writer". Prompt triggered warning instead of block. Date: 2026-03-10T09:24:29.312Z

- [ROUTING WARN] Developer task routing warned. Keyword "simplify the" suggests specialist "code-simplifier". Prompt triggered warning instead of block. Date: 2026-03-10T09:24:29.327Z

- [ROUTING WARN] Developer task routing warned. Keyword "review code" suggests specialist "code-reviewer". Prompt triggered warning instead of block. Date: 2026-03-10T09:24:29.342Z

- [ROUTING WARN] Developer task routing warned. Keyword "write tests" suggests specialist "qa". Prompt triggered warning instead of block. Date: 2026-03-10T09:24:29.358Z

- [ROUTING WARN] Developer task routing warned. Keyword "set up docker" suggests specialist "devops". Prompt triggered warning instead of block. Date: 2026-03-10T09:24:29.374Z

- [ROUTING WARN] Developer task routing warned. Keyword "database schema" suggests specialist "database-architect". Prompt triggered warning instead of block. Date: 2026-03-10T09:24:29.389Z

- [ROUTING WARN] Developer task routing warned. Keyword "research" suggests specialist "researcher". Prompt triggered warning instead of block. Date: 2026-03-10T09:24:29.404Z

- [ROUTING WARN] Developer task routing warned. Keyword "write documentation" suggests specialist "technical-writer". Prompt triggered warning instead of block. Date: 2026-03-10T09:24:29.418Z

- [ROUTING WARN] Developer task routing warned. Keyword "data pipeline" suggests specialist "data-engineer". Prompt triggered warning instead of block. Date: 2026-03-10T09:24:29.447Z

- [ROUTING WARN] Developer task routing warned. Keyword "write documentation" suggests specialist "technical-writer". Prompt triggered warning instead of block. Date: 2026-03-10T09:24:29.461Z

---

## [OPEN] P1: TaskStateMachine has no persistence — restart = total state loss (2026-03-10)

**Source:** Gemini 2.5 + Codex 0.106.0 multi-LLM review
**Component:** `.claude/lib/a2a/task-state-machine.cjs`
**Risk:** Any A2A server restart or OOM crash wipes all in-flight task state. Clients polling get 404.
**Fix:** Persist task state to existing SQLite `queue-operations.cjs` on every state transition.
**Report:** `.claude/context/reports/backend/multi-llm-review-2026-03-10.md`

## [OPEN] P1: Memory consolidation lacks atomicity — rows can be double-processed (2026-03-10)

**Source:** Codex 0.106.0 multi-LLM review
**Component:** consolidate-agent.cjs (reads file_memory + episodic_memory)
**Risk:** Multiple consolidators or re-runs process overlapping rows without transaction. Rows marked `consolidated_at` before derived insight is committed — duplicate insights, inconsistent state.
**Fix:** Wrap read + mark-consolidated + insert-insight in single SQLite `BEGIN IMMEDIATE` transaction.
**Report:** `.claude/context/reports/backend/multi-llm-review-2026-03-10.md`

## [OPEN] P2: Worker thread has no hard timeout — malformed files can hang ingestion (2026-03-10)

**Source:** Codex 0.106.0
**Component:** `.claude/lib/memory/ingestion/file-converter.cjs`
**Risk:** Parser hangs, decompression bombs, or CPU spikes on bad files can stall the entire ingestion pipeline indefinitely. `token-gate.cjs` handles token limits but not pre-parse size limits.
**Fix:** Add `setTimeout(() => worker.terminate(), TIMEOUT)` in host + pre-dispatch file size check.

## [OPEN] P2: Zombie tasks in `working` state bypass TTL eviction (2026-03-10)

**Source:** Gemini 2.5
**Component:** `.claude/lib/a2a/task-state-machine.cjs`
**Risk:** TTL eviction only fires on terminal state transitions. Tasks stuck in `working` never reach terminal → accumulate indefinitely → OOM in high-volume scenarios.
**Fix:** Add `setInterval` watchdog that scans Map for `working` tasks older than 30min and transitions them to `failed`.

## [OPEN] P3: debounceMap in file-watcher never cleared — slow memory leak (2026-03-10)

**Source:** Own analysis during multi-LLM review
**Component:** `.claude/lib/memory/ingestion/file-watcher.cjs`
**Risk:** `debounceMap` keyed by file path, never purged. Long-running watchers on active codebases accumulate unique paths indefinitely.
**Fix:** Periodic cleanup: purge entries older than 10× DEBOUNCE_MS, or cap map size.
