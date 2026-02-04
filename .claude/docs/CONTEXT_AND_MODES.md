# Context and Modes

Context and modes define a layered system prompt and an allowed tool set. Contexts represent the environment (for example, a CLI coding session). Modes represent operational constraints (for example, planning-only vs editing).

## What They Do

- Context adds a prompt fragment and can include or exclude tools.
- Modes add additional prompt fragments and tool restrictions.
- Tool restrictions are advisory unless a guard hook is enabled.

## Where Config Lives

- Contexts: .claude/config/contexts/\*.yml
- Modes: .claude/config/modes/\*.yml

Each file defines:

- ame
- prompt
- Optional xcluded_tools and included_optional_tools

## How Active Context and Modes Are Resolved

Resolution order (highest to lowest):

1. .claude/context/runtime/current-context.json
2. .claude/context/runtime/current-modes.json (only if current-context.json does not specify modes)
3. Environment variables:
   - AGENT_STUDIO_CONTEXT
   - AGENT_STUDIO_MODES (comma-separated list)
4. Defaults: no context, no modes

If both runtime files exist, current-context.json is authoritative for both context and modes.

## CLI Utilities

- ode .claude/tools/cli/get-current-config.cjs
  - Prints active context, active modes, active tools, and inactive tools.
- ode .claude/tools/cli/switch-modes.cjs planning
  - Writes .claude/context/runtime/current-modes.json with the provided mode list.
  - To clear modes:
    ode .claude/tools/cli/switch-modes.cjs

## Tool Restrictions

When a context or mode is active, the tool list is intersected with the agent's enriched tools. Unknown tools in context or mode definitions are ignored with a warning. When no context or mode is active, the existing tool selection behavior is preserved.

Tool restrictions are advisory unless a guard hook is enabled.

## Prompt Placement

Context and mode prompts are injected into a single Context / Mode section in the system prompt, after structured sections (skills, memory, task hints) and before any closing content.

## Claude Code Note

Claude Code provides LSP-based symbol navigation and code intelligence. Agent-studio does not run its own LSP; context/mode settings only adjust prompts and tool availability.
