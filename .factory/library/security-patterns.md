# Security Patterns

## Path Validation
When validating paths to ensure they stay within the project (e.g., using `validatePathWithinProject`), note that this function returns an object containing validation status rather than throwing an error. The security check is advisory-only unless the caller explicitly handles the return object (e.g., checking `isValid` or `error` properties).
