# cloud-run Rules

## Purpose

Deploy and manage containerized applications on Google Cloud Run.

## Best Practices

- Always specify --region for all gcloud run commands
- Use --allow-unauthenticated only for public services
- Set memory and CPU limits explicitly
- Use Cloud Build for production container builds
- Never store secrets in environment variables directly — use Secret Manager

## Integration Points

See SKILL.md for complete documentation.
