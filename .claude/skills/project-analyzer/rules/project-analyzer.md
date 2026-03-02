# project-analyzer Rules

## Purpose

Automated brownfield codebase analysis. Detects project type, frameworks, dependencies, architecture patterns, and generates comprehensive project profile. Essential for Conductor integration and onboarding existing projects.

## Best Practices

- Detect project root from package managers and manifest files
- Identify frameworks from dependencies and directory structure
- Generate comprehensive file statistics and language breakdown
- Map component relationships and architecture patterns
- Validate output against project-analysis.schema.json
- Execute in < 30 seconds for typical projects (< 10k files)

## Integration Points

See SKILL.md for complete documentation.
