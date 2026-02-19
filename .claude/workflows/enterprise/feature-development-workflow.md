# Enterprise Feature Development Workflow

Orchestrate end-to-end feature development from requirements to production deployment.

**Extended Thinking**: This workflow orchestrates specialized agents through comprehensive feature development phases - from discovery and planning through implementation, testing, and deployment. Each phase builds on previous outputs, ensuring coherent feature delivery. The workflow supports multiple development methodologies (traditional, TDD/BDD, DDD), feature complexity levels, and modern deployment strategies including feature flags, gradual rollouts, and observability-first development. Agents receive detailed context from previous phases to maintain consistency and quality throughout the development lifecycle.

## Configuration Options

### Development Methodology

- **traditional**: Sequential development with testing after implementation
- **tdd**: Test-Driven Development with red-green-refactor cycles
- **bdd**: Behavior-Driven Development with scenario-based testing
- **ddd**: Domain-Driven Design with bounded contexts and aggregates

### Feature Complexity

- **simple**: Single service, minimal integration (1-2 days)
- **medium**: Multiple services, moderate integration (3-5 days)
- **complex**: Cross-domain, extensive integration (1-2 weeks)
- **epic**: Major architectural changes, multiple teams (2+ weeks)

### Deployment Strategy

- **direct**: Immediate rollout to all users
- **canary**: Gradual rollout starting with 5% of traffic
- **feature-flag**: Controlled activation via feature toggles
- **blue-green**: Zero-downtime deployment with instant rollback
- **a-b-test**: Split traffic for experimentation and metrics

## Phase 1: Discovery & Requirements Planning

### Step 1: Business Analysis & Requirements

**Agent**: Planner with plan-generator skill

**Task Spawn**:

```javascript
Task({
  task_id: 'task-1',
  subagent_type: 'general-purpose',
  description: 'Business analysis for feature requirements',
  prompt: `You are the PLANNER agent.

## Task
Analyze feature requirements for: $FEATURE_NAME

## Instructions
1. Read your agent definition: .claude/agents/core/planner.md
2. **Invoke skills**: Skill({ skill: "interactive-requirements-gathering" })
3. Define user stories, acceptance criteria, success metrics, and business value
4. Identify stakeholders, dependencies, and risks
5. Create feature specification document with clear scope boundaries
6. Save output to: .claude/context/plans/feature-$FEATURE_NAME-requirements.md

## Context
- Initial feature request: $ARGUMENTS
- Business context: [provide relevant business context]

## Memory Protocol
1. Read .claude/context/memory/learnings.md first
2. Record decisions to .claude/context/memory/decisions.md
`,
});
```

**Expected Output**: Requirements document with user stories, success metrics, risk assessment

### Step 2: Technical Architecture Design

**Agent**: Architect

**Task Spawn**:

```javascript
Task({
  task_id: 'task-2',
  subagent_type: 'general-purpose',
  description: 'Technical architecture design',
  prompt: `You are the ARCHITECT agent.

## Task
Design technical architecture for feature: $FEATURE_NAME

## Instructions
1. Read your agent definition: .claude/agents/core/architect.md
2. Review requirements: .claude/context/plans/feature-$FEATURE_NAME-requirements.md
3. Define service boundaries, API contracts, data models, integration points
4. Consider scalability, performance, and security requirements
5. Create architecture diagrams and technical design document
6. Save output to: .claude/context/plans/feature-$FEATURE_NAME-architecture.md

## Context
- Business requirements from Step 1
- Existing system architecture

## Memory Protocol
1. Read .claude/context/memory/learnings.md first
2. Record architectural decisions to .claude/context/memory/decisions.md
`,
});
```

**Expected Output**: Technical design document with architecture diagrams, API specifications, data models

### Step 3: Security & Risk Assessment

**Agent**: Security Architect

**Task Spawn**:

```javascript
Task({
  task_id: 'task-3',
  subagent_type: 'general-purpose',
  description: 'Security and risk assessment',
  prompt: `You are the SECURITY-ARCHITECT agent.

## Task
Assess security implications and risks for feature: $FEATURE_NAME

## Instructions
1. Read your agent definition: .claude/agents/specialized/security-architect.md
2. **Invoke security-architect skill**: Skill({ skill: "security-architect" })
3. Review architecture: .claude/context/plans/feature-$FEATURE_NAME-architecture.md
4. Identify security requirements, compliance needs, data privacy concerns
5. Create security assessment with risk matrix, compliance checklist
6. Save output to: .claude/context/reports/feature-$FEATURE_NAME-security.md

## Context
- Technical design from Step 2
- Regulatory requirements

## Memory Protocol
1. Read .claude/context/memory/learnings.md first
2. Record security findings to .claude/context/memory/issues.md
`,
});
```

