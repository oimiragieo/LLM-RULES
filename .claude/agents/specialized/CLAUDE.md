# Specialized Agents

25 cross-cutting concern specialists that handle specific technical disciplines. These are preferred over the generic `developer` agent for their respective domains.

## Agents

### Code Quality & Review

| File                     | Purpose                    | Key Details                                                                    |
| ------------------------ | -------------------------- | ------------------------------------------------------------------------------ |
| `code-reviewer.md`       | Two-stage code review      | Spec compliance first, then code quality. Senior-level PR reviews.             |
| `code-simplifier.md`     | Code cleanup & refactoring | Simplifies for clarity and maintainability. Focuses on recently modified code. |
| `conductor-validator.md` | Project validation         | Validates completeness, consistency, and correctness of project artifacts.     |

### Security & Reliability

| File                    | Purpose                 | Key Details                                                                           |
| ----------------------- | ----------------------- | ------------------------------------------------------------------------------------- |
| `security-architect.md` | Security architecture   | Threat modeling, auth systems, zero-trust, OWASP Top 10. Mandatory for auth/PII.      |
| `penetration-tester.md` | Ethical hacking         | OWASP testing, vulnerability scanning, CVSS scoring. Requires authorization.          |
| `chaos-engineer.md`     | Resilience testing      | Failure injection, circuit breakers, bulkheads, hypothesis-driven chaos testing.      |
| `incident-responder.md` | SRE incident response   | Incident command, blameless post-mortems, error budgets. Use IMMEDIATELY for outages. |
| `sre-engineer.md`       | Reliability engineering | SLO/SLI definition, error budgets, production readiness, toil reduction.              |

### DevOps & Infrastructure

| File                       | Purpose            | Key Details                                                                 |
| -------------------------- | ------------------ | --------------------------------------------------------------------------- |
| `devops.md`                | CI/CD & deployment | Containerization, K8s, cloud architecture, monitoring, release management.  |
| `devops-troubleshooter.md` | Incident debugging | Log analysis, distributed tracing, K8s debugging, performance optimization. |

### Architecture & Documentation

| File                      | Purpose                  | Key Details                                                                      |
| ------------------------- | ------------------------ | -------------------------------------------------------------------------------- |
| `database-architect.md`   | Database design          | Schema design, query optimization, migration planning, data modeling.            |
| `researcher.md`           | Research & fact-finding  | Web access, Exa tools. External information gathering, best practices research.  |
| `ecosystem-auditor.md`    | Codebase auditing        | Maps tech stack, compares against Agent Studio capabilities, triggers evolution. |
| `reverse-engineer.md`     | Binary analysis          | Disassembly, decompilation, IDA Pro, Ghidra, radare2.                            |
| `advanced-debugging.md`   | Multi-layer debugging    | Application code, runtime internals, memory profiling, distributed systems.      |
| `performance-engineer.md` | Performance optimization | Profiling, load testing, bottleneck identification, optimization validation.     |

### C4 Architecture Documentation

| File              | Purpose              | Key Details                                                 |
| ----------------- | -------------------- | ----------------------------------------------------------- |
| `c4-code.md`      | Code-level docs      | Function signatures, dependencies, code structure analysis. |
| `c4-component.md` | Component-level docs | Component boundaries, interfaces, relationships.            |
| `c4-container.md` | Container-level docs | Deployment units, container interfaces, APIs.               |
| `c4-context.md`   | Context-level docs   | System context diagrams, personas, user journeys.           |

### Testing & Validation

| File                      | Purpose         | Key Details                                                          |
| ------------------------- | --------------- | -------------------------------------------------------------------- |
| `accessibility-tester.md` | WCAG compliance | WCAG 2.2 Level AA, screen reader compatibility, keyboard navigation. |

### Task Management

| File              | Purpose      | Key Details                                                          |
| ----------------- | ------------ | -------------------------------------------------------------------- |
| `task-manager.md` | Task hygiene | Audits task state, verifies framework health, closes orphaned tasks. |
