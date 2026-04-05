---
name: research-synthesis
description: Research best practices and synthesize into design decisions for artifact creation. Invoke BEFORE any creator skill to ensure research-backed decisions.
version: 1.2.0
model: sonnet
invoked_by: both
user_invocable: true
tools:
  - mcp__Exa__web_search_exa
  - mcp__Exa__get_code_context_exa
  - WebSearch
  - WebFetch
  - Read
  - Write
  - Glob
  - Grep
skills:
  - task-management-protocol
triggers:
  - 'research for'
  - 'best practices for'
  - 'before creating'
best_practices:
  - Execute minimum 3 research queries before synthesizing
  - Consult at least 3 external sources
  - Document existing codebase patterns
  - Provide rationale for every design decision
  - Include risk assessment with mitigations
error_handling: graceful
streaming: supported
output_location: .claude/context/artifacts/research-reports/
verified: true
lastVerifiedAt: '2026-02-28'
---

# Research Synthesis Skill

## Purpose

Gather and synthesize research BEFORE creating any new artifact (agent, skill, workflow, hook, schema, template). This skill ensures all design decisions are backed by:

1. **Current best practices** from authoritative sources
2. **Implementation patterns** from real-world examples
3. **Existing codebase conventions** to maintain consistency
4. **Risk assessment** to anticipate problems

## When to Invoke This Skill

**MANDATORY BEFORE:**

- `agent-creator` - Research agent patterns and domain expertise
- `skill-creator` - Research skill implementation best practices
- `workflow-creator` - Research orchestration patterns
- `hook-creator` - Research validation and safety patterns
- `schema-creator` - Research JSON Schema patterns
- `template-creator` - Research code scaffolding patterns

**RECOMMENDED FOR:**

- New feature design
- Architecture decisions
- Technology selection
- Integration planning

## The Iron Law

```
NO ARTIFACT CREATION WITHOUT RESEARCH FIRST
```

If you haven't executed the research protocol, you cannot proceed with artifact creation.

## Multi-Source Conflict Detection (Inspired by Skill_Seekers unified_scraper)

When synthesizing from 2+ sources, actively detect and flag contradictions. This prevents silent adoption of conflicting advice.

**Conflict types to detect:**

| Conflict Type                | Example                                                                 | Resolution Strategy                               |
| ---------------------------- | ----------------------------------------------------------------------- | ------------------------------------------------- |
| Version mismatch             | Source A says "use v2 API", Source B says "v3 is required"              | Flag with dates, prefer most recent               |
| Contradictory advice         | Source A says "always use ORM", Source B says "raw SQL for performance" | Flag both with context, let decision-maker choose |
| Deprecated patterns          | Source A recommends pattern that Source B marks deprecated              | Flag with deprecation notice, prefer Source B     |
| Incompatible implementations | Source A uses callbacks, Source B uses async/await                      | Flag with migration path if available             |

**Detection protocol:**

1. After collecting findings from all sources, build a **claim matrix** — extract factual claims from each source
2. Compare claims pairwise for contradictions using semantic overlap (same topic, different recommendation)
3. For each conflict, record: `{ claim_a, source_a, claim_b, source_b, conflictType, suggestedResolution }`
4. Include a `conflicts` section in the synthesis report — **never silently pick one side**

**Conflict output in report:**

```markdown
### Conflicts Detected (2)

1. **Version requirement** — React Router docs (2026-03) say v7 required for data loading; Stack Overflow answer (2025-11) assumes v6. **Resolution:** Use v7 (docs are authoritative and more recent).

2. **State management approach** — Official docs recommend Context API for simple state; community blog recommends Zustand universally. **Resolution:** Flag for architect — depends on app complexity.
```

## Query Limits (IRON LAW)

```
3-5 QUERIES MAXIMUM PER RESEARCH TASK
```

Exceeding this limit causes:

