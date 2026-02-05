### 31. **Mandatory Tools Defensive Merging** (fix-tool-param-002)

    - **Date**: 2026-02-05
    - **Context**: `enrichAllowedTools()` did not guarantee mandatory tools (TaskUpdate, Skill) when tool list was at maxTools limit
    - **Problem**: When spawn prompt had 15+ tools, the `.slice(0, maxTools)` would cut off mandatory tools added at the end of the Set
    - **Root Cause**: Set iteration preserves insertion order; mandatory tools added last were sliced off
    - **Fix Pattern** (implemented in `spawn-prompt-assembler.cjs` lines 257-317):
      1. Extract mandatory tools from `tool-manifest.json`: `manifest.validation?.mandatoryTools || ['TaskUpdate', 'Skill']`
      2. Separate merged tools into mandatory and non-mandatory arrays
      3. Cap non-mandatory tools to leave room: `maxTools - mandatoryInList.length`
      4. Combine: mandatory first (guaranteed), then non-mandatory up to limit
      5. Final safety check with warning log if still missing (defensive)
    - **Test Coverage**: 12 new tests in `tests/hooks/spawn-prompt-assembler-enrichAllowedTools.test.cjs`
    - **Verification**: `node -e` inline test showed TaskUpdate and Skill present in all scenarios

### 27. **Entity Linking - Session Context Pattern**

    - **Date**: 2026-02-05
    - **Context**: Database had 108 entities but only 1 relationship
    - **Pattern Learned**:
      - Entity linking (`linkMemoryToTools()`) is triggered by memory extraction pipeline
      - Must be run with `sessionToolsUsed` populated (not standalone)
      - Low relationship count is expected if memory extraction hasn't run frequently
      - Entity linking creates bidirectional relationships (memory → tools, tools → memory)
    - **Status**: Working as designed - not a bug

### 28. **Workflow Registry - Centralized Discovery Pattern** (WF-001)

    - **Date**: 2026-02-05
    - **Context**: No workflow-registry.json existed, preventing programmatic discovery
    - **Pattern Learned**:
      - Create generator script at `.claude/tools/cli/generate-workflow-registry.cjs`
      - Scan all `.md` and `.yaml` files in `.claude/workflows/`
      - Extract metadata: category, type, description, phases, requiredAgents, triggers, status
      - Detect workflow types from content (state-machine, phased, parallel, sequential)
      - Generate registry at `.claude/context/artifacts/workflow-registry.json`
    - **Registry Structure**:
      ```json
      {
        "version": "1.0.0",
        "lastUpdated": "ISO timestamp",
        "summary": { "total": 36, "byCategory": {...}, "byType": {...} },
        "workflows": { "name": { "path", "category", "type", "description", ... } }
      }
      ```
    - **Impact**: 36 workflows now cataloged and discoverable

### 29. **Audit Methodology - Verification-Before-Claims**

    - **Date**: 2026-02-05
    - **Context**: Previous audit (2026-02-04) conflated "CODE EXISTS" with "VERIFIED WORKING"
    - **Pattern Learned** (5-Step Verification Protocol):
      1. CODE_EXISTS - File/function implemented
      2. SYNTAX_VALID - Passes `node -c` or lint check
      3. EXECUTION_TEST - Run actual test showing feature works
      4. METRICS_COLLECTION - Capture before/after data
      5. USAGE_EVIDENCE - Show logs/traces of actual usage
      - Only after steps 1-5: Mark as "VERIFIED_WORKING"
    - **Scoring Levels**:
      - VERIFIED_WORKING: Execution test + metrics + usage proven
      - CODE_EXISTS: Implementation complete but not tested
      - DOCUMENTED: Planned/designed but not implemented
      - UNVERIFIED: Claimed but cannot confirm
    - **Impact**: More accurate health scores (78/100 actual vs 92/100 inflated claim)

### 30. **Tool Documentation - Anti-Error Pattern**

    - **Date**: 2026-02-05
    - **Context**: Task() tool parameter errors were common due to unclear documentation
    - **Pattern Learned**:
      - Document BOTH correct and incorrect usage examples
      - Include common error messages with their causes and solutions
      - Provide hook processing pipeline for advanced users
      - Use tables for structured error-solution mappings
      - Show 3+ correct examples (minimal, recommended, full)
      - Show 4+ incorrect examples with inline comments
    - **Documentation Structure**:
      1. CRITICAL requirements box (must-read)
      2. Full signature with TypeScript types
      3. Parameter descriptions table
      4. Common errors table (error -> cause -> solution)
      5. Correct usage examples (progressive complexity)
      6. Incorrect usage examples (with WRONG/CORRECT pairs)
      7. Hook processing pipeline (for debugging)
    - **Impact**: Prevents "Invalid tool parameters" errors from wrong invocation

---
