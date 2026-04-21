<!-- Agent: planner | Task: #4 | Session: 2026-02-17 -->

# Feasibility Report: `powershell-expert` Skill

**Date:** 2026-02-17
**Task ID:** #4
**Artifact Type:** skill
**Proposed Name:** `powershell-expert`
**Purpose:** Expert PowerShell scripting skill covering cross-platform scripting, module authoring, pipeline patterns, security, testing with Pester, remoting, DSC, and PowerShell 7+ features

---

## Decision: PROCEED

All feasibility gates pass. Creation is approved to proceed to Task #5 (skill-creator).

---

## 1. Creation Feasibility Gate Results

**Status: PASS**

### Evidence

| Check | Result | Evidence |
|-------|--------|----------|
| Existence / Duplicate check | PASS — No duplicate found | `Glob("**/*powershell*")` → 0 results; `Glob("**/*pwsh*")` → 0 results in `.claude/skills/` |
| Skill catalog scan | PASS — Not present | Searched all 109 active skills in `.claude/context/artifacts/catalogs/skill-catalog.md`; no PowerShell entry in any category |
| Stack compatibility | PASS | SKILL.md format is established; skill-creator workflow in place; catalog append process defined |
| Integration readiness | PASS | Routing table keywords can be added; agent assignment target identified (see Section 5) |
| Security / creator boundary | PASS | No creator guard issues; skill creation follows Gate 4 path via `skill-creator` |

### Blockers

None.

---

## 2. Compliance Policy Check Results

**Decision: PASS (with required mitigations)**

### Policy Findings

1. **Creator Boundary (Gate 4 Iron Law):** The SKILL.md file at `.claude/skills/powershell-expert/SKILL.md` MUST be written by the `skill-creator` skill. Direct `Write` calls to this path are blocked by `unified-creator-guard.cjs`. The skill-creator agent must be invoked in Task #5.

2. **Research-First Requirement:** `research-synthesis` skill MUST be invoked BEFORE `skill-creator` executes. The research output should be saved to `.claude/context/artifacts/research-reports/powershell-expert-research-2026-02-17.md`.

3. **Post-Creation Integration:** After skill-creator completes, `artifact-integrator` skill must run to:
   - Add catalog entry to `.claude/context/artifacts/catalogs/skill-catalog.md` (Languages section)
   - Verify routing keyword wiring
   - Validate agent assignment

4. **Memory Protocol:** Creator agent must append learnings to `.claude/context/memory/learnings.md` and decisions to `.claude/context/memory/decisions.md`.

### Required Mitigations

| Mitigation | Owner | Required Before |
|------------|-------|-----------------|
| Invoke `research-synthesis` first | skill-creator agent (Task #5) | `skill-creator` invocation |
| Write SKILL.md via `skill-creator` only | skill-creator agent (Task #5) | Any direct Write to creator path |
| Add catalog entry after creation | artifact-integrator (post Task #5) | Task completion |
| Assign skill to at least one agent | artifact-integrator (post Task #5) | Task completion |

---

## 3. Duplicate Check Results

**Status: No duplicates found — CLEAR**

### Searches Executed

| Search Pattern | Scope | Result |
|----------------|-------|--------|
| `**/*powershell*` | `.claude/skills/` | 0 files |
| `**/*pwsh*` | `.claude/skills/` | 0 files |
| `**/*ps-*` | `.claude/skills/` | 5 files (gitops, cloud-devops — unrelated) |
| Skill catalog scan for "PowerShell", "pwsh", "ps" | `skill-catalog.md` | 0 matches |

No existing PowerShell skill exists anywhere in the skill ecosystem. The `php-expert` skill (closest analog in the `Other` category) is unrelated to PowerShell.

---

## 4. Category Recommendation

**Recommended Category:** `Languages`

### Rationale

The existing `Languages` category in the skill catalog contains language-specific expert skills:

| Existing Skill | Language Coverage |
|----------------|-------------------|
| `python-backend-expert` | Python (Django, FastAPI, Flask) |
| `typescript-expert` | TypeScript |
| `go-expert` | Go (APIs, gRPC, concurrency) |
| `nodejs-expert` | Node.js, Express, NestJS |
| `java-expert` | Java, Spring Boot |
| `php-expert` | PHP, Laravel, WordPress |
| `web3-expert` | Solidity, Ethereum |

PowerShell is a scripting language with cross-platform support (PS 7+) and its own ecosystem (Pester testing, PSGallery modules, DSC). It fits the `Languages` category pattern precisely.

**Alternative considered:** A new `Scripting` or `Automation` category was considered but rejected — with only one skill, creating a new category would fragment the catalog unnecessarily. If `bash-expert` or `python-scripting` skills are added in the future, a category split can be evaluated.

---

## 5. Companion Artifact Requirements

### Agent Assignment (Must-Have)

The `powershell-expert` skill should be assigned to these agents in their frontmatter `skills:` array:

| Agent | Justification | Priority |
|-------|---------------|----------|
| `devops` | `.claude/agents/specialized/devops.md` — Primary consumer; PowerShell is core to Windows/hybrid DevOps workflows | **Must-Have** |
| `devops-troubleshooter` | `.claude/agents/specialized/devops-troubleshooter.md` — Incident response on Windows/hybrid stacks often requires PS remoting | **Must-Have** |
| `developer` | `.claude/agents/core/developer.md` — General PowerShell scripting tasks | **Should-Have** |
| `qa` | `.claude/agents/core/qa.md` — Pester testing framework expertise | **Should-Have** |

### Related Skills (Cross-Reference)

| Skill | Relationship |
|-------|-------------|
| `docker-compose` | PowerShell can orchestrate Docker workflows on Windows |
| `terraform-infra` | PS Azure/AWS CLI integration complements Terraform |
| `k8s-manifest-generator` | kubectl often scripted via PowerShell on Windows |
| `ripgrep` | Search across PS scripts |
| `verification-before-completion` | Quality gate for PS module validation |

### Routing Keywords (Must Add to Routing Table)

After creation, the following keywords should be wired in `.claude/lib/routing/routing-table-intent-keywords.cjs`:

```
"powershell", "pwsh", "ps1", "pester", "dsc", "desired state configuration",
"powershell remoting", "winrm", "psmodule", "ps module", "psgallery",
"powershell 7", "cross-platform scripting"
```

### Catalog Entry (Must Add to skill-catalog.md)

```markdown
| `powershell-expert` | PowerShell 7+, Pester testing, DSC, remoting, module authoring | devops, developer |
```

Location: `Languages` section.

---

## 6. Compliance Issues Summary

None blocking. All findings are addressed by the required mitigations above.

---

## 7. Next Action for Task #5 (skill-creator)

The skill-creator agent for Task #5 must follow this chain:

1. Invoke `Skill({ skill: 'research-synthesis' })` first — research PowerShell 7+ best practices, Pester, DSC, module authoring, cross-platform patterns
2. Invoke `Skill({ skill: 'skill-creator' })` with artifact name `powershell-expert`
3. Save research report to `.claude/context/artifacts/research-reports/powershell-expert-research-2026-02-17.md`
4. Write SKILL.md to `.claude/skills/powershell-expert/SKILL.md` (via skill-creator only — never direct Write)
5. After creation, trigger artifact-integrator for catalog and routing integration

**Creator skill chain:**
```javascript
Skill({ skill: 'research-synthesis' });  // FIRST
Skill({ skill: 'skill-creator' });       // SECOND
Skill({ skill: 'artifact-integrator' }); // THIRD (post-creation)
```

---

*Report generated by planner agent | Task #4 | 2026-02-17*
