<!-- Agent: artifact-integrator | Task: #1 | Session: 2026-02-17 -->

# PowerShell Expert Research Synthesis Report

**Date:** 2026-02-17
**Purpose:** Comprehensive research for creating a `powershell-expert` skill in the agent-studio framework
**Sources:** hmohamed01/powershell-expert (GitHub), PowerShell/PowerShell (official repo), Microsoft Learn documentation

---

## 1. Source Repository Analysis

### 1.1 hmohamed01/powershell-expert

**Repository structure:**

```
.gitignore
CLAUDE.md
README.md
powershell-expert.skill          (packaged skill archive)
powershell-expert/
  SKILL.md                       (main skill definition, ~500 lines)
  references/
    best-practices.md            (naming, parameters, error handling, output patterns)
    gui-development.md           (WinForms + WPF patterns, 15+ controls)
    powershellget.md             (PSResourceGet commands, PSGallery integration)
  scripts/
    Search-Gallery.ps1           (PowerShell Gallery search wrapper)
```

**What it covers well:**

- Script development templates (CmdletBinding, parameter design, begin/process/end blocks)
- Verb-Noun naming conventions with approved verbs
- Parameter validation attributes (ValidateNotNullOrEmpty, ValidateRange, ValidateSet)
- Pipeline support (ValueFromPipeline, ValueFromPipelineByPropertyName, streaming output)
- Error handling patterns (try/catch/finally, terminating vs non-terminating errors)
- GUI development (Windows Forms + WPF/XAML) with 15+ control examples
- PowerShell Gallery integration via PSResourceGet
- Module discovery and recommendation by category
- Live verification of module availability and cmdlet syntax
- Progressive disclosure architecture (compact SKILL.md with detailed references)
- Output patterns (PSCustomObject, PassThru, ShouldProcess)
- Code style guidelines (no aliases in scripts, splatting, comment-based help)

**What it is missing or undercovers:**

- PowerShell 7+ cross-platform features (runs on Windows focus primarily)
- New PS7+ operators (null-coalescing `??`, null-conditional `?.`, ternary `? :`, pipeline chain `&&`/`||`)
- Module authoring lifecycle (manifests, versioning, PSGallery publishing pipeline)
- Security hardening (execution policies, script signing, credential management, SecureString)
- Performance patterns (Measure-Command, pipeline streaming vs ForEach-Object -Parallel, runspaces)
- Pester testing framework (test-driven PowerShell development)
- PSScriptAnalyzer (static analysis, linting)
- DSC (Desired State Configuration)
- DevOps integration (CI/CD pipelines, Azure DevOps, GitHub Actions with PowerShell)
- Remote management (PSRemoting, WinRM, SSH-based remoting)
- Classes and enums (PS5+ class syntax)
- PowerShell profiles and configuration management
- Logging and structured output (Start-Transcript, logging frameworks)
- Job/runspace-based parallelism (ForEach-Object -Parallel, Start-ThreadJob)
- Cross-platform differences (Linux/macOS caveats, case sensitivity, path separators)

### 1.2 PowerShell/PowerShell (Official Repository)

**Repository:** The official open-source PowerShell runtime, MIT licensed, cross-platform (Windows/Linux/macOS).

**Key documentation areas (from /docs):**

- building/ - Build instructions for all platforms
- cmdlet-example/ - Cmdlet development examples
- community/ - Governance and community guidelines
- debugging/ - Debugging PowerShell itself
- dev-process/ - Development process documentation
- testing-guidelines/ - Testing conventions for the project
- FAQ.md - Frequently asked questions

**Key takeaways from the official project:**

