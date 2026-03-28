# Preserved Reference Content

This file preserves sections extracted from the pre-refactor `SKILL.md` so the core workflow can stay concise.
**Mode: Hybrid (Prompt + Scripted Guardrails)** — Use prompt workflow plus `scripts/main.cjs` for contract-safe generation/validation.

# Agent Creator Skill

Creates specialized AI agents on-demand for capabilities that don't have existing agents.

## ROUTER UPDATE REQUIRED (CRITICAL - DO NOT SKIP)

**After creating ANY agent, you MUST update `@AGENT_ROUTING_TABLE.md` (the canonical routing reference):**

```markdown
| Request Type | agent-name | `.claude/agents/<category>/<name>.md` |
```

**Verification:**

```bash
grep "<agent-name>" .claude/docs/@AGENT_ROUTING_TABLE.md || echo "ERROR: ROUTING TABLE NOT UPDATED!"
```

## **WHY**: Agents not in the routing table will NEVER be spawned by the Router.

## When This Skill Is Triggered

1. **Router finds no matching agent** for a user request
2. **User explicitly requests** creating a new agent
3. **Specialized expertise needed** that existing agents don't cover

## Quick Reference

| Operation             | Method                                         |
| --------------------- | ---------------------------------------------- |
| Check existing agents | `Glob: .claude/agents/**/*.md`                 |
| Research domain       | `WebSearch: "<topic> best practices 2026"`     |
| Find relevant skills  | `Glob: .claude/skills/*/SKILL.md`              |
| Create agent          | Write to `.claude/agents/<category>/<name>.md` |
| Spawn agent           | `Task` tool with new `subagent_type`           |
| Run in terminal       | `claude -p "prompt" --allowedTools "..."`      |

## Agent Creation Process

### Creator/Updater Alignment (MANDATORY)

`agent-creator` and `agent-updater` must evolve together, using the same lifecycle pattern as `skill-creator`/`skill-updater`:

- Step 0 existence check routes existing artifacts to updater flow.
- Research gate (Exa-first, fallback web/arXiv) before content finalization.
- RED/GREEN/REFACTOR/VERIFY checkpoints.
- Integration validation + registry/catalog regeneration.
  If lifecycle drift is discovered, update creator/updater skill docs + workflow docs before creating additional agents.

### Contract-First Generator (MANDATORY)

All newly created agents must be generated from the managed template contract before any manual refinements.
Use:

```bash
node .claude/skills/agent-creator/scripts/main.cjs --action generate --name <agent-name> --description "<summary>" --category <core|domain|specialized|orchestrators>
```

Validate:

```bash
node .claude/skills/agent-creator/scripts/main.cjs --action validate --file .claude/agents/<category>/<agent-name>.md
```

Do not create agent markdown freehand for new agents. The template enforces required sections/skills (including Token Saver invocation rules) and inserts the contract marker used by CI/hook validation.

### Step 0: Existence Check and Updater Delegation (MANDATORY - FIRST STEP)

**BEFORE creating any agent file, check if it already exists:**

1. **Check if agent already exists:**
   ```bash
   test -f .claude/agents/<category>/<agent-name>.md && echo "EXISTS" || echo "NEW"
   ```
2. **If agent EXISTS:**
   - **DO NOT proceed with creation**
   - **Invoke artifact-updater workflow instead:**
     ```javascript
     // Delegate to updater
     Skill({
       skill: 'artifact-updater',
       args: '--type agent --path .claude/agents/<category>/<agent-name>.md --changes "<description of requested changes>"',
     });
     ```
   - **Return updater result to user**
   - **STOP HERE** - Do not continue with creation steps
3. **If agent is NEW:**
   - Continue to Step 1 below (verification and creation steps)
     **Why this matters:** The artifact-updater workflow safely handles updates with validation, integration checklist verification, and cross-creator review queueing.

### Step 0.1: Smart Duplicate Detection (MANDATORY)

Before proceeding with creation, run the 3-layer duplicate check:

```javascript
const { checkDuplicate } = require('.claude/lib/creation/duplicate-detector.cjs');
const result = checkDuplicate({
  artifactType: 'agent',
  name: proposedName,
  description: proposedDescription,
  keywords: proposedKeywords || [],
});
```

