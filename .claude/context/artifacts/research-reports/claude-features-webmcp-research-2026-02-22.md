<!-- Agent: researcher | Task: #27 | Session: 2026-02-22 -->

# Research Report: WebMCP + Claude New Features (Memory, Worktrees, Healthcare)

**Date**: 2026-02-22
**Researcher**: researcher agent
**Task**: #27 (EPIC: Router audit + webmcp skill + Claude features research)
**Sources Consulted**: 9

---

## Executive Summary

Four Claude/web capabilities were investigated. (1) WebMCP is a W3C Web Machine Learning Working Group proposal for a JavaScript API enabling web applications to expose their functionality as tools to AI agents via client-side JavaScript -- a browser-side standard proposal, not an installable package, with no production browser support yet. (2) The Anthropic Memory Tool (beta June 2025, beta header: context-management-2025-06-27) provides file-based CRUD memory in a /memories directory plus Context Editing that reduces token consumption by 84% on long-running workflows -- directly applicable to agent-studio context overflow issues documented 2026-02-09. (3) Claude Code built-in git worktree support was announced February 2026; enables parallel agent isolation via --worktree CLI flag or isolation: worktree frontmatter field -- immediately usable in agent-studio multi-agent pipelines. (4) Anthropic launched Claude for Healthcare at JPM26 (January 2026) with FHIR development and prior authorization Agent Skills, ICD-10/PubMed integrations, and HIPAA-ready enterprise infrastructure -- a product offering, not a community agent.

---

## Research Methodology

### Search Queries Executed

| # | Query | Source | Results Found |
|---|-------|--------|---------------|
| 1 | WebFetch: github.com/webmachinelearning/webmcp | GitHub | Full overview |
| 2 | WebFetch: raw README.md from webmachinelearning/webmcp | GitHub raw | Detailed README |
| 3 | WebSearch: Anthropic Claude agent memory types in-context external storage 2025 | Web | 10 results |
| 4 | WebSearch: Claude Code worktrees git isolation parallel agents 2025 2026 | Web | 10 results |
| 5 | WebSearch: Anthropic Claude medical healthcare AI agent FHIR 2025 2026 | Web | 10 results |
| 6 | WebFetch: devcenter.upsun.com git worktrees parallel AI coding agents | Web | Technical guide |

### Sources Consulted

| Source | URL | Type | Credibility |
|--------|-----|------|-------------|
| WebMCP GitHub Repo | https://github.com/webmachinelearning/webmcp | Official W3C proposal | High |
| WebMCP README | raw.githubusercontent.com/webmachinelearning/webmcp/main/README.md | Official spec | High |
| Anthropic Memory Docs | https://docs.claude.com/en/docs/agents-and-tools/tool-use/memory-tool | Official docs | High |
| Skywork Claude Memory | https://skywork.ai/blog/claude-memory-a-deep-dive/ | Technical blog | Medium |
| Anthropic Context Management | https://www.anthropic.com/news/context-management | Official blog | High |
| Upsun Git Worktrees | https://devcenter.upsun.com/posts/git-worktrees-for-parallel-ai-coding-agents/ | Technical guide | High |
| Boris Cherny (Anthropic) on Threads | https://www.threads.com/@boris_cherny/post/DVAAnexgRUj/ | Anthropic engineer | High |
| Anthropic Healthcare Launch | https://www.anthropic.com/news/healthcare-life-sciences | Official announcement | High |
| TechCrunch Claude Healthcare | https://techcrunch.com/2026/01/12/anthropic-announces-claude-for-healthcare | Press | High |
---

## Detailed Findings

### 1. WebMCP (webmachinelearning/webmcp)

#### What It Is

WebMCP is a **W3C Web Machine Learning Working Group proposal** for a JavaScript API that enables web applications to expose their functionality as tools accessible to AI agents and assistive technologies. It is distinct from Anthropic MCP -- it is a **browser-side standard proposal**, not an installable npm package.