**Expected Output**: Security assessment with risk matrix, compliance checklist, mitigation strategies

## Phase 2: Implementation & Development

### Step 4: Backend Services Implementation

**Agent**: Developer with backend-expert and tdd skills

**Task Spawn**:

```javascript
Task({
  task_id: 'task-4',
  subagent_type: 'general-purpose',
  description: 'Backend services implementation',
  prompt: `You are the DEVELOPER agent.

## Task
Implement backend services for: $FEATURE_NAME

## Instructions
1. Read your agent definition: .claude/agents/core/developer.md
2. **Invoke skills**:
   - Skill({ skill: "backend-expert" })
   - Skill({ skill: "tdd" }) // If methodology=tdd
3. Follow technical design: .claude/context/plans/feature-$FEATURE_NAME-architecture.md
4. Build RESTful/GraphQL APIs, implement business logic
5. Integrate with data layer, add resilience patterns (circuit breakers, retries)
6. Implement caching strategies and feature flags for gradual rollout
7. Follow TDD cycle: RED (failing test) → GREEN (minimal code) → REFACTOR

## Context
- Technical design, API contracts, data models
- Development methodology: $METHODOLOGY

## Memory Protocol
1. Read .claude/context/memory/learnings.md first
2. Record patterns to .claude/context/memory/learnings.md
`,
});
```

**Expected Output**: Backend services with APIs, business logic, database integration, feature flags

### Step 5: Frontend Implementation

**Agent**: Developer with frontend-expert skill

**Task Spawn**:

```javascript
Task({
  task_id: 'task-5',
  subagent_type: 'general-purpose',
  description: 'Frontend components implementation',
  prompt: `You are the DEVELOPER agent.

## Task
Build frontend components for: $FEATURE_NAME

## Instructions
1. Read your agent definition: .claude/agents/core/developer.md
2. **Invoke skills**:
   - Skill({ skill: "frontend-expert" }) // or react-expert, vue-expert, etc.
   - Skill({ skill: "tdd" }) // If methodology=tdd
3. Integrate with backend APIs from Step 4
4. Implement responsive UI, state management, error handling
5. Add loading states and analytics tracking
6. Integrate feature flags for A/B testing capabilities

## Context
- Backend APIs from Step 4
- UI/UX designs, user stories

## Memory Protocol
1. Read .claude/context/memory/learnings.md first
2. Record UI patterns to .claude/context/memory/learnings.md
`,
});
```

**Expected Output**: Frontend components with API integration, state management, analytics

### Step 6: Data Pipeline & Integration

**Agent**: Developer with data-engineering-expert skill

**Task Spawn**:

```javascript
Task({
  task_id: 'task-6',
  subagent_type: 'general-purpose',
  description: 'Data pipelines and integration',
  prompt: `You are the DEVELOPER agent.

## Task
Build data pipelines for: $FEATURE_NAME

## Instructions
1. Read your agent definition: .claude/agents/core/developer.md
2. **Invoke skill**: Skill({ skill: "data-engineering-expert" })
3. Design ETL/ELT processes, implement data validation
4. Create analytics events, set up data quality monitoring
5. Integrate with product analytics platforms for feature usage tracking

## Context
- Data requirements from architecture
- Analytics needs: $ANALYTICS_PLATFORM
- Existing data infrastructure

## Memory Protocol
1. Read .claude/context/memory/learnings.md first
2. Record data patterns to .claude/context/memory/learnings.md
`,
});
```

**Expected Output**: Data pipelines, analytics events, data quality checks

## Phase 3: Testing & Quality Assurance

### Step 7: Automated Test Suite

**Agent**: QA with tdd skill

**Task Spawn**:

```javascript
Task({
  task_id: 'task-7',
  subagent_type: 'general-purpose',
  description: 'Comprehensive test suite creation',
  prompt: `You are the QA agent.

## Task
Create comprehensive test suite for: $FEATURE_NAME

## Instructions
1. Read your agent definition: .claude/agents/core/qa.md
2. **Invoke skill**: Skill({ skill: "tdd" })
3. Write unit tests for backend and frontend implementations
4. Add integration tests for API endpoints
5. Create E2E tests for critical user journeys
6. Add performance tests for scalability validation
7. Ensure minimum $TEST_COVERAGE_MIN% code coverage

## Context
- Backend implementation from Step 4
- Frontend implementation from Step 5
- Acceptance criteria from requirements
- Test coverage minimum: $TEST_COVERAGE_MIN (default: 80%)

## Memory Protocol
1. Read .claude/context/memory/learnings.md first
2. Record testing patterns to .claude/context/memory/learnings.md
`,
});
```

**Expected Output**: Test suites with unit, integration, E2E, and performance tests

### Step 8: Security Validation

