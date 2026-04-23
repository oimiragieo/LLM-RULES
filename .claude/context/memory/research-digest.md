# Research Digest

<!-- Auto-maintained by arxiv-monitor + exa-monitor heartbeat -->

---

## Digest — 2026-04-20 (morning)

### arXiv: Top Papers (keywords: multi-agent systems, autonomous agents, LLM agents)

1. **Mesh Memory Protocol: Semantic Infrastructure for Multi-Agent LLM Systems**
   Authors: Hongwei Xu | ID: 2604.19540
   Protocol enabling LLM agents to share and combine cognitive state in real time across sessions — directly relevant to agent-studio memory architecture.

2. **Refute-or-Promote: Adversarial Stage-Gated Multi-Agent Review**
   Authors: Abhinav Agarwal | ID: 2604.19049
   Stage-gated adversarial review pattern for filtering false positives in LLM-assisted defect discovery — applicable to code-reviewer / proactive-audit workflows.

3. **Towards Optimal Agentic Architectures for Offensive Security Tasks**
   Authors: Isaac David, Arthur Gervais | ID: 2604.18718
   Empirical study of 600 runs across 5 agent topology types; finds that more agents doesn't always win — cost/performance tradeoff data.

4. **Explicit Trait Inference for Multi-Agent Coordination**
   Authors: Suhaib Abdurahman, Etsuko Ishii | ID: 2604.19278
   Agents infer partner warmth/competence dimensions to improve coordination — relevant to orchestrator-specialist routing.

5. **MASS-RAG: Multi-Agent Synthesis RAG**
   Authors: Xingchen Xiao, Heyan Huang | ID: 2604.18509
   Structures RAG evidence processing into specialized summarization/extraction/synthesis agents — patterns for researcher agent.

6. **YAIFS: Fog Simulator via Model Context Protocol**
   Authors: Isaac Lera, Carlos Guerrero | ID: 2604.19181
   Unified MCP API enabling heterogeneous agents to observe/control distributed system execution.

7. **Cyber Defense Benchmark: Agentic Threat Hunting for LLMs**
   Authors: Alankrit Chona, Igor Kozlov | ID: 2604.19533
   Benchmark for LLM agents performing threat hunting on Windows event logs — security-architect relevance.

8. **PlayCoder: Multi-Agent GUI Code Generation & Repair**
   Authors: Zhiyuan Peng, Wei Tao | ID: 2604.19742
   Multi-agent evaluate-and-repair loop for GUI code — TDD/developer agent pattern confirmation.

### Exa Monitor: Industry News (topics: Claude AI updates, agent frameworks)

- **Claude Managed Agents** (public beta, Apr 8 2026): Anthropic handles infra; teams define tasks, tools, guardrails. Eliminates 3–6 months of agent infra work. [docs](https://platform.claude.com/docs/en/managed-agents/overview)
- **Claude Opus 4.7** now GA: improved software engineering, vision (higher res images). **Sonnet 4.6** gains 1M context window in beta.
- **Claude Code** shipped 30+ releases in 5 weeks: Remote Control, Dispatch, Channels, Computer Use, Auto Mode, AutoDream; larger MCP result persistence.
- **Claude Cowork** GA on macOS/Windows: OpenTelemetry support, role-based access controls for Enterprise.
- **Microsoft Agent Framework**: AutoGen + Semantic Kernel merge; direct successor from same teams.
- **Archon v2.1**: open-source harness builder for AI coding agents, 14K GitHub stars.
- **MCP ecosystem**: new servers for database access, cloud infra, browser automation shipping through April.

---

## Digest — 2026-04-20 (7am heartbeat)

### arXiv Monitor (topics: multi-agent systems, LLM reasoning, autonomous agents, tool use)

1. **SWE-chat: Coding Agent Interactions From Real Users in the Wild** | 2604.20779
   Authors: Joachim Baumann, Vishakh Padmakumar
   Real-world coding agent interaction traces — only 44% of agent-generated code survives into user commits. Stark quality benchmark directly relevant to agent-studio's code-reviewer and verification-before-completion gates.

2. **AVISE: Framework for Evaluating the Security of AI Systems** | 2604.20833
   Authors: Mikko Lempinen, Joni Kemppainen
   Modular automated jailbreak and vulnerability evaluation framework — relevant to security-architect agent and proactive-audit skill.

3. **LLMs as External Memory, Verification, and Planning Layer (Ontology Construction)** | 2604.20795
   Authors: Pavel Salovskii, Iuliia Gorshkova
   LLMs + knowledge graphs for persistent, verifiable, semantically grounded reasoning — validates agent-studio's hybrid STM/MTM/LTM + knowledge-graph skill design.

4. **Diagnosing CFG Interpretation in LLMs** | 2604.20811
   Authors: Hanqi Li, Lu Chen
   LLMs maintain surface syntax but fail structural semantics under complexity — caution flag for grammar-based routing rules in routing-guard.

### Exa Monitor (topics: Claude AI updates, agent frameworks, LLM tooling)

- **Claude Opus 4.7 GA**: stronger software engineering, vision, instruction following; new `/effort` and `/ultrareview` controls; task budgets. Same $5/$25 per MTok as Opus 4.6.
- **Advisor Strategy** (Anthropic): pair Sonnet for routine tasks with Opus for complex decisions — up to 11% cost reduction. Aligns with agent-studio haiku/sonnet/opus model selection per complexity.
- **Monitor Tool**: reduces background-polling token consumption, eliminates continuous polling overhead.
- **Claude Managed Agents public beta**: fully managed cloud (file I/O, shell, browser, code execution). Evaluate for agent-studio hosted deployment path.
- **`ant` CLI**: Anthropic command-line API client with Claude Code integration and YAML-versioned API resources.
- **ORCH** (research): deterministic multi-agent orchestrator — independent LLM analysis + merge-agent selection, no training. Achieves 100% actionable recommendation rate vs 1.7% single-agent on incident response.
- **MAS-Orchestra** (research): frames multi-agent orchestration as function-calling RL with holistic system-level reward — relevant to master-orchestrator evolution.

### Key Signals for agent-studio

- 44% code survival rate (SWE-chat): confirms value of verification-before-completion + code-reviewer gates.
- Managed Agents removes infra burden: evaluate delegating long-running agentic tasks to Anthropic's hosted harness.
- Advisor Strategy cost savings: already implemented in agent-studio via model complexity routing; confirm haiku is used for heartbeat/trivial tasks.
- ORCH deterministic voting pattern: candidate for high-stakes routing decisions where single-LLM confidence is low.

