# Environment

Environment variables, external dependencies, and setup notes.

**What belongs here:** Required env vars, external API keys/services, dependency quirks, platform-specific notes.
**What does NOT belong here:** Service ports/commands (use `.factory/services.yaml`).

---

## Platform

- **OS:** Windows 10 (10.0.26200)
- **Node.js:** v22+ (Python 3.14 also available)
- **Package Manager:** pnpm
- **Shell:** PowerShell (default on Windows)
- **Git:** 2.53.0

## Key Dependencies (already installed)

- `ajv` - JSON Schema validation
- `better-sqlite3` - SQLite for worker queue
- `yaml` - YAML parsing
- `prettier` - Code formatting

## Windows-Specific Notes

- `fs.watch` may be unreliable on NTFS - use polling fallback
- Use `where` instead of `command -v` for binary detection
- Use `path.join()` and `path.normalize()` for all file paths
- EBUSY errors possible on concurrent file access (use atomic writes)
- `process.platform === 'win32'` for platform detection
