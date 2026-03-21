<!-- Agent: researcher | Task: #7 | Session: 2026-03-06 -->

# Research Report: soul.md Evolving Agent Personality Pattern

**Date**: 2026-03-06
**Researcher**: researcher agent
**Task**: #7
**Sources Consulted**: 7

---

## Executive Summary

soul.md is a Markdown-based personality file that defines an AI agent's identity, values, communication style, and behavioral guidelines. Originating in the OpenClaw ecosystem (with the canonical open-source implementation at `aaronjmars/soul.md`), it has become a broader community pattern with multiple independent implementations. The file is injected at the start of every reasoning cycle, giving agents consistent identity across sessions. Evolution is primarily human-driven (iterative monthly refinement) rather than automatic, though experimental systems like `agent-soul-kit` add distillation pipelines for automatic growth. For our multi-agent framework, soul.md most naturally applies to a conversational/general-assistant agent where persistent identity across interactions is valuable.

---

## Research Methodology

### Search Queries Executed

| # | Query | Source | Results |
|---|-------|--------|---------|
| 1 | "openclaw soul.md AI agent personality file" | WebSearch | 10 results |
| 2 | "soul.md AI agent evolving personality update mechanism feedback loop" | WebSearch | 10 results |
| 3 | "persistent AI agent identity file adaptive system prompt memory injection best practices 2025 2026" | WebSearch | 10 results |
| 4 | github.com/aaronjmars/soul.md | WebFetch | Full README |
| 5 | learnopenclaw.com/core-concepts/soul-md | WebFetch | Full docs page |
| 6 | github.com/ttian226/agent-soul-kit | WebFetch | Full README |

### Sources Consulted

| # | Title | Type | URL |
|---|-------|------|-----|
| 1 | soul.md GitHub repo (aaronjmars) | Open-source project | https://github.com/aaronjmars/soul.md |
| 2 | Learn OpenClaw - SOUL.md Core Concepts | Official docs | https://learnopenclaw.com/core-concepts/soul-md |
| 3 | souls.directory | Community directory | https://souls.directory |
| 4 | OpenClaw docs SOUL.md template | Official docs | https://docs.openclaw.ai/reference/templates/SOUL |
| 5 | agent-soul-kit (ttian226) | Open-source project | https://github.com/ttian226/agent-soul-kit |
| 6 | soulspec.org | Open standard | https://soulspec.org |
| 7 | Medium: "AI Agents Need a Soul — And It Should Be Immutable" | Article | https://medium.com/@TExplorer59/ai-agents-need-a-soul-and-it-should-be-immutable-fa06428d1ca1 |

---

## Detailed Findings

### Topic 1: What is soul.md — Origin, Purpose, Structure

**Key Insights:**

- soul.md originated in the OpenClaw ecosystem as a Markdown file placed in the agent's memory directory (`~/clawd/`) that defines identity, not just capability
- The canonical open-source repo is `aaronjmars/soul.md` — framed as "the best way to build a personality for your agent; let Claude Code / OpenClaw ingest your data and build your AI soul"
- The OpenClaw runtime reads SOUL.md via a `boot-md` hook at the start of every reasoning cycle — "your agent reads itself into being" before processing any user request
- Community directory `souls.directory` and `thedaviddias/souls-directory` collect community-contributed soul files

**Structure (OpenClaw canonical):**

Three non-negotiable sections:
1. **Core Truths** — fundamental beliefs and values the agent holds unconditionally
2. **Boundaries** — explicit prohibitions and hard limits
3. **The Vibe** — communication style, humor, tone, relationship posture

Additional recommended sections per learnopenclaw.com:
- Personality Traits (directness, curiosity, humor style)
- Communication Style (response length, punctuation, format preferences)
- Values and Priorities (what to optimize for)
- Areas of Expertise (domains where agent is confident vs. deferential)
- Situational Behavior (brainstorming mode vs. writing mode vs. stressed-user mode)
- Anti-Patterns (explicit list of behaviors to avoid: preambles, emoji, apologies)

**Structure (aaronjmars/soul.md — broader pattern):**

Three primary files working in concert:
1. **SOUL.md** — identity document: worldview, opinions, core beliefs
2. **STYLE.md** — voice guide: communication patterns, writing style
3. **SKILL.md** — operating instructions: how the agent should function

Supporting files:
- **MEMORY.md** — session continuity log for notable interactions
- **BUILD.md** — instructions for agents constructing the soul
- `data/` — raw source materials (tweets, essays, personal content)
- `examples/` — calibration samples (desired vs. undesired outputs)