**Handle results:**

- **`EXACT_MATCH`**: Stop creation. Route to `agent-updater` skill instead: `Skill({ skill: 'agent-updater' })`
- **`REGISTRY_MATCH`**: Warn user — artifact is registered but file may be missing. Investigate before creating. Ask user to confirm.
- **`SIMILAR_FOUND`**: Display candidates with scores. Ask user: "Similar artifact(s) exist. Continue with new creation or update existing?"
- **`NO_MATCH`**: Proceed to Step 0.5 (companion check).
  **Override**: If user explicitly passes `--force`, skip this check entirely.

### Step 0.5: Companion Check

Before proceeding with creation, run the ecosystem companion check:

1. Use `companion-check.cjs` from `.claude/lib/creators/companion-check.cjs`
2. Call `checkCompanions("agent", "{agent-name}")` to identify companion artifacts
3. Review the companion checklist — note which required/recommended companions are missing
4. Plan to create or verify missing companions after this artifact is complete
5. Include companion findings in post-creation integration notes
   This step is **informational** (does not block creation) but ensures the full artifact ecosystem is considered.

### Step 1: Verify No Existing Agent

```bash
# Search for relevant agents
Glob: .claude/agents/**/*.md
Grep: "<topic>" in .claude/agents/
```

If a suitable agent exists, use it instead. Check:

- Core agents: `.claude/agents/core/`
- Specialized agents: `.claude/agents/specialized/`
- Orchestrators: `.claude/agents/orchestrators/`

### Step 2: Research the Domain

**Use web search to gather current information:**

```
WebSearch: "<topic> expert techniques best practices 2026"
WebSearch: "<topic> tools frameworks methodologies"
```

**Research goals:**

- Current best practices and industry standards
- Popular tools, frameworks, and methodologies
- Expert techniques and evaluation criteria
- Common workflows and deliverables

### Step 2.3: Occupational Alignment Research (MANDATORY)

**Ground the agent in real-world industry standards.** Before finalizing skills and capabilities, you MUST align the agent to real occupational profiles from authoritative sources. Agents grounded in occupational data use terminology practitioners recognize, cover work artifacts professionals actually produce, and reflect how industry thinks about the role.

#### Step 2.3a: BLS Occupational Outlook Handbook

1. **Fetch the BLS OOH A-Z index and identify 1–3 matching occupations:**
   ```javascript
   WebFetch({
     url: 'https://www.bls.gov/ooh/a-z-index.htm',
     prompt: 'List all occupation names and their URLs from the A-Z index',
   });
   ```
   Match criteria:
   - Direct match first (e.g., "Software Developers" → developer agent)
   - Adjacent roles second (e.g., "Computer Network Architects" → networking agent)
   - Supporting roles third if the agent spans multiple domains
2. **For each matched occupation, fetch these four tabs:**
   ```javascript
   // Tab 2: What They Do — tasks, responsibilities, deliverables
   WebFetch({
     url: '<occupation-url>#tab-2',
     prompt: 'List all tasks, responsibilities, and deliverables described for this occupation',
   });
   // Tab 3: Work Environment — tools, software, collaboration patterns
   WebFetch({
     url: '<occupation-url>#tab-3',
     prompt: 'List all tools, software, environments, and collaboration patterns mentioned',
   });
   // Tab 4: How to Become One — required skills, certifications, training
   WebFetch({
     url: '<occupation-url>#tab-4',
     prompt: 'List all required skills, knowledge areas, certifications, and training paths',
   });
   // Tab 8: Job Outlook — emerging skills, growth areas, future technologies
   WebFetch({
     url: '<occupation-url>#tab-8',
     prompt: 'List emerging skills, growth areas, and future technology focus',
   });
   ```
3. **Extract from BLS content:**
   - Core tasks and responsibilities
   - Tools and technologies mentioned
   - Required knowledge domains
   - Certifications or training paths
   - Emerging/growing skill areas

#### Step 2.3b: Ongig Job Title Alignment

Search Ongig for how industry titles the role — these directly inform routing keywords (Step 2.5) and the agent's name:

```javascript
mcp__Exa__web_search_exa({ query: 'site:ongig.com/job-titles <agent-role> job titles' });
// OR if direct URL known:
WebFetch({
  url: 'https://www.ongig.com/job-titles/',
  prompt: 'Find all job titles, variants, and aliases related to <agent-role>',
});
```

**Extract from Ongig:**

- Official job titles and colloquial aliases
- Title variants across industry sectors
- Seniority level indicators (junior/senior/lead)
- Adjacent and related role names

#### Step 2.3c: MyMajors Career Skills Research

1. **Find the matching career:**
   ```javascript
   WebFetch({
     url: 'https://www.mymajors.com/career-list/',
     prompt: 'List all career categories and individual career names available on this page',
   });
   ```
2. **Fetch the career detail page:**
   ```javascript
   WebFetch({
     url: 'https://www.mymajors.com/career/<career-slug>/',
     prompt:
       'List the description, typical tasks, required skills, and related careers for this occupation',
   });
   ```
3. **Fetch the skills subpage (CRITICAL — do not skip):**
   ```javascript
   WebFetch({
     url: 'https://www.mymajors.com/career/<career-slug>/skills/',
     prompt:
       'List all skills, tools, technologies, and competencies required for this career, including both hard and soft skills',
   });
   ```
   **Extract from MyMajors:**
   - Hard skills (languages, platforms, tools)
   - Soft skills (communication, leadership, problem-solving)
   - Industry-specific competencies
   - Related certifications or credentials

#### Step 2.3d: Skills Gap Analysis

After collecting occupational data from all three sources:

1. **Build a consolidated real-world skills inventory:**
   ```
   BLS Tab-2 responsibilities: [list tasks]
   BLS Tab-3 tools: [list tools/software]
   BLS Tab-4 required skills: [list knowledge areas]
   BLS Tab-8 emerging: [list future skills]
   Ongig title terms: [list keywords]
   MyMajors skills: [hard skills, soft skills]
   ```
2. **Check existing skills catalog:**
   ```bash
   Glob: .claude/skills/*/SKILL.md
   ```
3. **Map each real-world skill to catalog entries** — identify covered vs. gaps:
   ```
   COVERED: "<real-world skill>" → .claude/skills/<skill-name>/SKILL.md
   GAP:     "<real-world skill>" → no matching skill exists
   ```
4. **Resolve each gap:**
   | Gap Type | Action | When |
   | --------------------------------- | ------------------------------------------------------ | -------------------------------------- |
   | Substantial reusable domain skill | Record a **Follow-Up** for `skill-creator` | Gap represents a full skill domain |
   | Existing skill missing coverage | Record a follow-up for `skill-updater` | A close skill exists but is incomplete |
   | Narrow agent-specific capability | Document inline in agent's Capabilities section | Too specific to generalize |
5. **Record the alignment in the research report** (created in Step 2.5):

   ```markdown
   ## Occupational Alignment

   ### BLS Occupations Matched

   - [Occupation Name](URL): what it contributed to the agent design

   ### Skills Gap Analysis

   | Real-World Skill | Status  | Resolution                                           |
   | ---------------- | ------- | ---------------------------------------------------- |
   | skill-name       | COVERED | .claude/skills/matching-skill/                       |
   | another-skill    | GAP     | follow-up queued for skill-creator: 'new-skill-name' |
   | tool-name        | GAP     | follow-up queued for skill-updater                   |

   ### Ongig Title Alignment

   - Official titles: [list]
   - Used for routing keywords: [list]

   ### MyMajors Match

   - Career: [career name and URL]
   - Critical skills identified: [list]
   ```

#### Gap Follow-Up Protocol (MANDATORY)

