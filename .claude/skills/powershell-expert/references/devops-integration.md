# PowerShell DevOps Integration

## GitHub Actions with PowerShell

### Basic Workflow

```yaml
name: PowerShell CI

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  test:
    runs-on: windows-latest
    steps:
      - uses: actions/checkout@v4

      - name: Install Dependencies
        shell: pwsh
        run: |
          Set-PSRepository -Name PSGallery -InstallationPolicy Trusted
          Install-PSResource -Name Pester -Scope CurrentUser
          Install-PSResource -Name PSScriptAnalyzer -Scope CurrentUser

      - name: Run PSScriptAnalyzer
        shell: pwsh
        run: |
          $results = Invoke-ScriptAnalyzer -Path ./src -Recurse -Severity Error
          if ($results.Count -gt 0) {
            $results | Format-Table -AutoSize
            throw "PSScriptAnalyzer found $($results.Count) error(s)"
          }
          Write-Host "PSScriptAnalyzer: No errors found"

      - name: Run Pester Tests
        shell: pwsh
        run: |
          $config = New-PesterConfiguration
          $config.Run.Path = './tests'
          $config.Output.Verbosity = 'Detailed'
          $config.TestResult.Enabled = $true
          $config.TestResult.OutputPath = 'TestResults.xml'
          $config.TestResult.OutputFormat = 'NUnitXml'
          $config.Run.Exit = $true
          Invoke-Pester -Configuration $config

      - name: Publish Test Results
        uses: actions/upload-artifact@v4
        if: always()
        with:
          name: test-results
          path: TestResults.xml
```

### Cross-Platform Matrix

```yaml
jobs:
  test:
    strategy:
      matrix:
        os: [windows-latest, ubuntu-latest, macos-latest]
    runs-on: ${{ matrix.os }}
    steps:
      - uses: actions/checkout@v4
      - name: Run Tests
        shell: pwsh # 'pwsh' works on all platforms; 'powershell' is Windows-only
        run: Invoke-Pester -Path ./tests -CI
```

### Publish to PSGallery from CI

```yaml
- name: Publish Module
  if: github.ref == 'refs/heads/main'
  shell: pwsh
  env:
    PSGALLERY_API_KEY: ${{ secrets.PSGALLERY_API_KEY }}
  run: |
    Publish-PSResource -Path ./MyModule -Repository PSGallery -ApiKey $env:PSGALLERY_API_KEY
```

## Azure DevOps Pipeline

```yaml
trigger:
  branches:
    include:
      - main

pool:
  vmImage: 'windows-latest'

steps:
  - task: PowerShell@2
    displayName: 'Run Pester Tests'
    inputs:
      targetType: inline
      pwsh: true # Use pwsh (cross-platform) not powershell
      script: |
        Install-PSResource -Name Pester -Scope CurrentUser
        $config = New-PesterConfiguration
        $config.Run.Path = './tests'
        $config.TestResult.Enabled = $true
        $config.TestResult.OutputPath = '$(System.DefaultWorkingDirectory)/TestResults.xml'
        $config.TestResult.OutputFormat = 'NUnitXml'
        $config.Run.Exit = $true
        Invoke-Pester -Configuration $config

  - task: PublishTestResults@2
    displayName: 'Publish Test Results'
    condition: always()
    inputs:
      testResultsFormat: NUnit
      testResultsFiles: '**/TestResults.xml'
```

## Azure PowerShell Module

```powershell
# Install Az module (modular)
Install-PSResource -Name Az -Scope CurrentUser

# Or install only needed submodules
Install-PSResource -Name Az.Compute -Scope CurrentUser
Install-PSResource -Name Az.Storage -Scope CurrentUser

# Authenticate
Connect-AzAccount  # Interactive
Connect-AzAccount -ServicePrincipal -Credential $spCred -Tenant $tenantId  # SP

# Managed Identity (in Azure resources)
Connect-AzAccount -Identity

# Common operations
$vms = Get-AzVM -ResourceGroupName 'MyRG'
New-AzResourceGroup -Name 'MyRG' -Location 'eastus'
Get-AzStorageAccount | Where-Object { $_.Kind -eq 'StorageV2' }
```

## AWS Tools for PowerShell

```powershell
# Install modular AWS.Tools
Install-PSResource -Name AWS.Tools.Common -Scope CurrentUser
Install-PSResource -Name AWS.Tools.S3 -Scope CurrentUser
Install-PSResource -Name AWS.Tools.EC2 -Scope CurrentUser

# Configure credentials
Set-AWSCredential -AccessKey $accessKey -SecretKey $secretKey -StoreAs 'default'

# Use profiles
Set-AWSCredential -ProfileName 'production'

# Common operations
Get-S3Bucket
Get-EC2Instance | Select-Object -ExpandProperty Instances
Write-S3Object -BucketName 'my-bucket' -Key 'folder/file.txt' -File 'C:\file.txt'
```

## PowerShell in Docker

```dockerfile
# Windows container
FROM mcr.microsoft.com/powershell:7.4-windowsservercore-ltsc2022

WORKDIR /app
COPY MyModule/ ./MyModule/
COPY tests/ ./tests/

RUN pwsh -Command "Install-PSResource -Name Pester -Scope AllUsers"

CMD ["pwsh", "-Command", "Invoke-Pester -Path ./tests -CI"]
```

```dockerfile
# Linux container (cross-platform PS)
FROM mcr.microsoft.com/powershell:7.4-ubuntu-22.04

WORKDIR /app
COPY . .

RUN pwsh -Command "Install-PSResource -Name Pester -Scope AllUsers && Install-PSResource -Name PSScriptAnalyzer -Scope AllUsers"

CMD ["pwsh", "-Command", "Invoke-Pester -CI"]
```

## Environment-Specific Configuration

```powershell
# Best practice: Use environment-specific config files
$env = $env:DEPLOYMENT_ENV ?? 'development'
$configPath = Join-Path $PSScriptRoot "config.$env.json"
$config = Get-Content $configPath | ConvertFrom-Json

# Or use #Requires for environment validation
#Requires -Modules Az.Accounts
#Requires -Version 7.2
#Requires -RunAsAdministrator

# Environment detection in CI
$isCI = [bool]($env:CI -or $env:TF_BUILD -or $env:GITHUB_ACTIONS)
if ($isCI) {
    $ErrorActionPreference = 'Stop'
    $ProgressPreference = 'SilentlyContinue'  # Speeds up downloads in CI
}
```

## CI Best Practices

1. Use `pwsh` shell target (not `powershell`) for cross-platform compatibility
2. Run Pester with `-CI` flag for machine-readable output
3. Publish NUnit test results for CI dashboards
4. Run PSScriptAnalyzer as a gate before tests
5. Store API keys in CI secrets, not code
6. Use `$ProgressPreference = 'SilentlyContinue'` to speed up downloads
7. Set `$ErrorActionPreference = 'Stop'` in CI scripts to fail fast
8. Use `Install-PSResource` (PSResourceGet) not `Install-Module` (deprecated)
