# docker-compose Rules

## Purpose

Docker Compose container orchestration and management. Manage multi-container applications, services, networks, and volumes. Use for local development, testing, and orchestration of containerized applications.

## Best Practices

- Prefer compose.yaml (canonical V2 name) over docker-compose.yml
- Use `docker compose` (V2 plugin) never `docker-compose` (V1 binary)
- Verify compose.yaml exists before operations
- Use project names for isolation
- Check service status before destructive operations
- Avoid volume removal without confirmation
- Review logs before restarting failed services
- Define healthchecks on all stateful services
- Use profiles for environment-specific services
- Use watch + develop block for live development reloading

## Integration Points

See SKILL.md for complete documentation.
