<!-- Agent: developer | Task: #44 | Session: 2026-02-06 -->

---

name: domain-development-workflow
description: Common TDD workflow for all 22 domain agents with language-specific conventions.
triggers:

- feature implementation
- bug fix
- domain-specific development
  agents:
- python-pro
- rust-pro
- typescript-pro
- golang-pro
- java-pro
- nodejs-pro
- frontend-pro
- nextjs-pro
- fastapi-pro
- graphql-pro
- all domain specialists

---

# Domain Development Workflow

Common TDD workflow for all 22 domain specialist agents with language-specific conventions and integration with enterprise feature development workflow.

## Overview

This workflow provides a unified Red-Green-Refactor Cycle (RGRC) for all domain specialists while respecting language-specific idioms, test frameworks, and package managers.

## Red-Green-Refactor Cycle (RGRC)

### Phase 1: RED - Write Failing Test

**Universal Steps (all languages):**

1. Invoke TDD skill: `Skill({ skill: 'tdd' })`
2. Write one minimal test for the feature
3. Run test and verify it fails for the RIGHT reason (feature missing, not typo)
4. Record failing test output

**Language-Specific Test Commands:**

See Language Conventions Table below for test execution commands.

### Phase 2: GREEN - Minimal Implementation

**Universal Steps:**

1. Write simplest code to make the test pass
2. No over-engineering, no YAGNI features
3. Run test and verify it passes
4. Run all tests to ensure no regressions

**Code Quality Rules:**

- Functions ≤ 50 lines
- Cyclomatic complexity ≤ 10
- No code duplication (DRY principle)
- Follow language-specific style guides

### Phase 3: REFACTOR - Clean Up

**Universal Steps:**

1. Remove duplication
2. Improve names and structure
3. Extract helpers if needed
4. Keep tests passing throughout refactor
5. Run linter to verify style compliance

**Refactoring Checklist:**

- [ ] Duplicated code extracted
- [ ] Variable names clear and descriptive
- [ ] Magic numbers replaced with constants
- [ ] Functions have single responsibility
- [ ] Tests still pass

## Language Conventions Table

### Test Commands

| Language/Framework | Test Command                | Coverage Command                  | Linter                   |
| ------------------ | --------------------------- | --------------------------------- | ------------------------ |
| **Python**         | `pytest`                    | `pytest --cov=. --cov-report=xml` | `ruff check .`           |
| **TypeScript**     | `pnpm test` or `vitest`     | `pnpm test:coverage`              | `pnpm lint`              |
| **JavaScript**     | `npm test` or `jest`        | `npm run test:coverage`           | `eslint .`               |
| **Rust**           | `cargo test`                | `cargo tarpaulin`                 | `cargo clippy`           |
| **Go**             | `go test ./...`             | `go test -cover ./...`            | `golangci-lint run`      |
| **Java**           | `mvn test` or `gradle test` | `mvn jacoco:report`               | `mvn checkstyle:check`   |
| **FastAPI**        | `pytest -v`                 | `pytest --cov=app`                | `ruff check .`           |
| **Next.js**        | `pnpm test`                 | `pnpm test:coverage`              | `pnpm lint`              |
| **GraphQL**        | `pnpm test`                 | `pnpm test:coverage`              | `pnpm lint`              |
| **React**          | `pnpm test`                 | `pnpm test:coverage`              | `pnpm lint`              |
| **Node.js**        | `npm test`                  | `npm run test:coverage`           | `eslint .`               |
| **Android**        | `./gradlew test`            | `./gradlew jacocoTestReport`      | `./gradlew lint`         |
| **iOS**            | `xcodebuild test`           | `xcrun llvm-cov`                  | `swiftlint`              |
| **Expo**           | `pnpm test`                 | `pnpm test:coverage`              | `pnpm lint`              |
| **Tauri**          | `pnpm test`                 | `pnpm test:coverage`              | `pnpm lint`              |
| **PHP**            | `./vendor/bin/phpunit`      | `phpunit --coverage-html`         | `./vendor/bin/phpcs`     |
| **Web3/Solidity**  | `hardhat test`              | `hardhat coverage`                | `solhint contracts/**/*` |
| **SvelteKit**      | `pnpm test`                 | `pnpm test:coverage`              | `pnpm lint`              |

