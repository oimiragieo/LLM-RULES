# Thinking Tools Rules

## Core Principles

- Self-reflection prevents drift and low-quality output
- Three checkpoints: collected information, task adherence, completion
- Use checkpoints at natural pauses (not continuously)
- Each checkpoint has specific validation criteria
- Checkpoints are quick (30 seconds each, not deep dives)

## Three Thinking Tools

### 1. Think About Collected Information

**When**: After gathering research, reading docs, exploring code
**Purpose**: Validate research quality before proceeding
**Questions**:

- Is information relevant to the task?
- Are sources credible and current?
- Do I have enough context to proceed?
- What gaps remain?

### 2. Think About Task Adherence

**When**: Mid-implementation, before major decisions
**Purpose**: Prevent scope creep and ensure alignment
**Questions**:

- Am I solving the actual problem?
- Have I drifted from the requirements?
- Is this change within scope?
- Should I ask user before proceeding?

### 3. Think About Whether You Are Done

**When**: Before claiming completion
**Purpose**: Ensure quality gates passed
**Questions**:

- Do tests pass (with evidence)?
- Is code linted and formatted?
- Are requirements fully met?
- Is documentation updated?
- Can I demonstrate completion?

## Standards

- Use checkpoints at natural breakpoints
- Each checkpoint is 30 seconds (not minutes)
- Answer questions honestly (no rationalization)
- If checkpoint fails, stop and fix
- Document checkpoint results in task metadata

## Anti-Patterns

- Skipping checkpoints when "almost done"
- Rushing through checkpoint questions
- Rationalizing away red flags
- Using checkpoints as ceremony (not genuine reflection)
- Checking only once at the end

## Integration Points

- **Verification-Before-Completion**: Final checkpoint before done
- **Task Management Protocol**: Document checkpoint results
- **TDD**: Checkpoint 3 includes test verification
- **Memory Protocol**: Record checkpoint failures as learnings
