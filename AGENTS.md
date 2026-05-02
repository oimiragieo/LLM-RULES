# Repository Guidelines

## Project Structure & Module Organization

Agent Studio is a pnpm-managed Node.js repository for agent, skill, hook, and tool configuration across Claude Code, Cursor, and Factory. Core implementation lives under `.claude/`: `.claude/lib/` for reusable runtime modules, `.claude/hooks/` for lifecycle hooks, `.claude/tools/` for CLI utilities, `.claude/agents/` for agent definitions, `.claude/skills/` for skill packages, and `.claude/templates/` or `.claude/schemas/` for contracts. Repository automation lives in `scripts/`. Tests live in `tests/`, usually mirroring the feature area, with shared fixtures in `tests/fixtures/`. Keep temporary or generated runtime data in `.tmp/`, `tmp/`, `local_cache/`, or `.claude/context/` unless a script expects tracked outputs.

## Build, Test, and Development Commands

- `pnpm install` installs dependencies and runs the postinstall routing prototype check.
- `pnpm test` runs the main Node test suite with `node --test`.
- `pnpm test:unit`, `pnpm test:framework`, and `pnpm test:integration` run narrower suites.
- `pnpm lint` runs ESLint and markdownlint; `pnpm lint:fix` applies safe fixes.
- `pnpm format` formats tracked files with Prettier; `pnpm format:check` verifies formatting.
- `pnpm validate:full` runs the broad validation gate and can be expensive; use it before larger PRs.

## Coding Style & Naming Conventions

Use JavaScript for runtime code. This repo is `"type": "module"`, so `.mjs` and `.js` are ESM by default; use `.cjs` for CommonJS hooks, tests, and CLI files that require it. Prettier enforces 2-space indentation, semicolons, single quotes, LF endings, 100-column width, and ES5 trailing commas. ESLint requires no unused variables unless prefixed with `_`, strict equality, `prefer-const`, and a 500-line module warning. Name tests as `*.test.cjs` or `*.test.mjs`.

## Testing Guidelines

The primary framework is Node’s built-in test runner. Jest is configured only for `*.jest.test.[cm]js`. Place new tests near the matching area in `tests/`, and prefer targeted commands first, for example `pnpm test:framework:hooks` or `node --test tests/lib/routing/model-router.test.cjs`. Use `pnpm test:ci` for broader validation.

## Commit & Pull Request Guidelines

Recent history follows Conventional Commit style, such as `fix(hooks): ...`, `chore(session): ...`, and `style: ...`. Use a scoped type when possible and keep subjects imperative. PRs should describe the behavior change, list verification commands and results, link related issues or audit items, and include screenshots only for user-visible UI or documentation rendering changes.

## Security & Configuration Tips

Do not commit secrets from `.env`; update `.env.example` or `.env.minimal` when configuration changes. Be careful with hooks, MCP routing, memory, and marketplace code: prefer existing path, schema, and validation helpers over ad hoc parsing.
