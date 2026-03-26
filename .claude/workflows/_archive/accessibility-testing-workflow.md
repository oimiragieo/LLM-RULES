---
name: accessibility-testing-workflow
description: WCAG 2.2 Level AA validation workflow combining automated and manual accessibility testing.
triggers:
  - accessibility audit
  - compliance review
  - pre-release quality gate
agents:
  - accessibility-tester
---

# Accessibility Testing Workflow

## Phase 1: Scope and Standard

1. Define target pages/components and user journeys.
2. Set conformance target (default WCAG 2.2 AA).
3. Record known constraints and assistive technologies in scope.

## Phase 2: Automated Scanning

1. Run axe/lighthouse/pa11y scans.
2. Group findings by severity and WCAG criterion.
3. Remove duplicates and false positives.

## Phase 3: Manual Verification

1. Keyboard-only navigation audit.
2. Screen-reader checks (NVDA/JAWS/VoiceOver as applicable).
3. Form, focus, error-state, and dynamic-content verification.

## Phase 4: Remediation Plan

1. Produce prioritized issue list (blocking, high, medium, low).
2. Map each issue to owner, file, and fix strategy.
3. Add regression tests/checks for recurring classes of issues.

## Phase 5: Re-test and Gate

1. Re-run automated scans after fixes.
2. Re-run targeted manual checks for changed flows.
3. Mark pass/fail with evidence and residual risks.

## Outputs

- Report: `.claude/context/reports/accessibility/<name>-<date>.md`
- Artifacts: `.claude/context/artifacts/accessibility/`
- Follow-up tasks linked to code owners