- PowerShell is built on .NET CLR; all inputs/outputs are .NET objects
- Three components: command-line shell, scripting language, configuration management framework
- Cmdlet base classes: System.Management.Automation.Cmdlet (lightweight) and PSCmdlet (full runtime access)
- Input processing methods: BeginProcessing, ProcessRecord, EndProcessing, StopProcessing
- ShouldProcess for safe destructive operations (WhatIf/Confirm)
- Binary cmdlets (C#) and advanced script functions share the same pipeline semantics
- Verb-Noun naming is enforced; unapproved verbs generate import warnings

---

## 2. Core PowerShell Domains

### 2.1 Cmdlets, Pipelines, and Objects

PowerShell's fundamental paradigm is **object-based pipelines** rather than text streams.

**Key concepts:**

- Cmdlets are .NET class instances, not standalone executables
- Pipeline passes objects (not text) between commands
- `ProcessRecord()` is called once per pipeline object (record-oriented processing)
- Format-\* cmdlets control display; underlying data remains objects
- Select-Object, Where-Object, Sort-Object, Group-Object for object manipulation
- Custom objects via `[PSCustomObject]@{}` or `New-Object`
- Type adaptation via ETS (Extended Type System) and format.ps1xml
- Providers expose non-filesystem stores as drives (Registry, Cert, Env, Variable, Function)

**Best practices:**

- Return objects, not formatted text
- Use `Write-Output` for pipeline data, `Write-Host` only for user-facing display
- Avoid `Format-*` in functions that feed pipelines
- Process one record at a time in `process {}` blocks for streaming efficiency
- Use `[OutputType()]` attribute to document return types

### 2.2 PowerShell 7+ Features

PowerShell 7 (based on .NET 6+/7+/8+) introduced significant improvements:

**Operators:**

- Null-coalescing: `$x ?? 'default'`
- Null-coalescing assignment: `$x ??= 'default'`
- Null-conditional member access: `${x}?.Property`
- Ternary: `$condition ? 'true' : 'false'`
- Pipeline chain operators: `command1 && command2` (run if success), `command1 || command2` (run if failure)

**Parallelism:**

- `ForEach-Object -Parallel {}` for parallel pipeline processing
- `-ThrottleLimit` controls concurrency
- `Start-ThreadJob` for lightweight background jobs (replaces heavy Start-Job)

**Cross-platform:**

- Runs on Windows, Linux, macOS
- Path separator differences (`/` vs `\`; use `Join-Path`)
- Case sensitivity on Linux filesystems
- No Windows-specific features on Linux (WMI/CIM partial, no WinForms/WPF)
- SSH-based remoting alongside WinRM
- `$IsWindows`, `$IsLinux`, `$IsMacOS` automatic variables

**Other notable features:**

- Error view improvements (`$ErrorView = 'ConciseView'`)
- Get-Error for detailed error inspection
- Improved tab completion and prediction (PSReadLine predictive IntelliSense)
- Experimental features framework
- Ternary operator and null-coalescing reduce boilerplate
- Cleaner JSON handling (ConvertFrom-Json/ConvertTo-Json with -Depth)

### 2.3 Scripting Patterns

**Function design:**

- Always use `[CmdletBinding()]` for advanced function behavior
- Add `[Parameter(Mandatory)]` for required parameters
- Use `[ValidateNotNullOrEmpty()]` with default values instead of `Mandatory` when appropriate
- Pipeline input via `ValueFromPipeline` (by type) and `ValueFromPipelineByPropertyName`
- Begin/Process/End blocks for pipeline-aware functions
- `SupportsShouldProcess` for state-changing functions
- Prefix noun with abbreviation to avoid naming conflicts (e.g., `Get-MrPSVersion`)
- Comment-based help (.SYNOPSIS, .DESCRIPTION, .PARAMETER, .EXAMPLE, .INPUTS, .OUTPUTS)

**Script structure template:**

```powershell
#Requires -Version 7.0
#Requires -Modules @{ ModuleName='Az.Accounts'; ModuleVersion='2.0' }

<#
.SYNOPSIS
    Brief description.
.DESCRIPTION
    Detailed description.
.PARAMETER Name
    Parameter description.
.EXAMPLE
    Example-Command -Name 'Value'
#>
[CmdletBinding(SupportsShouldProcess)]
param(
    [Parameter(Mandatory, ValueFromPipeline)]
    [ValidateNotNullOrEmpty()]
    [string[]]$Name
)

begin {
    # One-time initialization
}

process {
    foreach ($Item in $Name) {
        if ($PSCmdlet.ShouldProcess($Item, 'Operation')) {
            # Perform action
            [PSCustomObject]@{
                Name   = $Item
                Status = 'Complete'
            }
        }
    }
}

end {
    # Cleanup
}
```

**Dot-sourcing vs modules:**

- Dot-sourcing (`. .\script.ps1`) loads into current scope; fragile for distribution
- Script modules (.psm1) are preferred for reusable functions
- Place in `$env:PSModulePath` for autoloading

### 2.4 Error Handling

**Error types:**

- **Terminating errors**: thrown with `throw` or by cmdlets via `-ErrorAction Stop`
- **Non-terminating errors**: reported with `Write-Error`; pipeline continues
- Default: cmdlet errors are non-terminating; must use `-ErrorAction Stop` for try/catch

**Error handling patterns:**

```powershell
try {
    Get-Item -Path 'nonexistent' -ErrorAction Stop
}
catch [System.Management.Automation.ItemNotFoundException] {
    Write-Warning "Specific: Item not found"
}
catch {
    Write-Warning "General: $($_.Exception.Message)"
}
finally {
    # Always runs (cleanup)
}
```

**Key variables and preferences:**

- `$Error` - automatic array of recent errors (most recent first)
- `$ErrorActionPreference` - session-wide default (Continue, Stop, SilentlyContinue, Inquire)
- `$_` / `$PSItem` in catch blocks - the current ErrorRecord
- `$_.Exception.Message` - human-readable error message
- `$_.Exception.GetType().FullName` - exception type for specific catching
- `$_.ScriptStackTrace` - call stack at error point

**Best practices:**

- Prefer `-ErrorAction Stop` on individual cmdlets over changing `$ErrorActionPreference`
- Use specific exception types in catch blocks
- Use `Write-Warning` for recoverable issues, `Write-Error` for non-terminating errors
- Use `throw` for terminating errors in your own functions
- Log errors with `Write-Error -ErrorRecord $_` to preserve original context
- Use `$ErrorActionPreference = 'Stop'` at function scope (resets on exit)

### 2.5 Security Patterns

**Execution policies:**

- `Restricted` - no scripts allowed (default on Windows client)
- `AllSigned` - all scripts must be digitally signed
- `RemoteSigned` - downloaded scripts must be signed; local scripts run freely
- `Unrestricted` - all scripts run (with warning for downloaded)
- `Bypass` - no restrictions (used in CI/CD)
- Set per machine, user, or process: `Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser`

**Script signing:**

```powershell
# Sign a script
$cert = Get-ChildItem -Path Cert:\CurrentUser\My -CodeSigningCert
Set-AuthenticodeSignature -FilePath .\script.ps1 -Certificate $cert

# Verify signature
Get-AuthenticodeSignature -FilePath .\script.ps1
```

**Credential management:**

```powershell
# Prompt for credentials (secure)
$cred = Get-Credential

# SecureString for passwords
$securePassword = Read-Host -AsSecureString -Prompt 'Enter password'
$securePassword = ConvertTo-SecureString 'plaintext' -AsPlainText -Force  # Only for testing

# PSCredential from components
$cred = [PSCredential]::new('username', $securePassword)

# SecretManagement module (recommended for production)
Install-PSResource -Name Microsoft.PowerShell.SecretManagement
Install-PSResource -Name Microsoft.PowerShell.SecretStore
Register-SecretVault -Name 'MyVault' -ModuleName Microsoft.PowerShell.SecretStore
Set-Secret -Name 'APIKey' -Secret 'value'
$key = Get-Secret -Name 'APIKey' -AsPlainText
```

**Security best practices:**

- Never hardcode credentials in scripts
- Use SecretManagement module for secret storage
- Prefer certificate-based authentication where possible
- Enable constrained language mode for untrusted environments
- Use JEA (Just Enough Administration) for delegated administration
- Validate all external input; avoid `Invoke-Expression` with user data
- Use `-NoProfile` when running scripts in automation to avoid profile injection

### 2.6 Performance Patterns

**Pipeline streaming:**

```powershell
# GOOD: Stream items (constant memory)
Get-Content -Path .\large.log | Where-Object { $_ -match 'ERROR' }

# BAD: Load entire file into memory
$content = Get-Content -Path .\large.log
$content | Where-Object { $_ -match 'ERROR' }
```

**Measurement:**

```powershell
Measure-Command { Get-ChildItem -Recurse C:\Windows }
```

**Performance tips:**

- Use `ForEach-Object -Parallel` for CPU-bound work (PS7+)
- Prefer .NET methods for hot paths (`[System.IO.File]::ReadAllLines()` vs `Get-Content`)
- Use `[System.Collections.Generic.List[object]]` instead of `@() +=` for array building
- Avoid `Select-Object *` when you only need specific properties
- Use `-Filter` parameter (provider-side) over `Where-Object` (client-side) when available
- `Get-CimInstance` is faster and more modern than `Get-WmiObject`
- Use runspaces for I/O-bound parallelism (network calls, disk operations)
- Avoid `Write-Host` in performance-critical code (console output is slow)
- Use `[hashtable]` for O(1) lookups instead of array contains
- Pipeline overhead exists: for tight loops, direct `foreach` statement is faster than `ForEach-Object`

### 2.7 Module Authoring

**Module structure:**

```
MyModule/
  MyModule.psd1          (module manifest)
  MyModule.psm1          (script module / root module)
  Public/                (exported functions)
    Get-Something.ps1
    Set-Something.ps1
  Private/               (internal helper functions)
    Invoke-Helper.ps1
  en-US/
    MyModule-help.xml    (MAML help)
  MyModule.Format.ps1xml (formatting rules)
```

**Manifest creation:**

```powershell
New-ModuleManifest -Path .\MyModule\MyModule.psd1 `
    -RootModule 'MyModule.psm1' `
    -ModuleVersion '1.0.0' `
    -Author 'Author Name' `
    -Description 'Module description' `
    -FunctionsToExport @('Get-Something', 'Set-Something') `
    -CmdletsToExport @() `
    -AliasesToExport @() `
    -VariablesToExport @() `
    -PowerShellVersion '7.0' `
    -Tags @('tag1', 'tag2')
```

**Exporting:**

- `FunctionsToExport` in manifest is the recommended approach
- `Export-ModuleMember` in .psm1 is the alternative (one or the other, not both)
- Explicitly list exports; avoid `'*'` wildcard for performance and security

**PSGallery publishing:**

```powershell
Publish-PSResource -Path .\MyModule -Repository PSGallery -ApiKey $apiKey
```

**Best practices:**

- Always create a module manifest (.psd1)
- Separate public and private functions into directories
- Use `New-ModuleManifest` then `Update-ModuleManifest` (never recreate; GUID must persist)
- Include `RequiredModules` for dependencies
- Semantic versioning (Major.Minor.Patch)
- Include Pester tests in a `Tests/` directory
- Use PSScriptAnalyzer for linting before publishing

### 2.8 Common Tools and Ecosystem

**PSReadLine:**

- Enhanced command-line editing experience
- Predictive IntelliSense (PS7.2+): `Set-PSReadLineOption -PredictionSource HistoryAndPlugin`
- Key bindings customization
- Syntax highlighting in terminal
- History search with Ctrl+R

**Pester (Testing Framework):**

```powershell
# Install
Install-PSResource -Name Pester

# Test file structure
Describe 'Get-Something' {
    Context 'when called with valid input' {
        It 'returns expected output' {
            $result = Get-Something -Name 'Test'
            $result | Should -Be 'Expected'
        }
    }
    Context 'when called with invalid input' {
        It 'throws an error' {
            { Get-Something -Name '' } | Should -Throw
        }
    }
}

# Run tests
Invoke-Pester -Path .\Tests\ -Output Detailed
```

**PSScriptAnalyzer (Static Analysis):**

```powershell
Install-PSResource -Name PSScriptAnalyzer
Invoke-ScriptAnalyzer -Path .\MyModule\ -Recurse -ReportSummary
```

**Other notable tools:**

- **Plaster**: Project scaffolding/templates for PowerShell modules
- **platyPS**: Generate external MAML help from markdown
- **Terminal-Icons**: File/folder icons in terminal listings
- **PSReadLine**: Command prediction and editing
- **oh-my-posh**: Cross-platform prompt theming
- **SecretManagement**: Unified secret store abstraction
- **Az module**: Azure resource management
- **AWS.Tools**: AWS resource management (modular)
- **VMware PowerCLI**: VMware infrastructure management
- **Pode**: Cross-platform web server framework for PowerShell

### 2.9 DevOps Integration

**GitHub Actions with PowerShell:**

```yaml
jobs:
  test:
    runs-on: windows-latest
    steps:
      - uses: actions/checkout@v4
      - name: Run Pester Tests
        shell: pwsh
        run: |
          Install-Module Pester -Force -SkipPublisherCheck
          Invoke-Pester -Path ./Tests -Output Detailed -CI
      - name: Run PSScriptAnalyzer
        shell: pwsh
        run: |
          Install-Module PSScriptAnalyzer -Force
          Invoke-ScriptAnalyzer -Path ./src -Recurse -ReportSummary
```

**Azure DevOps pipeline:**

```yaml
trigger: [main]
pool:
  vmImage: 'windows-latest'
steps:
  - task: PowerShell@2
    inputs:
      targetType: inline
      pwsh: true
      script: |
        Invoke-Pester -CI
```

**CI/CD patterns:**

- Use `pwsh` (cross-platform) shell target instead of `powershell` (Windows-only)
- Run Pester with `-CI` flag for CI-optimized output
- Publish test results in NUnit format
- PSScriptAnalyzer as a linting gate
- Publish to PSGallery from CI pipeline using API key stored in secrets
- Use `#Requires` statements for environment validation

**Azure PowerShell:**

- `Az` module (modular: Az.Compute, Az.Storage, Az.Network, etc.)
- `Connect-AzAccount` for authentication
- Azure Resource Manager (ARM) template deployment
- Azure Functions with PowerShell runtime

**AWS Tools for PowerShell:**

- Modular: `AWS.Tools.S3`, `AWS.Tools.EC2`, etc.
- `Set-AWSCredential` for authentication
- Compatible with PS5.1 and PS7+

---

## 3. Skill Coverage Gap Analysis

### What hmohamed01/powershell-expert covers well (retain):

| Domain                 | Coverage Level | Notes                                                |
| ---------------------- | -------------- | ---------------------------------------------------- |
| Script templates       | Excellent      | CmdletBinding, begin/process/end, comment-based help |
| Naming conventions     | Excellent      | Verb-Noun, approved verbs, PascalCase                |
| Parameter design       | Excellent      | Validation attributes, parameter sets, common params |
| Pipeline support       | Good           | ValueFromPipeline, streaming patterns                |
| Error handling basics  | Good           | Try/catch, ErrorAction, Write-Warning                |
| GUI development        | Excellent      | WinForms + WPF, 15+ controls, templates              |
| PSGallery integration  | Good           | PSResourceGet commands, search script                |
| Module recommendations | Good           | Curated list by category                             |
| Live verification      | Unique         | Validates module/cmdlet accuracy at runtime          |
| Progressive disclosure | Architectural  | Compact SKILL.md + detailed references               |

### Gaps to fill (new content needed):

| Domain                     | Priority | Notes                                              |
| -------------------------- | -------- | -------------------------------------------------- |
| PowerShell 7+ operators    | HIGH     | ??, ??=, ?., ternary, pipeline chain               |
| Cross-platform patterns    | HIGH     | Linux/macOS caveats, path handling, $Is\* vars     |
| Security hardening         | HIGH     | SecretManagement, signing, JEA, execution policy   |
| Pester testing             | HIGH     | TDD in PowerShell, Describe/Context/It, mocking    |
| PSScriptAnalyzer           | HIGH     | Static analysis, custom rules, CI integration      |
| Module authoring lifecycle | HIGH     | Manifest creation, versioning, publishing pipeline |
| Performance optimization   | MEDIUM   | Parallel, .NET methods, array building, runspaces  |
| DevOps/CI/CD integration   | MEDIUM   | GitHub Actions, Azure DevOps, pipeline patterns    |
| Remote management          | MEDIUM   | PSRemoting, WinRM, SSH remoting                    |
| Classes and enums          | MEDIUM   | PS5+ class syntax, when to use                     |
| DSC patterns               | LOW      | Desired State Configuration basics                 |
| ForEach-Object -Parallel   | MEDIUM   | PS7 parallelism patterns, ThrottleLimit            |
| Logging patterns           | LOW      | Start-Transcript, structured logging               |
| Profile management         | LOW      | $PROFILE, AllUsersAllHosts, etc.                   |

---

## 4. Recommended Skill Architecture

### Structure

```
.claude/skills/powershell-expert/
  SKILL.md                          (main definition, <500 lines)
  references/
    best-practices.md               (from hmohamed01 + expanded)
    gui-development.md              (from hmohamed01)
    powershellget.md                (from hmohamed01 + PSResourceGet updates)
    security-patterns.md            (NEW)
    testing-patterns.md             (NEW - Pester, PSScriptAnalyzer)
    module-authoring.md             (NEW - manifests, publishing, versioning)
    performance-patterns.md         (NEW - parallel, streaming, .NET methods)
    devops-integration.md           (NEW - CI/CD, Azure, AWS)
    ps7-features.md                 (NEW - cross-platform, new operators)
  scripts/
    Search-Gallery.ps1              (from hmohamed01)
  commands/
    powershell-expert.md            (command surface)
  schemas/
    input.schema.json               (optional)
    output.schema.json              (optional)
```

### SKILL.md Content Strategy

The SKILL.md should be kept under 500 lines following the progressive disclosure model from hmohamed01:

- Core templates and workflow in SKILL.md
- Detailed domain guidance in references/
- References loaded on-demand based on user request type

### Trigger Conditions

The skill should activate when users:

- Request help writing PowerShell scripts, functions, or modules
- Ask about PowerShell best practices or patterns
- Need PowerShell GUI development guidance (WinForms/WPF)
- Seek PowerShell Gallery or module management help
- Request PowerShell security hardening advice
- Need CI/CD pipeline configuration for PowerShell projects
- Ask about Pester testing or PSScriptAnalyzer
- Need cross-platform PowerShell guidance
- Request Azure/AWS PowerShell module help
- Ask about PowerShell performance optimization

### Agent Assignment Recommendations

- **developer**: Primary consumer (PowerShell is a development tool)
- **devops**: PowerShell is core to Windows/Azure automation
- **security-architect**: PowerShell security patterns, hardening
- **qa**: Pester testing integration

---

## 5. Key Design Decisions

### 5.1 Retain hmohamed01 progressive disclosure architecture

The existing SKILL.md + references/ pattern is well-designed. Keep the compact main file with detailed references loaded on demand.

### 5.2 Expand coverage to 10 domains

The original covers 4 main areas (scripting, GUI, Gallery, modules). Expand to cover security, testing, module authoring, performance, DevOps, and cross-platform patterns.

### 5.3 Maintain live verification capability

The pattern of verifying module availability and cmdlet syntax against live sources is unique and valuable. Retain this as a core feature.

### 5.4 Target PowerShell 7.x as primary

While maintaining Windows PowerShell 5.1 compatibility notes, target PowerShell 7+ as the primary version. Document cross-platform differences explicitly.

### 5.5 Include Pester and PSScriptAnalyzer as first-class patterns

Testing and linting are essential for production PowerShell. These deserve dedicated reference files and integration with the TDD workflow patterns already in the agent-studio framework.

---

## 6. Sources Consulted

| Source                            | URL                                                                                     | Content                                                     |
| --------------------------------- | --------------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| hmohamed01/powershell-expert      | https://github.com/hmohamed01/powershell-expert                                         | Full repository analysis (SKILL.md, references, scripts)    |
| PowerShell/PowerShell             | https://github.com/PowerShell/PowerShell                                                | Official repo structure, README, docs/ tree                 |
| Microsoft Learn - Overview        | https://learn.microsoft.com/en-us/powershell/scripting/overview                         | PowerShell definition, features, DSC                        |
| Microsoft Learn - PS101 Intro     | https://learn.microsoft.com/en-us/powershell/scripting/learn/ps101/00-introduction      | Learning path, best practices intro                         |
| Microsoft Learn - Cmdlet Overview | https://learn.microsoft.com/en-us/powershell/scripting/developer/cmdlet/cmdlet-overview | Cmdlet architecture, base classes, naming                   |
| Microsoft Learn - Functions       | https://learn.microsoft.com/en-us/powershell/scripting/learn/ps101/09-functions         | Advanced functions, CmdletBinding, pipeline, error handling |
| Microsoft Learn - Script Modules  | https://learn.microsoft.com/en-us/powershell/scripting/learn/ps101/10-script-modules    | Module creation, manifests, publishing                      |

---

## 7. Conclusion

The hmohamed01/powershell-expert repository provides a solid foundation for a PowerShell skill with excellent coverage of script development, GUI patterns, and Gallery integration. However, it has significant gaps in security, testing, module authoring, performance, DevOps, and cross-platform patterns that must be filled for a production-grade skill.

The recommended approach is to:

1. Adapt the existing SKILL.md structure and progressive disclosure pattern
2. Retain and enhance the three existing reference files
3. Add six new reference files covering the identified gaps
4. Register the skill with developer, devops, security-architect, and qa agents
5. Create a `/powershell` command that delegates to the skill
6. Include the Search-Gallery.ps1 helper script

This will create a comprehensive PowerShell skill covering 10 domains with appropriate depth for each.
