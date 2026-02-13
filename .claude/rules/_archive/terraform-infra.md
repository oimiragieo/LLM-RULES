---
paths:
  - .claude/skills/terraform-infra/**
---

# Terraform Infrastructure Rules

## Core Principles

- Infrastructure as Code (IaC) for all cloud resources
- Version control all Terraform configurations
- Use modules for reusability
- Remote state storage (S3, Azure Blob, GCS)
- State locking to prevent concurrent modifications

## Terraform Standards

- DRY: Use modules, locals, and variables
- Naming: Consistent resource naming with prefixes
- Tagging: Tag all resources with environment, owner, cost-center
- Backend: Remote backend with encryption
- Workspaces: Use workspaces for multi-environment

## Security Standards

- Secrets via secret managers (AWS Secrets Manager, Azure Key Vault, HashiCorp Vault)
- Never commit secrets to VCS
- IAM least privilege for Terraform execution
- Encrypted state files
- Sensitive variables marked with `sensitive = true`

## Best Practices

- Plan before apply (`terraform plan` review)
- Import existing resources before managing
- Use `terraform fmt` for consistent formatting
- Validate with `terraform validate`
- Pin provider versions for reproducibility

## Anti-Patterns

- Hardcoded credentials in .tf files
- No state locking (concurrent execution risk)
- Untagged resources (cost tracking impossible)
- No modules (code duplication)
- Direct state file editing (corruption risk)

## Integration Points

- `devops` agent - CI/CD integration
- `security-architect` - IAM and secrets review
- `container-expert` skill - Container infrastructure

## Related References

- `.claude/skills/terraform-infra/SKILL.md` - Terraform patterns and best practices
