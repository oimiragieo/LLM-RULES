# Verify Agent Skills and Tools Registration

Use these commands to confirm the agent/skill/tool registration and spawn enricher work end-to-end.

## 1. Regenerate registries (in order)

Ensures skill-index is built from agent-skill-matrix and agent-registry merges skill-required tools.

```bash
pnpm run gen:all-registries
```

Or step-by-step:

```bash
pnpm run gen:tool-manifest
pnpm run gen:skill-index
pnpm run gen:agent-registry
```

## 2. Validate registries

Checks manifest, skill-index, and agent-registry structure (and that referenced tools exist in manifest).

```bash
pnpm run manifest:validate
pnpm run skills:validate
pnpm run agents:registry:validate
```

## 3. Unit / integration tests for changed code

**Spawn prompt assembler (enricher + assembly):**

```bash
node --test --test-concurrency=1 tests/unit/hooks/spawn-prompt-assembler.test.mjs
```

**Prompt assembler (lib that uses skill-index for skills section):**

```bash
node --test --test-concurrency=1 tests/lib/spawn/prompt-assembler.test.cjs
```

**Agent registry generator (merge of skill requiredTools):**

```bash
node --test --test-concurrency=1 tests/lib/tools/agent-registry-generator.test.cjs
```

**Pre-spawn tool validator (validates allowed_tools against manifest):**

```bash
pnpm run validator:test
# or
node --test tests/hooks/pre-spawn-tool-validator.test.cjs
```

## 4. Broader test suites

**Root + integration tests (node test runner):**

```bash
pnpm test
pnpm run test:integration
```

**Framework (hooks + lib under .claude):**

```bash
pnpm run test:framework
```

**All tests (if using Jest for tests/**):**

```bash
npx jest --testPathPattern="tests/(unit/hooks/spawn-prompt-assembler|lib/tools/agent-registry-generator|lib/spawn/prompt-assembler)|hooks/pre-spawn-tool-validator"
```

Or run the full Jest suite:

```bash
npx jest
```

## 5. Lint and format

```bash
pnpm lint
pnpm format
```

## Quick one-liner (registries + validations + key tests)

```bash
pnpm run gen:all-registries && \
pnpm run manifest:validate && \
pnpm run skills:validate && \
pnpm run agents:registry:validate && \
node --test --test-concurrency=1 tests/unit/hooks/spawn-prompt-assembler.test.mjs tests/lib/spawn/prompt-assembler.test.cjs tests/lib/tools/agent-registry-generator.test.cjs tests/hooks/pre-spawn-tool-validator.test.cjs
```

## What each part checks

| Step | What it verifies |
|------|------------------|
| `gen:skill-index` | Reads agent-skill-matrix; builds agentPrimary/agentSupporting and byAgent; SKILL_TOOLS for repo-rag, project-analyzer, tool-search. |
| `gen:agent-registry` | Loads matrix + skill-index; merges skill requiredTools into each agent’s requiredTools (up to 18). |
| `manifest:validate` | Referenced tools (from skill-index + agent-registry) exist in tool-manifest; optional schema validation. |
| `spawn-prompt-assembler.test.mjs` | looksAssembled, appendSemanticMatches, inferAgentFromPrompt, enrichAllowedTools. |
| `prompt-assembler.test.cjs` | getSkillsByAgent, buildToolsSection, assembleSpawnPrompt using skill-index. |
| `agent-registry-generator.test.cjs` | generateCapabilityCard (with optional 5th arg), schema, scanAgents, generate. |
| `pre-spawn-tool-validator.test.cjs` | allowed_tools validation against manifest, reserved tools, mandatory tools. |
