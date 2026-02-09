# Sentry Monitoring Rules

## Core Principles

- Instrument all production code with error tracking
- Capture contextual data (user, environment, breadcrumbs)
- Set up alerts for critical errors
- Filter noisy errors to reduce alert fatigue
- Use performance monitoring for slow transactions

## Error Tracking Standards

- Initialize Sentry early in application startup
- Set environment (development, staging, production)
- Tag errors with release version
- Capture user context (never PII without consent)
- Include breadcrumbs for debugging context

## Performance Monitoring

- Sample rates: 100% dev, 10-20% staging, 1-10% production
- Track slow database queries
- Monitor API response times
- Set up transaction performance alerts
- Profile slow functions

## Alert Configuration

- Critical: User-impacting errors (page crashes, auth failures)
- High: Frequent errors (>10/min)
- Medium: New error patterns
- Low: Known issues with workarounds

## Security Standards

- Never log secrets or PII in error messages
- Sanitize request bodies before sending
- Use Sentry's `beforeSend` hook for data scrubbing
- Set up IP address scrubbing
- Limit breadcrumb retention

## Anti-Patterns

- Logging sensitive data in error context
- No error grouping (too many unique issues)
- Catching and ignoring errors without logging
- No release tracking (can't correlate errors to deploys)
- Over-sampling performance (cost and noise)

## Integration Points

- `devops` agent - CI/CD integration for release tracking
- `security-architect` - PII and security review
- `incident-runbook-templates` skill - Incident response

## Related References

- `.claude/skills/sentry-monitoring/SKILL.md` - Sentry integration patterns
- `.claude/skills/incident-runbook-templates/SKILL.md` - Incident response procedures