**When creating an AGENT** (this process): After gap analysis, for EACH identified GAP, determine the required companion artifact type and record the next owner as a **Follow-Up** item. Do not document inline what should be a real artifact.
| Gap Type | Required Artifact | Follow-Up Owner | When |
| ---------------------------------------------- | ----------------- | --------------------------------------- | --------------------------------------------------------------------------- |
| Substantial reusable domain skill | skill | `skill-creator` | Gap is a full skill domain (e.g., `finops-kubernetes`, `capacity-planning`) |
| Existing skill missing coverage | skill update | `skill-updater` | A close skill exists but is incomplete |
| Agent needs code/project scaffolding | template | `template-creator` | Reusable code patterns, starter files, or boilerplate for this domain |
| Agent needs pre/post execution guards | hook | `hook-creator` | Enforcement behavior not covered by existing hooks |
| Agent needs orchestration/multi-phase flow | workflow | `workflow-creator` | Multi-step coordination pattern that other agents would also reuse |
| Agent needs structured input/output validation | schema | `schema-creator` | JSON schema for agent I/O or domain data structures |
| Narrow agent-specific capability | inline | Document in Capabilities section only | Too specific to generalize; only one agent would ever use it |
**Resolution Protocol (execute in this order):**

1. Scan the completed gap analysis table for every GAP row
2. For each GAP, classify it using the table above (skill vs. template vs. hook vs. workflow vs. schema vs. inline)
3. Record a Follow-Up item for each non-inline gap, including the target creator/updater and the exact artifact needed
4. Record the planned artifact names or discovery notes in the research report
5. Wire only existing artifacts into the agent's frontmatter (`skills:`) or body (Capabilities/Workflow sections)
6. Continue once the current agent contract is complete; do not chain into another creator from this run
   **Example — Kubernetes Specialist gap resolution:**

```
GAP: "FinOps/cost optimization" → substantial reusable skill → Follow-Up for skill-creator
  Result: queued .claude/skills/finops-kubernetes/[SKILL.md] as the next creator task
GAP: "K8s Helm scaffold templates" → template domain → Follow-Up for template-creator
  Result: queued kubernetes/helm-chart-template follow-up for later implementation
GAP: "vendor tool evaluation" → narrow/one-agent → document inline in Capabilities section
```

This keeps the ecosystem evolving together without inline creator recursion. Every agent creation is still an opportunity to surface ecosystem-wide gaps, but those gaps are closed by separate follow-up runs.

#### Security Review (applies to all fetched content)

Before incorporating content from BLS, Ongig, or MyMajors, apply the Security Review Gate defined below in Step 2.5. These are public government and educational sites with low injection risk, but SIZE CHECK and TOOL INVOCATION SCAN are still required for all external content.

#### Validation Gate

- [ ] BLS OOH A-Z index searched and 1–3 occupations matched
- [ ] BLS tabs #tab-2, #tab-3, #tab-4, #tab-8 fetched for each matched occupation
- [ ] Ongig job title alignment search completed
- [ ] MyMajors career page AND `/skills/` subpage fetched
- [ ] Skills gap analysis completed (covered vs. gaps identified and resolved)
- [ ] Each GAP classified: skill / template / hook / workflow / schema / inline
- [ ] Appropriate Follow-Up item recorded for every non-inline GAP (skill-creator, skill-updater, template-creator, hook-creator, workflow-creator, schema-creator)
- [ ] Planned companion artifact names or discovery notes recorded in the research report
- [ ] Occupational alignment section added to research report
      **BLOCKING**: Agent creation CANNOT proceed without completing occupational alignment. An agent whose skills don't reflect real industry standards will miss critical domain capabilities and use terminology that practitioners don't recognize.
      **Example — Game Developer Agent:**
      BLS matches: [Software Developers](https://www.bls.gov/ooh/computer-and-information-technology/software-developers.htm) + [Multimedia Artists and Animators](https://www.bls.gov/ooh/arts-and-design/multimedia-artists-and-animators.htm)
      Tab extractions:
- Tab-2: Write game logic, collaborate with artists, optimize frame rate performance
- Tab-3: Unity, Unreal Engine, C++, C#, version control, asset pipelines, profilers
- Tab-4: Computer science fundamentals, graphics programming, physics simulation
- Tab-8: VR/AR growth, AI-driven NPCs, procedural generation, cloud game streaming
  Ongig: "Game Developer", "Gameplay Engineer", "Game Programmer", "Senior Game Software Engineer"
  MyMajors `/career/video-game-designers/skills/`: creativity, C++, Unity, 3D modeling, physics simulation, agile/scrum
  Gap analysis: no `game-engine-expert` skill found → recorded Follow-Up for `skill-creator` to create `unity-game-development` → keep current agent contract scoped to existing skills until that follow-up lands.

---