### Package Managers

| Language/Framework | Install Command                   | Add Dependency      | Remove Dependency     |
| ------------------ | --------------------------------- | ------------------- | --------------------- |
| **Python**         | `pip install -r requirements.txt` | `pip install <pkg>` | `pip uninstall <pkg>` |
| **TypeScript/JS**  | `pnpm install`                    | `pnpm add <pkg>`    | `pnpm remove <pkg>`   |
| **Rust**           | `cargo build`                     | `cargo add <pkg>`   | `cargo remove <pkg>`  |
| **Go**             | `go mod download`                 | `go get <pkg>`      | `go mod tidy`         |
| **Java (Maven)**   | `mvn install`                     | Edit `pom.xml`      | Edit `pom.xml`        |
| **Java (Gradle)**  | `gradle build`                    | Edit `build.gradle` | Edit `build.gradle`   |
| **PHP**            | `composer install`                | `composer require`  | `composer remove`     |
| **Web3**           | `pnpm install`                    | `pnpm add <pkg>`    | `pnpm remove <pkg>`   |

### Style Guides

| Language       | Official Style Guide                    |
| -------------- | --------------------------------------- |
| **Python**     | PEP 8                                   |
| **TypeScript** | TypeScript Handbook + project .eslintrc |
| **JavaScript** | Airbnb Style Guide or Standard JS       |
| **Rust**       | Rust Style Guide (rustfmt defaults)     |
| **Go**         | Effective Go                            |
| **Java**       | Google Java Style Guide                 |
| **Swift**      | Swift Style Guide                       |
| **Kotlin**     | Kotlin Coding Conventions               |
| **PHP**        | PSR-12                                  |
| **Solidity**   | Solidity Style Guide                    |

## Output Standards (Workspace Conventions)

All domain agents MUST follow workspace-conventions for file placement:

### Implementation Files

- **Code**: Language-specific directory structure (src/, lib/, app/, contracts/)
- **Tests**: Mirror source structure with test suffix (_test.go, .test.ts, test_\*.py)
- **Documentation**: Inline docstrings/comments following language conventions

### Reports and Artifacts

- **Test Results**: `.claude/context/tmp/test-results-{YYYY-MM-DD}.json`
- **Coverage Reports**: `.claude/context/tmp/coverage-{YYYY-MM-DD}.html`
- **Implementation Notes**: `.claude/context/reports/backend/domain/{language}-implementation-{YYYY-MM-DD}.md`

### Provenance Headers (All Generated Files)

```markdown
<!-- Agent: {agent-type} | Task: #{task-id} | Session: {YYYY-MM-DD} -->
```

Example:

```markdown
<!-- Agent: python-pro | Task: #123 | Session: 2026-02-06 -->
```

## Integration with Feature Development Workflow

Domain specialists are spawned during PHASE_2_IMPLEMENT of the enterprise feature development workflow:

### Handoff from PHASE_1_DESIGN

1. **Read design artifacts:**
   - `.claude/context/plans/impl-{feature}-{YYYY-MM-DD}.md` (implementation plan)
   - `.claude/context/artifacts/specs/{feature}-spec.md` (technical spec)

2. **Understand requirements:**
   - Acceptance criteria from plan
   - API contracts and data models
   - Performance requirements
   - Security considerations

### Execution During PHASE_2_IMPLEMENT

1. **Setup:**
   - Read implementation plan
   - Verify test framework installed
   - Create feature branch (via git-expert skill)

2. **TDD Loop:**
   - For each requirement in plan:
     - RED: Write failing test
     - GREEN: Minimal implementation
     - REFACTOR: Clean up code
     - VERIFY: Run all tests

3. **Code Quality:**
   - Run linter (fix all issues)
   - Run coverage report (aim for ≥80%)
   - Check cyclomatic complexity (≤10 per function)
   - Remove dead code

