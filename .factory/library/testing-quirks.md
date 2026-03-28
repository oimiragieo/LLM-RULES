# Testing Quirks

## `safe-json` Objects
The `safe-json` module returns `null-prototype` objects. When writing unit tests using `assert.deepStrictEqual()`, it will fail when comparing these returned objects against plain object literals `{}`. 

To work around this, you must either:
- Use `assert.strictEqual()` on explicit object keys.
- Create a null-prototype object for comparison using `Object.assign(Object.create(null), {...})`.
