# Brownfield Project Detection

## Overview

Brownfield project detection enables intelligent, <30 minute onboarding for existing codebases by automatically identifying tech stacks, assessing project maturity, and recommending appropriate agents, skills, and workflows.

## Components

### 1. Tech Stack Detector

**File:** `.claude/lib/utils/tech-stack-detector.cjs`

Analyzes project structure to identify:

- **Primary language(s)**: TypeScript, JavaScript, Python, Go, etc.
- **Frameworks and libraries**: React, Vue, FastAPI, Django, etc.
- **Build tools and package managers**: npm, pip, Poetry, Go modules
- **Testing frameworks**: Jest, pytest, Vitest, etc.
- **CI/CD tooling**: GitHub Actions, etc.

**Usage:**

```javascript
const detector = require('./.claude/lib/utils/tech-stack-detector.cjs');

// Full detection
const result = await detector.detect('/path/to/project');
console.log(result);
// {
//   languages: ['typescript', 'python'],
//   frameworks: ['react', 'fastapi'],
//   package_managers: ['npm', 'pip'],
//   build_tools: [],
//   testing: ['jest', 'pytest'],
//   ci_cd: ['github-actions'],
//   confidence: 0.92
// }

// Quick language detection
const language = await detector.detectLanguage('/path/to/project');
console.log(language); // 'typescript'
```

**Detection Strategy:**

