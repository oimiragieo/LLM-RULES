# Sharp Edges — Agent-Studio Hazard Patterns

Known hazards specific to this codebase. Agents must internalize these before writing code.

## SE-01: Windows Backslash Paths
- `path.relative()` returns `\` on Windows — NEVER use in regex or glob patterns
- ALWAYS normalize: `.replace(/\\/g, '/')`
- Use `[^/\\]*` in regex if normalization is uncertain

## SE-02: Prototype Pollution
- NEVER use `JSON.parse()` directly on untrusted input — use `safeParseJSON()` from `.claude/lib/utils/safe-json.cjs`
- Filter `__proto__`, `constructor`, `prototype` keys before merging objects

## SE-03: Hook Exit Codes
- Hooks must exit `0` (allow) or `2` (block) — exit `1` is treated as error, NOT block
- Always wrap hook body in try/catch and exit `0` on unexpected errors

## SE-04: Async Swallowing
- Never `await` inside `forEach` — use `for...of` or `Promise.all(arr.map(...))`
- Always attach `.catch()` to fire-and-forget promises — never let them go unhandled

## SE-05: ReDoS in Glob-to-Regex
- Glob patterns converted to regex must escape special chars FIRST, then convert `**`/`*`
- `**/dir/**` → `(.*/)?dir(/.*)?` (leading `**/` optional, trailing `/**` optional)
- Never use `[^/]*` without confirming paths are normalized to forward slashes

## SE-06: DST Arithmetic
- Never add/subtract fixed milliseconds for day-boundary calculations — use date libraries
- `Date.now() + 86400000` is wrong across DST boundaries

## SE-07: Array Mutation During Iteration
- Never splice/push/pop an array you are currently iterating with `for...of` or `forEach`
- Copy the array first: `[...arr].forEach(...)` or collect mutations, apply after loop
