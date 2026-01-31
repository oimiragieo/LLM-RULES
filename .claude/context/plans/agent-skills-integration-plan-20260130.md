# Agent Skills Integration Plan

**Created**: 2026-01-30
**Project**: Restore and integrate agent-skills-main into agent-studio
**Target**: Full integration with validation and CI/CD support

---

## Phase Overview

```
Phase 1: Foundation (1-2 weeks)      [Skills Import + Build System]
    ↓
Phase 2: Integration (2-3 weeks)     [Validation + Hook Integration]
    ↓
Phase 3: Validation (1 week)         [Testing + CI/CD]
    ↓
Phase 4: Enhancement (2-3 weeks)     [Agent Routing + Capabilities]
    ↓
Phase 5: Documentation (1 week)      [Guides + Examples]
```

**Total Effort**: 7-10 weeks of steady-state work
**Recommended Velocity**: 2-3 tasks per week per developer

---

## Phase 1: Foundation Setup (Weeks 1-2)

### Goal

Import skills and build system with minimal modifications.

### Tasks

#### 1.1: Import React Best Practices Skill

**Effort**: 3 days (Low-Medium)
**Status**: Not started

**Description**:
Copy `react-best-practices` skill into agent-studio ecosystem.

**Subtasks**:

1. Create `.claude/skills/react-best-practices-vercel/` directory
2. Copy all rule files from archived project
3. Copy SKILL.md and metadata.json
4. Update relative paths in documentation
5. Verify rule count: 59 rules across 8 categories
6. Test skill loads in agent context
7. Add to skill catalog

**Files to Create**:

- `.claude/skills/react-best-practices-vercel/SKILL.md`
- `.claude/skills/react-best-practices-vercel/metadata.json`
- `.claude/skills/react-best-practices-vercel/rules/` (59 rule files)

**Tests**:

- Skill parsing succeeds
- All 59 rules present
- Frontmatter metadata valid
- No broken cross-references

**Acceptance Criteria**:

- [x] Skill directory created with all files
- [x] Rule files copied without corruption
- [x] Skill loads in Skill() tool
- [x] Catalog updated
- [x] All 59 rules accessible

---

#### 1.2: Import React Native Skills

**Effort**: 2 days (Low)
**Status**: Not started
**Depends on**: 1.1

**Description**:
Import React Native/Expo best practices skill.

**Subtasks**:

1. Create `.claude/skills/react-native-skills-vercel/` directory
2. Copy all 38 rule files
3. Copy SKILL.md and metadata.json
4. Verify categories: Performance (8), Animation (3), Navigation (1), UI (9), State (5), Rendering (2), Monorepo (2), Config (2)
5. Test skill loads correctly
6. Add to catalog

**Files to Create**:

- `.claude/skills/react-native-skills-vercel/SKILL.md`
- `.claude/skills/react-native-skills-vercel/metadata.json`
- `.claude/skills/react-native-skills-vercel/rules/` (38 files)

**Tests**:

- All 38 rules present
- Categories balanced
- No duplicate prefixes

**Acceptance Criteria**:

- [x] 38 rules imported
- [x] Skill loads successfully
- [x] Catalog updated

---

#### 1.3: Import Composition Patterns Skill

**Effort**: 1 day (Low)
**Status**: Not started
**Depends on**: 1.1

**Description**:
Import React composition patterns skill.

**Subtasks**:

1. Create `.claude/skills/composition-patterns-vercel/` directory
2. Copy 10 rule files
3. Copy SKILL.md and metadata.json
4. Include React 19 API rules
5. Test skill loads
6. Add to catalog

**Files to Create**:

- `.claude/skills/composition-patterns-vercel/SKILL.md`
- `.claude/skills/composition-patterns-vercel/metadata.json`
- `.claude/skills/composition-patterns-vercel/rules/` (10 files)

**Tests**:

- All 10 rules present
- React 19 rules included
- Frontmatter valid

**Acceptance Criteria**:

- [x] 10 rules imported
- [x] React 19 rules present
- [x] Skill loads

---

#### 1.4: Import Web Design Guidelines Skill

**Effort**: 1 day (Low)
**Status**: Not started
**Depends on**: 1.1

**Description**:
Import web design/accessibility audit skill (dynamic content).

**Subtasks**:

1. Create `.claude/skills/web-design-guidelines-vercel/` directory
2. Copy SKILL.md (contains fetch logic for external guidelines)
3. Copy metadata.json
4. Document dynamic fetch behavior
5. Test skill loads and fetch works
6. Add to catalog

**Files to Create**:

- `.claude/skills/web-design-guidelines-vercel/SKILL.md`
- `.claude/skills/web-design-guidelines-vercel/metadata.json`

**Tests**:

- Skill loads
- External fetch logic works
- Fallback handling correct

**Acceptance Criteria**:

- [x] Skill loads
- [x] Fetch logic verified
- [x] Catalog updated

---

#### 1.5: Import Build System Tooling

**Effort**: 2 days (Low-Medium)
**Status**: Not started

**Description**:
Copy build system for compiling skill rules.

**Subtasks**:

1. Create `.claude/lib/skill-build/` directory structure
2. Copy TypeScript source files:
   - `build.ts` - Compilation engine
   - `parser.ts` - Markdown parser
   - `config.ts` - Configuration
   - `validate.ts` - Validation
   - `extract-tests.ts` - Test extraction
   - `types.ts` - Type definitions
   - `migrate.ts` - Migration utilities
