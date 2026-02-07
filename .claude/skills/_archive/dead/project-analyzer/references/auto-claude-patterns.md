# Auto-Claude Detection Patterns

> Source: Auto-Claude analysis framework (project_analyzer_module.py, base.py)

## Overview

This document contains detection patterns extracted from the Auto-Claude autonomous coding framework for identifying monorepo structures, services, infrastructure configurations, and project conventions.

## Monorepo Detection

### Monorepo Indicator Files

Check for these files at project root to identify monorepo projects:

| File                  | Tool            |
| --------------------- | --------------- |
| `pnpm-workspace.yaml` | pnpm workspaces |
| `lerna.json`          | Lerna           |
| `nx.json`             | Nx              |
| `turbo.json`          | Turborepo       |
| `rush.json`           | Rush            |

**Detection logic:**

1. If any indicator file exists, mark as monorepo
2. Extract tool name from filename (strip .json/.yaml extension)
3. Store as `monorepo_tool` in analysis

**Example:**

```python
monorepo_indicators = [
    "pnpm-workspace.yaml",
    "lerna.json",
    "nx.json",
    "turbo.json",
    "rush.json",
]

for indicator in monorepo_indicators:
    if (project_dir / indicator).exists():
        project_type = "monorepo"
        monorepo_tool = indicator.replace(".json", "").replace(".yaml", "")
        break
```

### Structure-Based Detection

If no indicator files found, check directory structure:

**Packages/Apps directories:**

- Presence of `packages/` directory
- Presence of `apps/` directory

**Multiple service directories:**
Count directories with service root files. If 2+ directories have root files, classify as monorepo.

## Service Detection

### SERVICE_INDICATORS - Common Service Names

Directories with these names (case-insensitive) suggest service boundaries:

```
backend, frontend, api, web, app, server, client,
worker, workers, services, packages, apps, libs,
scraper, crawler, proxy, gateway, admin, dashboard,
mobile, desktop, cli, sdk, core, shared, common
```

### SERVICE_ROOT_FILES - Service Manifest Files

Files that indicate a service/package root:

| File               | Language/Ecosystem            |
| ------------------ | ----------------------------- |
| `package.json`     | Node.js/JavaScript/TypeScript |
| `requirements.txt` | Python (pip)                  |
| `pyproject.toml`   | Python (modern)               |
| `Cargo.toml`       | Rust                          |
| `go.mod`           | Go                            |
| `Gemfile`          | Ruby                          |
| `composer.json`    | PHP                           |
| `pom.xml`          | Java (Maven)                  |
| `build.gradle`     | Java/Kotlin (Gradle)          |
| `Makefile`         | Generic build                 |
| `Dockerfile`       | Containerized service         |

### Service Location Patterns

In monorepos, search these locations for services:

1. Project root (for hybrid monorepos)
2. `packages/` directory
3. `apps/` directory
4. `services/` directory

**For each potential service:**

- Check for SERVICE_ROOT_FILES
- Verify directory is not in SKIP_DIRS
- Skip hidden directories (starting with `.`)

## Directories to Skip

### SKIP_DIRS - Excluded from Analysis

Never traverse into these directories:

```
node_modules, .git, __pycache__, .venv, venv, .env, env,
dist, build, .next, .nuxt, target, vendor, .idea, .vscode,
.pytest_cache, .mypy_cache, coverage, .coverage, htmlcov,
eggs, *.egg-info, .turbo, .cache, .worktrees, .auto-claude
```

## Infrastructure Detection

### Docker Configuration

| Pattern               | Detection             |
| --------------------- | --------------------- |
| `docker-compose.yml`  | Docker Compose        |
| `docker-compose.yaml` | Docker Compose (alt)  |
| `Dockerfile`          | Root Dockerfile       |
| `docker/` directory   | Docker configurations |
| `docker/Dockerfile*`  | Multiple Dockerfiles  |
| `docker/*.Dockerfile` | Named Dockerfiles     |

**Extract docker-compose services:**
Parse `services:` block in YAML and extract service names at 2-space indent.

### CI/CD Detection

| Pattern              | Platform       |
| -------------------- | -------------- |
| `.github/workflows/` | GitHub Actions |
| `.gitlab-ci.yml`     | GitLab CI      |
| `.circleci/`         | CircleCI       |

### Deployment Platform Detection

| File             | Platform             |
| ---------------- | -------------------- |
| `vercel.json`    | Vercel               |
| `netlify.toml`   | Netlify              |
| `fly.toml`       | Fly.io               |
| `render.yaml`    | Render               |
| `railway.json`   | Railway              |
| `Procfile`       | Heroku               |
| `app.yaml`       | Google App Engine    |
| `serverless.yml` | Serverless Framework |

## Convention Detection

### Python Linting

| Pattern                         | Tool   |
| ------------------------------- | ------ |
| `ruff.toml`                     | Ruff   |
| `[tool.ruff]` in pyproject.toml | Ruff   |
| `.flake8`                       | Flake8 |
| `pylintrc`                      | Pylint |

### Python Formatting

| Pattern                          | Tool  |
| -------------------------------- | ----- |
| `[tool.black]` in pyproject.toml | Black |

### JavaScript/TypeScript Linting

Check for any of these files:

```
.eslintrc
.eslintrc.js
.eslintrc.json
.eslintrc.yml
eslint.config.js
```

### Prettier Formatting

Check for any of these files:

```
.prettierrc
.prettierrc.js
.prettierrc.json
prettier.config.js
```

### TypeScript Detection

| Pattern         | Indicator             |
| --------------- | --------------------- |
| `tsconfig.json` | TypeScript configured |

### Git Hooks

| Pattern                   | Tool       |
| ------------------------- | ---------- |
| `.husky/`                 | Husky      |
| `.pre-commit-config.yaml` | pre-commit |

## Integration Notes

When using these patterns with project-analyzer skill:

1. **Order matters**: Check monorepo indicators before structure-based detection
2. **Fail gracefully**: Handle missing files/parse errors
3. **Cache results**: Store analysis in `.claude/context/artifacts/project-analysis.json`
4. **Respect SKIP_DIRS**: Never traverse into excluded directories
5. **Combine with framework_analyzer**: These patterns identify structure; framework_analyzer identifies tech stack

## Memory Protocol (MANDATORY)

**After using these patterns:**

- Record new patterns discovered in `.claude/context/memory/learnings.md`
- Document edge cases in `.claude/context/memory/issues.md`

> ASSUME INTERRUPTION: If it's not in memory, it didn't happen.
