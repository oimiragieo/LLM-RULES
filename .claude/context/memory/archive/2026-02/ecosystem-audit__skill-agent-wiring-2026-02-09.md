<!-- Agent: developer | Task: #15 | Session: 2026-02-09 -->

# Skill-Agent Wiring Report

**Generated:** 2026-02-09
**Task:** Map new/expanded skills to agents and identify orphans

## New Skill Assignments

### Trail of Bits P0 Security Skills (5 new skills)

| Skill                  | Assigned Agents                                       | Rationale                                                 |
| ---------------------- | ----------------------------------------------------- | --------------------------------------------------------- |
| `static-analysis`      | security-architect, code-reviewer, penetration-tester | Core security analysis skill for vulnerability detection  |
| `variant-analysis`     | security-architect, code-reviewer, penetration-tester | Pattern-based vulnerability discovery across codebase     |
| `differential-review`  | security-architect, code-reviewer                     | Security-focused code diff analysis for PRs               |
| `semgrep-rule-creator` | security-architect, devops                            | Custom security rule creation for project-specific checks |
| `insecure-defaults`    | security-architect, code-reviewer, devops             | Detect hardcoded credentials and misconfigurations        |

**Assignment Logic:**

- **security-architect**: All 5 skills (primary security agent)
- **code-reviewer**: 4 skills (excludes semgrep-rule-creator, focuses on review)
- **penetration-tester**: 2 skills (static-analysis + variant-analysis for testing)
- **devops**: 2 skills (semgrep-rule-creator + insecure-defaults for deployment security)

## Registry Update

**File:** `.claude/context/agent-registry.json`

**Changes:**

- Added 5 new skills to `triggerPhrases` arrays
- Added 5 new skills to `skills` arrays
- Updated `metadata.updatedAt` for 4 agents
- Updated registry `generatedAt` timestamp

## Orphaned Skills Analysis

### Identified Orphans (Skills not assigned to any agent)

Based on comparison between filesystem (96 skills) and registry assignments (184 entries including non-skill phrases):

**High Priority Orphans** (domain-specific experts - should be assigned):

1. `database-architect` - Should be assigned to architect, database-architect agent
2. `frontend-expert` - Should be assigned to frontend-pro
3. `python-backend-expert` - Should be assigned to python-pro
4. `typescript-expert` - Should be assigned to typescript-pro, developer
5. `nodejs-expert` - Should be assigned to nodejs-pro
6. `react-expert` - Should be assigned to frontend-pro
7. `java-expert` - Should be assigned to java-pro
8. `go-expert` - Should be assigned to go-pro
9. `graphql-expert` - Should be assigned to api-designer
10. `web3-expert` - Should be assigned to web3-dev

**Medium Priority Orphans** (operational skills - should be assigned):

11. `terraform-infra` - Should be assigned to devops
12. `k8s-manifest-generator` - Should be assigned to devops
13. `docker-compose` - Should be assigned to devops
14. `test-generator` - Should be assigned to qa, developer
15. `template-creator` - Should be assigned to general-purpose (creator skill)
16. `schema-creator` - Should be assigned to general-purpose (creator skill)
17. `workflow-creator` - Should be assigned to general-purpose (creator skill)
18. `prd-generator` - Should be assigned to pm
19. `project-onboarding` - Should be assigned to general-purpose

**Low Priority Orphans** (specialized skills - assign as needed):

20. `protocol-reverse-engineering` - Should be assigned to reverse-engineer
21. `scientific-skills` - Should be assigned to researcher
22. `sparc-methodology` - Should be assigned to architect, planner
23. `planning-with-files` - Should be assigned to planner
24. `interactive-requirements-gathering` - Should be assigned to pm
25. `text-to-sql` - Should be assigned to database-architect
26. `thinking-tools` - Should be assigned to all agents (meta-skill)
27. `sentry-monitoring` - Should be assigned to devops, sre-engineer
28. `tauri-native-api-integration` - Should be assigned to desktop-dev (if exists)
29. `svelte-expert` - Should be assigned to frontend-pro
30. `php-expert` - Should be assigned to php-dev (if exists)