3. Copy tsconfig.json and package.json
4. Update import paths for agent-studio structure
5. Create npm scripts in root package.json:
   ```json
   {
     "skill:build": "tsx .claude/lib/skill-build/src/build.ts",
     "skill:validate": "tsx .claude/lib/skill-build/src/validate.ts",
     "skill:extract-tests": "tsx .claude/lib/skill-build/src/extract-tests.ts"
   }
   ```
6. Test build runs without errors

**Files to Create**:

- `.claude/lib/skill-build/src/build.ts`
- `.claude/lib/skill-build/src/parser.ts`
- `.claude/lib/skill-build/src/config.ts`
- `.claude/lib/skill-build/src/validate.ts`
- `.claude/lib/skill-build/src/extract-tests.ts`
- `.claude/lib/skill-build/src/types.ts`
- `.claude/lib/skill-build/src/migrate.ts`
- `.claude/lib/skill-build/tsconfig.json`

**Tests**:

- TypeScript compiles
- Build script runs
- Output is valid markdown

**Acceptance Criteria**:

- [x] All source files copied
- [x] Build runs successfully
- [x] npm scripts configured
- [x] No compilation errors

---

#### 1.6: Set Up Build Infrastructure

**Effort**: 2 days (Medium)
**Status**: Not started
**Depends on**: 1.5

**Description**:
Create CI/CD pipeline for skill validation and compilation.

**Subtasks**:

1. Create `.github/workflows/skill-build-validate.yml`
   - Trigger on skills/\* changes
   - Run TypeScript compilation
   - Run rule validation
   - Extract test cases
   - Report results
2. Create validation hook: `.claude/hooks/skills/rule-validator.cjs`
   - Validate rule structure
   - Check metadata
   - Detect duplicates
   - Enforce naming
3. Create pre-commit hook for skill validation
4. Document build process in `.claude/docs/SKILL_BUILD.md`
5. Test workflow runs successfully

**Files to Create**:

- `.github/workflows/skill-build-validate.yml`
- `.claude/hooks/skills/rule-validator.cjs`
- `.claude/docs/SKILL_BUILD.md`

**Tests**:

- Workflow triggers correctly
- Validation catches errors
- Hook runs on commits

**Acceptance Criteria**:

- [x] Workflow created
- [x] Validation hook works
- [x] Documentation complete
- [x] Pre-commit hook configured

---

### Phase 1 Completion Criteria

- [x] 5 skills imported (React, Native, Composition, Web Design, Deploy)
- [x] 107 total rules in skill catalog
- [x] Build system integrated
- [x] CI/CD pipeline created
- [x] All tests passing
- [x] Skills available via `Skill()` tool

---

## Phase 2: Integration & Validation (Weeks 2-4)

### Goal

Integrate skills with existing agent-studio infrastructure and validation systems.

### Tasks

#### 2.1: Create Skill Validation Hooks

**Effort**: 3 days (Medium)
**Status**: Not started
**Depends on**: 1.5, 1.6

**Description**:
Build validation system to enforce skill standards.

**Subtasks**:

1. Create `.claude/hooks/skills/metadata-validator.cjs`
   - Validate frontmatter format
   - Check required fields: name, description, author, version
   - Verify trigger phrases
   - Check license field
2. Create `.claude/hooks/skills/rule-structure-validator.cjs`
   - Enforce rule template (Problem, Why, Wrong, Right, Impact)
   - Check for required sections
   - Validate code examples
   - Verify cross-references
3. Create `.claude/hooks/skills/duplicate-detector.cjs`
   - Find duplicate rule IDs
   - Detect overlapping trigger phrases
   - Flag naming conflicts
4. Integrate into pre-commit hooks
5. Add configuration for error levels (block/warn/info)

**Files to Create**:

- `.claude/hooks/skills/metadata-validator.cjs`
- `.claude/hooks/skills/rule-structure-validator.cjs`
- `.claude/hooks/skills/duplicate-detector.cjs`

**Tests**:

- Validation catches missing fields
- Duplicate detection works
- Hook runs in CI/CD
- Error levels configurable

**Acceptance Criteria**:

- [x] Validators created
- [x] All checks pass
- [x] False positives: 0
- [x] Hook integrated in CI

---

#### 2.2: Update Skill Catalog

**Effort**: 2 days (Low-Medium)
**Status**: Not started
**Depends on**: 1.1-1.4

**Description**:
Update and expand skill catalog with new skills.

**Subtasks**:

1. Read `.claude/context/artifacts/skill-catalog.md`
2. Add new skills to inventory:
   - vercel-react-best-practices (59 rules)
   - vercel-react-native-skills (38 rules)
   - vercel-composition-patterns (10 rules)
   - vercel-web-design-guidelines (dynamic, 100+)
   - vercel-deploy (specialized)
3. Add to appropriate categories:
   - React/Frontend: React, Composition
   - Mobile: React Native
   - Design/UX: Web Design Guidelines
   - Deployment: Vercel Deploy
4. Update trigger phrase index
5. Add cross-references between skills
6. Update indexing for search

**Files to Modify**:

- `.claude/context/artifacts/skill-catalog.md` - Add 5 new entries
- `.claude/context/artifacts/skill-index.json` - Update index

**Tests**:

- Catalog reads correctly
- All skills indexed
- Search queries work
- No duplicate entries

**Acceptance Criteria**:

- [x] 5 new skills added
- [x] Catalog complete
- [x] Index updated
- [x] Search works

---

#### 2.3: Integrate with Agent Routing

**Effort**: 3 days (Medium)
**Status**: Not started
**Depends on**: 2.2

**Description**:
Add skills to agent routing system for automatic skill activation.

**Subtasks**:

1. Read `.claude/hooks/routing/router-enforcer.cjs`
2. Add trigger phrase mappings in `INTENT_TO_AGENT`:

   ```javascript
   // React Performance
   'react performance|next.js optimization|bundle size|code review|performance issues':
     { agent: 'frontend-pro', skills: ['react-best-practices-vercel'] },

   // React Native
   'react native|expo|mobile performance|list optimization|animation':
     { agent: 'expo-mobile-developer', skills: ['react-native-skills-vercel'] },

   // Component Architecture
   'boolean props|compound components|composition|component library':
     { agent: 'frontend-pro', skills: ['composition-patterns-vercel'] },

   // Web Design
   'accessibility audit|ui review|design guidelines|ux best practices':
     { agent: 'frontend-pro', skills: ['web-design-guidelines-vercel'] },

   // Deployment
   'deploy my app|push live|deployment':
     { agent: 'devops', skills: ['vercel-deploy'] }
   ```

3. Update `DISAMBIGUATION_RULES` for overlapping intents
4. Add skill preference ordering
5. Test routing with example prompts
6. Document in `.claude/docs/ROUTER_SKILL_MAPPING.md`

**Files to Modify**:

- `.claude/hooks/routing/router-enforcer.cjs` - Add mappings
- `.claude/docs/ROUTER_KEYWORD_GUIDE.md` - Document new keywords

**Tests**:

- Routing detects React performance queries
- Mobile skills activate on React Native
- Multiple skill activation works
- Ambiguous queries disambiguate correctly

**Acceptance Criteria**:

- [x] All trigger phrases mapped
- [x] Routing tests pass
- [x] 0 false positives
- [x] Documentation complete

---

#### 2.4: Create Skill Usage Documentation

**Effort**: 2 days (Low-Medium)
**Status**: Not started
**Depends on**: 1.1-1.4

**Description**:
Document how agents should use the new skills.

**Subtasks**:

1. Create `.claude/docs/SKILL_USAGE_GUIDE.md`
   - When to invoke each skill
   - Example trigger scenarios
   - Expected outputs
   - Performance impact
2. Create skill-specific guides:
   - `.claude/docs/REACT_PERFORMANCE_SKILL.md`
   - `.claude/docs/REACT_NATIVE_SKILL.md`
   - `.claude/docs/COMPOSITION_PATTERNS_SKILL.md`
   - `.claude/docs/WEB_DESIGN_SKILL.md`
   - `.claude/docs/VERCEL_DEPLOY_SKILL.md`
3. Add code review checklist examples
4. Document skill composition (using multiple skills)
5. Add troubleshooting section

**Files to Create**:

- `.claude/docs/SKILL_USAGE_GUIDE.md`
- `.claude/docs/REACT_PERFORMANCE_SKILL.md`
- `.claude/docs/REACT_NATIVE_SKILL.md`
- `.claude/docs/COMPOSITION_PATTERNS_SKILL.md`
- `.claude/docs/WEB_DESIGN_SKILL.md`
- `.claude/docs/VERCEL_DEPLOY_SKILL.md`

**Tests**:

- Documentation is complete
- Examples are accurate
- No broken references

**Acceptance Criteria**:

- [x] All guides created
- [x] Examples verified
- [x] Links working
- [x] Spell check passed

---

#### 2.5: Integrate with Agent Definition

**Effort**: 2 days (Medium)
**Status**: Not started
**Depends on**: 2.3, 2.4

**Description**:
Add skills to agent personality files.

**Subtasks**:

1. Update `.claude/agents/domain/frontend-pro.md`
   - Add skills section
   - Reference react-best-practices-vercel
   - Reference composition-patterns-vercel
   - Reference web-design-guidelines-vercel
   - Add to trigger phrase list
2. Update `.claude/agents/domain/expo-mobile-developer.md`
   - Add react-native-skills-vercel
   - Update trigger phrases
3. Update `.claude/agents/specialized/devops.md`
   - Add vercel-deploy skill
4. Update `.claude/agents/domain/nextjs-pro.md`
   - Add react-best-practices-vercel reference
5. Test agent definitions load correctly

**Files to Modify**:

- `.claude/agents/domain/frontend-pro.md` - Add 3 skills
- `.claude/agents/domain/expo-mobile-developer.md` - Add 1 skill
- `.claude/agents/specialized/devops.md` - Add 1 skill
- `.claude/agents/domain/nextjs-pro.md` - Add reference

**Tests**:

- Agent files parse correctly
- Skills referenced correctly
- No syntax errors

**Acceptance Criteria**:

- [x] All agent files updated
- [x] Skill references correct
- [x] No parsing errors
- [x] Agents ready for skill use

---

### Phase 2 Completion Criteria

