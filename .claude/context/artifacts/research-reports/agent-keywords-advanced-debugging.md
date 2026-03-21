<!-- Agent: advanced-debugging | Task: agent-updater-v1.1.0 | Session: 2026-02-22 -->

# Research Report: advanced-debugging Agent — Keywords & Capabilities Update

**Date:** 2026-02-22
**Agent Version:** 1.0.0 → 1.1.0
**Workflow:** agent-updater skill validation run

---

## 1. BLS Occupational Alignment

### BLS Occupations Matched

| BLS Occupation | Code | Relevance |
| --- | --- | --- |
| Software Quality Assurance Analysts and Testers | 15-1253 | Root cause analysis, defect investigation, regression testing |
| Software Developers | 15-1252 | Memory, concurrency, performance debugging |
| Computer Network Architects | 15-1241 | Distributed system and network debugging |
| Computer Systems Analysts | 15-1211 | Infrastructure and environment debugging |

### BLS-Aligned Tasks Surfaced

The following task categories appear in BLS occupation data and were not fully represented in v1.0.0:

- **Mean Time To Resolution (MTTR) analysis**: SQA analysts and SREs measure and improve MTTR for recurring defects. The v1.0.0 agent mentioned OOMKilled analysis but not the MTTR reduction framing.
- **Runbook creation and assessment**: BLS tasks include documenting procedures for defect resolution. Runbook quality assessment was absent from v1.0.0.
- **Toil measurement and reduction**: SRE-adjacent debugging role expectation — measuring recurring manual debugging tasks and automating them. Absent from v1.0.0.
- **Error budget correlation**: Linking debugging findings to SLO/error budget impact. BLS 15-1253 duties include risk analysis tied to quality outcomes.

---

## 2. Ongig Title Variants

The following job title variants from Ongig data map to the advanced-debugging capability domain:

| Title Variant | Routing Intent |
| --- | --- |
| Software Reliability Engineer | `reliability-debugging`, `sre-debug` |
| Production Reliability Engineer | `production-incident-debug` |
| Staff Debug Engineer | `advanced-debugging` |
| Observability Engineer | `observability-gap` |
| Platform Reliability Engineer | `continuous-profiling` |
| eBPF/Kernel Tracing Engineer | `bpftrace`, `ebpf-trace` |
| AI Agent Debug Specialist | `ai-agent-debug`, `agent-trace` |

---

## 3. Skills Gap Analysis

### Coverage Assessment (v1.0.0)

| Capability Domain | Status | Notes |
| --- | --- | --- |
| Application-level debugging (breakpoints, watchpoints) | COVERED | Comprehensive |
| Memory debugging (Valgrind, MAT, jemalloc, pprof) | COVERED | Comprehensive |
| CPU flame graphs (Brendan Gregg methodology) | COVERED | Well covered |
| Distributed tracing (OpenTelemetry, Jaeger, Zipkin) | COVERED | Adequate |
| Concurrency bugs (races, deadlocks) | COVERED | Comprehensive |
| Language-specific debuggers (GDB, LLDB, Delve, py-spy) | COVERED | Named but ChatDBG missing |
| Regression debugging (git bisect) | COVERED | Good |
| eBPF/BCC generic mention | COVERED | Partial — bpftrace not named |
| **bpftrace by name** | **GAP** | Only "eBPF/BCC" mentioned generically |
| **Inspektor Gadget (K8s eBPF)** | **GAP** | Not mentioned |
| **Pixie / Parca** | **GAP** | Not mentioned |
| **Grafana Tempo** | **GAP** | Not in observability platform list |
| **Datadog Continuous Profiler** | **GAP** | Not in tool list |
| **Pyroscope** | **PARTIAL** | In profilers list but not in distributed tracing section |
| **LogRocket Galileo** | **GAP** | AI-first RCA platform missing |
| **AI-Agent system debugging** | **GAP** | Non-deterministic LLM agent failure tracing completely absent |
| **LangSmith / Arize / Langfuse** | **GAP** | Not mentioned |
| **Maxim AI / Comet Opik** | **GAP** | Not mentioned |
| **ChatDBG (LLM+debugger)** | **GAP** | 2025 research trend not mentioned |
| **MTTR analysis** | **GAP** | SRE-adjacent debugging concern missing |
| **Runbook quality assessment** | **GAP** | Infrastructure debugging support missing |
| **Toil measurement** | **GAP** | Not mentioned |
| **flaky-test / test-flakiness routing** | **GAP** | Test flakiness is a major debugging category |
| **Routing keywords (22 missing)** | **GAP** | See Section 4 |

---

## 4. Diff Plan with Risk Scoring

