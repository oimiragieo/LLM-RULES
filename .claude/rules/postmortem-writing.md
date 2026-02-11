---
paths:
  - .claude/skills/postmortem-writing/**
---

# Postmortem Writing Rules

## Core Principles

- Blameless culture: focus on systems, not people
- Root cause analysis using Five Whys or Ishikawa
- Action items with owners and deadlines
- Share learnings across organization
- Write within 48 hours of incident resolution

## Postmortem Structure Standards

- Executive summary (2-3 sentences)
- Incident details (start time, duration, severity, impact)
- Timeline of events with timestamps
- Root cause analysis (technical and process causes)
- What went well (successes to replicate)
- What went poorly (failures to fix)
- Action items (preventive, detective, corrective)
- Lessons learned

## Root Cause Analysis Standards

- Five Whys: Ask "why" 5 times to reach root cause
- Ishikawa (Fishbone) diagram for complex incidents
- Distinguish between proximate cause (immediate) and root cause (systemic)
- Avoid "human error" as root cause (dig deeper)

## Action Items Standards

- SMART format (Specific, Measurable, Achievable, Relevant, Time-bound)
- Owner assigned with backup
- Priority level (P0-P4)
- Type: Prevent (stop recurrence), Detect (catch earlier), Correct (fix immediate)
- Tracking ticket linked

## Communication Standards

- Blameless language (avoid "should have", "failed to")
- Technical depth appropriate for audience
- Include metrics (MTTR, MTTD, customer impact)
- Positive framing (learnings, not failures)

## Anti-Patterns

- Blame individuals instead of systems
- Vague action items ("improve monitoring")
- No follow-up on action items
- Written too late (details forgotten)
- Skipping "what went well"

## Integration Points

- `incident-runbook-templates` skill - Incident response procedures
- `devops-troubleshooter` agent - Incident resolution
- `sentry-monitoring` skill - Error tracking data

## Related References

- `.claude/skills/postmortem-writing/SKILL.md` - Postmortem templates and patterns
- `.claude/skills/incident-runbook-templates/SKILL.md` - Incident response procedures
