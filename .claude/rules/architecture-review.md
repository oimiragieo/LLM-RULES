# Architecture Review Rules

## Core Principles

- Evaluate designs against non-functional requirements (performance, security, scalability)
- Identify anti-patterns before implementation begins
- Ensure architectural decisions align with system constraints
- Focus on long-term maintainability, not just immediate functionality

## Input Requirements

- Architecture diagram or design document
- Non-functional requirements (NFRs)
- System constraints (performance, security, budget)
- Technology stack and dependencies
- Expected load and scale

## Output Standards

### Required Review Elements

1. **Architecture Assessment**: Overall design quality (strong/adequate/weak)
2. **Anti-Patterns Identified**: List of detected anti-patterns with severity
3. **NFR Compliance**: How design meets non-functional requirements
4. **Risk Analysis**: Technical risks with mitigation strategies
5. **Recommendations**: Specific improvements ranked by priority
6. **Trade-offs**: Documented design trade-offs and rationale

### Review Categories

| Category        | Focus Areas                                | Red Flags                                  |
| --------------- | ------------------------------------------ | ------------------------------------------ |
| Performance     | Response times, throughput, resource usage | N+1 queries, no caching, blocking I/O      |
| Security        | Auth, encryption, data protection          | Hardcoded secrets, no input validation     |
| Scalability     | Horizontal/vertical scaling capability     | Single points of failure, tight coupling   |
| Reliability     | Fault tolerance, error handling            | No circuit breakers, missing health checks |
| Maintainability | Code organization, documentation           | Tight coupling, no separation of concerns  |

## Anti-Patterns

### Common Architecture Anti-Patterns

| Anti-Pattern            | Problem                             | Fix                                  |
| ----------------------- | ----------------------------------- | ------------------------------------ |
| God Object              | Single class does everything        | Split into cohesive services         |
| Tight Coupling          | Components depend on implementation | Use interfaces/dependency injection  |
| No Caching              | Redundant expensive operations      | Add caching layer (Redis, Memcached) |
| Synchronous Everything  | Blocking calls limit throughput     | Use async patterns, message queues   |
| Single Point of Failure | One component fails = system fails  | Add redundancy, load balancing       |
| No Monitoring           | Can't detect/diagnose issues        | Add metrics, logging, tracing        |
| Database as Integration | Services share database             | Use APIs for service communication   |
| No API Versioning       | Breaking changes break clients      | Implement API versioning strategy    |

## Integration Points

### Agents Using This Skill

- **architect** (primary): Reviews architecture designs
- **planner**: Validates plans have sound architecture
- **security-architect**: Reviews security architecture aspects
- **database-architect**: Reviews data architecture aspects

### Related Skills

- **complexity-assessment**: Determines review depth
- **plan-generator**: Uses review feedback to adjust plans
- **security-architect**: Deep security analysis
- **diagram-generator**: Creates architecture diagrams for review

### Workflows

- **feature-development-workflow.md**: Architecture review in Design phase
- **enterprise-workflow.md**: Architecture review gate
- **migration-workflow.md**: Architecture review before migration

## Review Checklist

Before finalizing architecture review, verify:

- [ ] All NFRs addressed (performance, security, scalability)
- [ ] Anti-patterns identified with severity (Critical/High/Medium/Low)
- [ ] Single points of failure documented
- [ ] Caching strategy appropriate
- [ ] Error handling comprehensive
- [ ] Monitoring and observability planned
- [ ] Security reviewed (auth, encryption, input validation)
- [ ] Scalability path clear (horizontal vs vertical)
- [ ] Technology choices justified
- [ ] Trade-offs documented

## NFR Template

When reviewing against non-functional requirements, use this template:

| NFR Category    | Requirement               | Design Approach                | Compliant? | Gaps                  |
| --------------- | ------------------------- | ------------------------------ | ---------- | --------------------- |
| Performance     | <95th percentile          | Redis cache, async processing  | ✅ Yes     | None                  |
| Security        | OAuth 2.1, JWT            | Auth middleware, token refresh | ✅ Yes     | Rate limiting missing |
| Scalability     | 10x current load          | Horizontal scaling, stateless  | ✅ Yes     | None                  |
| Availability    | 99.9% uptime              | Load balancer, health checks   | ⚠️ Partial | No circuit breakers   |
| Maintainability | <10 cyclomatic complexity | Modular design, DI             | ✅ Yes     | None                  |

## Iron Law

```
NO IMPLEMENTATION WITHOUT ARCHITECTURE REVIEW FOR COMPLEX+ TASKS
```

COMPLEX and EPIC complexity tasks must have architecture review before implementation begins.

## Related References

- `.claude/skills/architecture-review/SKILL.md` - Full skill documentation
- `architect` agent - Performs architecture reviews
- `complexity-assessment` skill - Determines if review is required