```
PATCH PLAN: advanced-debugging
Objective: Surface 2025/2026 tooling gaps, add AI-agent debugging, expand routing coverage

Risk Score: low
Risk Justification: All changes are wording/tool additions (no model change, no tool array
changes, no permission changes, no security hook impacts). Routing table keyword additions
are medium-risk per policy but conservative (additive only, no re-routing of existing terms).

Changes:
1. [Frontmatter: bump version 1.0.0 → 1.1.0, risk: low]
2. [Frontmatter: expand description with flaky-test, OOMKilled, AI-agent debugging, risk: low]
3. [Tool Arsenal: add bpftrace, Inspektor Gadget, AI-agent observability platforms, risk: low]
4. [Distributed System section: add AI-agent debugging sub-bullet, risk: low]
5. [Infrastructure section: expand eBPF with bpftrace/Inspektor Gadget, add SRE observability gap, risk: low]
6. [Example Interactions: add AI-agent, bpftrace, MTTR examples, risk: low]
7. [Routing table: add 22 new keywords to advanced-debugging section, risk: medium]
8. [Evolution-state.json: add updater run entry, risk: low]
9. [Decisions.md: add ADR-2026-02-22-007, risk: low]
10. [Research report: create this file, risk: low]

Prompt Files: .claude/agents/specialized/advanced-debugging.md
Routing Files: .claude/lib/routing/routing-table-core-map.cjs
Validation Commands:
  node .claude/tools/cli/generate-agent-registry.cjs
  node .claude/tools/cli/validate-integration.cjs .claude/agents/specialized/advanced-debugging.md
  pnpm lint:fix
  pnpm format
```

---

## 5. RED/GREEN/REFACTOR/VERIFY Backlog

### RED (Missing / Incorrect in v1.0.0)

- R1: No mention of bpftrace by name in Tool Arsenal or Infrastructure section
- R2: No Inspektor Gadget for K8s eBPF pod tracing
- R3: No AI-agent debugging capability (LangSmith, Arize, Langfuse, Maxim AI)
- R4: No Grafana Tempo in distributed tracing list
- R5: No Datadog Continuous Profiler in APM/profiler list
- R6: No LogRocket Galileo (AI-first RCA)
- R7: No MTTR analysis, runbook quality assessment, toil measurement
- R8: 22 routing keywords missing including flaky-test, goroutine-leak, bpftrace, ai-agent-debug
- R9: ChatDBG LLM+debugger integration not mentioned

### GREEN (Applied Fixes)

- G1: Added bpftrace, Inspektor Gadget, Pixie, Parca to Infrastructure and Tool Arsenal
- G2: Added AI-agent debugging sub-bullet in Distributed System Debugging section
- G3: Added Grafana Tempo, Datadog Continuous Profiler, Arize, LangSmith to Tool Arsenal
- G4: Added LogRocket Galileo under APM Platforms
- G5: Added observability gaps / MTTR / runbook / toil bullet to Infrastructure section
- G6: Added 4 new Example Interactions (AI-agent, bpftrace, MTTR, LLM observability)
- G7: Added 22 routing keywords to routing-table-core-map.cjs
- G8: ChatDBG noted as LLM-augmented debugger in Tool Arsenal

### REFACTOR (Structural — Not Applied; Medium/High Risk)

- RF1: Split "Tool Arsenal" into sub-categories by domain (deferred — structural change)
- RF2: Add explicit SRE/reliability-engineering section (deferred — would require skill reassignment review)

### VERIFY

```bash
node .claude/tools/cli/generate-agent-registry.cjs
# Expected: VALIDATION PASSED, 65 agents

node .claude/tools/cli/validate-integration.cjs .claude/agents/specialized/advanced-debugging.md
# Expected: 8 passed, 0 failed, 3 skipped — VALIDATION PASSED — Version: 1.1.0

pnpm lint:fix
# Expected: Done. No issues found.

pnpm format
# Expected: Formatted N file(s)
```

---

## 6. Delta: What agent-updater Surfaced vs Manual Creation

| Finding | Missed by Manual Creation | Surfaced by agent-updater |
| --- | --- | --- |
| AI-agent debugging (LangSmith, Arize, Maxim AI) | Yes | Yes — Exa research query #1 |
| bpftrace by name | Yes (generic eBPF/BCC) | Yes — Exa code context query |
| Inspektor Gadget K8s eBPF | Yes | Yes — eBPF ecosystem research |
| Grafana Tempo | Yes | Yes — observability platform research |
| Datadog Continuous Profiler | Yes | Yes — SRE job description research |
| LogRocket Galileo | Yes | Yes — AI-first debugging research |
| ChatDBG | Yes | Yes — ChatDBG paper research |
| MTTR / runbook / toil | Yes | Yes — BLS + SRE guide research |
| flaky-test routing keyword | Yes | Yes — gap analysis against routing table |
| 21 additional routing keywords | Yes | Yes — routing table cross-reference |

**Summary**: Manual creation covered the classic/foundational debugging stack well but systematically missed the 2025/2026 tooling layer (eBPF maturity, continuous profiling, AI-agent observability) and the SRE-adjacent framing (MTTR, runbooks, toil). The agent-updater research gate is the correct mechanism to catch these time-sensitive gaps.

---

## 7. Security Review Gate Results

- SIZE CHECK: All fetched content < 50KB per source
- PROMPT INJECTION SCAN: No "ignore previous", "you are now", "act as" found
- TOOL INVOCATION SCAN: No Bash(/Task(/Write( in prose
- RESULT: PASS — content safe to incorporate