- [x] Validation hooks created and tested
- [x] Skill catalog updated with 5 new entries
- [x] Agent routing configured
- [x] Usage documentation complete
- [x] Agent definitions updated
- [x] Integration tests passing

---

## Phase 3: Validation & Testing (Week 4-5)

### Goal

Comprehensive testing and validation of integrated skills.

### Tasks

#### 3.1: Create Skill Unit Tests

**Effort**: 3 days (Medium)
**Status**: Not started
**Depends on**: 2.1

**Description**:
Create unit tests for skill loading and parsing.

**Subtasks**:

1. Create `tests/skills/` directory
2. Create test suite `tests/skills/skill-loading.test.mjs`
   - Test each skill loads without errors
   - Verify rule counts
   - Check metadata parsing
   - Validate trigger phrases
3. Create test suite `tests/skills/rule-validation.test.mjs`
   - Test rule structure compliance
   - Verify frontmatter format
   - Check example code validity
   - Validate cross-references
4. Create test suite `tests/skills/routing-integration.test.mjs`
   - Test trigger phrase detection
   - Verify skill selection
   - Check disambiguation logic
5. Run test suite in CI/CD

**Files to Create**:

- `tests/skills/skill-loading.test.mjs`
- `tests/skills/rule-validation.test.mjs`
- `tests/skills/routing-integration.test.mjs`
- `tests/skills/fixtures/` - Test data

**Tests**:

- All 107 rules load
- No parsing errors
- Metadata valid
- Trigger phrases match
- Routing decisions correct

**Acceptance Criteria**:

- [x] 100+ tests created
- [x] All tests passing
- [x] Code coverage > 80%
- [x] CI integration working

---

#### 3.2: Create Integration Test Scenarios

**Effort**: 2 days (Medium)
**Status**: Not started
**Depends on**: 3.1

**Description**:
Test realistic skill usage scenarios.

**Subtasks**:

1. Create scenario: "Review React component for performance"
   - Trigger: "Review this React component"
   - Expected skill: react-best-practices-vercel
   - Expected agent: frontend-pro
   - Verify rule extraction
2. Create scenario: "Optimize React Native list"
   - Trigger: "My FlatList is slow"
   - Expected skill: react-native-skills-vercel
   - Expected agent: expo-mobile-developer
3. Create scenario: "Audit website for accessibility"
   - Trigger: "Check my site for accessibility"
   - Expected skill: web-design-guidelines-vercel
   - Verify fetch logic
4. Create scenario: "Deploy app to Vercel"
   - Trigger: "Deploy this to production"
   - Expected skill: vercel-deploy
   - Expected agent: devops
5. Create scenario: "Fix component composition"
   - Trigger: "Refactor my component"
   - Expected skill: composition-patterns-vercel
   - Verify rule application

**Files to Create**:

- `tests/skills/scenarios/` directory
- `tests/skills/scenarios/react-performance.test.mjs`
- `tests/skills/scenarios/react-native.test.mjs`
- `tests/skills/scenarios/web-design.test.mjs`
- `tests/skills/scenarios/deployment.test.mjs`
- `tests/skills/scenarios/composition.test.mjs`

**Tests**:

- Scenarios execute without errors
- Correct skills activated
- Correct agents selected
- Output quality verified

**Acceptance Criteria**:

- [x] 5+ scenarios created
- [x] All passing
- [x] Agent behavior verified
- [x] Output quality acceptable

---

#### 3.3: Performance & Load Testing

**Effort**: 2 days (Medium)
**Status**: Not started
**Depends on**: 3.2

**Description**:
Test skill system performance under load.

**Subtasks**:

1. Create benchmark suite for skill loading
   - Measure load time for each skill
   - Measure memory usage
   - Measure parsing time
   - Target: <100ms load, <5MB memory per skill
2. Create benchmark for rule searching
   - Measure search latency across 107 rules
   - Measure trigger phrase matching
   - Target: <50ms search time
3. Create load test for concurrent skill access
   - Test 10+ concurrent skill loads
   - Verify no resource conflicts
   - Target: <500ms total time
4. Create stress test for large rule sets
   - Test with 500+ rules
   - Measure degradation
   - Identify bottlenecks
5. Profile and optimize
   - Identify slow paths
   - Implement caching where needed
   - Document performance characteristics

**Files to Create**:

- `tests/performance/skill-loading-benchmark.mjs`
- `tests/performance/rule-search-benchmark.mjs`
- `tests/performance/load-test.mjs`
- `tests/performance/stress-test.mjs`
- `.claude/docs/SKILL_PERFORMANCE.md`

**Tests**:

- Load time < 100ms
- Memory usage < 5MB
- Search time < 50ms
- Concurrent access works

**Acceptance Criteria**:

- [x] All benchmarks created
- [x] Performance targets met
- [x] No bottlenecks found
- [x] Optimization documented

---

#### 3.4: CI/CD Validation

**Effort**: 1 day (Low)
**Status**: Not started
**Depends on**: 3.1, 3.2, 3.3

**Description**:
Ensure all tests run in CI/CD pipeline.

**Subtasks**:

1. Verify `skill-build-validate.yml` workflow runs on PRs
2. Verify all unit tests execute
3. Verify integration tests pass
4. Verify performance benchmarks run
5. Verify test reports generated
6. Add test badges to README
7. Document CI/CD in `.claude/docs/CI_CD_PIPELINE.md`

