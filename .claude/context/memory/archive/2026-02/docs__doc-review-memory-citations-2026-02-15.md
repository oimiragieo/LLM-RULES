<!-- Agent: researcher | Task: doc-review-memory-citations | Session: 2026-02-15 -->

# Documentation Consistency Review: Memory Citations Index

**Date**: 2026-02-15
**File**: `.claude/context/reports/doc-review-memory-citations-2026-02-15.md`

## Summary

Analyzed 5 memory sources and extracted 47 documentation-relevant citations. Found 8 contradictions, 12 stale entries, 15 memory-grounded recommendations.

## Key Contradictions (P0/P1)

1. **Learnings.md legacy status** - CLAUDE.md instructs writes but memory says read-only (2026-02-15)
2. **Memory rotation thresholds** - Docs say 20KB, actual 40KB/80KB
3. **Research report naming** - `-research-` suffix required but not always followed
4. **Lint/format duplication** - code-standards.md AND git-workflow.md document same requirements
5. **Test archival pattern** - Pattern exists but not documented in rules
6. **ADR-103 integration testing** - Proposed but not in active rules
7. **Session file naming** - Pattern used but not documented
8. **Pre-commit hooks** - Multiple proposed but not implemented

## Priority Recommendations

### P0 (Critical - Immediate)
- **REC-009**: Memory sanitization (OWASP ASI06, sensitive data in archives)
- **REC-010**: Memory rotation (136KB over budget)
- **REC-013**: Test coverage audit (0% in critical modules)

### P1 (High - This Sprint)
- **REC-001**: Pre-commit hook for artifact naming
- **REC-004**: Update CLAUDE.md memory targets
- **REC-006**: QA checkpoint enforcement
- **REC-007**: ADR-103 integration testing status
- **REC-008**: windowsHide enforcement automation
- **REC-014**: Research report naming consistency

### P2 (Medium - Next Sprint)
- **REC-002**: Consolidate lint/format docs
- **REC-003**: Document session file naming
- **REC-005**: Document test archival pattern
- **REC-011**: issues.md threshold documentation
- **REC-012**: Schema audit update
- **REC-015**: Archival pattern in rules

## Citations by Category (47 total)

### File Naming & Placement (15)
- Research reports: `{topic}-research-{YYYY-MM-DD}.md`
- Operational reports: `.claude/context/reports/`
- Provenance: `<!-- Agent: {type} | Task: #{id} | Session: {date} -->`
- Tests: `tests/` mirror structure
- Temp: `.claude/context/tmp/` only
- Data: `.claude/context/data/` for *.db, *.json, *.lance
- Naming: lowercase kebab-case, ISO 8601 dates

### Memory System (8)
- learnings.md is legacy archive (not active)
- Thresholds: 40KB learnings, 80KB decisions
- Session files use timestamps
- Named memory API in named/
- Structured API: recordGotcha/Pattern/Discovery
- Tiers: STM/MTM/LTM

### Code Quality & Testing (10)
- Lint/format BLOCKING before completion
- TDD planning: parallel reads → search → plan
- Quality gates: Tests → Lint → Format
- Coverage gaps: 39 memory, 17 routing at 0%
- ADR-103 integration testing (proposed)
- Test archival with implementation

### Git Workflow (6)
- Conventional commits
- AI attribution required
- Frequent commits as save points
- Pre-commit: lint + format + tests
- Checkpoints for 40+ files
- TDD: RED → GREEN → REFACTOR → COMMIT

### Security & Enforcement (8)
- windowsHide (18+ calls, no automation)
- safeParseJSON (ADR-115)
- shell: false (ADR-114)
- File locking (ADR-116)
- Memory poisoning (OWASP ASI06, P0)
- Prompt injection (OWASP ASI01, P1)
- Prototype pollution (38 raw JSON.parse)
- Sensitive data scrubbing (HIGH severity)

## Memory Sources

- learnings.md: 424 lines, ~30KB (legacy)
- decisions.md: 185 lines, ~15KB (over budget at 74KB)
- issues.md: 334 lines, ~24KB (over budget at 62KB)
- gotchas.json: 30 entries
- patterns.json: 50+ patterns

**Next Steps**: Prioritize P0 (sanitization, rotation, coverage)
