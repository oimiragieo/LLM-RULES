# GPU Acceleration Setup Guide

## Issue Summary

**Symptom:** GPU detected but not used for embeddings (0% GPU utilization, CPU at 67%)

**Root Cause:** CUDA version mismatch
- System has CUDA 11.5 installed
- onnxruntime-node-gpu v1.21.0 requires CUDA 12.x
- pnpm skips GPU package installation due to missing CUDA 12 DLLs

## Verification

Run the GPU diagnostic to check your system:

```bash
pnpm run gpu:check
```

Expected output if GPU is working:
```
✅ NVIDIA GPU(s) detected
✅ onnxruntime-node-gpu installed (GPU-enabled)
✅ onnxruntime-node-gpu module loadable
✅ CUDA Toolkit installed: version 12.x
✅ cudart64_12.dll found in PATH
✅ cublas64_12.dll found in PATH
✅ cublasLt64_12.dll found in PATH
✅ cudnn64_9.dll found in PATH
```

Current output:
```
✅ NVIDIA GPU(s) detected: RTX 4070, RTX 5070
✅ onnxruntime-node-gpu in package.json
❌ onnxruntime-node-gpu module NOT loadable
✅ CUDA Toolkit: version 11.5 (WRONG VERSION)
❌ CUDA 12 DLLs NOT found in PATH
```

## Solution

### Option 1: Upgrade CUDA to 12.x (Recommended)

1. **Download CUDA 12.x:**
   - https://developer.nvidia.com/cuda-downloads
   - Choose: Windows → x86_64 → Version 12.x
   - Installer: ~3GB download

2. **Install CUDA Toolkit:**
   - Run installer
   - Select "Custom Installation"
   - Ensure these components are checked:
     - CUDA Runtime
     - CUDA Development
     - cuBLAS
     - cuDNN (if available)
   - Installation adds to PATH automatically

3. **Verify Installation:**
   ```bash
   nvcc --version  # Should show CUDA 12.x
   where cudart64_12.dll  # Should find DLL in CUDA/v12.x/bin
   ```

4. **Install GPU Package:**
   ```bash
   # Package.json already updated to onnxruntime-node-gpu
   pnpm install

   # Verify it loaded
   node -e "require('onnxruntime-node-gpu'); console.log('GPU package loaded')"
   ```

5. **Reindex with GPU:**
   ```bash
   pnpm run code:index:reindex
   ```

### Option 2: Use CUDA 11.x Compatible Version (Alternative)

If you cannot upgrade CUDA:

1. **Downgrade onnxruntime-node-gpu:**
   ```bash
   # Find CUDA 11 compatible version
   pnpm info onnxruntime-node-gpu versions

   # Install compatible version (e.g., 1.16.x for CUDA 11)
   pnpm add onnxruntime-node-gpu@1.16.0
   ```

2. **Verify and reindex:**
   ```bash
   pnpm run gpu:check
   pnpm run code:index:reindex
   ```

### Option 3: CPU-Only Mode (Fallback)

If GPU acceleration is not available:

```bash
# Revert to CPU version
# Edit package.json: "onnxruntime-node-gpu" → "onnxruntime-node"
pnpm install
```

FastEmbed will use CPU automatically. Performance impact:
- CPU: ~5-10s per 100 embeddings
- GPU: ~50-100ms per 100 embeddings (100x faster)

## Testing GPU Usage

After installation, verify GPU is being used:

```bash
# Run GPU usage test
node --test tests/lib/memory/verify-gpu-usage.test.cjs
```

Expected output with working GPU:
```
GPU utilization before: 0%
GPU memory before: 0MB
Generated 100 embeddings in 100ms
GPU utilization after: 50%
GPU memory after: 2000MB
Memory increase: 2000MB
✅ GPU is actually being used for embeddings
Loaded package: onnxruntime-node-gpu (GPU)
```

