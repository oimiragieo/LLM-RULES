# Issues

## Windows Path Normalization

**Date:** 2026-02-01

path.relative() returns backslash on Windows. Normalize with .replace(/\\/g, '/').

---

## Windows Path Normalization Issue

**Date:** 2026-02-03

On Windows, path.relative() returns backslash paths. Must normalize paths with .replace(/\\/g, '/') before regex.

---

## Unrelated Issue

**Date:** 2026-02-05

Something completely different.

---