- Memory exhaustion (reports >10 KB → context window overflow)
- Information overload (can't process 10+ sources effectively)
- Diminishing returns (quality > quantity)

**Query Budget by Complexity:**

- **Simple research** (fact-checking, version checking): 3 queries
- **Medium research** (feature comparison, implementation patterns): 4 queries
- **Complex research** (comprehensive best practices, ecosystem overview): 5 queries

**NEVER:**

- Execute >5 queries in a single research session
- Execute unbounded "research everything" queries
- Combine multiple unrelated research topics in one session

**Multi-Phase Pattern:** If research requires >5 queries, split into multiple research sessions (see "Multi-Phase Research Pattern" below).

---

## Report Size Limit (IRON LAW)

```
10 KB MAXIMUM PER RESEARCH REPORT
```

**Why 10 KB?**

- Context efficiency (10 KB = ~2500 words = readable in one context window)
- Forces prioritization (include only essential findings)
- Prevents "encyclopedia syndrome" (copying entire articles)

**Format Requirements:**

- Use bullet points (compact)
- Reference URLs instead of copying content
- Summarize findings in <3 sentences per source
- Remove noise, keep essentials

**When approaching 10 KB:**

1. Stop adding new sources
2. Consolidate duplicates
3. Remove redundant details
4. Focus on unique insights

**For complex topics:**

- Split into 2-3 mini-reports (each <10 KB)
- Each focused on one aspect
- Link reports together in summary

---

## MANDATORY Research Protocol

### Step 0: Internal Memory Lookup + Context Pressure Check (MANDATORY - FIRST STEP)

**BEFORE executing any external research queries**, first search internal project memory.
If sufficient high-confidence results exist internally, skip external queries entirely.
Then check context pressure before proceeding.

```javascript
// Sub-step 0a: Query internal RAG for cached research on the topic
const { searchInternalContext } = require('.claude/lib/memory/internal-rag.cjs');
const internalResults = await searchInternalContext(researchTopic, { limit: 5, threshold: 0.6 });
const avgSimilarity =
  internalResults.results.length > 0
    ? internalResults.results.reduce((sum, r) => sum + (r.similarity || 0), 0) /
      internalResults.results.length
    : 0;
if (internalResults.results.length >= 3 && avgSimilarity > 0.7) {
  // High-confidence internal hit — synthesize from internal results and skip external search
  console.log(
    '[research-synthesis] Internal RAG hit (avg similarity:',
    avgSimilarity.toFixed(2),
    ') — skipping external search'
  );
}
// Otherwise proceed to external queries below

// Sub-step 0b: Context pressure check
const { checkContextPressure } = require('.claude/lib/utils/context-pressure.cjs');

// Option A — token-budget-based (if budget info available)
const pressure = checkContextPressure({
  tokenBudgetPercent: currentTokenBudgetPercent,
});

// Option B — text-based estimate (when budget % not available)
// const pressure = checkContextPressure({ text: recentContextSnapshot });

if (pressure.pressure === 'high') {
  // STOP — compress context before researching
  console.warn('[research-synthesis] High context pressure:', pressure.reason);
  console.warn('Run context-compressor skill first, then re-invoke research-synthesis.');
  // Return early without executing research queries
  process.exit(0);
}

if (pressure.pressure === 'medium') {
  // Proceed but limit to 3 queries (simple budget)
  console.warn('[research-synthesis] Medium context pressure:', pressure.reason);
  console.warn('Limiting to 3 queries. Consider compressing after research.');
}
// Low pressure → proceed normally with full query budget
```

**Enforcement:**

| Pressure | Action                                                |
| -------- | ----------------------------------------------------- |
| `high`   | STOP — invoke `context-compressor` skill, then retry  |
| `medium` | Limit to 3 queries, warn caller                       |
| `low`    | Proceed normally with full query budget (3–5 queries) |

---

### Step 1: Define Research Scope & Plan Queries

Before executing queries, define scope AND plan query budget:

```markdown
## Research Scope Definition

**Artifact Type**: [agent | skill | workflow | hook | schema | template]
**Domain/Capability**: [What this artifact will do]

**Complexity Assessment**:

- [ ] Simple (fact-checking, version checking) → 3 queries
- [ ] Medium (feature comparison, implementation patterns) → 4 queries
- [ ] Complex (comprehensive best practices, ecosystem overview) → 5 queries

**Planned Queries** (list 3-5 BEFORE executing):

1. [Query 1: Best practices - specific question]
2. [Query 2: Implementation patterns - specific question]
3. [Query 3: Framework/AI-specific - specific question]
4. [Optional Query 4: Security/performance - specific question]
5. [Optional Query 5: Trade-offs/alternatives - specific question]

**Key Questions**:

1. What are the best practices for this domain?
2. What implementation patterns exist?
3. What tools/frameworks should be used?
4. What are the common pitfalls?

**Existing Patterns to Examine**:

- .claude/[category]/ - Similar artifacts
- .claude/templates/ - Relevant templates
- .claude/schemas/ - Validation patterns
```

**Pre-Research Checklist:**

```
[ ] Complexity assessed (3, 4, or 5 queries planned)
[ ] Queries planned BEFORE executing (prevents scope creep)
[ ] Each query is specific (not "research everything about X")
[ ] Report size target set (<10 KB)
[ ] Multi-phase split considered (if >5 queries needed)
```

### Step 2: Execute Research Queries (3-5 Maximum)

Execute **exactly 3-5** research queries (no more). More queries = memory exhaustion and context loss.

**Query 1: Best Practices**

```javascript
// Using Exa (preferred for technical content)
mcp__Exa__web_search_exa({
  query: '{artifact_type} {domain} best practices 2024 2025',
  numResults: 5,
});

// Or using WebSearch (fallback)
WebSearch({
  query: '{domain} best practices implementation guide',
});
```

**Query 2: Implementation Patterns**

```javascript
// Code-focused search
mcp__Exa__get_code_context_exa({
  query: '{domain} implementation patterns examples github',
  tokensNum: 5000,
});

// Or fetch from authoritative sources
WebFetch({
  url: 'https://[authoritative-source]/docs/{topic}',
});
```

**Query 3: Claude/AI Agent Specific**

```javascript
// Framework-specific patterns
mcp__Exa__web_search_exa({
  query: 'Claude AI agent {domain} {artifact_type} patterns',
  numResults: 5,
});

// Or search for MCP patterns
WebSearch({
  query: 'Model Context Protocol {domain} integration',
});
```

**Query Efficiency Tips:**

- Prefer 2-3 high-quality queries over 10 generic ones
- Combine related questions in one query ("X best practices + implementation patterns")
- Use WebFetch for known authoritative sources (faster, more focused)
- Stop when you have enough unique insights (quality > quantity)

### Step 3: Analyze Existing Codebase

Before synthesizing, examine existing patterns in the codebase:

```javascript
// Find similar artifacts
Glob({ pattern: '.claude/{artifact_category}/**/*.md' });

// Search for related implementations
Grep({ pattern: '{related_keyword}', path: '.claude/' });

// Read existing examples
Read({ file_path: '.claude/{category}/{similar_artifact}' });
```

**What to Extract:**

1. **Naming conventions** - How are similar artifacts named?
2. **Structure patterns** - What sections do they include?
3. **Tool usage** - What tools do similar artifacts use?
4. **Skill dependencies** - What skills are commonly assigned?
5. **Output locations** - Where do artifacts save their outputs?

### Step 4: Synthesize Findings

Output a structured research report following `.claude/templates/reports/research-report-template.md`:

**File Location**: `.claude/context/artifacts/research-reports/{topic}-research-{YYYY-MM-DD}.md`

**Required Sections**:

1. **Provenance Header**: `<!-- Agent: {type} | Task: #{id} | Session: {date} -->`
2. **Executive Summary**: 2-3 sentence overview of key findings
3. **Research Methodology**: Query table + sources consulted table
4. **Detailed Findings**: By topic with key insights, evidence, relevance
5. **Academic References**: arXiv papers, academic sources (include even if empty)
6. **Practical Recommendations**: P0/P1/P2 prioritization
7. **Risk Assessment**: Risk table with impact/probability/mitigation
8. **Implementation Roadmap**: Next steps and timeline

**For artifact creation research, also include**:

### Existing Codebase Patterns

**Similar Artifacts Found:**

- `{path_1}` - {what it does, what patterns it uses}
- `{path_2}` - {what it does, what patterns it uses}

**Conventions Identified:**

- Naming: {convention}
- Structure: {convention}
- Tools: {convention}
- Output: {convention}

### Best Practices Identified

| #   | Practice   | Source               | Confidence | Rationale        |
| --- | ---------- | -------------------- | ---------- | ---------------- |
| 1   | {practice} | {source_url_or_name} | High       | {why_applicable} |
| 2   | {practice} | {source_url_or_name} | Medium     | {why_applicable} |
| 3   | {practice} | {source_url_or_name} | High       | {why_applicable} |

**Confidence Levels:**

- **High**: Multiple authoritative sources agree
- **Medium**: Single authoritative source or multiple secondary sources
- **Low**: Limited evidence, requires validation

### Design Decisions

| Decision     | Rationale | Source   | Alternatives Considered    |
| ------------ | --------- | -------- | -------------------------- |
| {decision_1} | {why}     | {source} | {what_else_was_considered} |
| {decision_2} | {why}     | {source} | {what_else_was_considered} |
| {decision_3} | {why}     | {source} | {what_else_was_considered} |

### Recommended Implementation

**File Location**: `.claude/{category}/{name}/`

**Template to Use**: `.claude/templates/{template}.md`

**Skills to Invoke**:

- `{skill_1}` - {why}
- `{skill_2}` - {why}

**Hooks Needed**:

- `{hook_type}` - {purpose}

**Dependencies**:

- Existing artifacts: {list}
- External tools: {list}

### Quality Gate Checklist

Before proceeding to artifact creation, verify:

- [ ] Minimum 3 research queries executed
- [ ] At least 3 external sources consulted
- [ ] Existing codebase patterns documented
- [ ] All design decisions have rationale and source
- [ ] Risk assessment completed with mitigations
- [ ] Recommended implementation path documented
- [ ] Report saved with correct naming: `{topic}-research-{YYYY-MM-DD}.md`
- [ ] Provenance header included

### Next Steps

1. **Invoke creator skill**: `Skill({ skill: "{creator_skill}" })`
2. **Use this report as input**: Reference decisions above
3. **Validate against checklist**: Before marking complete

## Integration with Creator Skills

### Pre-Creation Workflow

```text
[AGENT] User requests: "Create a Slack notification skill"

[AGENT] Step 1: Research first
Skill({ skill: "research-synthesis" })

[RESEARCH-SYNTHESIS] Executing research protocol...
- Query 1: "Slack API best practices 2025"
- Query 2: "Slack MCP server integration patterns"
- Query 3: "Claude AI Slack notification skill"
- Analyzing: .claude/skills/*/SKILL.md for patterns
- Output: Research Report saved

[AGENT] Step 2: Create with research backing
Skill({ skill: "skill-creator" })

[SKILL-CREATOR] Using research report...
- Following design decisions from report
- Applying identified best practices
- Mitigating documented risks
```

### Handoff Format

After completing research, provide this handoff to the creator skill:

```markdown
## Research Handoff to: {creator_skill}

**Report Location**: `.claude/context/artifacts/research-reports/{artifact_name}-research.md`

**Summary**:
{2-3 sentence summary of key findings}

**Critical Decisions**:

1. {decision_1}
2. {decision_2}
3. {decision_3}

**Proceed with creation**: YES/NO
**Confidence Level**: High/Medium/Low
```

## Multi-Phase Research Pattern (for complex topics)

When research complexity **exceeds 5 queries**, split into phases:

**Phase 1: Scope & Definition (2 queries)**

- What is the topic/technology?
- What are the key concepts?

**Phase 2: Implementation (2 queries)**

- How do experts implement this?
- Common patterns & best practices?

**Phase 3: Comparison & Trade-offs (1 query)**

- How does this compare to alternatives?
- Trade-offs & gotchas?

**Benefits:**

- Each phase is independent (less context bleed)
- Can be done in separate skill invocations
- Clearer organization
- Easier to reuse findings

**Example:**

```
Session 1: Research "Rust async/await" (Phase 1: 2 queries)
Session 2: Research "Tokio patterns" (Phase 2: 2 queries)
Session 3: Research "async-trait vs manual impl" (Phase 3: 1 query)
```

---

## Memory-Aware Chunking Examples

**GOOD - Focused query + chunked report:**

```
Query: "Rust async/await best practices 2026"
Report structure:
- Definition (100 words)
- Pattern 1: Tokio (200 words)
- Pattern 2: async-trait (150 words)
- Gotchas (100 words)
- Links (10 sources)
---Total: ~550 words, ~3 KB
```

**BAD - Unbounded research:**

```
Query: "everything about Rust ecosystem 2026"
Report: 50 sources, 15 KB (truncated by context limit)
---Can't use findings without context loss
```

**GOOD - Phased approach:**

```
Phase 1 Report: Rust async fundamentals (3 KB)
Phase 2 Report: Tokio implementation patterns (4 KB)
Phase 3 Report: Performance comparison (2 KB)
---Total: 9 KB across 3 sessions (all usable)
```

**BAD - Single massive report:**

```
Single Report: Comprehensive Rust async guide (25 KB)
---Truncated to 10 KB, missing critical sections
```

---

## Quality Gate

Research is complete when ALL items pass:

```
[ ] 3-5 research queries executed (NO MORE THAN 5)
[ ] At least 3 external sources consulted (URLs or authoritative names)
[ ] Existing codebase patterns documented (at least 2 similar artifacts)
[ ] ALL design decisions have rationale AND source
[ ] Risk assessment completed (at least 3 risks with mitigations)
[ ] Recommended implementation path documented
[ ] Report saved to output location
[ ] Report size <10 KB (check file size before saving)
```

**BLOCKING**: If any item fails, research is INCOMPLETE. Do not proceed to artifact creation.

## Output Locations

- Research reports: `.claude/context/artifacts/research-reports/`
- Temporary notes: `.claude/context/tmp/research/`
- Memory updates: `.claude/context/memory/learnings.md`

## Report Naming Convention (MANDATORY)

**Format**: `{topic}-research-{YYYY-MM-DD}.md`

- Topic: kebab-case descriptive name
- Always includes `-research-` suffix before date
- Date: ISO 8601 with hyphens (YYYY-MM-DD)

**Examples**:

- ✓ `oauth2-security-research-2026-02-09.md`
- ✓ `json-schema-patterns-research-2026-02-09.md`
- ✓ `slack-integration-best-practices-research-2026-02-09.md`
- ✗ `agent-keywords-core.md` (missing date)
- ✗ `oauth2-auth-2026-02-09.md` (missing `-research-` suffix)
- ✗ `bmad-method-analysis-20260128-104050.md` (wrong date format)

**Template**: Use `.claude/templates/reports/research-report-template.md` for all research reports

## Examples

### Example 1: Research Before Creating Slack Skill

```javascript
// Step 1: Define scope
// Artifact: skill, Domain: Slack notifications

// Step 2: Execute queries
mcp__Exa__web_search_exa({
  query: 'Slack API webhook best practices 2025',
  numResults: 5,
});

mcp__Exa__get_code_context_exa({
  query: 'Slack notification system implementation Node.js',
  tokensNum: 5000,
});

WebSearch({
  query: 'Claude AI MCP Slack server integration',
});

// Step 3: Analyze codebase
Glob({ pattern: '.claude/skills/*notification*/SKILL.md' });
Glob({ pattern: '.claude/skills/*slack*/SKILL.md' });
Read({ file_path: '.claude/skills/skill-creator/SKILL.md' });

// Step 4: Synthesize and output report
Write({
  file_path: '.claude/context/artifacts/research-reports/slack-notifications-research.md',
  content: '## Research Report: Slack Notifications Skill...',
});
```

### Example 2: Research Before Creating Database Agent

```javascript
// Research queries for database-architect agent
mcp__Exa__web_search_exa({
  query: 'database design architecture best practices 2025',
  numResults: 5,
});

WebFetch({
  url: 'https://docs.postgresql.org/current/ddl.html',
});

mcp__Exa__web_search_exa({
  query: 'AI agent database schema design automation',
  numResults: 5,
});

// Analyze existing agents
Glob({ pattern: '.claude/agents/domain/*data*.md' });
Read({ file_path: '.claude/agents/core/developer.md' });
```

## Common Research Domains

| Domain          | Key Queries                                      | Authoritative Sources       |
| --------------- | ------------------------------------------------ | --------------------------- |
| API Integration | "REST API design", "GraphQL patterns"            | OpenAPI spec, GraphQL spec  |
| Security        | "OWASP top 10", "security best practices"        | OWASP, NIST                 |
| Database        | "database design patterns", "SQL optimization"   | PostgreSQL docs, MySQL docs |
| Frontend        | "React patterns", "accessibility WCAG"           | React docs, W3C             |
| DevOps          | "CI/CD best practices", "IaC patterns"           | GitLab docs, Terraform docs |
| Testing         | "TDD patterns", "test automation"                | Testing Library, Jest docs  |
| AI/ML           | "LLM integration patterns", "prompt engineering" | Anthropic docs, OpenAI docs |

## File Placement & Standards

### Output Location Rules

This skill outputs to: `.claude/context/artifacts/research-reports/`

### Mandatory References

- **File Placement**: See `.claude/docs/FILE_PLACEMENT_RULES.md`
- **Developer Workflow**: See `.claude/docs/DEVELOPER_WORKFLOW.md`
- **Artifact Naming**: See `.claude/docs/ARTIFACT_NAMING.md`

### Enforcement

File placement is enforced by `file-placement-guard.cjs` hook.
Invalid placements will be blocked in production mode.

---

## Memory Protocol (MANDATORY)

**Before starting:**

```bash
cat .claude/context/memory/learnings.md
```

Check for:

- Previous research on similar domains
- Known patterns and conventions
- Documented decisions

**After completing:**

- New research findings -> Append to `.claude/context/memory/learnings.md`
- Important decisions -> Append to `.claude/context/memory/decisions.md`
- Issues found -> Append to `.claude/context/memory/issues.md`

> ASSUME INTERRUPTION: Your context may reset. If it's not in memory, it didn't happen.

## Workflow Integration

This skill integrates with the Creator Ecosystem:

| Creator            | Research Focus                                       |
| ------------------ | ---------------------------------------------------- |
| `agent-creator`    | Domain expertise, agent patterns, skill dependencies |
| `skill-creator`    | Tool integration, MCP patterns, validation hooks     |
| `workflow-creator` | Orchestration patterns, multi-agent coordination     |
| `hook-creator`     | Validation patterns, security checks, safety gates   |
| `schema-creator`   | JSON Schema patterns, validation strategies          |
| `template-creator` | Code scaffolding, project structure patterns         |

**Full lifecycle:** `.claude/workflows/core/skill-lifecycle.md`

---

## Iron Laws

1. **NEVER** create any artifact without completing the research protocol first — uninformed creation produces decisions that conflict with existing patterns and require expensive rework.
2. **NEVER** execute more than 5 queries per research session — exceeding the limit causes memory exhaustion and context window overflow where later findings are silently lost.
3. **NEVER** produce a research report exceeding 10 KB — oversized reports overflow the context window and force truncation of findings at the most critical sections.
4. **ALWAYS** analyze at least 2 existing codebase artifacts before synthesizing external research — external best practices alone miss project-specific conventions and produce inconsistent implementations.
5. **ALWAYS** document a source and rationale for every design decision — decisions without evidence cannot be evaluated, challenged, or traced during future refactoring.

## Anti-Patterns

| Anti-Pattern                                                       | Why It Fails                                                                                       | Correct Approach                                                                                             |
| ------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| Starting artifact creation before running research protocol        | Produces uninformed decisions that conflict with existing patterns and require rework              | Always invoke research-synthesis and pass the quality gate before calling any creator skill                  |
| Executing 10+ queries to "be thorough"                             | Causes memory exhaustion and context overflow; later findings are silently lost                    | Plan exactly 3–5 targeted queries before starting; split complex topics into separate research phases        |
| Writing exhaustive research reports exceeding 10 KB                | Oversized reports truncate in the context window, hiding sections the creator skill most needs     | Use bullet points, reference URLs instead of copying content, and summarize each source in under 3 sentences |
| Synthesizing external findings without examining existing codebase | External best practices may conflict with established project patterns and naming conventions      | Always glob and read at least 2 similar existing artifacts before writing design decisions                   |
| Recording design decisions without source citations                | Undocumented decisions cannot be validated, challenged, or traced during future refactoring cycles | Every decision row in the Design Decisions table must include a source URL or authoritative reference name   |
