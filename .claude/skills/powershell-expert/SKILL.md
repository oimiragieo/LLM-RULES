---
name: powershell-expert
description: 'PowerShell 7+ scripting and Windows system administration -- cross-platform automation, secure credential handling, Pester testing, DSC, and JEA patterns.'
version: 2.2.0
category: Languages
agents: [developer, devops]
tags: [powershell, windows, automation, scripting, pester, dsc, system-administration]
model: sonnet
invoked_by: both
user_invocable: true
tools: [Read, Write, Edit, Bash, Grep, Glob, WebSearch, WebFetch]
best_practices:
  - Prefer PowerShell 7+ syntax for cross-platform (Core) compatibility
  - Enforce strict error handling via $ErrorActionPreference = 'Stop'
  - Use structured objects (PSCustomObject) rather than parsing strings
  - Secure sensitive data using SecretManagement and SecretStore modules
  - Test all scripts with Pester 5+ before deployment
error_handling: graceful
streaming: supported
verified: true
lastVerifiedAt: '2026-03-01'
---

# PowerShell Expert Skill

<identity>
Automation Architect and Windows Internals Specialist -- expert in high-scale scripting, system orchestration, and secure administrative patterns. Specialist in PowerShell 7 Core, Desired State Configuration (DSC), Just Enough Administration (JEA), and Pester testing.
</identity>

<capabilities>
- Design and implement robust automation scripts using PowerShell 7+
- Audit scripts for security (injection, plaintext secrets, unsafe aliases)
- Optimize pipeline performance using parallelization and background jobs
- Manage complex system states across Windows, Linux, and cloud environments
- Design custom modules with structured help and unit tests (Pester)
- Orchestrate secure deployments using JEA (Just Enough Administration) patterns
- Configure Desired State Configuration (DSC) for infrastructure as code
- Build CI/CD pipelines with PowerShell-based build and deploy scripts
</capabilities>

## Overview

This skill covers PowerShell 7+ (Core) for cross-platform automation, system administration, and DevOps scripting. The core philosophy is: treat PowerShell as a typed, object-oriented automation language -- not a bash replacement. Every script must handle errors explicitly, use structured objects instead of text parsing, and never expose credentials in plaintext.

## When to Use

- When writing PowerShell automation scripts for Windows or cross-platform
- When auditing existing PowerShell scripts for security and reliability
- When setting up CI/CD pipelines with PowerShell-based tooling
- When managing Windows infrastructure with DSC or JEA
- When building PowerShell modules with proper structure and testing
- When migrating from Windows PowerShell 5.1 to PowerShell 7+

## Iron Laws

1. **ALWAYS** set `$ErrorActionPreference = 'Stop'` at the top of scripts -- silent failures are the primary cause of automation bugs and data loss.
2. **NEVER** hardcode credentials or secrets in scripts -- use `Microsoft.PowerShell.SecretManagement` module to pull secrets from vaults.
3. **ALWAYS** use `[PSCustomObject]` or `-OutputType JSON` for structured output -- text parsing with regex is fragile and breaks on locale/format changes.
4. **NEVER** use `Invoke-Expression` (IEX) on untrusted input -- it is the PowerShell equivalent of `eval()` and enables arbitrary code execution.
5. **ALWAYS** write Pester tests for production scripts -- untested automation is a liability in enterprise environments.

## Anti-Patterns

| Anti-Pattern                                                       | Why It Fails                                                            | Correct Approach                                                                            |
| ------------------------------------------------------------------ | ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| Parsing command output with regex instead of using objects         | Breaks on locale changes, format updates, and different OS versions     | Use cmdlet object output directly or convert to PSCustomObject                              |
| Using `Invoke-Expression` to build dynamic commands                | Enables code injection; any user input can execute arbitrary PowerShell | Use splatting (`@params`) for dynamic parameters; use `Start-Process` for external commands |
| Catching all exceptions with empty catch blocks                    | Silently swallows errors; automation appears to succeed when it failed  | Use typed catch blocks; log and re-throw unexpected exceptions                              |
| Using Windows PowerShell 5.1 syntax without checking compatibility | Scripts fail on Linux/macOS where PS 7 is the only option               | Use `$PSVersionTable.PSVersion` checks; prefer PS 7 cross-platform cmdlets                  |
| Storing credentials in script variables or config files            | Plaintext secrets in source control; credential theft risk              | Use `Get-Secret` from SecretManagement module; inject via environment variables in CI       |

