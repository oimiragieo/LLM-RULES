---
name: azure-devops
description: Azure DevOps integration covering pipelines, boards, repos, artifacts, and work item management via Azure CLI and REST API
version: 1.0.0
category: devops
tools:
  - Bash
  - WebFetch
  - Read
  - Write
---

# Azure DevOps Skill

## Overview

This skill provides comprehensive integration with Azure DevOps including Pipelines, Boards, Repos, Artifacts, and Test Plans. Use it for CI/CD automation, work item tracking, and repository management.

## Prerequisites

```bash
# Install Azure CLI
# Windows: winget install Microsoft.AzureCLI
# macOS: brew install azure-cli
# Linux: curl -sL https://aka.ms/InstallAzureCLIDeb | sudo bash

# Install Azure DevOps extension
az extension add --name azure-devops

# Verify installation
az --version
az devops --version
```

## Authentication

### Interactive Login

```bash
# Login to Azure
az login

# Set default organization and project
az devops configure --defaults organization=https://dev.azure.com/YOUR_ORG project=YOUR_PROJECT

# Verify configuration
az devops configure --list
```

### Service Principal / PAT Authentication

```bash
# Environment variable (recommended for CI)
export AZURE_DEVOPS_EXT_PAT="your-personal-access-token"

# Or use az login with service principal
az login --service-principal \
  --username "$AZURE_CLIENT_ID" \
  --password "$AZURE_CLIENT_SECRET" \
  --tenant "$AZURE_TENANT_ID"
```

### PAT Scopes Required

| Scope                 | Operations                 |
| --------------------- | -------------------------- |
| `vso.work_write`      | Create/update work items   |
| `vso.build_execute`   | Queue and manage pipelines |
| `vso.code_write`      | Read/write repositories    |
| `vso.packaging_write` | Publish artifacts          |
| `vso.release_execute` | Manage release pipelines   |

## Pipelines

### Pipeline Management

```bash
# List pipelines
az pipelines list --output table

# Run a pipeline
az pipelines run --name "CI Pipeline" --branch main

# Run with parameters
az pipelines run \
  --name "Deploy Pipeline" \
  --branch main \
  --parameters environment=staging version=1.2.3

# Get pipeline run status
az pipelines runs show --id RUN_ID

# List recent runs
az pipelines runs list --pipeline-name "CI Pipeline" --status completed --top 10 --output table

# Get pipeline logs
az pipelines runs logs download --run-id RUN_ID --output logs/
```

### Pipeline Variables

```bash
# List variables
az pipelines variable list --pipeline-name "CI Pipeline"

# Create/update variable
az pipelines variable create \
  --name DEPLOY_TARGET \
  --value production \
  --pipeline-name "CI Pipeline"

# Create secret variable
az pipelines variable create \
  --name API_SECRET \
  --value "secret-value" \
  --secret true \
  --pipeline-name "CI Pipeline"

# Delete variable
az pipelines variable delete --name DEPLOY_TARGET --pipeline-name "CI Pipeline"
```

### Pipeline YAML Reference

```yaml
# azure-pipelines.yml
trigger:
  branches:
    include:
      - main
      - feature/*
  paths:
    exclude:
      - docs/*

pr:
  branches:
    include:
      - main

pool:
  vmImage: 'ubuntu-latest'

variables:
  buildConfiguration: 'Release'
  NODE_VERSION: '20.x'

stages:
  - stage: Build
    displayName: 'Build and Test'
    jobs:
      - job: BuildJob
        steps:
          - task: NodeTool@0
            inputs:
              versionSpec: $(NODE_VERSION)

          - script: |
              npm ci
              npm run build
              npm test
            displayName: 'Install, Build, Test'

          - task: PublishTestResults@2
            inputs:
              testResultsFormat: 'JUnit'
              testResultsFiles: '**/test-results.xml'

          - task: PublishBuildArtifacts@1
            inputs:
              pathToPublish: '$(Build.ArtifactStagingDirectory)'
              artifactName: 'drop'

  - stage: Deploy
    displayName: 'Deploy to Production'
    dependsOn: Build
    condition: and(succeeded(), eq(variables['Build.SourceBranch'], 'refs/heads/main'))
    jobs:
      - deployment: DeployJob
        environment: 'production'
        strategy:
          runOnce:
            deploy:
              steps:
                - script: echo "Deploying to production"
```

### Release Pipelines

```bash
# List release definitions
az pipelines release definition list --output table

# Create release
az pipelines release create \
  --definition-name "Release Pipeline" \
  --artifact-metadata-list "build=CI Pipeline:1.2.3"

# List releases
az pipelines release list --definition-name "Release Pipeline" --output table
```

## Boards — Work Items

### Work Item Operations

```bash
# Create work item
az boards work-item create \
  --type "User Story" \
  --title "As a user, I can reset my password" \
  --description "Implement password reset flow" \
  --assigned-to "user@example.com" \
  --area "MyProject\Frontend"

# Show work item
az boards work-item show --id 123

# Update work item
az boards work-item update \
  --id 123 \
  --state "Active" \
  --assigned-to "developer@example.com"

# Delete work item
az boards work-item delete --id 123 --yes
```