Key characteristics:
- Proposal repository: https://github.com/webmachinelearning/webmcp
- Status: Proposal/draft (not yet a W3C standard; not shipped in any browser)
- Author: W3C WebML Working Group (not Anthropic)
- Concept: Web pages act as MCP servers running client-side JavaScript
- Integration: Works alongside backend MCP servers (not a replacement)

#### What It Exposes / MCP Tools Provided

WebMCP does not provide pre-built tools. It is a **framework specification** that lets web developers define their own tools. Each tool consists of:
- A JavaScript function with natural language descriptions
- A structured input schema (JSON Schema compatible)
- Parameters with types and descriptions

Example tools from the proposal:
- filterTemplates(description: string) -- filter design templates by natural language
- editDesign(instructions: string) -- modify designs based on directives
- getDresses(size, color) -- product discovery with filtering
- showDresses(product_ids) -- update UI to display selected products
- getTryRunStatuses() -- retrieve CI/test failure data
- addSuggestedEdit(filename, patch) -- code review integration
- orderPrints(...) -- commerce workflow

#### How It Differs from Standard MCP

| Aspect | Standard MCP | WebMCP |
|--------|-------------|--------|
| Location | Separate server process | Browser client-side JS |
| Context | Isolated from UI | Shared with user interface |
| Installation | npm/pip package | Browser API (proposed only) |
| Current status | Shipped, production | Draft proposal |
| Code reuse | Requires separate server | Reuses existing frontend code |

#### Installation / Invocation

WebMCP is a **proposal document** -- there is no npm package to install, no browser API to call yet. It exists as a GitHub proposal with spec documents (proposal.md with API shape and code examples) and reference implementations for demonstration.

Developers interested today would need to implement the pattern manually (register tools, expose them to agents via a browser-compatible mechanism).

#### Integration with agent-studio

WebMCP is relevant as a **future integration target** and **skill opportunity**:

1. **Skill concept**: Create a webmcp-browser-tools skill that teaches agents how to interact with web applications exposing WebMCP tools
2. **Browser agent**: When the standard ships in browsers, agent-studio browser-automation agent could use WebMCP discovery to auto-enumerate a page available tools
3. **Current applicability**: LOW -- it is a proposal; no production browser support exists
4. **Watch signal**: Monitor W3C WebML Working Group for browser implementation milestones
---

### 2. Claude Agent Memory (Anthropic Native Feature)

#### What It Is

Anthropic released the **Memory Tool** in beta (June 2025, beta header: context-management-2025-06-27) as part of a broader Context Management feature set. It is a **client-side tool** that enables Claude to persist information across conversations using a file-based approach.

The Memory Tool:
- Creates a /memories directory (location is application-controlled)
- Claude makes tool calls to perform CRUD operations on files in that directory
- Application code executes the actual file operations locally
- Developers have full control over storage backend (local files, S3, database, etc.)

Additionally, **Context Editing** was released alongside the Memory Tool:
- Automatically clears stale tool results from the context window when approaching token limits
- Preserves conversation flow while extending agent run time
- In a 100-turn web search evaluation, reduced token consumption by **84%** while enabling workflows that would otherwise fail from context exhaustion
- Configured via a token threshold; operates transparently to the agent

#### Memory Tool Operations

The Memory Tool enables Claude to:
1. **Create** new memory entries in /memories directory
2. **Read** existing memory files to recall past context
3. **Update** existing entries when information changes
4. **Delete** stale or outdated memory files

#### How It Differs from agent-studio Memory System

