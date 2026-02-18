# PowerShell Security Patterns

## Execution Policy

```powershell
# Check current policy
Get-ExecutionPolicy -List

# Set policy for current user (safe default for developers)
Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser

# Common values:
# Restricted       - No scripts (Windows client default)
# AllSigned        - All scripts must be signed
# RemoteSigned     - Downloaded scripts must be signed; local run freely
# Unrestricted     - All scripts run (with warning for downloaded)
# Bypass           - No restrictions (CI/CD pipelines)

# Bypass for single script (without changing policy)
powershell.exe -ExecutionPolicy Bypass -File .\script.ps1
```

## Script Signing

```powershell
# Get code signing certificate
$cert = Get-ChildItem -Path Cert:\CurrentUser\My -CodeSigningCert

# Sign a script
Set-AuthenticodeSignature -FilePath .\script.ps1 -Certificate $cert

# Verify signature
$sig = Get-AuthenticodeSignature -FilePath .\script.ps1
$sig.Status  # Should be 'Valid'
```

## Credential Management

### Interactive (Never Hardcode)

```powershell
# Prompt user securely
$cred = Get-Credential -Message 'Enter your credentials'
$securePass = Read-Host -AsSecureString -Prompt 'Password'
```

### SecretManagement Module (Production Standard)

```powershell
# Install
Install-PSResource -Name Microsoft.PowerShell.SecretManagement
Install-PSResource -Name Microsoft.PowerShell.SecretStore  # Local vault

# Register vault
Register-SecretVault -Name 'LocalVault' -ModuleName Microsoft.PowerShell.SecretStore

# Store secrets
Set-Secret -Name 'APIKey' -Secret 'your-api-key'
Set-Secret -Name 'DBPassword' -Secret (ConvertTo-SecureString 'pass' -AsPlainText -Force)

# Retrieve secrets
$apiKey = Get-Secret -Name 'APIKey' -AsPlainText
$dbPass = Get-Secret -Name 'DBPassword'  # Returns SecureString by default

# List all secrets
Get-SecretInfo

# Remove secret
Remove-Secret -Name 'APIKey'
```

### PSCredential Pattern

```powershell
# Construct from components
$username = 'domain\user'
$securePass = Get-Secret -Name 'MyPassword'  # SecureString from vault
$cred = [PSCredential]::new($username, $securePass)

# Use with cmdlets
Connect-AzAccount -Credential $cred
Invoke-Command -ComputerName 'server1' -Credential $cred -ScriptBlock { ... }
```

## Avoid Insecure Patterns

```powershell
# BAD: Plaintext password in code
$password = 'MySecretPassword'

# BAD: ConvertTo-SecureString from plaintext (only for testing)
$secure = ConvertTo-SecureString 'MyPassword' -AsPlainText -Force

# BAD: Invoke-Expression with user input (injection risk)
Invoke-Expression $userInput

# GOOD: Validate and restrict user input
$allowedValues = @('start', 'stop', 'restart')
if ($action -notin $allowedValues) {
    throw "Invalid action: $action"
}
```

## Constrained Language Mode

```powershell
# Check language mode
$ExecutionContext.SessionState.LanguageMode
# FullLanguage | ConstrainedLanguage | RestrictedLanguage | NoLanguage

# Constrained mode restricts:
# - Add-Type
# - COM object creation
# - .NET type methods
# - Reflection

# Set constrained mode (system-wide security measure)
# Typically configured via WDAC/AppLocker policies
```

## Just Enough Administration (JEA)

```powershell
# Create JEA role capability file
New-PSRoleCapabilityFile -Path .\Capabilities\HelpDesk.psrc `
    -VisibleCmdlets @(
        'Get-Service',
        @{ Name = 'Restart-Service'; Parameters = @{ Name = 'Name'; ValidateSet = 'spooler', 'w32time' } }
    ) `
    -VisibleFunctions 'Get-DiskUsage' `
    -VisibleProviders 'FileSystem'

# Create JEA session configuration
New-PSSessionConfigurationFile -Path .\SessionConfigs\JEA.pssc `
    -SessionType RestrictedRemoteServer `
    -RoleDefinitions @{
        'DOMAIN\HelpDesk' = @{ RoleCapabilities = 'HelpDesk' }
    } `
    -RunAsVirtualAccount

# Register JEA endpoint
Register-PSSessionConfiguration -Name 'JEA_HelpDesk' `
    -Path .\SessionConfigs\JEA.pssc `
    -Force

# Connect to JEA endpoint
Enter-PSSession -ComputerName 'server1' -ConfigurationName 'JEA_HelpDesk'
```

## Input Validation Best Practices

```powershell
function Invoke-SafeCommand {
    param(
        [Parameter(Mandatory)]
        [ValidateSet('start', 'stop', 'restart')]
        [string]$Action,

        [Parameter(Mandatory)]
        [ValidatePattern('^[a-zA-Z0-9_-]+$')]  # Allow only safe characters
        [string]$ServiceName
    )

    # Never use: Start-Service $userInput (unvalidated)
    # Always validate before using in commands
    switch ($Action) {
        'start'   { Start-Service -Name $ServiceName -ErrorAction Stop }
        'stop'    { Stop-Service -Name $ServiceName -ErrorAction Stop }
        'restart' { Restart-Service -Name $ServiceName -ErrorAction Stop }
    }
}
```

## Script Security Checklist

- [ ] No hardcoded credentials (use SecretManagement)
- [ ] Input validated before use (ValidateSet, ValidatePattern, ValidateScript)
- [ ] No Invoke-Expression with user input
- [ ] No -AsPlainText except in tests
- [ ] Script signed if distributed
- [ ] #Requires -RunAsAdministrator when needed
- [ ] Sensitive data removed from error messages
- [ ] Transcript logging enabled for audit trails