### Work Item Queries

```bash
# Query work items with WIQL
az boards query \
  --wiql "SELECT [System.Id], [System.Title], [System.State] FROM WorkItems WHERE [System.TeamProject] = 'MyProject' AND [System.State] = 'Active' ORDER BY [System.CreatedDate] DESC"

# Query by iteration (sprint)
az boards query \
  --wiql "SELECT * FROM WorkItems WHERE [System.IterationPath] = 'MyProject\\Sprint 10' AND [System.WorkItemType] = 'Task'"
```

### Work Item Relations

```bash
# Add child work item
az boards work-item relation add \
  --id 100 \
  --relation-type "Child" \
  --target-id 101

# List relations
az boards work-item relation list-type
```

## Repos

### Repository Management

```bash
# List repositories
az repos list --output table

# Show repo details
az repos show --repository MyRepo

# Create repository
az repos create --name "new-service"
```

### Pull Requests

```bash
# List PRs
az repos pr list --status active --output table

# Create PR
az repos pr create \
  --title "Feature: Add authentication" \
  --description "Implements JWT auth with refresh tokens" \
  --source-branch feature/auth \
  --target-branch main \
  --reviewers "reviewer@example.com" \
  --work-items 123 456

# Show PR details
az repos pr show --id PR_ID

# Approve PR
az repos pr set-vote --id PR_ID --vote approve

# Complete (merge) PR
az repos pr update \
  --id PR_ID \
  --status completed \
  --merge-strategy merge

# Add PR comment
az repos pr policy list --id PR_ID
```

### Branch Policies

```bash
# List branch policies
az repos policy list --branch main --output table

# Enable required reviewer policy
az repos policy required-reviewer create \
  --branch main \
  --is-blocking true \
  --is-enabled true \
  --minimum-approver-count 2 \
  --repository-id REPO_ID

# Enable build validation policy
az repos policy build create \
  --branch main \
  --is-blocking true \
  --is-enabled true \
  --build-definition-id BUILD_DEF_ID \
  --repository-id REPO_ID
```

### Git Operations via REST API

```bash
# Base URL pattern
BASE_URL="https://dev.azure.com/$ORG/$PROJECT/_apis"

# Get commits
curl -u ":$AZURE_DEVOPS_EXT_PAT" \
  "$BASE_URL/git/repositories/REPO_ID/commits?api-version=7.1&searchCriteria.itemVersion.version=main&searchCriteria.\$top=10"

# Get file content
curl -u ":$AZURE_DEVOPS_EXT_PAT" \
  "$BASE_URL/git/repositories/REPO_ID/items?path=/src/app.ts&api-version=7.1"
```

## Artifacts

### Feed Management

```bash
# List feeds
az artifacts feed list --output table

# Create feed
az artifacts feed create --name my-packages

# Show feed
az artifacts feed show --name my-packages
```

### npm Package Publishing

```bash
# Authenticate for npm
az artifacts feeds authenticate --feed my-packages

# Configure .npmrc for Azure Artifacts
FEED_URL="https://pkgs.dev.azure.com/ORG/_packaging/my-packages/npm/registry/"

cat > .npmrc << EOF
registry=${FEED_URL}
always-auth=true
; ${FEED_URL}:username=PAT
; ${FEED_URL}:_password=$(echo -n "$AZURE_DEVOPS_EXT_PAT" | base64)
EOF

# Publish package
npm publish
```

### NuGet Package Publishing

```bash
# Add Azure Artifacts as NuGet source
az artifacts feeds show --name my-packages --query nugetInfo.url --output tsv

dotnet nuget add source \
  "https://pkgs.dev.azure.com/ORG/_packaging/my-packages/nuget/v3/index.json" \
  --name azure-artifacts \
  --username PAT \
  --password "$AZURE_DEVOPS_EXT_PAT"

# Push package
dotnet nuget push "*.nupkg" --source azure-artifacts
```

## MCP Server Configuration

### Setup Azure DevOps MCP Server

```json
{
  "mcpServers": {
    "azure-devops": {
      "command": "npx",
      "args": ["-y", "@tiberriver256/mcp-server-azure-devops"],
      "env": {
        "AZURE_DEVOPS_ORG_URL": "https://dev.azure.com/YOUR_ORG",
        "AZURE_DEVOPS_PAT": "your-personal-access-token",
        "AZURE_DEVOPS_DEFAULT_PROJECT": "YOUR_PROJECT"
      }
    }
  }
}
```

Add to `.claude/settings.json` under `mcpServers` for agent-studio integration.

### Available MCP Tools (after setup)

- `azure_devops_get_work_item` — Retrieve work item by ID
- `azure_devops_create_work_item` — Create new work item
- `azure_devops_update_work_item` — Update work item fields
- `azure_devops_list_work_items` — Query work items
- `azure_devops_get_pipeline` — Get pipeline definition
- `azure_devops_run_pipeline` — Trigger pipeline run
- `azure_devops_get_pipeline_run` — Get run status and logs
- `azure_devops_list_repos` — List repositories
- `azure_devops_create_pr` — Create pull request
- `azure_devops_get_pr` — Get PR details