| Aspect | Anthropic Memory Tool | agent-studio STM/MTM/LTM |
|--------|----------------------|--------------------------|
| Scope | Per-conversation persistence | Cross-session, hierarchical tiers |
| Implementation | API-level tool call | File-based markdown + LanceDB vectors |
| Context management | Context editing (auto-clear stale) | Memory rotation (learnings.md -> archive) |
| Structure | Flat files in /memories | STM (current) -> MTM (last 10) -> LTM (permanent) |
| Semantic search | Not built-in | Hybrid search (BM25 + embeddings) |
| Pattern detection | Not built-in | gotchas.json, patterns.json via MemoryRecord |
| Discoverability | File listing only | Semantic + entity graph queries |

#### Integration Opportunity with agent-studio

The Memory Tool context editing feature is highly relevant:

1. **Adopt context-management-2025-06-27 beta header**: Enables context editing, reducing token consumption by 84% on long-running agent tasks -- directly solves the context overflow problem documented in memory (2026-02-09 session crash from 200k overflow, 52 min of work lost)

2. **Memory Tool as STM bridge**: The Memory Tool could act as the agent-side STM layer, with agent-studio existing STM/MTM/LTM handling promotion/compression. Agents write to /memories via the Memory Tool; a background process syncs high-value entries to the agent-studio memory hierarchy.

3. **Complementary, not replacement**: agent-studio existing system is significantly richer (semantic search, hierarchical tiers, entity graphs, MemoryRecord pattern classification). The Memory Tool adds Anthropic-managed persistence with no additional infrastructure.

4. **Implementation path**: Spawn a developer to add the context-management-2025-06-27 beta header to API configuration and test context editing on long-running review pipelines.
---

### 3. Claude Code Worktree Support

#### What It Is

Anthropic announced **built-in git worktree support for Claude Code** in February 2026 (announcement by Boris Cherny, Anthropic engineer). This ships across all Claude Code surfaces: CLI, Desktop app, IDE extensions, web, and mobile app.

Git worktrees create linked working directories that share the same .git database -- each worktree has its own files and branch while reusing the repo object database, refs, and configuration. This enables true parallel agent isolation.

#### CLI Usage



#### Agent Frontmatter Configuration

Add isolation: worktree to any agent frontmatter:



With isolation: worktree in frontmatter, each spawned subagent gets its own worktree that is automatically cleaned up when the subagent finishes without changes.

#### Key Properties

- **Parallel isolation**: Multiple Claude sessions on different parts of a project, each in its own branch
- **Context preservation**: Each agent maintains its conversation history without branch-switching confusion
- **Safe experimentation**: Risky refactors tested in isolated worktrees, discarded if unsuccessful
- **Conflict avoidance**: Separate workspaces prevent agents from modifying unrelated files
- **Auto-cleanup**: Empty worktrees (no changes) are automatically removed when subagent finishes

#### Known Limitations / Sharp Edges

- **Port conflicts**: Multiple dev servers default to identical ports (3000, 5432, 8080)
- **Dependency duplication**: Each worktree needs separate npm install, multiplying disk usage
- **VS Code**: Added native worktree support in July 2025; Claude Code /ide command may not recognize worktrees
- **Shared databases**: Parallel agents risk race conditions on shared local databases
- **Disk explosion**: Reported 9.82GB consumed in 20 minutes with a 2GB codebase (5 worktrees)
- **Windows path normalization**: path.relative() on Windows returns backslashes -- must normalize per SE-01 in sharp-edges.md

#### Multi-Agent Benefits for agent-studio

1. **Parallel code agents**: When spawning developer agents for separate features (Wave 1 + Wave 2 of enterprise pipeline), each gets an isolated worktree -- eliminates file conflicts between parallel agents
2. **Subagent frontmatter**: Add isolation: worktree to developer, qa, and code-reviewer agent definitions where parallel execution is expected
3. **Review workflows**: Code-reviewer, QA, and security-architect can review simultaneously in isolated worktrees without corrupting each other state
4. **Router integration**: master-orchestrator can spawn agents with --worktree flag; each works on its own branch; orchestrator merges results
5. **Configuration**: No settings.json changes needed -- enabled via CLI flag or agent frontmatter

#### Setup for agent-studio (Windows)

