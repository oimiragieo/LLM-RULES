# Debugging Skill Observations

This directory contains observations and learnings from applying the systematic debugging skill in agent-studio.

## Purpose

The `observations/` directory serves as a feedback loop for continuous improvement of the debugging methodology. Agents should record:

1. **Effective root cause techniques** - Successful strategies for isolating root causes
2. **Difficult-to-diagnose patterns** - Problems that required multiple investigation passes
3. **Phase sequencing insights** - When Phase 1 (RCI) was sufficient vs. when all 4 phases were needed
4. **Tracing challenges** - Cases where backward tracing through the call stack was complex
5. **Tool effectiveness** - Which debugging tools and techniques worked best for different problem types
6. **Model-specific observations** - How different LLM models handle the 4-phase debugging process

## Structure

Observations are recorded in JSONL format:

```json
{
  "timestamp": "2026-03-03T10:00:00Z",
  "type": "technique|pattern|challenge|tool_insight|phase_analysis|model_behavior",
  "description": "Human-readable description of the observation",
  "phase": "RCI|pattern_analysis|hypothesis_testing|implementation",
  "rootCause": "Brief statement of actual root cause found",
  "difficulty": "trivial|easy|moderate|difficult|extremely_difficult",
  "suggestedImprovement": "Potential skill update or documentation fix"
}
```

## When to Write Observations

- **After completing a debugging session** (all 4 phases or stopped earlier)
- When Phase 1 (Root Cause Investigation) reveals the issue immediately
- When Phase 1 takes unexpectedly long despite evidence collection
- When a hypothesis is formed and rejected (Phase 3)
- When data flow tracing reveals unexpected component interactions
- When the actual root cause differs significantly from initial hypothesis
- When a model struggles with the 4-phase sequence

## Example Observations

### Effective Technique (what worked)

```json
{
  "timestamp": "2026-03-03T10:30:00Z",
  "type": "technique",
  "description": "Adding instrumentation at component boundaries (before/after each function call) made the exact point of failure immediately obvious",
  "phase": "RCI",
  "rootCause": "Data type mismatch between middleware and handler",
  "difficulty": "easy",
  "suggestedImprovement": "Emphasize boundary instrumentation in Phase 1 RCI guidance"
}
```

### Difficult Challenge (what blocked progress)

```json
{
  "timestamp": "2026-03-03T11:00:00Z",
  "type": "challenge",
  "description": "Race condition only reproduced under specific timing conditions; required instrumentation of async queue to isolate",
  "phase": "RCI",
  "rootCause": "Promise resolution order assumption in concurrent processing",
  "difficulty": "extremely_difficult",
  "suggestedImprovement": "Add guidance for debugging timing-sensitive async issues"
}
```

### Phase Analysis (meta-insight)

```json
{
  "timestamp": "2026-03-03T12:00:00Z",
  "type": "phase_analysis",
  "description": "Phase 1 (RCI) alone was insufficient for abstract error messages; Phase 2 pattern analysis provided necessary context",
  "phase": "pattern_analysis",
  "rootCause": "Implicit contract violation between API consumer and provider",
  "difficulty": "moderate",
  "suggestedImprovement": "Clarify when pattern analysis (Phase 2) is mandatory vs. optional"
}
```

## Integration with Skill Evolution

Observations are automatically analyzed quarterly to:

1. Identify phase sequencing patterns
2. Refine RCI (Root Cause Investigation) guidance
3. Discover new debugging techniques to document
4. Assess which problem types require which phases
5. Update tool recommendations

## References

- [Debugging Skill Documentation](../SKILL.md)
- [Root Cause Tracing Technique](../root-cause-tracing.md)
- [Defense-in-Depth Validation](../defense-in-depth.md)
- [Condition-Based Waiting Patterns](../condition-based-waiting.md)
- [Agent Studio Debugging Rules](../../rules/debugging.md)