## REST API Integration

### Direct API Calls

```bash
# Helper function for Azure DevOps REST API
ado_api() {
  local method="$1"
  local path="$2"
  local data="$3"
  local org="${AZURE_DEVOPS_ORG:-your-org}"
  local project="${AZURE_DEVOPS_PROJECT:-your-project}"

  local url="https://dev.azure.com/$org/$project/_apis/$path"

  curl -s \
    -u ":$AZURE_DEVOPS_EXT_PAT" \
    -X "$method" \
    -H "Content-Type: application/json" \
    ${data:+-d "$data"} \
    "$url"
}

# Get project info
ado_api GET "projects?api-version=7.1" | jq '.value[] | {name, state}'

# Queue build
ado_api POST "build/builds?api-version=7.1" '{
  "definition": {"id": 1},
  "sourceBranch": "refs/heads/main"
}' | jq '{id, status, buildNumber}'
```

## Cross-Service Workflows

### CI/CD with Work Item Tracking

```bash
# On pipeline trigger: automatically transition work item to "In Progress"
update_work_items_on_build_start() {
  local build_source_branch="$1"

  # Extract work item IDs from branch name (e.g., feature/AB#123-my-feature)
  local item_ids
  item_ids=$(echo "$build_source_branch" | grep -oP 'AB#\K[0-9]+')

  for item_id in $item_ids; do
    az boards work-item update \
      --id "$item_id" \
      --state "Active" \
      --discussion "Build started for $(git log -1 --format='%H %s')"
    echo "Updated work item $item_id to Active"
  done
}

# On deployment success: close work items and notify
close_work_items_on_deploy() {
  local work_item_ids=("$@")

  for item_id in "${work_item_ids[@]}"; do
    az boards work-item update \
      --id "$item_id" \
      --state "Closed" \
      --discussion "Deployed to production successfully"
  done
}
```

### Automated Sprint Reports

```bash
# Generate sprint summary
generate_sprint_report() {
  local iteration="${1:-@CurrentIteration}"

  echo "# Sprint Report: $(date +%Y-%m-%d)"
  echo ""

  # Completed stories
  echo "## Completed"
  az boards query \
    --wiql "SELECT [System.Id], [System.Title] FROM WorkItems WHERE [System.IterationPath] = '$iteration' AND [System.State] = 'Closed'" \
    --query "workItems[].fields.[\"System.Title\"]" \
    --output tsv | while read -r title; do
      echo "- $title"
    done

  # In progress
  echo ""
  echo "## In Progress"
  az boards query \
    --wiql "SELECT [System.Id], [System.Title] FROM WorkItems WHERE [System.IterationPath] = '$iteration' AND [System.State] = 'Active'" \
    --query "workItems[].fields.[\"System.Title\"]" \
    --output tsv | while read -r title; do
      echo "- $title"
    done
}
```

## Environment Variables Reference

| Variable               | Description              | Required    |
| ---------------------- | ------------------------ | ----------- |
| `AZURE_DEVOPS_EXT_PAT` | Personal Access Token    | Yes         |
| `AZURE_DEVOPS_ORG`     | Organization name        | Yes         |
| `AZURE_DEVOPS_PROJECT` | Default project          | Recommended |
| `AZURE_CLIENT_ID`      | Service principal app ID | For SP auth |
| `AZURE_CLIENT_SECRET`  | Service principal secret | For SP auth |
| `AZURE_TENANT_ID`      | Azure AD tenant ID       | For SP auth |

## Error Handling and Troubleshooting

```bash
# Check Azure CLI authentication status
az account show

# Validate DevOps extension
az devops configure --list

# Debug API calls with verbose output
az pipelines run --name "CI" --debug 2>&1 | grep -A3 "Request"

# Common errors:
# TF401019: Project not found → check --project flag
# TF20012: Invalid PAT → regenerate token with correct scopes
# VS402371: Rate limit → implement exponential backoff
```

## Best Practices

1. **Use Service Connections** — Connect Azure DevOps to external services (AWS, Docker Hub) via service connections, not raw credentials in pipelines.
2. **Environment protection rules** — Gate production deployments with required approvals in Environments.
3. **YAML pipeline templates** — Extract reusable pipeline logic to templates in a shared repository.
4. **Variable groups** — Store environment-specific variables in Library variable groups, link to Azure Key Vault for secrets.
5. **Branch policies** — Enforce code quality with required build validation and reviewer policies on protected branches.
6. **Agent pools** — Use self-hosted agents for private network access, Microsoft-hosted for clean environments.
7. **PAT rotation** — Rotate PATs every 90 days; use service principals for long-lived automation.
8. **Work item templates** — Define templates for common work item types to ensure consistent metadata capture.

## Related Skills

- `devops` — General DevOps patterns and CI/CD workflows
- `atlassian-integration` — Jira/Confluence alternative for project management
- `github-ops` — GitHub alternative for source control and CI/CD
- `terraform-infra` — Infrastructure as Code for Azure resources