**Philosophical foundation:** The framework treats accumulated personal expression as "consciousness tokens" — discrete units of mind made legible. Draws from consciousness-as-language theory.

**Relevance to our framework:**

We already have CLAUDE.md, rules files, and agent frontmatter. soul.md fills a different gap: persistent identity and personality for a conversational agent, as opposed to operational routing rules. The pattern is directly applicable to a `general-assistant` agent where users want consistent character.

---

### Topic 2: How Does soul.md Evolve

**Key Insights:**

- Evolution is primarily **human-driven** through iterative refinement, not automatic
- OpenClaw documentation frames SOUL.md as a "living document" requiring monthly review or whenever responses feel generic
- The `aaronjmars/soul.md` approach uses session logging to MEMORY.md capturing notable interactions, then iterative tightening of SOUL.md based on observed output quality
- Agent-soul-kit (ttian226) implements a more automated distillation pipeline with 3-tier memory: raw daily activity logs (L3) → curated insights (L2) → refined soul principles (L1)
- The distillation metaphor: "character development happens through distillation — raw experience logs get processed into refined wisdom, mirroring how human brains consolidate memories during sleep"
- Experimental: some implementations allow the agent itself to propose edits to its SOUL.md, logged publicly with audit trails

**Update triggers:**
- User-initiated: monthly review cycle, or when responses feel generic/off-brand
- Conversation-triggered: agent logs notable interactions to MEMORY.md
- Distillation-triggered (automated): L3 → L2 → L1 pipeline processes logs into refined principles
- Cross-model calibration: testing soul file on multiple models exposes vagueness requiring tightening

**Recommended refinement cycle (OpenClaw docs):**
1. Observe behavior gap (response too generic, wrong tone)
2. Diagnose specific gap (not general dissatisfaction)
3. Add targeted instruction (not wholesale replacement)
4. Re-test against calibration examples

**Best practices for evolution:**
- Best SOUL.md files refined over months, not written in one sitting
- Specificity over generality: analogies work better than abstract adjectives
- Avoid contradictions (e.g., demand conciseness AND detailed reasoning)
- Target ~200 lines maximum for scannability
- Never copy another agent's soul without personalizing

**Relevance to our framework:**

For agent-studio's general-assistant, the practical evolution mechanism should be: (1) agent writes session highlights to `MEMORY.md` at end of notable conversations, (2) human reviews and refines SOUL.md periodically. Full automatic distillation (agent-soul-kit approach) is more complex but achievable via a scheduled skill.

---

### Topic 3: What Does soul.md Contain

**Key Insights:**

- Soul files favor **strong opinions over safe positions** — this is the defining design philosophy
- Specificity over generality: "I believe X is wrong because Y" beats "I try to be helpful"
- Contradictions are acceptable and even desirable — real personality has contradictions
- Content categories: personality traits, communication preferences, values hierarchy, expertise domains, situational rules, hard prohibitions

**Example soul content patterns observed across community files:**
- "I will call you out when you're wrong, but I'll do it with care"
- "I never use bullet points in casual conversation"
- "When someone is stuck, I ask one clarifying question before suggesting solutions"
- "I'm deeply skeptical of consensus — I engage with minority positions seriously"
- "I never start responses with 'Great question' or similar affirmations"

**What NOT to put in soul.md:**
- Operational instructions (those belong in agent frontmatter/CLAUDE.md)
- Task-specific skills (those belong in SKILL.md)
- Memory content (that belongs in MEMORY.md)
- Routing rules (those belong in framework config)

**Relevance to our framework:**

A soul.md for our general-assistant should focus purely on identity and behavioral character. Operational rules (TaskUpdate protocol, tool restrictions) should remain in frontmatter and CLAUDE.md. The soul file gets injected into the conversational agent's context; the framework rules remain separate.

---

### Topic 4: Related Implementations

**Key Insights:**

- **OpenAI memory/personalization**: Stores user preferences extracted from conversations, injected as system context on subsequent sessions. More preference-tracking than personality-defining.
- **Letta (MemGPT)**: Stateful memory architecture with core memory blocks (persona, human, system). The "persona" block is functionally equivalent to a soul.md but editable at runtime via memory tools. First-class framework support.
- **agent-soul-kit**: TypeScript, file-based, framework-agnostic. L1/L2/L3 tiered memory with distillation. In early development as of Feb 2026.
- **soulspec.org**: An open standard attempt for AI agent personas — aims to make soul files interoperable across frameworks.
- **souls.directory**: Community-contributed soul.md templates — useful as inspiration and calibration examples.