## Workflow

### Step 1: Script Structure

```powershell
#Requires -Version 7.0
#Requires -Modules @{ ModuleName='Microsoft.PowerShell.SecretManagement'; ModuleVersion='1.1.0' }

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

function Invoke-DataBackup {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)]
        [ValidateNotNullOrEmpty()]
        [string]$TargetPath,

        [Parameter()]
        [switch]$Compress
    )

    begin {
        Write-Verbose "Starting backup to $TargetPath"
    }

    process {
        try {
            # Business logic here
        }
        catch [System.IO.IOException] {
            Write-Error "IO error during backup: $_"
            throw
        }
        catch {
            Write-Error "Unexpected error: $_"
            throw
        }
    }

    end {
        Write-Verbose "Backup complete"
    }
}
```

### Step 2: Secure Secret Retrieval

```powershell
# Register a vault (one-time setup)
Register-SecretVault -Name 'AzureKeyVault' -ModuleName 'Az.KeyVault'

# Retrieve secret at runtime
$apiKey = Get-Secret -Name 'MyApiKey' -Vault 'AzureKeyVault' -AsPlainText

# Use in automation (never log the value)
$headers = @{ 'Authorization' = "Bearer $apiKey" }
Invoke-RestMethod -Uri $endpoint -Headers $headers
```

### Step 3: Object-Oriented Pipeline

```powershell
# Process structured data through the pipeline
Get-ChildItem -Path $target -Filter *.json |
    ForEach-Object {
        $data = Get-Content -Path $_.FullName | ConvertFrom-Json
        [PSCustomObject]@{
            FileName  = $_.Name
            ItemCount = $data.items.Count
            LastModified = $_.LastWriteTime
        }
    } |
    Sort-Object -Property ItemCount -Descending |
    Export-Csv -Path 'report.csv' -NoTypeInformation
```

### Step 4: Pester Testing

```powershell
# Invoke-DataBackup.Tests.ps1
Describe 'Invoke-DataBackup' {
    BeforeAll {
        . $PSScriptRoot/Invoke-DataBackup.ps1
    }

    Context 'When target path exists' {
        It 'Should create backup file' {
            $result = Invoke-DataBackup -TargetPath $TestDrive
            $result | Should -Not -BeNullOrEmpty
            Test-Path "$TestDrive/backup.zip" | Should -BeTrue
        }
    }

    Context 'When target path is invalid' {
        It 'Should throw IO exception' {
            { Invoke-DataBackup -TargetPath '/nonexistent/path' } |
                Should -Throw -ExceptionType ([System.IO.IOException])
        }
    }
}
```

### Step 5: Cross-Platform Compatibility

```powershell
# Use Join-Path for all path operations
$configPath = Join-Path -Path $HOME -ChildPath '.config' -AdditionalChildPath 'myapp', 'settings.json'

# Check platform before using platform-specific features
if ($IsWindows) {
    # Windows-specific: registry, WMI, COM
    $os = Get-CimInstance -ClassName Win32_OperatingSystem
} elseif ($IsLinux -or $IsMacOS) {
    # Unix-specific: /proc, systemctl
    $os = uname -a
}
```

## Complementary Skills

| Skill             | Relationship                                           |
| ----------------- | ------------------------------------------------------ |
| `devops`          | CI/CD pipeline integration with PowerShell scripts     |
| `docker-compose`  | Containerized PowerShell automation                    |
| `terraform-infra` | Infrastructure provisioning alongside PS configuration |
| `tdd`             | Test-driven development methodology for Pester tests   |

## Memory Protocol (MANDATORY)

**Before starting:**

Read `.claude/context/memory/learnings.md` for prior PowerShell modules, Pester testing patterns, or OS-specific workarounds.

**After completing:** Record new PowerShell modules, Pester testing patterns, or OS-specific workarounds to `.claude/context/memory/learnings.md`.

> ASSUME INTERRUPTION: Your context may reset. If it's not in memory, it didn't happen.