**Agent**: Security Architect

**Task Spawn**:

```javascript
Task({
  task_id: 'task-8',
  subagent_type: 'general-purpose',
  description: 'Security testing and validation',
  prompt: `You are the SECURITY-ARCHITECT agent.

## Task
Perform security testing for: $FEATURE_NAME

## Instructions
1. Read your agent definition: .claude/agents/specialized/security-architect.md
2. **Invoke skill**: Skill({ skill: "security-architect" })
3. Review backend implementation from Step 4 and frontend from Step 5
4. Run OWASP checks, penetration testing, dependency scanning
5. Verify data encryption, authentication, and authorization
6. Create vulnerability report with remediation actions
7. Save output to: .claude/context/reports/feature-$FEATURE_NAME-security-validation.md

## Context
- Implementation code from Steps 4-5
- Security requirements from Step 3

## Memory Protocol
1. Read .claude/context/memory/learnings.md first
2. Record vulnerabilities to .claude/context/memory/issues.md
`,
});
```

**Expected Output**: Security test results, vulnerability report, remediation actions

### Step 9: Performance Optimization

**Agent**: Developer with performance-optimization skill

**Task Spawn**:

```javascript
Task({
  task_id: 'task-9',
  subagent_type: 'general-purpose',
  description: 'Performance optimization',
  prompt: `You are the DEVELOPER agent.

## Task
Optimize performance for: $FEATURE_NAME

## Instructions
1. Read your agent definition: .claude/agents/core/developer.md
2. **Invoke skill**: Skill({ skill: "performance-optimization" })
3. Analyze backend services and frontend from Steps 4-5
4. Profile code, optimize queries, implement caching
5. Reduce bundle sizes, improve load times
6. Set up performance budgets and monitoring
7. Target: $PERFORMANCE_BUDGET (default: <200ms response time)

## Context
- Implementation code from Steps 4-5
- Performance requirements: $PERFORMANCE_BUDGET

## Memory Protocol
1. Read .claude/context/memory/learnings.md first
2. Record optimizations to .claude/context/memory/learnings.md
`,
});
```

**Expected Output**: Performance improvements, optimization report, performance metrics

## Phase 4: Deployment & Monitoring

### Step 10: Deployment Strategy & Pipeline

**Agent**: DevOps

**Task Spawn**:

```javascript
Task({
  task_id: 'task-10',
  subagent_type: 'general-purpose',
  description: 'Deployment pipeline preparation',
  prompt: `You are the DEVOPS agent.

## Task
Prepare deployment for: $FEATURE_NAME

## Instructions
1. Read your agent definition: .claude/agents/specialized/devops.md
2. **Invoke skills**:
   - Skill({ skill: "cicd-expert" })
   - Skill({ skill: "deployment-strategies" })
3. Create CI/CD pipeline with automated tests from Step 7
4. Configure feature flags for gradual rollout
5. Implement $DEPLOYMENT_STRATEGY deployment strategy
6. Set up rollback procedures and create deployment runbook
7. Save runbook to: .claude/context/runbooks/feature-$FEATURE_NAME-deployment.md

## Context
- Test suites from Step 7
- Deployment strategy: $DEPLOYMENT_STRATEGY
- Rollout percentage: $ROLLOUT_PERCENTAGE (default: 5%)
- Feature flag service: $FEATURE_FLAG_SERVICE

## Memory Protocol
1. Read .claude/context/memory/learnings.md first
2. Record deployment patterns to .claude/context/memory/learnings.md
`,
});
```

**Expected Output**: CI/CD pipeline, deployment configuration, rollback procedures

### Step 11: Observability & Monitoring

**Agent**: DevOps with observability skill

**Task Spawn**:

```javascript
Task({
  task_id: 'task-11',
  subagent_type: 'general-purpose',
  description: 'Observability and monitoring setup',
  prompt: `You are the DEVOPS agent.

## Task
Set up observability for: $FEATURE_NAME

## Instructions
1. Read your agent definition: .claude/agents/specialized/devops.md
2. **Invoke skill**: Skill({ skill: "observability-expert" })
3. Implement distributed tracing, custom metrics, error tracking
4. Create dashboards for feature usage, performance, error rates, KPIs
5. Set up SLOs/SLIs with automated alerts
6. Monitoring stack: $MONITORING_STACK

## Context
- Feature implementation from Steps 4-6
- Success metrics from requirements
- Monitoring stack: $MONITORING_STACK (default: grafana)

## Memory Protocol
1. Read .claude/context/memory/learnings.md first
2. Record monitoring patterns to .claude/context/memory/learnings.md
`,
});
```

**Expected Output**: Monitoring dashboards, alerts, SLO definitions, observability infrastructure

### Step 12: Documentation & Knowledge Transfer

