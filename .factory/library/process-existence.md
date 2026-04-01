# Process Existence Check

To perform a robust, cross-platform check for process existence in Node.js, use `process.kill(pid, 0)` and handle the `EPERM` error code. This safely identifies running processes without terminating them, even if you lack permissions to send a signal.

```javascript
function isProcessAlive(pid) {
  try {
    process.kill(pid, 0); // 0 is a special signal that checks existence without killing
    return true;
  } catch (err) {
    return err.code === 'EPERM'; // Process exists but we lack permission to signal it
  }
}
```