1. **package.json** (Node.js/TypeScript) - Highest priority
2. **pyproject.toml** / **requirements.txt** (Python)
3. **go.mod** (Go)
4. **tsconfig.json** (TypeScript fallback)
5. **.github/workflows/** (CI/CD detection)

**Confidence Scoring:**

- **0.9+**: Strong signals (package manager files present)
- **0.5-0.9**: Medium signals (config files only)
- **0-0.5**: Weak signals (minimal detection)

### 2. Brownfield Assessor

**File:** `.claude/lib/utils/brownfield-assessor.cjs`

Scores project maturity on 4 dimensions:

| Dimension     | Score Factors                                                            |
| ------------- | ------------------------------------------------------------------------ |
| **Structure** | Directory organization (src/, tests/, docs/, config/), CI/CD             |
| **Tests**     | Test file count (0 = 0.0, 1-5 = 0.3, 5-10 = 0.5, 10-20 = 0.7, 20+ = 0.9) |
| **Docs**      | README quality, CHANGELOG, CONTRIBUTING, LICENSE, etc.                   |
| **Patterns**  | Config files (tsconfig, eslint, prettier, etc.)                          |

**Project Classification:**

- **Greenfield** (avg score 0-0.3): New project, minimal existing code
- **Brownfield** (avg score 0.3-0.8): Established project, good structure
- **Legacy** (avg score 0.8-1.0): Mature, complex, needs careful handling

**Usage:**

```javascript
const assessor = require('./.claude/lib/utils/brownfield-assessor.cjs');

const assessment = await assessor.assess('/path/to/project');
console.log(assessment);
// {
//   type: 'brownfield',
//   scores: {
//     structure: 0.75,
//     tests: 0.60,
//     docs: 0.55,
//     patterns: 0.70
//   },
//   recommendations: [
//     'Increase test coverage to 80%+',
//     'Add API documentation'
//   ],
//   suggested_workflows: ['context-driven-development', 'tdd'],
//   suggested_agents: ['typescript-pro', 'qa']
// }
```

## Integration with Project Onboarding

Brownfield detection is integrated into the `project-onboarding` skill:

```javascript
// Automatic detection on invocation
Skill({ skill: 'project-onboarding' });

// Workflow:
// 1. Detect tech stack
// 2. Assess maturity
// 3. Auto-configure based on detection
// 4. Show recommendations
// 5. Enable <30 min setup
```

## Supported Tech Stacks

### Fully Supported (10+ patterns)

| Language/Framework | Detection Files                          | Confidence |
| ------------------ | ---------------------------------------- | ---------- |
| **TypeScript**     | package.json (typescript), tsconfig.json | 0.9+       |
| **JavaScript**     | package.json (no typescript)             | 0.9+       |
| **Python**         | pyproject.toml, requirements.txt         | 0.9+       |
| **Go**             | go.mod                                   | 0.9+       |
| **React**          | package.json (react)                     | 0.9+       |
| **Next.js**        | package.json (next)                      | 0.9+       |
| **Vue**            | package.json (vue)                       | 0.9+       |
| **Django**         | requirements.txt (django)                | 0.9+       |
| **FastAPI**        | pyproject.toml (fastapi)                 | 0.9+       |
| **Jest**           | package.json (jest)                      | 0.9+       |
| **pytest**         | requirements.txt (pytest)                | 0.9+       |

### Partially Supported

- **Angular**: package.json (@angular/core)
- **Express**: package.json (express)
- **Flask**: requirements.txt (flask)
- **Gin** (Go): go.mod (gin-gonic)

## Performance

- **Tech stack detection**: <2 seconds (100 commits)
- **Project assessment**: <3 seconds (complex project)
- **Full onboarding setup**: <30 minutes (brownfield projects)

## Examples

### Example 1: TypeScript + React Project

**Project Structure:**

```
myproject/
├── package.json (typescript, react, jest)
├── tsconfig.json
├── src/
├── tests/
├── README.md
└── .github/workflows/ci.yml
```

**Detection Result:**

```javascript
{
  languages: ['typescript'],
  frameworks: ['react'],
  package_managers: ['npm'],
  testing: ['jest'],
  ci_cd: ['github-actions'],
  confidence: 0.95
}
```

**Assessment:**

```javascript
{
  type: 'brownfield',
  scores: { structure: 0.7, tests: 0.5, docs: 0.4, patterns: 0.6 },
  recommendations: ['Increase test coverage', 'Add CHANGELOG.md'],
  suggested_workflows: ['project-onboarding', 'tdd'],
  suggested_agents: ['typescript-pro', 'frontend-pro', 'qa']
}
```

### Example 2: Python FastAPI Project

**Project Structure:**

```
api/
├── pyproject.toml (fastapi, pytest)
├── src/
├── tests/ (20 test files)
├── README.md
├── CHANGELOG.md
└── CONTRIBUTING.md
```

**Detection Result:**

```javascript
{
  languages: ['python'],
  frameworks: ['fastapi'],
  package_managers: ['poetry'],
  testing: ['pytest'],
  ci_cd: [],
  confidence: 0.92
}
```

**Assessment:**

```javascript
{
  type: 'brownfield',
  scores: { structure: 0.6, tests: 0.7, docs: 0.7, patterns: 0.3 },
  recommendations: ['Add linting configuration', 'Add GitHub Actions CI'],
  suggested_workflows: ['project-onboarding', 'context-driven-development'],
  suggested_agents: ['python-pro', 'fastapi-pro', 'qa']
}
```

### Example 3: Legacy Monolith

**Project Structure:**

```
legacy-app/
├── package.json (complex scripts, many deps)
├── src/ (deep nesting, many subdirs)
├── tests/ (25+ test files)
├── docs/ (extensive documentation)
├── config/
├── scripts/
├── .github/workflows/ (CI/CD)
└── Multiple config files (eslint, prettier, jest, webpack, etc.)
```

**Assessment:**

```javascript
{
  type: 'legacy',
  scores: { structure: 0.9, tests: 0.9, docs: 0.9, patterns: 0.9 },
  recommendations: ['Maintain current practices', 'Consider microservices migration'],
  suggested_workflows: ['project-onboarding', 'context-driven-development'],
  suggested_agents: ['typescript-pro', 'architect', 'qa', 'code-reviewer']
}
```

## Troubleshooting

### Low Confidence Detection

**Symptom**: `confidence` < 0.5

**Cause**: Minimal project files, non-standard structure

**Solution:**

- Add package.json or pyproject.toml
- Ensure standard directory structure
- Add config files (tsconfig.json, .eslintrc, etc.)

### Incorrect Language Detection

**Symptom**: Wrong language detected

**Cause**: Multiple language files present, priority issue

**Solution:**

- Primary language determined by package manager file presence
- TypeScript > JavaScript (if typescript dependency exists)
- Python detected from pyproject.toml/requirements.txt
- Go detected from go.mod

### Incorrect Maturity Classification

**Symptom**: Greenfield project classified as brownfield, or vice versa

**Cause**: Scoring threshold mismatch

**Solution:**

- **Greenfield**: avg score < 0.3 - Add directories (src/, tests/, docs/)
- **Brownfield**: avg score 0.3-0.8 - Already well-organized
- **Legacy**: avg score >= 0.8 - Very mature, many files/config

## API Reference

### Tech Stack Detector

#### `detect(projectPath: string): Promise<DetectionResult>`

Full tech stack detection.

**Returns:**

```typescript
{
  languages: string[];
  frameworks: string[];
  package_managers: string[];
  build_tools: string[];
  testing: string[];
  ci_cd: string[];
  confidence: number; // 0-1
}
```

#### `detectLanguage(projectPath: string): Promise<string | null>`

Quick primary language detection.

**Returns:** `'typescript' | 'javascript' | 'python' | 'go' | null`

### Brownfield Assessor

#### `assess(projectPath: string): Promise<AssessmentResult>`

Full maturity assessment.

**Returns:**

```typescript
{
  type: 'greenfield' | 'brownfield' | 'legacy';
  scores: {
    structure: number; // 0-1
    tests: number; // 0-1
    docs: number; // 0-1
    patterns: number; // 0-1
  };
  recommendations: string[];
  suggested_workflows: string[];
  suggested_agents: string[];
}
```

## Best Practices

1. **Run detection before onboarding**: Always detect tech stack first to configure appropriate workflows
2. **Use recommendations**: Assessment recommendations are tailored to project maturity
3. **Verify confidence**: Low confidence (<0.5) may require manual verification
4. **Update regularly**: Re-run assessment after major structural changes

## Related Features

- **SPEC-006**: Code Styleguides - Auto-injected based on detected tech stack
- **project-onboarding skill**: Integrates brownfield detection for <30 min setup
- **SPEC-009**: Progressive Disclosure v2 - Adapts questions based on project maturity

## Testing

Run tests:

```bash
node --test tests/tech-stack-detector.test.cjs
node --test tests/brownfield-assessor.test.cjs
```

**Coverage:**

- Tech stack detector: 13 tests (Node.js, TypeScript, Python, Go, CI/CD, confidence, errors)
- Brownfield assessor: 11 tests (maturity classification, scoring, recommendations, errors)

**Total:** 24 tests, 100% passing
