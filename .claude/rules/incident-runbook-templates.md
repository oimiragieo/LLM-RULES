---
paths:
  - .claude/skills/incident-runbook-templates/**
---

# Incident Runbook Templates Rules

## Core Principles

- Document procedures BEFORE incidents occur
- Step-by-step actions with clear owners
- Include diagnostic commands and expected outputs
- Escalation paths with contact information
- Regular testing and updating of runbooks

## Runbook Structure Standards

- Incident classification (severity levels P0-P4)
- Detection and triage steps
- Investigation playbook with diagnostic commands
- Mitigation procedures (rollback, hotfix, failover)
- Communication templates (status updates, postmortem)
- Post-incident checklist

## Severity Levels

- **P0 (Critical)**: Service down, data loss, security breach
- **P1 (High)**: Major feature broken, performance degradation
- **P2 (Medium)**: Minor feature broken, workaround available
- **P3 (Low)**: Cosmetic issues, no user impact
- **P4 (Informational)**: Questions, requests

## Escalation Standards

- Define escalation triggers (time-based, impact-based)
- List on-call contacts with backups
- Include vendor support contacts
- Document escalation procedures (PagerDuty, Slack, phone)

## Communication Standards

- Status page updates (frequency, messaging)
- Internal communication (Slack channels, email)
- External communication (customers, partners)
- Postmortem distribution

## Anti-Patterns

- No runbooks (ad-hoc responses)
- Outdated contact information
- Missing diagnostic commands
- No testing of procedures
- Blame-focused postmortems

## Integration Points

- `devops-troubleshooter` agent - Incident response
- `postmortem-writing` skill - Post-incident analysis
- `sentry-monitoring` skill - Error detection

## Related References

- `.claude/skills/incident-runbook-templates/SKILL.md` - Runbook creation patterns
- `.claude/skills/postmortem-writing/SKILL.md` - Postmortem writing guide
