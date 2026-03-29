# Cloud Run Research Requirements (2026)

## Verified Tech Stack

- **Platform**: Google Cloud Run (serverless containers)
- **CLI**: gcloud run commands
- **Build**: Cloud Build or Docker

## Deployment Patterns

### Service Configuration

- Memory limits: 256Mi - 32Gi
- CPU allocation: 1 - 8 vCPUs
- Concurrency: 1 - 1000 requests per container
- Min instances: 0 (scale to zero) to N
- Max instances: default 100, configurable

### Traffic Management

- Revision-based traffic splitting
- Gradual rollout support
- Rollback to previous revisions

### Security

- IAM-based authentication
- Service account configuration
- Secret Manager integration
- VPC connector for private access

## Source References

- [Cloud Run Documentation](https://cloud.google.com/run/docs)
- [Cloud Run MCP](https://github.com/GoogleCloudPlatform/cloud-run-mcp)
