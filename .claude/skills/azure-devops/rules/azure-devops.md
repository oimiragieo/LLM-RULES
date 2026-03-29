# azure-devops Rules

## Purpose

Comprehensive integration with Azure DevOps including Pipelines, Boards, Repos, Artifacts, and Test Plans for CI/CD automation and work item tracking.

## Best Practices

- Use Azure CLI with azure-devops extension for CLI operations
- Store PAT in AZURE_DEVOPS_EXT_PAT environment variable
- Use service principals for long-lived automation
- Implement service connections for external integrations
- Use YAML pipeline templates for reusability
- Enable environment protection rules for production deployments

## Authentication

- Interactive: `az login` + `az devops configure --defaults`
- Service Principal: Set AZURE_CLIENT_ID, AZURE_CLIENT_SECRET, AZURE_TENANT_ID
- PAT: Set AZURE_DEVOPS_EXT_PAT environment variable

## PAT Scopes Required

- vso.work_write - Work item management
- vso.build_execute - Pipeline operations
- vso.code_write - Repository operations
- vso.packaging_write - Artifact publishing
- vso.release_execute - Release management

## Related Skills

- `devops` — General DevOps patterns and CI/CD workflows
- `atlassian-integration` — Jira/Confluence alternative
- `github-ops` — GitHub alternative for source control
- `terraform-infra` — Infrastructure as Code for Azure
