# PowerShell Testing Patterns

## Pester 5 (Current Standard)

### Installation

```powershell
Install-PSResource -Name Pester -Repository PSGallery -Scope CurrentUser
Import-Module Pester -MinimumVersion 5.0
```

### Test File Structure

```powershell
# MyFunction.Tests.ps1
BeforeAll {
    # Load the function under test
    . $PSCommandPath.Replace('.Tests.ps1', '.ps1')
    # Or for module functions:
    Import-Module "$PSScriptRoot/../MyModule.psm1" -Force
}

Describe 'Function-Name' {
    Context 'Normal operation' {
        It 'Returns expected output for valid input' {
            $result = Function-Name -Parameter 'value'
            $result | Should -Be 'expected'
        }

        It 'Returns PSCustomObject with correct properties' {
            $result = Function-Name -Parameter 'value'
            $result | Should -BeOfType [PSCustomObject]
            $result.Name | Should -Not -BeNullOrEmpty
        }
    }

    Context 'Error handling' {
        It 'Throws on null input' {
            { Function-Name -Parameter $null } | Should -Throw
        }

        It 'Does not throw on invalid but non-null input' {
            { Function-Name -Parameter 'bad' } | Should -Not -Throw
        }
    }
}
```

### Should Assertions

```powershell
$value | Should -Be 42                          # Exact equality
$value | Should -BeExactly 'CaseSensitive'     # Case-sensitive equality
$value | Should -BeGreaterThan 0
$value | Should -BeLessThan 100
$value | Should -BeIn @('A', 'B', 'C')
$value | Should -BeNullOrEmpty
$value | Should -Not -BeNullOrEmpty
$value | Should -BeOfType [System.IO.FileInfo]
$value | Should -Match 'pattern'               # Regex match
$value | Should -Contain 'item'                # Collection contains
{ $block } | Should -Throw
{ $block } | Should -Throw -ErrorId 'ErrorIdValue'
{ $block } | Should -Not -Throw
```

### Mocking

```powershell
Describe 'Function with external dependency' {
    BeforeAll {
        Mock Get-ChildItem {
            [PSCustomObject]@{ Name = 'file.txt'; Length = 1024 }
        }

        # Mock with parameter filter
        Mock Invoke-RestMethod {
            @{ Status = 'OK'; Data = 'result' }
        } -ParameterFilter { $Uri -like '*api.example.com*' }
    }

    It 'Calls Get-ChildItem with correct path' {
        $result = Get-SomeData -Path 'C:\temp'
        Should -Invoke Get-ChildItem -Times 1 -ParameterFilter { $Path -eq 'C:\temp' }
    }

    It 'Uses mocked data correctly' {
        $result = Get-SomeData -Path 'C:\temp'
        $result.FileName | Should -Be 'file.txt'
    }
}
```

### TestDrive and TestRegistry

```powershell
Describe 'File operations' {
    It 'Creates a file in TestDrive' {
        $path = Join-Path $TestDrive 'test.txt'
        'content' | Out-File $path
        Test-Path $path | Should -BeTrue
    }
}

Describe 'Registry operations' {
    It 'Reads from TestRegistry' {
        # TestRegistry is automatically cleaned up
        $key = Join-Path $TestRegistry 'HKCU:\Software\Test'
        New-Item $key | Out-Null
        Test-Path $key | Should -BeTrue
    }
}
```

### Running Pester Tests

```powershell
# Run all tests in current directory
Invoke-Pester

# Run specific test file
Invoke-Pester -Path .\tests\MyFunction.Tests.ps1

# Run with detailed output
Invoke-Pester -Path .\tests\ -Output Detailed

# CI mode (throws on failure, NUnit output)
Invoke-Pester -Path .\tests\ -CI

# Run only tests matching a name
Invoke-Pester -Path .\tests\ -TestName '*error handling*'

# Code coverage
Invoke-Pester -Path .\tests\ -CodeCoverage .\src\*.ps1 -CodeCoverageOutputFile coverage.xml
```

