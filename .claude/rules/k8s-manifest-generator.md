# Kubernetes Manifest Generator Rules

## Core Principles

- Generate production-ready YAML manifests
- Resource limits and requests on all pods
- Liveness and readiness probes required
- Use ConfigMaps for configuration, Secrets for sensitive data
- Labels and selectors for resource organization

## Manifest Standards

- API version: apps/v1 for Deployments, v1 for Services
- Naming: lowercase-with-hyphens
- Namespaces: always specify (never default)
- Resource quotas: define per namespace
- Pod security policies: enforce non-root, read-only filesystem

## Security Standards

- Run as non-root user (securityContext.runAsNonRoot: true)
- Read-only root filesystem where possible
- Drop all capabilities, add only required
- Network policies for pod-to-pod communication
- Secrets encrypted at rest (enable encryption in etcd)

## High Availability

- Replicas: 3+ for production workloads
- Pod disruption budgets: min 1 available
- Anti-affinity rules: spread pods across nodes/zones
- Rolling update strategy: maxUnavailable 1, maxSurge 1

## Monitoring and Observability

- Prometheus annotations for scraping
- Logging: structured JSON to stdout
- Tracing: OpenTelemetry integration
- Health endpoints: /health, /ready

## Anti-Patterns

- No resource limits (node resource exhaustion)
- Missing probes (blind restarts)
- Running as root user
- Secrets in ConfigMaps
- Single replica for critical services

## Integration Points

- `container-expert` skill - Container best practices
- `terraform-infra` skill - Infrastructure provisioning
- `devops` agent - Deployment automation

## Related References

- `.claude/skills/k8s-manifest-generator/SKILL.md` - Manifest generation patterns
- `.claude/skills/container-expert/SKILL.md` - Container security standards
