# Azure DevOps Research Requirements (2026)

## Verified Tech Stack

- **CLI**: Azure CLI with azure-devops extension
- **API**: Azure DevOps REST API v7.1
- **Authentication**: PAT or Service Principal

## Authentication Setup

### Azure CLI Setup

```bash
# Install Azure CLI
# Windows: winget install Microsoft.AzureCLI
# macOS: brew install azure-cli

# Install DevOps extension
az extension add --name azure-devops

# Configure defaults
az devops configure --defaults organization=https://dev.azure.com/YOUR_ORG project=YOUR_PROJECT
```

### PAT Authentication

```bash
export AZURE_DEVOPS_EXT_PAT="your-personal-access-token"
```

## Key Commands

### Pipelines

```bash
az pipelines list
az pipelines run --name "CI Pipeline" --branch main
az pipelines runs show --id RUN_ID
```

### Boards

```bash
az boards work-item create --type "User Story" --title "Title"
az boards work-item update --id 123 --state "Active"
az boards query --wiql "SELECT * FROM WorkItems WHERE..."
```

### Repos

```bash
az repos list
az repos pr create --title "Feature" --source-branch feature/x
az repos pr set-vote --id PR_ID --vote approve
```

## REST API Pattern

```bash
BASE_URL="https://dev.azure.com/$ORG/$PROJECT/_apis"

curl -u ":$AZURE_DEVOPS_EXT_PAT" \
  "$BASE_URL/build/builds?api-version=7.1"
```

## MCP Server Configuration

```json
{
  "mcpServers": {
    "azure-devops": {
      "command": "npx",
      "args": ["-y", "@tiberriver256/mcp-server-azure-devops"],
      "env": {
        "AZURE_DEVOPS_ORG_URL": "https://dev.azure.com/YOUR_ORG",
        "AZURE_DEVOPS_PAT": "your-pat",
        "AZURE_DEVOPS_DEFAULT_PROJECT": "YOUR_PROJECT"
      }
    }
  }
}
```

## Source References

- [Azure DevOps REST API](https://learn.microsoft.com/en-us/rest/api/azure/devops/)
- [Azure DevOps CLI Reference](https://learn.microsoft.com/en-us/cli/azure/devops)
