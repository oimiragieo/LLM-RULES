# Summarize Changes Rules

## Core Principles

- Always summarize after non-trivial coding tasks
- Focus on "what" and "why", not just listing files
- Include verification steps for reviewers
- Note breaking changes or migration needs
- Keep summaries concise but complete
- Use conventional commit format for consistency

## When to Use

Use summarize-changes:
- After completing any non-trivial coding task
- Before committing changes
- When preparing PR descriptions
- After thinking-tools confirms completion

## Standards

### Summary Structure

Use this template:

```markdown
## Changes Summary

### Overview
[1-2 sentence high-level description]

### Changes Made

#### New Files
| File | Purpose |
|------|---------|
| `path/file.ts` | What this file does |

#### Modified Files
| File | Changes |
|------|---------|
| `path/existing.ts` | What changed and why |

#### Deleted Files
| File | Reason |
|------|--------|
| `path/old.ts` | Why removed |

### Technical Details

**Key Implementation Decisions**:
- Decision 1 and rationale
- Decision 2 and rationale

**Dependencies Added/Removed**:
- Added: `package@version` - reason
- Removed: `old-package` - reason

### Breaking Changes
[List breaking changes or "None"]

### Migration Required
[Steps to adopt changes or "None"]

### Verification Checklist
- [ ] Unit tests pass
- [ ] Integration tests pass
- [ ] Manual testing performed
- [ ] Documentation updated
- [ ] No console errors
- [ ] Performance acceptable

### Related Issues/Tasks
- Fixes #123
- Related to #456
```

### Conventional Commit Format

```
<type>(<scope>): <description>

<body - what and why>

<footer - breaking changes, issues>
```

**Types**:
- `feat`: New feature
- `fix`: Bug fix
- `refactor`: Code restructuring
- `docs`: Documentation only
- `test`: Adding tests
- `chore`: Maintenance tasks

**Example**:
```
fix(auth): resolve login timeout error

Increased timeout from 5s to 30s for login requests.
Previous timeout was insufficient for slow connections.

Fixes #123
```

## Anti-Patterns

| Pattern | Problem | Fix |
|---------|---------|-----|
| Just list files | No context | Explain what and why |
| Vague descriptions | "Fixed bug" | Specific: "Fixed race condition in auth flow" |
| No verification | Can't confirm quality | Add checklist |
| Missing "why" | Unclear motivation | Document rationale |
| No breaking changes | Surprises users | Explicit breaking changes section |
| Generic commit | "Updates" | Use conventional commits |

## Integration Points

**Related Skills**:
- `thinking-tools` - Use before summarizing to validate completion
- `git-expert` - For commit and PR workflows
- `verification-before-completion` - Evidence-based completion gates

**Related Agents**:
- `developer` - Creates summaries after implementation
- `code-reviewer` - Reviews summaries in PRs
- `technical-writer` - Uses for documentation updates

**Related Workflows**:
- TDD workflow - Summarize after red-green-refactor cycle
- Feature workflow - Summarize after each phase

## Summary Workflow

### Step 1: Gather Change Information

```bash
# If using git
git status
git diff --stat
```

Identify:
1. **Modified Files**: All changed files
2. **Change Types**: New, modified, deleted, renamed
3. **Scope**: Affected components/modules

### Step 2: Analyze Change Impact

For each significant change:
1. **What Changed**: Specific modification
2. **Why Changed**: Reason/motivation
3. **Impact**: What this affects (functionality, performance, API)

### Step 3: Generate Summary

Use template above with:
- Clear overview
- Organized file listing
- Technical decisions documented
- Breaking changes highlighted
- Verification checklist

### Step 4: Create Commit Message

Follow conventional commits:
```
type(scope): brief description

Longer explanation of what and why.
How it fixes the problem or adds value.

BREAKING CHANGE: description if applicable
Fixes #issue-number
```

## Example Summaries

### Bug Fix Example

```markdown
## Changes Summary

### Overview
Fixed search timeout error for users on slow connections.

### Changes Made

#### Modified Files
| File | Changes |
|------|---------|
| `src/api/search.ts` | Increased timeout from 5s to 30s |
| `src/api/search.test.ts` | Added timeout handling test |

### Technical Details

**Key Implementation Decisions**:
- 30s timeout covers 99th percentile of actual search times
- Added retry logic with exponential backoff for transient failures

### Breaking Changes
None

### Verification Checklist
- [x] Unit tests pass
- [x] Integration tests pass
- [x] Manual testing performed
- [x] No console errors

### Commit Message
```
fix(search): increase timeout for slow connections

Increased search API timeout from 5s to 30s and added retry logic.
Users on slow connections were experiencing frequent timeout errors.

Fixes #456
```
```

### Feature Example

```markdown
## Changes Summary

### Overview
Added user email validation with real-time feedback on registration form.

### Changes Made

#### New Files
| File | Purpose |
|------|---------|
| `src/utils/emailValidator.ts` | Email validation utilities |
| `src/utils/emailValidator.test.ts` | Validation tests |

#### Modified Files
| File | Changes |
|------|---------|
| `src/components/RegistrationForm.tsx` | Added validation to email field |
| `src/i18n/en.json` | Added error messages |

### Technical Details

**Key Implementation Decisions**:
- Used RFC 5322 compliant regex
- Validation runs on blur (avoid interrupting typing)
- Debounced validation (300ms) for performance

### Breaking Changes
None - additive change only

### Verification Checklist
- [x] Unit tests pass (15 test cases)
- [x] Integration tests pass
- [x] Manual testing performed
- [x] Works with screen readers (a11y tested)

### Commit Message
```
feat(registration): add email validation with real-time feedback

Added RFC 5322 compliant email validation to registration form.
Validation runs on blur with debouncing for smooth UX.

Closes #789
```
```

## Memory Protocol (MANDATORY)

**Before starting:**
Read `.claude/context/memory/learnings.md`

**After completing:**

- New pattern → `.claude/context/memory/learnings.md`
- Issue found → `.claude/context/memory/issues.md`
- Decision made → `.claude/context/memory/decisions.md`

> ASSUME INTERRUPTION: If it's not in memory, it didn't happen.
