<!-- Agent: technical-writer | Task: #29 | Session: 2026-03-03 -->

# Skill Format Reference

## Evolved Skill Directory Structure

```
.claude/skills/<skill-name>/
├── SKILL.md              # Strategic guide, iron laws, evidence-based steps
├── manifest.json         # Tool dependencies, staleness tracking
├── scripts/main.cjs      # Dispatcher (executable) or passthrough (cognitive)
├── knowledge/            # Decomposed domain knowledge files
├── benchmarks/           # Calibration test scenarios (scenario-*.json)
├── observations/         # Agent failure feedback loop
├── setup.cjs             # Environment provisioning hook
├── hooks/                # Pre/post execution hooks
├── schemas/              # Input/output validation
├── rules/                # Enforcement rules
├── templates/            # Output templates
└── commands/             # Slash command delegation
```

## Component Details

### manifest.json (REQUIRED)

Machine-readable dependency manifest. Schema: `.claude/schemas/skill-manifest.schema.json`

Key fields:
- `skillType`: "cognitive" | "executable" | "hybrid"
- `externalDependencies`: Tools the skill needs installed
- `lastResearchDate`: ISO date of last research update
- `staleAfterDays`: Days before skill is flagged stale

### knowledge/ (REQUIRED for non-trivial skills)

Decomposed domain knowledge. SKILL.md provides strategic guidance; knowledge/ provides the encyclopedia.

### benchmarks/ (RECOMMENDED)

2-3 JSON scenarios for calibration. If an agent can't solve these using the skill, the skill is defective.

### observations/ (REQUIRED)

Agent failure feedback directory. Agents write failure reports here; skill-updater reads them to patch gaps.

### setup.cjs (REQUIRED for executable/hybrid skills)

Provisioning hook. Checks if external tools are installed. Uses shared `setup-runner.cjs` utility.

### Dispatcher main.cjs (REQUIRED for executable skills)

Accepts `--action` parameter. Orchestrates real tool execution, not stub output.
See: dispatcher-pattern-spec.md

## Skill Types

| Type | manifest.json | knowledge/ | setup.cjs | Dispatcher main.cjs |
|------|:---:|:---:|:---:|:---:|
| cognitive | Required | Required | Optional | Passthrough |
| executable | Required | Optional | Required | Required |
| hybrid | Required | Required | Required | Required |

## Quality Gates

1. `validate-skill-ecosystem.cjs --min-score 70` — minimum quality score
2. `check-skill-staleness.cjs` — flags stale skills based on manifest dates
3. Benchmarks pass — agent can solve calibration scenarios
4. Evidence-Or-Die — every process step has concrete commands

## Related Files
- Schema: `.claude/schemas/skill-manifest.schema.json`
- Validator: `.claude/tools/cli/validate-skill-ecosystem.cjs`
- Staleness: `.claude/tools/cli/check-skill-staleness.cjs`
- Setup runner: `.claude/lib/tools/setup-runner.cjs`
- Skill runtime: `.claude/lib/tools/skill-tool.cjs`