4. **Documentation:**
   - Update inline docs/docstrings
   - Update README if public API changed
   - Record implementation notes

### Handoff to PHASE_3_REVIEW

1. **TaskUpdate metadata:**

```json
{
  "status": "completed",
  "metadata": {
    "filesModified": ["src/auth.ts", "tests/auth.test.ts"],
    "testsAdded": 12,
    "testsPassing": true,
    "coveragePercent": 85,
    "linterClean": true
  }
}
```

1. **Output artifacts:**
   - Implementation notes: `.claude/context/reports/backend/domain/{language}-implementation-{YYYY-MM-DD}.md`
   - Test results: `.claude/context/tmp/test-results-{YYYY-MM-DD}.json`

## Example: Python TDD Session

### Step 1: RED - Failing Test

```python
# tests/test_auth.py
import pytest
from app.auth import authenticate_user

def test_authenticate_user_with_valid_credentials():
    result = authenticate_user("user@example.com", "password123")
    assert result.success is True
    assert result.token is not None
```

**Run test:**

```bash
pytest tests/test_auth.py
# FAIL: ModuleNotFoundError: No module named 'app.auth'
```

### Step 2: GREEN - Minimal Implementation

```python
# app/auth.py
from dataclasses import dataclass

@dataclass
class AuthResult:
    success: bool
    token: str | None

def authenticate_user(email: str, password: str) -> AuthResult:
    # Minimal implementation - just make test pass
    return AuthResult(success=True, token="abc123")
```

**Run test:**

```bash
pytest tests/test_auth.py
# PASS: 1 passed
```

### Step 3: REFACTOR - Add Real Logic

```python
# app/auth.py (refactored)
import jwt
from datetime import datetime, timedelta
from dataclasses import dataclass

@dataclass
class AuthResult:
    success: bool
    token: str | None

def authenticate_user(email: str, password: str) -> AuthResult:
    if not _validate_credentials(email, password):
        return AuthResult(success=False, token=None)

    token = _generate_jwt(email)
    return AuthResult(success=True, token=token)

def _validate_credentials(email: str, password: str) -> bool:
    # Real validation logic
    pass

def _generate_jwt(email: str) -> str:
    payload = {
        "sub": email,
        "exp": datetime.utcnow() + timedelta(hours=1)
    }
    return jwt.encode(payload, SECRET_KEY, algorithm="HS256")
```

**Run all tests:**

```bash
pytest
# PASS: All tests passing
```

**Run linter:**

```bash
ruff check .
# All checks passed!
```

## Success Criteria

### Per-Phase Success

- [ ] RED: Test fails for the right reason (feature missing)
- [ ] GREEN: Test passes with minimal code
- [ ] REFACTOR: Code clean, tests still pass, linter clean

### Overall Success

- [ ] All requirements from implementation plan met
- [ ] Test coverage ≥ 80%
- [ ] Linter passes with zero errors
- [ ] Cyclomatic complexity ≤ 10 per function
- [ ] All tests passing (0 failures)
- [ ] Output artifacts in correct workspace paths
- [ ] TaskUpdate(completed) with metadata

## Related Workflows

- **feature-development-workflow.md**: Enterprise end-to-end workflow (this is PHASE_2_IMPLEMENT)
- **code-review-workflow.md**: Next phase after domain development
- **.claude/skills/tdd/SKILL.md**: Detailed TDD methodology

## Related Skills

- `tdd`: Test-driven development methodology
- `debugging`: Systematic debugging process
- `git-expert`: Version control operations
- `verification-before-completion`: Pre-completion verification gates
- `code-quality-expert`: Language-agnostic code quality rules
- Language-specific expert skills (typescript-expert, python-backend-expert, etc.)

## Memory Protocol (MANDATORY)

**Before starting:**
Read `.claude/context/memory/learnings.md`

**After completing:**

- New pattern → `.claude/context/memory/learnings.md`
- Issue found → `.claude/context/memory/issues.md`
- Language-specific gotcha → `.claude/context/memory/decisions.md`

> ASSUME INTERRUPTION: If it's not in memory, it didn't happen.
