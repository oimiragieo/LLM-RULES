# Formatting Gotcha

The global `pnpm format` command can sometimes time out due to the large codebase size. If this happens while formatting your changes, use `npx prettier --write <file-path>` directly on the specific files you modified instead.
