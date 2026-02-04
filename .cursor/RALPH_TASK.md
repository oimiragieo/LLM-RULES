---
task: Comprehensive bug review and fix loop - find and fix all bugs until none remain
test_command: "npm test && npm run validate:full"
---

# Comprehensive Bug Review and Fix Loop

## Objective

Run iterative code reviews using the code-reviewer agent to find and fix all bugs in the codebase. Continue looping until no bugs are found.

## Success Criteria

1. [x] Initial code review completed - all files reviewed for bugs
2. [x] All Critical bugs identified and documented (see .claude/context/memory/issues.md)
3. [x] All Important bugs identified and documented
4. [ ] All Critical bugs fixed and verified (SHELL-SECURITY-001/002 open; require new hooks)
5. [ ] All Important bugs fixed and verified
6. [ ] Second review pass completed - verify no new bugs introduced
7. [x] All tests passing (npm test)
8. [x] All validations passing (npm run validate:full)
9. [ ] Final review confirms zero Critical bugs
10. [ ] Final review confirms zero Important bugs
11. [ ] Code reviewer reports "Ready to merge" with no Critical/Important issues

## Review Process

### Stage 1: Comprehensive Review

1. **Invoke code-reviewer agent** with comprehensive scope:
   - Review all modified files
   - Review all hooks (`.claude/hooks/**/*.cjs`)
   - Review all lib files (`.claude/lib/**/*.cjs`)
   - Review all tools (`.claude/tools/**/*.{cjs,mjs}`)
   - Review all tests (`tests/**/*.{cjs,mjs}`)

2. **Use code-reviewer skills**:
   - `checklist-generator` - Generate comprehensive quality checklist
   - `code-analyzer` - Static analysis and complexity metrics
   - `code-quality-expert` - Best practices review
   - `rule-auditor` - Coding standards compliance
   - `ripgrep` - Fast pattern search for security issues
   - `code-semantic-search` - Semantic code pattern matching

3. **Categorize findings**:
   - **Critical**: Bugs, security issues, data loss risks, broken functionality
   - **Important**: Architecture problems, missing error handling, test gaps
   - **Minor**: Code style, optimization opportunities, documentation

### Stage 2: Fix Bugs

1. **For each Critical bug**:
   - Read the file and understand the issue
   - Fix the bug following TDD principles
   - Add/update tests to verify the fix
   - Run tests to ensure fix works
   - Commit fix with clear message

2. **For each Important bug**:
   - Assess impact and priority
   - Fix following same process as Critical bugs
   - Verify fix with tests

### Stage 3: Verification Loop

1. **After fixes complete**:
   - Run full test suite: `npm test`
   - Run full validation: `npm run validate:full`
   - Run second code review pass
   - Verify no new bugs introduced
   - Verify all Critical/Important bugs resolved

2. **If bugs still found**:
   - Document new findings
   - Fix and verify again
   - Continue loop until zero bugs

## Context

### Codebase Information

- **Framework**: Agent Studio (.claude framework)
- **Language**: JavaScript (CommonJS and ES modules)
- **Test Framework**: Node.js built-in test (`node --test`)
- **Validation**: Custom validation scripts
- **Code Reviewer**: `.claude/agents/specialized/code-reviewer.md`

### Known Issues

- See `.claude/context/memory/issues.md` for currently tracked issues
- 8 OPEN issues (1 CRITICAL, 6 HIGH, 1 MEDIUM)
- Focus on fixing Critical and Important bugs first

### Review Focus Areas

1. **Security**:
   - Shell injection vulnerabilities
   - Path traversal issues
   - Input validation gaps
   - Fail-open patterns in guards

2. **Error Handling**:
   - Missing try/catch blocks
   - Silent error swallowing
   - Unhandled promise rejections
   - Incomplete error recovery

3. **Code Quality**:
   - Code duplication
   - High cyclomatic complexity
   - Missing tests
   - Poor error messages

4. **Architecture**:
   - Separation of concerns
   - Proper abstraction
   - Scalability issues
   - Integration problems

### Tools and Commands

```bash
# Run tests
npm test

# Run validations
npm run validate:full

# Run specific test suites
npm run test:unit
npm run test:framework
npm run test:integration

# Check for linting issues
npm run lint

# View current issues
cat .claude/context/memory/issues.md
```

## Guardrails

- **Always read files before editing** - Understand context first
- **Run tests after each fix** - Verify nothing broke
- **Commit frequently** - Create checkpoints for rollback
- **Focus on Critical/Important** - Don't get distracted by Minor issues
- **Verify fixes work** - Don't assume fixes are correct
- **Document decisions** - Update issues.md when bugs are fixed

## Completion Criteria

The loop is complete when:

1. ✅ Code reviewer finds **zero Critical bugs**
2. ✅ Code reviewer finds **zero Important bugs**
3. ✅ All tests passing (`npm test`)
4. ✅ All validations passing (`npm run validate:full`)
5. ✅ Code reviewer reports **"Ready to merge"** with no Critical/Important issues
6. ✅ No new bugs introduced during fixes

## Notes

- Use `code-reviewer` agent for reviews (not developer agent)
- Fix bugs using `developer` agent or directly
- Run tests after each fix to catch regressions
- Update `.claude/context/memory/issues.md` when bugs are fixed
- Commit fixes with clear messages: `fix: [bug description]`
