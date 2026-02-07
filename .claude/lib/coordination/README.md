# Swarm Coordination Tool

Multi-agent swarm coordination patterns. Orchestrates parallel agent execution, manages agent communication, handles task distribution, and coordinates results aggregation for complex multi-agent workflows.

## Overview

This is a standalone CLI tool wrapper for the `swarm-coordination` skill. It provides a command-line interface for running the skill with various options.

## Usage

```bash
# Basic usage
node swarm-coordination.cjs run

# With options
node swarm-coordination.cjs run --input data.json --output result.json --verbose

# Validate inputs only
node swarm-coordination.cjs validate --input data.json

# Show help
node swarm-coordination.cjs help
```

## Commands

| Command    | Description                      |
| ---------- | -------------------------------- |
| `run`      | Execute the skill (default)      |
| `validate` | Validate inputs before execution |
| `help`     | Show help message                |

## Options

| Option            | Description               |
| ----------------- | ------------------------- |
| `--input <file>`  | Input file path           |
| `--output <file>` | Output file path          |
| `--config <file>` | Configuration file (JSON) |
| `--json`          | Output results as JSON    |
| `--verbose`       | Verbose output            |
| `--help`          | Show help message         |

## Integration

### With Other Tools

```javascript
const { execSync } = require('child_process');

// Run the tool
const result = execSync('node .claude/tools/swarm-coordination/swarm-coordination.cjs run --json', {
  encoding: 'utf-8',
});
const data = JSON.parse(result);
```

### With Claude Agents

Agents can invoke this tool via Bash:

```bash
node .claude/tools/swarm-coordination/swarm-coordination.cjs run --verbose
```

## Related

- **Skill Definition**: `.claude/skills/swarm-coordination/SKILL.md`
- **Skill Script**: `.claude/skills/swarm-coordination/scripts/main.cjs`
- **Workflow**: `.claude/workflows/swarm-coordination-skill-workflow.md`
