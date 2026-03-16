---
name: system-health-check
description: Verifies repository baseline test passing state and available memory/GPU resources to ensure safe mission execution.
---

# System Health Check (Pre-Flight)

Before accepting or starting a large architectural mission, you MUST run this health check to confirm you are not iterating on top of an already broken baseline.

## 1. Test Baseline Verification

Identify the primary test command for this workspace. Use the command matching the ecosystem:

- **Node.js**: `npm run test` or `pnpm test:all`
- **Rust**: `cargo test`
- **Python**: `pytest`

**Rule:** If the tests FAIL, immediately halt your mission and inform the user.
Do not proceed until the existing codebase compiles and tests pass.

## 2. Resource Verification

Ensure the host machine has adequate capacity to compile your work or run complex LLMs.

**Windows PowerShell Examples:**
Check available memory and CPU cores:

```powershell
systeminfo | findstr /C:"Total Physical Memory" /C:"Available Physical Memory"
wmic cpu get NumberOfCores,NumberOfLogicalProcessors /format:list
```

## 3. Hardware Accelerators (Optional)

If your mission explicitly governs a machine learning or GPU-heavy task, check for an NVIDIA GPU via:

```powershell
nvidia-smi --query-gpu=name,memory.total,memory.free --format=csv,noheader
```

If resources look extremely constrained (e.g., <2GB Free RAM), halt and warn the user before proceeding to file modifications.
