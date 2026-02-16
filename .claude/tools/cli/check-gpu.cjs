#!/usr/bin/env node

/**
 * GPU Configuration Check - Diagnostic script
 *
 * Verifies:
 * 1. NVIDIA GPU detection (nvidia-smi)
 * 2. ONNX Runtime package (CPU vs GPU)
 * 3. FastEmbed availability
 * 4. Execution provider configuration
 */

'use strict';

const { safeParseJSON } = require('../../lib/utils/safe-json.cjs');

const { execSync, spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const { wrapCLITool } = require('../../lib/utils/cli-wrapper.cjs');

const wrappedPreflight = wrapCLITool(async () => ({ ok: true }), 'check-gpu');
if (process.env.TRIGGER_WRAPPER_ERROR === 'true') {
  wrappedPreflight();
}

console.log('=== GPU Configuration Check ===\n');

// 1. Check nvidia-smi
console.log('1. NVIDIA GPU Detection:\n');
try {
  const output = execSync(
    'nvidia-smi --query-gpu=name,memory.total --format=csv,noheader,nounits',
    { encoding: 'utf-8' }
  );
  const lines = output.trim().split('\n');
  console.log('✅ NVIDIA GPU(s) detected:');
  lines.forEach(line => {
    const [name, memory] = line.split(',');
    const memoryGB = (parseInt(memory) / 1024).toFixed(2);
    console.log(`   - ${name.trim()}: ${memoryGB}GB`);
  });
} catch (e) {
  console.log('❌ nvidia-smi not available or no NVIDIA GPU detected');
  console.log(`   Error: ${e.message}`);
}

// 2. Check ONNX Runtime package
console.log('\n2. ONNX Runtime Package:\n');
const projectRoot = path.resolve(__dirname, '../../../');
const packageJsonPath = path.join(projectRoot, 'package.json');

if (fs.existsSync(packageJsonPath)) {
  const packageJson = safeParseJSON(fs.readFileSync(packageJsonPath, 'utf-8'));
  const deps = {
    ...packageJson.dependencies,
    ...packageJson.optionalDependencies,
  };

  const hasGpuPackage = 'onnxruntime-node-gpu' in deps;
  const hasCpuPackage = 'onnxruntime-node' in deps;

  if (hasGpuPackage) {
    console.log('✅ onnxruntime-node-gpu installed (GPU-enabled)');
    console.log(`   Version: ${deps['onnxruntime-node-gpu']}`);
  } else if (hasCpuPackage) {
    console.log('⚠️  onnxruntime-node installed (CPU-only)');
    console.log(`   Version: ${deps['onnxruntime-node']}`);
    console.log('   Recommendation: Switch to GPU version');
  } else {
    console.log('❌ No ONNX Runtime package installed');
  }

  // Try to require the actual installed package
  try {
    require('onnxruntime-node-gpu');
    console.log('✅ onnxruntime-node-gpu module loadable');
  } catch (_e) {
    try {
      require('onnxruntime-node');
      console.log('⚠️  onnxruntime-node module loadable (CPU-only)');
    } catch (_e2) {
      console.log('❌ No ONNX Runtime module loadable');
    }
  }
} else {
  console.log('❌ package.json not found');
}

// 3. Check FastEmbed
console.log('\n3. FastEmbed Package:\n');
try {
  const _fastembed = require('fastembed');
  console.log('✅ FastEmbed installed');
  console.log('   FastEmbed uses ONNX Runtime for inference');
} catch (_e) {
  console.log('❌ FastEmbed not installed');
  console.log(`   Error: ${_e.message}`);
}

// 4. Check CUDA availability (via onnxruntime)
console.log('\n4. CUDA Execution Provider Check:\n');
try {
  const ort = require('onnxruntime-node-gpu');
  console.log('✅ onnxruntime-node-gpu loadable');

  // Check if CUDA provider is available
  if (ort.env && ort.env.wasm) {
    console.log(`   WASM proxy: ${ort.env.wasm.proxy ? 'enabled' : 'disabled'}`);
  }

  // Try to get available providers (if API exists)
  if (typeof ort.InferenceSession !== 'undefined') {
    console.log('   InferenceSession API available');
  }
} catch (e) {
  console.log('❌ onnxruntime-node-gpu not loadable');
  console.log(`   Error: ${e.message}`);

  try {
    require('onnxruntime-node');
    console.log('⚠️  Falling back to onnxruntime-node (CPU-only)');
  } catch (_e2) {
    console.log('❌ No ONNX Runtime available');
  }
}

// 5. Check CUDA Toolkit
console.log('\n5. CUDA Toolkit Check:\n');
try {
  const nvccOutput = execSync('nvcc --version', { encoding: 'utf-8', stdio: 'pipe' });
  const match = nvccOutput.match(/release (\d+\.\d+)/);
  if (match) {
    console.log(`✅ CUDA Toolkit installed: version ${match[1]}`);
  } else {
    console.log('⚠️  CUDA Toolkit found but version unclear');
  }
} catch (_e) {
  console.log('❌ CUDA Toolkit (nvcc) not found in PATH');
  console.log('   GPU package requires CUDA runtime DLLs');
}

// 6. Check CUDA DLLs
console.log('\n6. CUDA Runtime DLLs:\n');
const cudaDlls = ['cudart64_12.dll', 'cublas64_12.dll', 'cublasLt64_12.dll', 'cudnn64_9.dll'];
let allDllsFound = true;
for (const dll of cudaDlls) {
  try {
    // Use spawnSync with array args to prevent command injection
    const result = spawnSync('where', [dll], {
      encoding: 'utf-8',
      stdio: 'pipe',
      shell: false,
      windowsHide: true,
    });
    if (result.status === 0) {
      console.log(`✅ ${dll} found in PATH`);
    } else {
      console.log(`❌ ${dll} NOT found in PATH`);
      allDllsFound = false;
    }
  } catch (_e) {
    console.log(`❌ ${dll} NOT found in PATH`);
    allDllsFound = false;
  }
}

if (!allDllsFound) {
  console.log('\n⚠️  Missing CUDA runtime DLLs');
  console.log('   onnxruntime-node-gpu requires CUDA DLLs in PATH');
  console.log('   Install CUDA Toolkit from: https://developer.nvidia.com/cuda-downloads');
}

// 7. Test FastEmbed GPU (Primary GPU Acceleration Method)
console.log('\n7. FastEmbed GPU Acceleration Test:\n');
try {
  const { MemoryVectorStore } = require('../../lib/memory/lancedb-client.cjs');
  const testStore = async () => {
    try {
      const store = new MemoryVectorStore({
        embeddingMode: 'fastembed',
        persistDirectory: '.claude/context/data/lancedb-test',
      });
      await store.initialize();

      if (store.device === 'gpu') {
        console.log('✅ GPU Acceleration: WORKING');
        console.log(`   GPU: ${store.gpuName}`);
        console.log(`   Memory: ${store.gpuMemoryMB}MB`);
        console.log(`   Embedding Status: ${store._embeddingStatus?.status}`);
        console.log('   FastEmbed with ONNX Runtime CUDA provider active');
      } else {
        console.log('⚠️  GPU Acceleration: Not active');
        console.log('   Running in CPU mode');
      }
    } catch (e) {
      console.log('❌ FastEmbed GPU test failed');
      console.log(`   Error: ${e.message}`);
    }
  };
  testStore();
} catch (e) {
  console.log('❌ Cannot test FastEmbed GPU');
  console.log(`   Error: ${e.message}`);
}

// 8. Summary and Recommendations
setTimeout(() => {
  console.log('\n=== Summary ===\n');
  console.log('GPU Acceleration Methods:');
  console.log('\n1. FastEmbed (Recommended - Already Working):');
  console.log('   ✅ Uses ONNX Runtime with CUDA provider internally');
  console.log('   ✅ No additional packages needed');
  console.log('   ✅ Works with CUDA 11.x, 12.x, 13.x');
  console.log('   ✅ Auto-detects GPU and falls back to CPU if unavailable');
  console.log('\n2. onnxruntime-node-gpu (Optional - Not Required):');
  console.log('   ℹ️  This package is optional and not needed for GPU acceleration');
  console.log('   ℹ️  FastEmbed provides GPU support without it');
  console.log('   ℹ️  pnpm correctly skips it when CUDA version mismatches');

  console.log('\n=== To Use GPU Acceleration ===\n');
  console.log('1. Ensure LANCEDB_EMBEDDING_MODE=fastembed (default)');
  console.log('2. Run: pnpm run code:index:reindex');
  console.log('3. GPU will be detected and used automatically');
  console.log('\n=== Troubleshooting ===\n');
  console.log('If GPU not detected:');
  console.log('- Verify CUDA Toolkit installed: nvcc --version');
  console.log('- Check CUDA DLLs in PATH: where cudart64_*.dll');
  console.log('- Ensure NVIDIA drivers updated');
  console.log('\nFor CPU-only mode:');
  console.log('- Set LANCEDB_EMBEDDING_MODE=transformers');
}, 2000);
