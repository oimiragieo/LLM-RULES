# Context Mode ToolSet Implementation Plan

> **Status:** Pre-implementation. Formal clarifications and critique incorporated.  
> **Constraint:** No third-party VMs (Docker/cloud); self-contained or npm/pnpm only.

---

## 1. Formal Clarifications (Decisions Before Coding)

These five decisions are **locked** for implementation. Any change requires a plan update.

### 1.1 Optional Tool Policy

- **Rule:** `ToolSet.default(role)` returns **all mandatory core tools + all non-optional tools** from the manifest for that role. Tools marked `optional: true` are **excluded by default**.
- **When to include optional tools:** Only when explicitly requested (e.g. via context/mode `include_tools` or a future “include optional” flag). No implicit inclusion.
- **Documentation:** Document in ToolSet and in tool-manifest schema that “optional” means “excluded from default set unless requested.”

### 1.2 Context/Mode Precedence

- **Authoritative order (highest to lowest):**
  1. **Runtime files:** `.claude/context/runtime/current-context.json` and `.claude/context/runtime/current-modes.json` (if present and valid).
  2. **Environment:** e.g. `AGENT_STUDIO_CONTEXT`, `AGENT_STUDIO_MODES` (if set).
  3. **Defaults:** No context, no modes (existing behavior).
- **Canonical layout:** If both `current-context.json` (with a `modes` array) and `current-modes.json` exist, **current-context.json is authoritative** for “current context + modes.” `current-modes.json` is used only when there is no context file or when the context file does not specify modes. This avoids conflicting sources of truth.

### 1.3 Allowed Tools Intersection Policy

- **When context/mode is active:** `allowed_tools = intersection(contextOrModeTools, enrichedAgentTools)`. Context/mode defines the **cap**; the agent’s enriched tool set is the base. Unknown tools in context/mode config are ignored (with a logged warning).
- **When no context/mode:** Preserve **existing behavior** (no intersection; use enriched agent tools only).
- **Logging:** Log when tools are removed due to context/mode (tool names and reason) so behavior is debuggable.

### 1.4 YAML Parser

- **Dependency:** Use **`js-yaml`** (already in `package.json` at `^4.1.1`). No new dependency.
- **Usage:** Use for parsing context and mode YAML files only. Include in lint/format/test as needed (no new tooling beyond existing).

### 1.5 Prompt Fragment Placement