**Ignore (Organizational):**

- `creators` - Directory, not a skill
- `integration` - Directory, not a skill
- `readme` - Not a standardized skill

## Recommendations

### Immediate Actions (Priority 1)

1. **Assign domain expert skills** (database-architect, frontend-expert, python-backend-expert, etc.) to corresponding agents
   - These are domain-specific knowledge bases that agents need
   - Run: `node .claude/tools/integrations/assign-orphan-skills.mjs --priority=high`

2. **Assign creator skills** (template-creator, schema-creator, workflow-creator) to general-purpose agent
   - Required for artifact creation workflows
   - Run: `node .claude/tools/integrations/assign-creator-skills.mjs`

3. **Verify new Trail of Bits assignments** by spawning agents and invoking new skills:
   - Spawn security-architect and invoke static-analysis
   - Spawn code-reviewer and invoke variant-analysis
   - Spawn penetration-tester and invoke differential-review

### Follow-Up Actions (Priority 2)

4. **Create missing agents** for orphaned expert skills:
   - `php-dev` agent for `php-expert` skill
   - `desktop-dev` agent for `tauri-native-api-integration` skill
   - `reverse-engineer` agent for `protocol-reverse-engineering` skill

5. **Document skill assignment policy** in `.claude/docs/SKILL_ASSIGNMENT_POLICY.md`:
   - Domain experts get corresponding domain skills
   - Core agents get cross-cutting skills (tdd, debugging, verification)
   - Operational agents get infrastructure skills
   - Creator agents get creator skills

### Validation (Priority 3)

6. **Run skill discovery audit**:

   ```bash
   node .claude/tools/analysis/skill-discovery-audit.mjs
   ```

   - Checks every skill has at least one agent assignment
   - Checks every agent skills array matches triggerPhrases
   - Reports inconsistencies

7. **Test skill invocation** for newly assigned skills:
   - Spawn each agent type (security-architect, code-reviewer, penetration-tester, devops)
   - Invoke new skills (static-analysis, variant-analysis, etc.)
   - Verify skills load and execute correctly

## Statistics

- **Total skills in filesystem**: 96 (excluding \_archive)
- **Trail of Bits skills added**: 5
- **Agents updated**: 4 (security-architect, code-reviewer, penetration-tester, devops)
- **Orphaned skills identified**: 30
- **High priority orphans**: 10
- **Medium priority orphans**: 9
- **Low priority orphans**: 11

## Integration Status

- [x] New skills assigned to agents in registry
- [x] Registry metadata updated
- [ ] Orphan skills assigned (follow-up task)
- [ ] Agent frontmatter updated (automated via registry sync)
- [ ] Skill catalog verified (automated)
- [ ] Assignment policy documented

## Next Steps

1. **Immediate**: Verify new Trail of Bits assignments work via agent spawning
2. **Short-term**: Assign high-priority orphan skills (domain experts)
3. **Medium-term**: Create missing agents for orphaned specialized skills
4. **Long-term**: Document and enforce skill assignment policy

## Related Files

- `.claude/context/agent-registry.json` - Updated with new assignments
- `.claude/skills/static-analysis/SKILL.md` - New Trail of Bits skill
- `.claude/skills/variant-analysis/SKILL.md` - New Trail of Bits skill
- `.claude/skills/differential-review/SKILL.md` - New Trail of Bits skill
- `.claude/skills/semgrep-rule-creator/SKILL.md` - New Trail of Bits skill
- `.claude/skills/insecure-defaults/SKILL.md` - New Trail of Bits skill

## Lessons Learned

1. **Orphan detection is crucial**: 30 skills had no agent assignments (31% orphan rate)
2. **Registry-first approach**: Updating registry before agent files ensures consistency
3. **Automation needed**: Manual orphan detection is error-prone, need audit script
4. **Assignment policy missing**: No documented policy for which skills go to which agents