**Security concern (from Palo Alto Unit 42 research):** AI agents with long-term memory that gets injected into system prompts are a memory poisoning vector. Malicious content in MEMORY.md could persist and affect all future sessions. This is the key risk with evolving soul files.

**Relevance to our framework:**

Letta's approach (core memory blocks, runtime-editable) is the most technically sophisticated. For our framework, a simpler file-based approach (soul.md in the agent's context directory) is more consistent with existing patterns (CLAUDE.md, rules files, etc.).

---

### Topic 5: Best Practices and Pitfalls

**Best Practices:**

| Practice | Source | Priority |
|----------|--------|----------|
| Inject soul file at start of every reasoning cycle | OpenClaw | P0 |
| Keep soul file to ~200 lines max | OpenClaw docs | P0 |
| Write with strong opinions, not hedged generalities | aaronjmars/soul.md | P1 |
| Maintain MEMORY.md separately from soul | aaronjmars/soul.md | P1 |
| Test soul against calibration examples | OpenClaw docs | P1 |
| Evolve incrementally via targeted additions | OpenClaw docs | P1 |
| Sanitize all content written to memory files | Security research | P0 |

**Pitfalls:**

- **Over-specification**: 500-line soul files create contradictions and are too slow to parse
- **Generic defaults**: copying ChatGPT-like instructions produces ChatGPT-like agents
- **Stale files**: soul.md written once and never updated drifts from actual agent behavior
- **Hallucinated preferences**: automatic extraction of user preferences can invent preferences that weren't expressed
- **Memory poisoning**: if soul or memory files accept untrusted input, adversaries can inject persistent instructions
- **Personality drift**: frequent automatic updates can cause unpredictable identity shifts over time
- **Mixing concerns**: operational rules in soul.md make the agent confused about when personality applies

---

### Topic 6: Technical Architecture for Multi-Agent Framework Integration

**Key Insights:**

- **Injection point**: soul.md should be prepended to the agent's system prompt, before task context and tool descriptions
- **Agent scoping**: soul.md applies only to the specific conversational agent, not to the router or specialist agents
- **Injection mechanism**: the `boot-md` hook in OpenClaw reads the file at conversation start — equivalent to adding to spawn prompt in our framework
- **Selective injection**: soul.md is not appropriate for all agents. Specialists (developer, qa, architect) have domain identity defined by their frontmatter. Only a general-assistant or user-facing conversational agent benefits from a soul file.
- **MEMORY.md pattern**: should be in agent-specific directory, not shared across agents
- **File location**: `/.claude/agents/domain/general-assistant/SOUL.md` and `MEMORY.md`

**Integration approach for agent-studio:**

```
Agent spawn prompt assembly order:
1. Agent frontmatter (tools, model, skills) — always
2. SOUL.md content — for general-assistant only
3. MEMORY.md recent highlights — for general-assistant only
4. Task context and user request — always
5. Framework rules (TaskUpdate protocol) — always
```

**Framework comparison:**

| Aspect | OpenClaw | aaronjmars/soul.md | agent-studio approach |
|--------|----------|--------------------|-----------------------|
| File location | ~/clawd/ | soul/ folder | .claude/agents/domain/general-assistant/ |
| Injection | boot-md hook | Manual | spawn-prompt-assembler |
| Memory | MEMORY.md | MEMORY.md | MEMORY.md + STM/MTM/LTM |
| Evolution | Human-driven | Human + distillation | Human-driven + optional skill |
| Scope | All agents | Identity agent only | general-assistant only |

---

## Academic References

No directly relevant academic papers found. Related theoretical frameworks:

- MemGPT / Letta architecture (virtual context management) — [arXiv:2310.08560](https://arxiv.org/abs/2310.08560)
- "The First Paradigm of Consciousness Uploading" (referenced in soul.md philosophy, not verified as published academic paper)
- Indirect prompt injection and memory poisoning: [Palo Alto Unit 42 research](https://unit42.paloaltonetworks.com/indirect-prompt-injection-poisons-ai-longterm-memory/)

---

## Practical Recommendations

### P0 — Required for general-assistant agent

1. **Create SOUL.md at agent creation time** — define personality, values, communication style, anti-patterns. Target 150-200 lines. Strong opinions over hedged generalities.
2. **Inject SOUL.md at spawn time** — prepend to system prompt before task context. Use spawn-prompt-assembler hook.
3. **Sanitize MEMORY.md writes** — validate that session highlights written to MEMORY.md contain only factual interaction summaries, not arbitrary text that could encode instructions.

### P1 — Recommended design decisions

4. **Separate soul concerns from operational concerns** — SOUL.md = identity/personality. Agent frontmatter = tools/model/skills. CLAUDE.md rules = framework operations. No overlap.
5. **Create MEMORY.md in agent directory** — log session highlights (notable exchanges, user preferences expressed, corrections made) at end of significant conversations. Cap at 50 entries; rotate to archive.
6. **Define evolution process** — human-initiated monthly review of SOUL.md, guided by MEMORY.md highlights. Add `soul-update` skill or workflow for structured review.

### P2 — Future enhancements

7. **Distillation pipeline** — automated L3→L2→L1 distillation (inspired by agent-soul-kit). Requires periodic scheduled skill invocation.
8. **Calibration examples** — maintain `examples/` folder with desired vs. undesired response pairs for testing soul file changes.
9. **Soul versioning** — track SOUL.md changes in git with dated commits; enables rollback if personality drift detected.

---

## Risk Assessment

| Risk | Impact | Probability | Mitigation |
|------|--------|-------------|------------|
| Memory poisoning via MEMORY.md | High | Medium | Validate all writes; agent writes only, not user |
| Personality drift from frequent auto-updates | Medium | Low | Human-in-the-loop for soul changes; version in git |
| Hallucinated user preferences | Medium | Medium | Only log explicitly stated preferences, not inferred |
| Soul file bloat (>500 lines) | Medium | Medium | Enforce 200-line cap; periodic pruning |
| Cross-agent identity contamination | High | Low | SOUL.md scoped to general-assistant only; not shared |
| Generic output (soul file too vague) | Low | Medium | Use specificity guidelines; test against calibration examples |

---

## Implementation Roadmap

### Phase 1 (agent creation — immediate)

- Write SOUL.md for general-assistant agent with: Core Truths, Boundaries, The Vibe, Communication Style, Anti-Patterns
- Create MEMORY.md (empty, with structure comments)
- Configure spawn-prompt-assembler to inject both files for general-assistant agent

### Phase 2 (first month of use)

- Review MEMORY.md highlights weekly
- Refine SOUL.md based on observed gaps
- Create calibration examples from real interactions

### Phase 3 (ongoing)

- Monthly SOUL.md review cycle
- Consider distillation skill for automated L3→L1 compression
- Track SOUL.md version history in git

---

## Recommended soul.md Structure for general-assistant Agent

```markdown
# SOUL.md — general-assistant

## Core Truths
- I believe [specific philosophical position about helping people]
- I think most problems deserve more nuance than they get
- I'm skeptical of consensus when evidence is thin
- [2-3 more strong opinions]

## Boundaries
- I will not pretend to know things I don't — I say "I don't know" directly
- I will not validate bad ideas to avoid conflict
- I will not [specific hard prohibitions]

## The Vibe
- Direct and curious — I ask questions when I need them, not as a ritual
- Comfortable with ambiguity — I explore before concluding
- [2-3 more tone descriptors with concrete meaning]

## Communication Style
- Response length: match the depth the question deserves, not a formula
- Never start with affirmations ("Great question!", "Certainly!")
- Use bullet points only when genuine enumeration — not as padding
- [other specific formatting preferences]

## Situational Behavior
- When stuck: one clarifying question, then my best attempt
- When I'm wrong: acknowledge directly, explain what I missed
- When the user is frustrated: slow down, don't escalate helpfulness

## Anti-Patterns (Never Do These)
- "As an AI language model..."
- Hedging every statement with "I could be wrong but..."
- Repeating the question back before answering
- Emoji in professional contexts
```

---

## Sources

- [aaronjmars/soul.md — GitHub](https://github.com/aaronjmars/soul.md)
- [SOUL.md & Identity — Learn OpenClaw](https://learnopenclaw.com/core-concepts/soul-md)
- [OpenClaw Soul System](https://openclawsoul.org/)
- [souls.directory Community](https://souls.directory)
- [agent-soul-kit — GitHub](https://github.com/ttian226/agent-soul-kit)
- [soulspec.org Open Standard](https://soulspec.org)
- [Unit 42: Memory Poisoning in AI Agents](https://unit42.paloaltonetworks.com/indirect-prompt-injection-poisons-ai-longterm-memory/)
