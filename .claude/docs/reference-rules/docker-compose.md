---
paths:
  - .claude/skills/docker-compose/**
---

# Docker Compose Rules

## Core Principles

- Use `docker compose` (V2) not obsolete `docker-compose` (V1)
- Declare all services in single compose.yml
- Use environment variables for configuration
- Named volumes for persistence
- Networks for service isolation

## Compose File Standards

- Version: omit (V2 doesn't need version field)
- Service naming: lowercase with hyphens
- Health checks on all services
- Resource limits (cpu, memory)
- Restart policies for production

## Environment Variables

- Use .env file for local development
- Never commit .env (use .env.example template)
- Override with .env.production for different environments
- Use ${VAR:-default} for defaults

## Networking Standards

- Create custom networks (not default bridge)
- Internal networks for backend services (no external access)
- Expose only necessary ports to host
- Use service names for inter-service communication

## Volume Management

- Named volumes for data persistence
- Bind mounts only for development
- Backup volumes before updates
- Use volume drivers for remote storage

## Anti-Patterns

- Using `docker-compose` V1 command
- Exposing all ports to host
- No health checks (blind restarts)
- No resource limits (container resource exhaustion)
- Hardcoded secrets in compose file

## Integration Points

- `container-expert` skill - Container best practices
- `devops` agent - Deployment orchestration
- `terraform-infra` skill - Infrastructure provisioning

## Related References

- `.claude/skills/docker-compose/SKILL.md` - Compose patterns and examples
- `.claude/skills/container-expert/SKILL.md` - Container orchestration principles