Current output (broken):
```
GPU utilization before: 0%
Generated 100 embeddings in 6902ms
GPU utilization after: 0%
Memory increase: 0MB
❌ GPU memory/utilization did not increase
Loaded package: onnxruntime-node (CPU-only)
```

## Performance Comparison

| Mode | Speed (100 embeddings) | GPU Util | Memory |
|------|------------------------|----------|---------|
| **CPU** | 6.9s | 0% | 0MB |
| **GPU (working)** | ~100ms | 50-100% | 2-4GB |
| **Speedup** | **69x faster** | | |

## Architecture

```
┌─────────────────────────────────────────────┐
│ Application                                  │
│   ↓                                          │
│ lancedb-client.cjs                           │
│   ↓                                          │
│ FastEmbed (fastembed npm package)            │
│   ↓                                          │
│ ONNX Runtime (onnxruntime-node-gpu)          │
│   ↓                                          │
│ Execution Provider Selection:                │
│   - Try: CUDAExecutionProvider (GPU)         │
│   - Fallback: CPUExecutionProvider           │
│   ↓                                          │
│ CUDA Runtime (cudart64_12.dll)               │
│   ↓                                          │
│ NVIDIA GPU Driver                            │
│   ↓                                          │
│ NVIDIA GPU (RTX 4070)                        │
└─────────────────────────────────────────────┘
```

**Failure Point:** CUDA Runtime layer (CUDA 11.5 ≠ CUDA 12.x)

## Implementation Details

### Package Changes

**Before:**
```json
{
  "optionalDependencies": {
    "onnxruntime-node": "^1.21.0"
  }
}
```

**After:**
```json
{
  "optionalDependencies": {
    "onnxruntime-node-gpu": "^1.21.0"
  }
}
```

### Code Changes

The `lancedb-client.cjs` already supports GPU:
- GPU detection via `gpu-detector.cjs`
- Auto-tunes batch size based on GPU memory
- Falls back to CPU if GPU unavailable

No code changes needed - only package installation required.

### Diagnostic Tool

New tool added: `.claude/tools/cli/check-gpu.cjs`

```bash
pnpm run gpu:check
```

Checks:
1. NVIDIA GPU detection (nvidia-smi)
2. ONNX Runtime package (CPU vs GPU)
3. FastEmbed availability
4. CUDA Toolkit version (nvcc)
5. CUDA runtime DLLs (cudart64_12.dll, etc.)
6. Execution provider configuration

## Troubleshooting

### pnpm skips onnxruntime-node-gpu

**Symptom:**
```
info: onnxruntime-node-gpu is an optional dependency and failed compatibility check
```

**Cause:** Missing CUDA 12 DLLs in PATH

**Solution:** Install CUDA 12.x, then re-run `pnpm install`

### "Cannot find module 'onnxruntime-node-gpu'"

**Cause:** Package not installed due to compatibility check failure

**Solution:**
1. Install CUDA 12.x
2. `pnpm install` (will succeed after CUDA installed)
3. Verify: `node -e "require('onnxruntime-node-gpu')"`

### GPU detected but 0% utilization

**Cause:** CPU-only onnxruntime-node is loaded

**Solution:**
1. Check loaded package: `node -e "require('onnxruntime-node-gpu')"`
2. If fails, CUDA DLLs missing
3. Install CUDA 12.x
4. Reinstall: `pnpm install`

### CUDA version mismatch

**Symptom:** CUDA 11.x installed but onnxruntime-node-gpu requires 12.x

**Solution:**
- Option A: Upgrade CUDA to 12.x (recommended)
- Option B: Downgrade onnxruntime-node-gpu to CUDA 11 compatible version

## References

- CUDA Downloads: https://developer.nvidia.com/cuda-downloads
- ONNX Runtime GPU Docs: https://onnxruntime.ai/docs/execution-providers/CUDA-ExecutionProvider.html
- FastEmbed Docs: https://github.com/qdrant/fastembed
- GPU Detector: `.claude/lib/code-indexing/gpu-detector.cjs`
- LanceDB Client: `.claude/lib/memory/lancedb-client.cjs`
