---
paths:
  - .claude/skills/container-expert/**
---

# Container Expert Rules

## Core Principles

- Use Docker for containerization in all environments
- Use `docker compose` (not obsolete `docker-compose` command)
- Leverage Istio service mesh for inter-service communication
- Implement Knative for serverless backend services
- Secure by default with least privilege principles

## Docker Standards

- Multi-stage builds for smaller images
- Non-root user in containers (security)
- Health checks for all services
- Volume mounts for persistence
- Environment variables for configuration (never hardcode secrets)

## Kubernetes/Helm Standards

- Resource limits and requests on all pods
- Liveness and readiness probes
- ConfigMaps for configuration
- Secrets for sensitive data (never in image layers)
- Namespaces for logical isolation

## Istio Service Mesh

- Traffic management via VirtualServices
- Security policies via PeerAuthentication
- Observability through tracing and metrics
- Circuit breakers for resilience
- Mutual TLS for inter-service encryption

## Knative Serverless

- Auto-scaling based on load (KPA or HPA)
- Scale-to-zero for cost efficiency
- Event-driven architectures
- Blue-green deployments via traffic splitting

## Anti-Patterns

- Running containers as root
- Storing secrets in images or environment variables
- No resource limits (risk of resource exhaustion)
- Missing health checks (undetected failures)
- Hardcoded service endpoints (use service discovery)

## Integration Points

- `devops` agent - Deployment and orchestration
- `security-architect` - Container security review
- `terraform-infra` skill - Infrastructure as code

## Related References

- `.claude/skills/container-expert/SKILL.md` - Container orchestration patterns
- `.claude/skills/docker-compose/SKILL.md` - Docker Compose best practices
- `.claude/skills/k8s-manifest-generator/SKILL.md` - Kubernetes manifest generation
