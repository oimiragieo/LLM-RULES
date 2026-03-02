# powershell-expert Rules

## Purpose

'Master PowerShell scripting and Windows system administration for 2026. Enforces cross-platform compatibility (PS 7+), secure credential handling, and high-fidelity automation patterns.'

## Best Practices

- Prefer PowerShell 7+ syntax for cross-platform (Core) compatibility
- Enforce strict error handling via $ErrorActionPreference = 'Stop'
- Use structured objects (PSCustomObject) rather than parsing strings
- Secure sensitive data using SecretManagement and SecretStore modules
- Place all enforcement rules in .claude/rules/powershell-expert.md

## Integration Points

See SKILL.md for complete documentation.