- **Placement:** Inject context/mode content into a **single deterministic section** of the system prompt: a dedicated **“Context / Mode”** section.
- **Location:** After existing structured sections (e.g. skills, memory, task hints) and **before** any free-form or closing content. Exact anchor will be defined in prompt-assembler / prompt-factory (e.g. “## Context / Mode”).
- **No free-form append:** Do not append context/mode text at the end without a clear section header; this keeps prompt size and order predictable and testable.

---

## 2. Dependency and Existing Code Confirmation

| Item              | Status                                                                                                               |
| ----------------- | -------------------------------------------------------------------------------------------------------------------- |
| **js-yaml**       | Present in `package.json` (`^4.1.1`) – use for context/mode YAML                                                     |
| **Atomic write**  | `.claude/lib/utils/atomic-write.cjs` – use `atomicWriteJSONSync` for `current-context.json` and `current-modes.json` |
| **Tool manifest** | `.claude/config/tool-manifest.json` + generator – extend schema then regenerate                                      |
| **Spawn prompt**  | `.claude/hooks/routing/spawn-prompt-assembler.cjs` – integrate prompt-factory and ToolSet output here                |

---

## 3. Risks and Mitigations (from Critique)

| Risk                                         | Mitigation                                                                                                                                                               |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Breaking prompt assembly                     | Single “Context / Mode” section; no free-form append; tests assert section presence and order                                                                            |
| Tool gating drift (ToolSet vs spawn vs host) | Document that context/mode restrictions are **advisory unless guard hook is enabled**; intersection policy and logging keep behavior traceable                           |
| Schema/manifest mismatch                     | Regenerate tool-manifest immediately after schema/generator changes; add validation script and tests that assume new structure                                           |
| YAML parsing in hooks                        | Loaders **fail open**: on parse/schema error, fall back to defaults and log warning; never throw in hook path so tool routing is not broken                              |
| Router default granting edit tools           | ToolSet.default("router") must use manifest’s router availability only; fallback role for unknown is “router” with **no** edit tools (explicit allow-list from manifest) |

---

## 4. Implementation Phases (Refined)

### Phase 1: Tool Markers + ToolSet

**Goals:** Tool markers in schema/manifest; centralized ToolSet; no behavior change until prompt-assembler uses it.

**1.1 Schema + generator + manifest**

- Extend `tool-manifest.schema.json` with optional fields: `canEdit` (boolean), `optional` (boolean), `requiresActiveProject` (boolean).
- Update tool manifest generator to read these from source (e.g. CLAUDE.md or a tools config) and emit them in `tool-manifest.json`.
- **Regenerate** `tool-manifest.json` immediately after schema/generator change.
- Ensure **canEdit** list is complete: Write, Edit, Bash, EditNotebook, TaskStop (and any other editing/execution tools in the manifest).

**1.2 ToolSet library** (`.claude/lib/tools/tool-set.cjs`)

- `ToolSet.default(role)`: returns tool names for role from manifest `agentDefaults` (or equivalent). For “router,” use only tools with `availability.router === 'yes'`. **Optional tools:** excluded by default (per 1.1).
- `ToolSet.apply(role, { fixed_tools, includeOptional })`: apply overrides; if `fixed_tools` is provided, treat as allow-list (intersection with valid manifest names). `validateToolName(toolName)`: reject unknown tools with a **warning** (do not throw in hook).
- `ToolSet.withoutEditingTools(role)`: returns default set for role **minus** all tools with `canEdit: true`, and explicitly exclude tools that “execute” (e.g. TaskStop) for read-only semantics.
- Fallback: if role is missing from agentDefaults, fall back to “router” (most restrictive) and log.

**1.3 Tests (Phase 1)**

- `ToolSet.default("router")` returns expected baseline (no edit tools).
- `ToolSet.default("developer")` returns expected baseline (includes edit tools per manifest).
- `ToolSet.apply` with `fixed_tools` overrides and validates unknown tools (warning, no throw).
- `ToolSet.withoutEditingTools(role)` removes all canEdit tools (and TaskStop).

---

### Phase 1.4–1.7: Context/Mode Loaders + Runtime Resolution

**Goals:** Load context and mode YAML; resolve current context/mode from runtime files → env → default; fail-open behavior.

**1.4 Schemas**

- Add JSON schemas for context and mode YAML (e.g. `context.schema.json`, `mode.schema.json`) with `name`, `prompt` (string), `include_tools` (optional array), `exclude_tools` (optional array).

**1.5 Directories and layout**

- Contexts: `.claude/config/contexts/*.yaml`
- Modes: `.claude/config/modes/*.yaml`
- Runtime: `.claude/context/runtime/current-context.json` (context name + optional modes), `.claude/context/runtime/current-modes.json` (mode names). Use **atomicWriteJSONSync** for all writes.

**1.6 Loaders** (e.g. `.claude/lib/config/context-mode-loader.cjs`)

- `loadContext(name)`, `loadMode(name)`: load and parse YAML; validate against schema. On invalid YAML or schema failure: **fail open** – return null or default, log warning.
- `listContextNames()`, `listModeNames()`: return names from directory listing.
- Resolution order: read `current-context.json` (if present) → else env → else no context/mode. Same for modes if not embedded in context.

**1.7 Tests**

- loadContext/loadMode with valid YAML.
- Invalid YAML → graceful fallback (no throw), warning logged.
- listContextNames / listModeNames.
- Resolution order (current-context.json wins over env over default).

---

### Phase 2: Prompt Factory + spawn-prompt-assembler Integration

**Goals:** Single “Context / Mode” section; allowed_tools = intersection when context/mode active; explicit logging.

**2.1 Prompt factory** (`.claude/lib/spawn/prompt-factory.cjs`)

- `buildContextModeFragment(contextName, modeNames)`: load context + modes, merge `prompt` fragments, substitute placeholders (e.g. `{{ available_tools }}` if needed). Return a single string for the “Context / Mode” section.
- `getActiveToolNames(role, contextName, modeNames)`: resolve ToolSet.default(role), then apply context/mode include/exclude; return **intersection** with manifest-valid tools. Log when tools are removed due to context/mode.

**2.2 Spawn-prompt-assembler integration**

- When context/mode is active: set `allowed_tools` to `getActiveToolNames(...)` (intersection with enriched agent tools). Inject prompt fragment into the **single** “## Context / Mode” section at the defined position (after skills/memory/task hints, before closing).
- When no context/mode: **preserve existing behavior** (no fragment; allowed_tools unchanged).
- Add explicit logging when tools are removed due to context/mode.

**2.3 Tests**

- Prompt fragment includes context/mode prompts when active.
- activeToolNames respects context/mode exclusion.
- Read-only mode removes canEdit tools (via ToolSet.withoutEditingTools or mode exclude).
- Spawn-prompt-assembler: with context/mode, allowed_tools = intersection; without, unchanged.
- Prompt includes “Context / Mode” section when fragment non-empty.

**Regression:** Any test that asserts exact prompt text or exact allowed_tools list must be updated to account for optional “Context / Mode” section and intersection.

---

### Phase 3: get_current_config + switch_modes

**Goals:** Observability and mode switching without mutating context.

**3.1 get_current_config** (e.g. `.claude/tools/cli/get-current-config.cjs`)

- Output: active context, active modes, resolved tool list (active/inactive), source of truth (file vs env vs default).
- Read-only; no file writes.

**3.2 switch_modes**

- **Only writes** `current-modes.json` (via atomicWriteJSONSync). Does **not** mutate context or current-context.json.
- Validates mode names against `listModeNames()`; on invalid name, error message and exit non-zero, no file write.
- Canonical layout: context is authoritative when present; switch_modes only updates modes file.

**3.3 Tests**

- get_current_config prints expected structure.
- switch_modes with valid names updates current-modes.json only.
- switch_modes with invalid name fails without writing.

---

### Phase 4: Named Memory API

**Goals:** Simple named memory CRUD; project-root safety; consistent naming.

**4.1 API** (extend `.claude/lib/memory/memory-manager.cjs` or new module)

- `readMemory(name)`, `writeMemory(name, content)`, `listMemories()`, `deleteMemory(name)`.
- Storage: e.g. `.claude/context/memory/named/<normalized-name>.md` (or agreed extension).
- **Name normalization:** shared helper (e.g. slug: lowercase, replace spaces/dots with single hyphen, collapse multiple hyphens). Document and export; use for all read/write/list/delete.
- **Safety:** validateProjectRoot and validatePathWithinProject for all paths; no writes outside project.

**4.2 Error contract**

- Missing memory: return consistent “not found” message (e.g. string or structured result); do not mix throw and return for the same case.
- Document in plan and code whether “not found” is return value or thrown.

**4.3 Tests**

- write/read/delete/list.
- Name normalization (e.g. “Project Setup”, “project_setup”, “project-setup” → same key).
- Missing memory returns documented “not found” behavior.

---

## 5. Testing Checklist (Summary)

| Area                              | Tests                                                                                                 |
| --------------------------------- | ----------------------------------------------------------------------------------------------------- |
| ToolSet                           | default(router) vs default(developer); apply + fixed_tools; unknown tool warning; withoutEditingTools |
| Context/mode loaders              | Valid YAML load; invalid YAML fallback; list names; resolution order                                  |
| Prompt factory                    | Fragment content; activeToolNames with exclusion; read-only removes canEdit                           |
| Spawn-prompt-assembler            | allowed_tools intersection when context/mode; unchanged when not; “Context / Mode” section            |
| get_current_config / switch_modes | Config output; switch_modes valid/invalid; only current-modes.json written                            |
| Named memory                      | read/write/delete/list; normalization; not found                                                      |

**Regression:** Update any routing or spawn-prompt tests that assert exact prompt text or allowed_tools.

---

## 6. Suggested Sequencing (Safer Order)

1. Tool-manifest schema + generator + regenerate manifest.
2. ToolSet + tests.
3. Context/mode schemas + loader + tests.
4. Prompt factory + tests.
5. Spawn-prompt-assembler integration + tests.
6. get_current_config + switch_modes + tests.
7. Named memory API + tests + docs.

Each step keeps regressions localized and depends on the previous being stable.

---

## 7. Documentation Requirements

- **CLAUDE.md or new doc:** Where context/mode prompts appear in the system prompt (section name and order).
- **Explicit note:** “Context/mode tool restrictions are advisory unless the guard hook is enabled.”
- **Named memory:** Document normalization rule and “not found” behavior.

---

## 8. Out of Scope (Unchanged)

- LSP/symbolic tools: rely on Claude Code’s existing code intelligence; no LSP in agent-studio.
- Third-party VMs (Docker/cloud): not used for this feature.
- Dashboard UI: file-based observability (get_current_config) only.

---

_Plan version: 1.0. Post-critique. Ready for Phase 1 implementation once you confirm._
