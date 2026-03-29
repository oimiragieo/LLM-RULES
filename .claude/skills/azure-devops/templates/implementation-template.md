# azure-devops Implementation Template

## Goal

- Integrate with Azure Pipelines for CI/CD automation
- Integrate with Azure Boards for work item tracking
- Integrate with Azure Repos for source control
- Integrate with Azure Artifacts for package management

## TDD

1. Red - Write tests for Azure CLI commands and REST API calls
2. Green - Implement pipeline, board, repo, artifact operations
3. Refactor - Add error handling, retry logic, and cross-service workflows

## Verification

- lint
- format
- targeted tests
- Integration tests against test project

## Implementation Checklist

1. Set up Azure CLI authentication
2. Implement pipeline run and monitoring
3. Implement work item CRUD operations
4. Implement PR creation and management
5. Implement artifact publishing
6. Add cross-service workflow helpers
