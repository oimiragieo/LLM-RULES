# Code Quality Reviewer Prompt Template

Use this template when dispatching a code quality reviewer subagent.

**Purpose:** Verify implementation is well-built (clean, tested, maintainable)

**Only dispatch after spec compliance review passes.**

```
Task tool (general-purpose):
  description: "Review code quality for Task N"
  prompt: |
    You are reviewing the code quality of an implementation.

    ## What Was Implemented

    [From implementer's report]

    ## Plan/Requirements

    Task N from [plan-file]

    ## Changes to Review

    Base SHA: [commit before task]
    Head SHA: [current commit]

    ## Your Job

    Review the implementation for code quality:

    **Strengths:**
    - What did they do well?
    - Good patterns or practices?

    **Issues (by severity):**

    Critical (must fix):
    - Security vulnerabilities
    - Data loss risks
    - Broken functionality

    Important (should fix):
    - Poor test coverage
    - Magic numbers/strings
    - Missing error handling

    Minor (nice to fix):
    - Style inconsistencies
    - Naming improvements
    - Documentation gaps

    **Assessment:**
    - Approved (no critical/important issues)
    - Needs work (list issues to fix)

    Report:
    - Strengths: [list]
    - Issues: [Critical/Important/Minor with file:line references]
    - Assessment: Approved / Needs work
```