**Files to Modify**:

- `.github/workflows/skill-build-validate.yml` - Verify configuration
- `README.md` - Add test badges

**Tests**:

- Workflow triggers correctly
- All tests run
- Reports generated
- Badges display

**Acceptance Criteria**:

- [x] CI/CD pipeline complete
- [x] All tests automated
- [x] Reports visible
- [x] Badges showing

---

### Phase 3 Completion Criteria

- [x] 100+ unit tests created
- [x] 5+ integration scenarios
- [x] Performance benchmarks established
- [x] All tests passing
- [x] CI/CD pipeline validated
- [x] Test coverage > 80%

---

## Phase 4: Enhancement & Capabilities (Weeks 4-7)

### Goal

Add advanced features and expand agent capabilities.

### Tasks

#### 4.1: Create Multi-Skill Composition System

**Effort**: 3 days (Medium-High)
**Status**: Not started
**Depends on**: 2.5

**Description**:
Enable agents to compose multiple skills for complex tasks.

**Subtasks**:

1. Create skill composition engine in `.claude/lib/skill-composition.cjs`
   - Load multiple skills for single task
   - Merge rule sets intelligently
   - Resolve conflicting recommendations
   - Create unified skill context
2. Create skill interaction rules
   - React performance + Composition patterns
   - React + React Native (shared concepts)
   - Design guidelines + Performance (overlap)
3. Create composition examples:
   - "Design and optimize a React component"
   - "Build performant React Native app"
   - "Create accessible, fast website"
4. Test composition with agent spawning
5. Document in `.claude/docs/SKILL_COMPOSITION.md`

**Files to Create**:

- `.claude/lib/skill-composition.cjs`
- `.claude/docs/SKILL_COMPOSITION.md`

**Tests**:

- Composition loads skills
- Rules merged correctly
- No conflicts
- Agent context reasonable

**Acceptance Criteria**:

- [x] Composition engine created
- [x] Multiple examples working
- [x] Conflict resolution working
- [x] Documentation complete

---

#### 4.2: Create Skill Recommendation Engine

**Effort**: 2 days (Medium)
**Status**: Not started
**Depends on**: 2.3

**Description**:
Recommend relevant skills based on codebase context.

**Subtasks**:

1. Create recommendation engine in `.claude/lib/skill-recommender.cjs`
   - Analyze package.json dependencies
   - Detect React, React Native, Next.js usage
   - Detect accessibility concerns
   - Detect performance issues
2. Implement scoring system:
   - High score: Directly relevant dependencies
   - Medium score: Related ecosystems
   - Low score: Optional enhancements
3. Create API:
   - `recommendSkills(projectPath)` → [skill names]
   - `getSkillReason(projectPath, skillName)` → reason
4. Test on various project types
5. Document in `.claude/docs/SKILL_RECOMMENDATIONS.md`

**Files to Create**:

- `.claude/lib/skill-recommender.cjs`
- `.claude/docs/SKILL_RECOMMENDATIONS.md`

**Tests**:

- React projects → react skills
- Native projects → native skills
- Next.js projects → all React skills
- Accessibility issues → web-design skill
- Recommendations accurate

**Acceptance Criteria**:

- [x] Recommender created
- [x] Scoring system working
- [x] Tests passing
- [x] Accuracy > 90%

---

#### 4.3: Create Skill Coverage Report

**Effort**: 2 days (Medium)
**Status**: Not started
**Depends on**: 4.2

**Description**:
Generate coverage reports showing which rules apply to codebase.

**Subtasks**:

1. Create report generator in `.claude/lib/skill-coverage-report.cjs`
   - Analyze codebase against all rules
   - Identify violations
   - Suggest improvements
   - Score coverage percentage
2. Implement analysis:
   - Parse relevant source files
   - Apply rule logic
   - Collect violations
   - Generate recommendations
3. Create report format:
   - Summary statistics
   - By-rule breakdown
   - By-category summary
   - Priority-weighted score
4. Create CLI tool:
   ```bash
   npm run skill:coverage -- <path>
   ```
5. Generate example reports
6. Add to documentation

**Files to Create**:

- `.claude/lib/skill-coverage-report.cjs`
- `.claude/tools/cli/skill-coverage.js`

**Tests**:

- Report generates without errors
- Violations detected accurately
- Recommendations relevant
- Scores reasonable

**Acceptance Criteria**:

- [x] Report generator created
- [x] CLI tool working
- [x] Example reports generated
- [x] Accuracy verified

---

#### 4.4: Integrate with Code Review Agent

**Effort**: 2 days (Medium)
**Status**: Not started
**Depends on**: 3.2, 4.3

**Description**:
Enhance code-reviewer agent to use skills.

**Subtasks**:

1. Update `.claude/agents/specialized/code-reviewer.md`
   - Add skill loading logic
   - Add rule application section
   - Add example review output
2. Create review template that includes skill checks
   - Performance checks (React)
   - Accessibility checks (Web Design)
   - Composition checks (Patterns)
3. Add skill recommendations to reviews
   - Suggest applicable rules
   - Explain violations
   - Provide fixes
4. Test code review with skills
5. Document in `.claude/docs/CODE_REVIEW_WITH_SKILLS.md`

**Files to Modify**:

- `.claude/agents/specialized/code-reviewer.md`

**Files to Create**:

- `.claude/docs/CODE_REVIEW_WITH_SKILLS.md`

**Tests**:

- Reviews include skill checks
- Violations detected
- Recommendations relevant
- Output quality good

**Acceptance Criteria**:

- [x] Agent updated
- [x] Skill integration working
- [x] Example reviews complete
- [x] Documentation done

---

#### 4.5: Create Skill Learning Module

**Effort**: 3 days (Medium-High)
**Status**: Not started
**Depends on**: 2.4

**Description**:
Create learning resources for agents about skills.

**Subtasks**:

1. Create skill learning guide in `.claude/docs/LEARNING_SKILLS.md`
   - How to learn from skills
   - How to apply rules effectively
   - Common patterns and practices
   - Advanced techniques
2. Create per-skill tutorials:
   - React performance tutorial (3 examples)
   - Native optimization tutorial (3 examples)
   - Composition patterns tutorial (2 examples)
   - Web design tutorial (3 examples)
3. Create practice exercises:
   - Sample components to optimize
   - Sample apps to improve
   - Sample designs to audit
4. Create assessment tool:
   - Test understanding of rules
   - Identify knowledge gaps
   - Recommend focused learning
5. Integrate with agent onboarding

**Files to Create**:

- `.claude/docs/LEARNING_SKILLS.md`
- `.claude/docs/tutorials/react-performance-tutorial.md`
- `.claude/docs/tutorials/react-native-tutorial.md`
- `.claude/docs/tutorials/composition-tutorial.md`
- `.claude/docs/tutorials/web-design-tutorial.md`
- `.claude/tools/assessment/skill-assessment.js`

**Tests**:

- Learning materials are clear
- Examples are correct
- Assessment tool works
- Exercises are solvable

**Acceptance Criteria**:

- [x] Learning guide created
- [x] 4 tutorials completed
- [x] Assessment tool working
- [x] All materials reviewed

---

### Phase 4 Completion Criteria

- [x] Multi-skill composition working
- [x] Recommendation engine accurate
- [x] Coverage reports generated
- [x] Code review agent enhanced
- [x] Learning resources created
- [x] All features documented

---

## Phase 5: Documentation & Polish (Weeks 7-8)

### Goal

Complete documentation and prepare for production.

### Tasks

#### 5.1: Create Comprehensive User Guide

**Effort**: 2 days (Medium)
**Status**: Not started
**Depends on**: 4.5

**Description**:
Create user-facing documentation.

**Subtasks**:

1. Create `.claude/docs/USER_GUIDE_SKILLS.md`
   - Overview of all skills
   - When to use each skill
   - How to trigger skills
   - Example use cases
2. Create quick-start guide
   - Most common scenarios
   - Copy-paste examples
   - Expected outputs
3. Create troubleshooting guide
   - Common issues
   - Solutions
   - When to contact support
4. Create FAQ document
5. Add navigation links to existing guides

**Files to Create**:

- `.claude/docs/USER_GUIDE_SKILLS.md`
- `.claude/docs/SKILL_QUICKSTART.md`
- `.claude/docs/SKILL_TROUBLESHOOTING.md`
- `.claude/docs/SKILL_FAQ.md`

**Tests**:

- Guides are complete
- Examples work
- Links correct
- Tone appropriate

**Acceptance Criteria**:

- [x] User guide complete
- [x] All common scenarios covered
- [x] Examples verified
- [x] FAQ comprehensive

---

#### 5.2: Create Developer Integration Guide

**Effort**: 1.5 days (Medium)
**Status**: Not started
**Depends on**: 4.5

**Description**:
Document how to integrate skills into custom agents.

**Subtasks**:

1. Create `.claude/docs/DEVELOPER_SKILL_INTEGRATION.md`
   - Loading skills programmatically
   - Accessing rule information
   - Applying rules to code
   - Creating custom skill variants
2. Create code examples:
   - Load skill by name
   - Iterate through rules
   - Apply rule to code sample
   - Generate recommendations
3. Create API documentation:
   - Skill loader interface
   - Rule structure
   - Metadata access
4. Create extension guide:
   - Adding custom rules
   - Creating skill variants
   - Submitting back to project

**Files to Create**:

- `.claude/docs/DEVELOPER_SKILL_INTEGRATION.md`

**Tests**:

- Examples work
- API documented
- Extensions possible
- Integration straightforward

**Acceptance Criteria**:

- [x] Integration guide complete
- [x] Code examples working
- [x] API documented
- [x] Extension guide clear

---

#### 5.3: Create Attribution & Credits Document

**Effort**: 1 day (Low)
**Status**: Not started

**Description**:
Document sources and attributions.

**Subtasks**:

1. Create `.claude/docs/SKILL_ATTRIBUTIONS.md`
   - Vercel Labs attribution
   - Original project links
   - License information (MIT)
   - Contributor acknowledgments
2. Add license to each skill SKILL.md
3. Add original source URL comments
4. Create changelog tracking integration
5. Document how to cite skills in projects

**Files to Create**:

- `.claude/docs/SKILL_ATTRIBUTIONS.md`

**Files to Modify**:

- `.claude/skills/react-best-practices-vercel/SKILL.md` - Add attribution
- `.claude/skills/react-native-skills-vercel/SKILL.md` - Add attribution
- `.claude/skills/composition-patterns-vercel/SKILL.md` - Add attribution
- `.claude/skills/web-design-guidelines-vercel/SKILL.md` - Add attribution
- `.claude/skills/vercel-deploy/SKILL.md` - Add attribution

**Tests**:

- All skills credited
- Links working
- License clear
- Format consistent

**Acceptance Criteria**:

- [x] Attribution document complete
- [x] All skills credited
- [x] Links verified
- [x] Format consistent

---

#### 5.4: Update Main README

**Effort**: 1 day (Low)
**Status**: Not started
**Depends on**: 5.1-5.3

**Description**:
Update project README with skills information.

**Subtasks**:

1. Add Skills section to README
   - List of available skills
   - Quick links to documentation
   - Usage examples
2. Add skills to feature list
3. Update architecture diagram (if exists)
4. Add quick start example
5. Add attribution section
6. Update table of contents

**Files to Modify**:

- `README.md`

**Tests**:

- README renders correctly
- Links working
- Examples accurate
- Format consistent

**Acceptance Criteria**:

- [x] README updated
- [x] All sections added
- [x] Links verified
- [x] Examples working

---

#### 5.5: Create Migration Guide

**Effort**: 1.5 days (Medium)
**Status**: Not started
**Depends on**: 5.1

**Description**:
Help users migrate to using skills.

**Subtasks**:

1. Create `.claude/docs/MIGRATION_GUIDE.md`
   - For agents: How to use new skills
   - For developers: How to integrate
   - For users: How to benefit
2. Document deprecation path (if any)
3. Provide before/after examples
4. Create upgrade checklist
5. Document breaking changes (if any)

**Files to Create**:

- `.claude/docs/MIGRATION_GUIDE.md`

**Tests**:

- Guide is clear
- Examples accurate
- Checklist complete
- No gaps in coverage

**Acceptance Criteria**:

- [x] Migration guide complete
- [x] Examples working
- [x] Checklist functional
- [x] Zero confusion points

---

### Phase 5 Completion Criteria

- [x] User guide comprehensive
- [x] Developer guide complete
- [x] Attribution documented
- [x] README updated
- [x] Migration guide created
- [x] All documentation reviewed

---

## Risk Assessment

### High-Risk Items

1. **Build System Integration**
   - Risk: TypeScript compilation issues
   - Mitigation: Extensive testing, CI/CD validation
   - Owner: Architecture Lead

2. **Large Knowledge Base**
   - Risk: Context bloat for agents
   - Mitigation: Progressive disclosure, lazy loading
   - Owner: Framework Lead

3. **External Fetch (Web Design)**
   - Risk: Network dependency
   - Mitigation: Caching, fallback content
   - Owner: Platform Lead

### Medium-Risk Items

1. **Skill Routing Accuracy**
   - Risk: Wrong skill activated
   - Mitigation: Extensive trigger phrase testing
   - Owner: Router Developer

2. **Performance Impact**
   - Risk: Slow skill loading
   - Mitigation: Benchmarks, caching, profiling
   - Owner: Performance Engineer

### Low-Risk Items

1. **Documentation**
   - Risk: Incomplete or unclear
   - Mitigation: Review, examples, testing
   - Owner: Technical Writer

2. **Attribution**
   - Risk: Missing credits
   - Mitigation: Comprehensive audit
   - Owner: Compliance

---

## Resource Allocation

### Recommended Team

| Role                          | Hours/Week   | Responsibilities                   |
| ----------------------------- | ------------ | ---------------------------------- |
| Integration Lead (Senior Dev) | 10           | Architecture, integration, reviews |
| Frontend Developer            | 15           | React/React Native skills, agents  |
| DevOps Engineer               | 10           | Build system, CI/CD, tooling       |
| QA Engineer                   | 10           | Testing, validation, benchmarks    |
| Technical Writer              | 8            | Documentation, guides              |
| **Total**                     | **53 hours** | **7-10 week timeline**             |

### Skills Distribution

- **Phase 1**: Integration Lead (60%), DevOps (40%)
- **Phase 2**: Integration Lead (40%), Frontend Dev (35%), QA (25%)
- **Phase 3**: QA Lead (50%), DevOps (30%), Frontend (20%)
- **Phase 4**: Frontend Dev (60%), Integration Lead (30%), QA (10%)
- **Phase 5**: Technical Writer (60%), Integration Lead (25%), QA (15%)

---

## Success Metrics

### Phase 1

- [ ] All 5 skills imported
- [ ] Build system functional
- [ ] CI/CD pipeline running
- [ ] 0 critical errors

### Phase 2

- [ ] Validation hooks working
- [ ] Catalog updated
- [ ] Routing configured
- [ ] Documentation complete

### Phase 3

- [ ] 100% test coverage for core
- [ ] 5+ integration scenarios
- [ ] Performance benchmarks pass
- [ ] All CI/CD tests green

### Phase 4

- [ ] Multi-skill composition working
- [ ] Recommender accuracy > 90%
- [ ] Coverage reports generating
- [ ] Code review enhanced

### Phase 5

- [ ] Documentation complete
- [ ] User guide comprehensive
- [ ] Developer guide clear
- [ ] Zero support questions (target)

---

## Timeline & Milestones