**Agent**: Developer with documentation skill

**Task Spawn**:

```javascript
Task({
  task_id: 'task-12',
  subagent_type: 'general-purpose',
  description: 'Comprehensive documentation generation',
  prompt: `You are the DEVELOPER agent.

## Task
Generate comprehensive documentation for: $FEATURE_NAME

## Instructions
1. Read your agent definition: .claude/agents/core/developer.md
2. **Invoke skill**: Skill({ skill: "documentation-expert" })
3. Create API documentation, user guides, deployment guides
4. Include troubleshooting runbooks
5. Add architecture diagrams, data flow diagrams, integration guides
6. Generate automated changelog from commits
7. Save to: .claude/context/docs/feature-$FEATURE_NAME/

## Context
- All previous phases' outputs
- Architecture from Step 2
- Implementation from Steps 4-6

## Memory Protocol
1. Read .claude/context/memory/learnings.md first
2. Record documentation patterns to .claude/context/memory/learnings.md
`,
});
```

**Expected Output**: API docs, user guides, runbooks, architecture documentation

## Execution Parameters

### Required Parameters

- **--feature**: Feature name and description
- **--methodology**: Development approach (traditional|tdd|bdd|ddd)
- **--complexity**: Feature complexity level (simple|medium|complex|epic)

### Optional Parameters

- **--deployment-strategy**: Deployment approach (direct|canary|feature-flag|blue-green|a-b-test) [default: canary]
- **--test-coverage-min**: Minimum test coverage threshold [default: 80]
- **--performance-budget**: Performance requirements [default: <200ms response time]
- **--rollout-percentage**: Initial rollout percentage for gradual deployment [default: 5]
- **--feature-flag-service**: Feature flag provider (launchdarkly|split|unleash|custom)
- **--analytics-platform**: Analytics integration (segment|amplitude|mixpanel|custom)
- **--monitoring-stack**: Observability tools (datadog|newrelic|grafana|custom) [default: grafana]

## Success Criteria

- All acceptance criteria from business requirements are met
- Test coverage exceeds minimum threshold (80% default)
- Security scan shows no critical vulnerabilities
- Performance meets defined budgets and SLOs
- Feature flags configured for controlled rollout
- Monitoring and alerting fully operational
- Documentation complete and approved
- Successful deployment to production with rollback capability
- Product analytics tracking feature usage
- A/B test metrics configured (if applicable)

## Rollback Strategy

If issues arise during or after deployment:

1. **Immediate feature flag disable** (< 1 minute)
2. **Blue-green traffic switch** (< 5 minutes)
3. **Full deployment rollback via CI/CD** (< 15 minutes)
4. **Database migration rollback if needed** (coordinate with data team)
5. **Incident post-mortem and fixes** before re-deployment

## Usage Example

```javascript
// Router spawning workflow orchestrator
Task({
  task_id: 'task-13',
  subagent_type: 'general-purpose',
  description: 'Orchestrating feature development workflow',
  prompt: `Execute enterprise feature development workflow.

## Parameters
- Feature: User authentication with OAuth2
- Methodology: tdd
- Complexity: medium
- Deployment Strategy: canary
- Test Coverage: 85%
- Performance Budget: <150ms response time

## Instructions
Follow the phased workflow in: .claude/workflows/enterprise/feature-development-workflow.md

Execute each phase sequentially, spawning appropriate agents with correct skills.
`,
});
```

## Agent-Skill Mapping Reference

| Original Agent Type                                | Framework Agent    | Required Skills                    |
| -------------------------------------------------- | ------------------ | ---------------------------------- |
| `business-analytics::business-analyst`             | planner            | plan-generator                     |
| `comprehensive-review::architect-review`           | architect          | -                                  |
| `security-scanning::security-auditor`              | security-architect | security-architect                 |
| `backend-architect`                                | developer          | backend-expert, tdd                |
| `frontend-mobile-development::frontend-developer`  | developer          | frontend-expert, react-expert      |
| `data-engineering::data-engineer`                  | developer          | data-engineering-expert            |
| `unit-testing::test-automator`                     | qa                 | tdd                                |
| `application-performance::performance-engineer`    | developer          | performance-optimization           |
| `deployment-strategies::deployment-engineer`       | devops             | cicd-expert, deployment-strategies |
| `observability-monitoring::observability-engineer` | devops             | observability-expert               |
| `documentation-generation::docs-architect`         | developer          | documentation-expert               |

## Notes

- This workflow integrates with the Task tracking system for multi-phase coordination
- All agents follow Memory Protocol (read learnings.md, write to memory files)
- Agents use Skill() tool to invoke specialized capabilities
- Each phase builds on previous outputs via saved artifacts in .claude/context/
- Workflow supports parallel agent spawning where phases are independent
