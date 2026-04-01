# Testing Quirks

## `safe-json` Objects

The `safe-json` module returns `null-prototype` objects. When writing unit tests using `assert.deepStrictEqual()`, it will fail when comparing these returned objects against plain object literals `{}`.

To work around this, you must either:

- Use `assert.strictEqual()` on explicit object keys.
- Create a null-prototype object for comparison using `Object.assign(Object.create(null), {...})`.

## Server-Sent Events (SSE) Tests

`supertest` hangs when used with Server-Sent Events (SSE) streaming endpoints. When writing tests for SSE streams, do not use `supertest`. Instead, use the raw Node.js `http` client.

## Async Event Emitter Testing

When testing Node.js `EventEmitter` instances using async test utilities (like a `waitForEvent` helper), if the event is emitted synchronously inside a method, the test listener may attach _after_ the event has already fired, causing the test to timeout.

To work around this, wrap the synchronous event emission in `setImmediate()` to ensure the event loop yields and allows the test listener to attach before firing the event.

Example:

```javascript
// Instead of:
this.emit('event', payload);

// Use:
setImmediate(() => this.emit('event', payload));
```

## AJV Schema Validation

AJV does not support the 'date-time' format natively. When validating schemas that use formats like 'date-time', you must install and require the `ajv-formats` plugin and apply it to your AJV instance via `addFormats(ajv)`.

## Integration Tests with memory-manager-core

When testing `memory-manager-core` API functions like `recordPattern` in isolated temp directories, the `validateProjectRoot` check will enforce the actual repository root and cause the test to fail.
To bypass this in integration tests, require `createRecordingOps` directly instead of using the high-level `memory-manager-core` API.
