# PowerShell Best Practices

## Naming Conventions

### Cmdlet Naming (Verb-Noun)

- Use approved verbs: `Get-Verb` lists all approved verbs
- Use singular nouns: `Get-Item` not `Get-Items`
- Prefix module nouns to avoid conflicts: `Get-MrVersion` (module prefix "Mr")
- PascalCase for both verb and noun: `Invoke-WebRequest`

### Variables and Parameters

- PascalCase for parameter names: `$ComputerName`, `$OutputPath`
- camelCase acceptable for local variables: `$currentIndex`
- Descriptive names: `$serverList` not `$sl`
- Avoid single-letter variables except loop iterators

### Files and Modules

- Module file: `ModuleName.psm1`
- Manifest file: `ModuleName.psd1`
- Script files: `Verb-Noun.ps1`
- Test files: `Verb-Noun.Tests.ps1`

## Function Design

### Always Use CmdletBinding

```powershell
[CmdletBinding(SupportsShouldProcess)]
param(...)
```

This gives you: `-Verbose`, `-Debug`, `-ErrorAction`, `-WhatIf`, `-Confirm` for free.

### Parameter Validation Attributes

```powershell
[ValidateNotNullOrEmpty()]       # Not null or empty string
[ValidateNotNull()]              # Not null (allows empty string)
[ValidateRange(1, 100)]         # Numeric range
[ValidateSet('A', 'B', 'C')]    # Enumerated values
[ValidateLength(1, 255)]        # String length
[ValidatePattern('^[a-z]+$')]   # Regex pattern
[ValidateScript({ $_ -gt 0 })]  # Custom script validation
```

### Pipeline Support

```powershell
param(
    [Parameter(Mandatory, ValueFromPipeline, ValueFromPipelineByPropertyName)]
    [string[]]$Name
)

process {
    foreach ($Item in $Name) {
        # Process one at a time for streaming
    }
}
```

### ShouldProcess for Destructive Operations

```powershell
[CmdletBinding(SupportsShouldProcess, ConfirmImpact = 'High')]
param(...)

process {
    if ($PSCmdlet.ShouldProcess($target, 'Delete')) {
        Remove-Item $target
    }
}
```

### OutputType Attribute

```powershell
[OutputType([PSCustomObject])]
[OutputType([System.IO.FileInfo])]
```

## Comment-Based Help

Always include comment-based help for public functions:

```powershell
<#
.SYNOPSIS
    One-line description.
.DESCRIPTION
    Detailed description. Can be multi-line.
.PARAMETER ComputerName
    Description of ComputerName parameter.
.PARAMETER Credential
    Description of Credential parameter.
.EXAMPLE
    Get-Something -ComputerName 'server1'
    Example description.
.EXAMPLE
    'server1', 'server2' | Get-Something
    Pipeline example.
.INPUTS
    System.String
.OUTPUTS
    PSCustomObject with Name, Status, Data properties.
.NOTES
    Author: Your Name
    Version: 1.0
.LINK
    https://docs.example.com/Get-Something
#>
```

## Code Style

### No Aliases in Scripts

```powershell
# BAD (aliases - break on other systems/profiles)
ls | ? { $_.Name -match '*.ps1' } | % { $_.FullName }

# GOOD (full cmdlet names)
Get-ChildItem | Where-Object { $_.Name -match '*.ps1' } | ForEach-Object { $_.FullName }
```

### Splatting for Long Commands

```powershell
# BAD (long line, hard to read)
Invoke-Command -ComputerName $server -Credential $cred -ScriptBlock $sb -ErrorAction Stop

# GOOD (splatting)
$invokeParams = @{
    ComputerName = $server
    Credential   = $cred
    ScriptBlock  = $sb
    ErrorAction  = 'Stop'
}
Invoke-Command @invokeParams
```

### Output Objects, Not Text

```powershell
# BAD: Returns text
"Server: $name, Status: $status"

# GOOD: Returns structured objects
[PSCustomObject]@{
    Server = $name
    Status = $status
}
```

### Write-Output vs Write-Host

- `Write-Output` — sends to pipeline (use for data)
- `Write-Host` — directly to console, bypasses pipeline (use only for display)
- `Write-Verbose` — informational messages with -Verbose
- `Write-Warning` — warnings (non-terminating issues)
- `Write-Error` — non-terminating errors
- `throw` — terminating errors

### Avoid Format-\* in Functions

```powershell
# BAD: Format-Table breaks pipeline
function Get-Data {
    Get-Process | Format-Table  # Can't pipe this output
}

# GOOD: Return objects, let caller format
function Get-Data {
    Get-Process  # Caller can pipe to Format-Table, Select-Object, etc.
}
```

## Error Handling Best Practices

1. Use specific exception types in catch blocks
2. Use `-ErrorAction Stop` on individual cmdlets rather than `$ErrorActionPreference`
3. Always re-throw if you can't handle the error: `throw`
4. Log errors with context: `Write-Error -ErrorRecord $_`
5. Use `finally` for cleanup that must always run

## Compatibility Notes (5.1 vs 7+)

| Feature                       | PS 5.1          | PS 7+               |
| ----------------------------- | --------------- | ------------------- |
| `??` null-coalescing          | No              | Yes                 |
| `?.` null-conditional         | No              | Yes                 |
| Ternary `? :`                 | No              | Yes                 |
| `&&` / `\|\|` pipeline chains | No              | Yes                 |
| `ForEach-Object -Parallel`    | No              | Yes                 |
| `Start-ThreadJob`             | Module required | Built-in            |
| Cross-platform                | Windows only    | Windows/Linux/macOS |
| UTF-8 default                 | No              | Yes                 |

Add `#Requires -Version 7.0` at top of scripts that use PS7+ features.