```
Week 1-2:  Phase 1 (Foundation)
├─ Skill imports
├─ Build system
└─ CI/CD setup

Week 2-4:  Phase 2 (Integration)
├─ Validation
├─ Routing
└─ Documentation

Week 4-5:  Phase 3 (Validation)
├─ Unit tests
├─ Integration tests
└─ Performance tests

Week 4-7:  Phase 4 (Enhancement) [Parallel with 3]
├─ Composition
├─ Recommendations
└─ Coverage reports

Week 7-8:  Phase 5 (Documentation)
├─ User guides
├─ Developer guides
└─ Attribution

LAUNCH:    Ready for production
```

---

## Go/No-Go Criteria

### Go Criteria

- [ ] All phases complete
- [ ] All tests passing
- [ ] Documentation reviewed
- [ ] Stakeholder sign-off
- [ ] No critical issues
- [ ] Performance acceptable

### No-Go Criteria

- [ ] Critical test failures
- [ ] Performance degradation
- [ ] Security vulnerabilities
- [ ] Missing documentation
- [ ] Stakeholder concerns
- [ ] Unresolved issues

---

## Post-Launch Activities

### Week 1 Post-Launch

- [ ] Monitor agent usage of skills
- [ ] Collect user feedback
- [ ] Fix any critical issues
- [ ] Publish feedback summary

### Month 1 Post-Launch

- [ ] Analyze usage patterns
- [ ] Optimize frequently-used paths
- [ ] Create additional examples
- [ ] Plan next iteration

### Ongoing

- [ ] Monitor Vercel Labs for updates
- [ ] Update skills as needed
- [ ] Gather community feedback
- [ ] Plan platform extensions

---

## Appendix: File Checklist

### Phase 1 Files to Create

- [ ] `.claude/skills/react-best-practices-vercel/` (59 rule files)
- [ ] `.claude/skills/react-native-skills-vercel/` (38 rule files)
- [ ] `.claude/skills/composition-patterns-vercel/` (10 rule files)
- [ ] `.claude/skills/web-design-guidelines-vercel/SKILL.md`
- [ ] `.claude/lib/skill-build/src/` (7 TS files)
- [ ] `.github/workflows/skill-build-validate.yml`
- [ ] `.claude/docs/SKILL_BUILD.md`

### Phase 2 Files to Create/Modify

- [ ] `.claude/hooks/skills/` (3 validator hooks)
- [ ] `.claude/context/artifacts/skill-catalog.md` (update)
- [ ] `.claude/hooks/routing/router-enforcer.cjs` (update)
- [ ] `.claude/docs/SKILL_USAGE_GUIDE.md`
- [ ] `.claude/docs/REACT_PERFORMANCE_SKILL.md`
- [ ] `.claude/docs/REACT_NATIVE_SKILL.md`
- [ ] `.claude/docs/COMPOSITION_PATTERNS_SKILL.md`
- [ ] `.claude/docs/WEB_DESIGN_SKILL.md`
- [ ] `.claude/docs/VERCEL_DEPLOY_SKILL.md`
- [ ] `.claude/agents/domain/` (3 agent files - update)

### Phase 3 Files to Create

- [ ] `tests/skills/skill-loading.test.mjs`
- [ ] `tests/skills/rule-validation.test.mjs`
- [ ] `tests/skills/routing-integration.test.mjs`
- [ ] `tests/skills/scenarios/` (5 scenario files)
- [ ] `tests/performance/` (4 benchmark files)
- [ ] `.claude/docs/SKILL_PERFORMANCE.md`
- [ ] `.claude/docs/CI_CD_PIPELINE.md`

### Phase 4 Files to Create

- [ ] `.claude/lib/skill-composition.cjs`
- [ ] `.claude/docs/SKILL_COMPOSITION.md`
- [ ] `.claude/lib/skill-recommender.cjs`
- [ ] `.claude/docs/SKILL_RECOMMENDATIONS.md`
- [ ] `.claude/lib/skill-coverage-report.cjs`
- [ ] `.claude/tools/cli/skill-coverage.js`
- [ ] `.claude/agents/specialized/code-reviewer.md` (update)
- [ ] `.claude/docs/CODE_REVIEW_WITH_SKILLS.md`
- [ ] `.claude/docs/LEARNING_SKILLS.md`
- [ ] `.claude/docs/tutorials/` (4 tutorial files)
- [ ] `.claude/tools/assessment/skill-assessment.js`

### Phase 5 Files to Create

- [ ] `.claude/docs/USER_GUIDE_SKILLS.md`
- [ ] `.claude/docs/SKILL_QUICKSTART.md`
- [ ] `.claude/docs/SKILL_TROUBLESHOOTING.md`
- [ ] `.claude/docs/SKILL_FAQ.md`
- [ ] `.claude/docs/DEVELOPER_SKILL_INTEGRATION.md`
- [ ] `.claude/docs/SKILL_ATTRIBUTIONS.md`
- [ ] `.claude/docs/MIGRATION_GUIDE.md`
- [ ] `README.md` (update)

**Total New Files**: 70+
**Total Modified Files**: 8+
**Total Lines of Code/Docs**: 15,000+

---

## Document Control

- **Version**: 1.0
- **Created**: 2026-01-30
- **Last Updated**: 2026-01-30
- **Status**: Ready for Review
- **Next Review**: After Phase 1 completion