### Pester Configuration Object

```powershell
$config = New-PesterConfiguration
$config.Run.Path = '.\tests\'
$config.Output.Verbosity = 'Detailed'
$config.CodeCoverage.Enabled = $true
$config.CodeCoverage.Path = '.\src\*.ps1'
$config.TestResult.Enabled = $true
$config.TestResult.OutputPath = 'TestResults.xml'
$config.TestResult.OutputFormat = 'NUnitXml'

Invoke-Pester -Configuration $config
```

## PSScriptAnalyzer

### Installation

```powershell
Install-PSResource -Name PSScriptAnalyzer -Repository PSGallery
```

### Basic Usage

```powershell
# Analyze a single file
Invoke-ScriptAnalyzer -Path .\script.ps1

# Analyze entire module/directory
Invoke-ScriptAnalyzer -Path .\MyModule\ -Recurse

# Analyze with summary
Invoke-ScriptAnalyzer -Path .\MyModule\ -Recurse -ReportSummary

# Return only specific severity
Invoke-ScriptAnalyzer -Path .\script.ps1 -Severity Error, Warning

# Include specific rules only
Invoke-ScriptAnalyzer -Path .\script.ps1 -IncludeRule PSAvoidUsingPlainTextForPassword

# Exclude specific rules
Invoke-ScriptAnalyzer -Path .\script.ps1 -ExcludeRule PSAvoidUsingWriteHost
```

### Common Rules

| Rule                                           | Severity    | Description                        |
| ---------------------------------------------- | ----------- | ---------------------------------- |
| PSAvoidUsingCmdletAliases                      | Warning     | Avoid aliases like `ls`, `%`, `?`  |
| PSAvoidUsingPositionalParameters               | Warning     | Use named parameters               |
| PSUseDeclaredVarsMoreThanAssignments           | Warning     | Variables assigned but not used    |
| PSAvoidUsingPlainTextForPassword               | Error       | Don't use plaintext passwords      |
| PSAvoidUsingConvertToSecureStringWithPlainText | Error       | Secure string from plaintext       |
| PSUseShouldProcessForStateChangingFunctions    | Warning     | ShouldProcess on verb functions    |
| PSUseApprovedVerbs                             | Warning     | Only use approved PowerShell verbs |
| PSAvoidUsingWriteHost                          | Information | Use Write-Output instead           |
| PSAvoidUsingInvokeExpression                   | Error       | Security risk                      |

### PSScriptAnalyzer in CI (GitHub Actions)

```yaml
- name: Run PSScriptAnalyzer
  shell: pwsh
  run: |
    $results = Invoke-ScriptAnalyzer -Path ./src -Recurse -ReportSummary
    $errors = $results | Where-Object Severity -eq 'Error'
    if ($errors.Count -gt 0) {
      $errors | Format-Table -AutoSize
      throw "PSScriptAnalyzer found $($errors.Count) error(s)"
    }
```

### Settings File

Create `.vscode/PSScriptAnalyzerSettings.psd1` or `PSScriptAnalyzerSettings.psd1` in module root:

```powershell
@{
    Severity     = @('Error', 'Warning')
    ExcludeRules = @(
        'PSAvoidUsingWriteHost'  # Intentional in interactive scripts
    )
    Rules        = @{
        PSUseConsistentIndentation = @{
            Enable = $true
            IndentationSize = 4
        }
        PSAlignAssignmentStatement = @{
            Enable = $true
            CheckHashtable = $true
        }
    }
}
```

## TDD Workflow for PowerShell

1. Write failing Pester test first
2. Run: `Invoke-Pester -Path .\tests\MyFunction.Tests.ps1` → verify RED
3. Implement minimal function code
4. Run again → verify GREEN
5. Refactor
6. Run PSScriptAnalyzer: `Invoke-ScriptAnalyzer -Path .\src\`
7. Fix any analyzer warnings
8. Commit
