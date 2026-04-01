# Hook Bundle Architecture

When adding new features to hooks (such as adding new response fields like `updatedInput` or `suppressOutput` in `.claude/hooks/safety/bash-command-validator.cjs`), be aware that hooks are often wrapped by a bundle file.

Specifically, the `bash-pretool-bundle.cjs` acts as a wrapper. Any new fields returned by the inner hooks must be explicitly forwarded through this bundle wrapper to take effect in the final output. Always ensure that the bundle correctly passes through your new fields.
