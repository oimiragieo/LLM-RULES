#!/usr/bin/env node
/**
 * Embedding Subprocess Worker
 *
 * Runs fastembed/transformers embedding in an isolated subprocess to work
 * around ONNX Runtime's native memory arena leak (microsoft/onnxruntime#25325,
 * qdrant/fastembed#570). When this process exits, ALL native memory
 * (including ONNX arena allocations) is fully reclaimed by the OS.
 *
 * Protocol (via stdin/stdout JSON lines):
 *   -> { action: 'init', mode: 'fastembed'|'transformers', model?: string }
 *   <- { ok: true, mode: string, device: string, gpuName: string|null }
 *   -> { action: 'embed', texts: string[], batchSize: number }
 *   <- { ok: true, vectors: number[][] }
 *   -> { action: 'exit' }
 *   <- (process exits)
 *
 * Spawned by lancedb-client-impl.cjs when embedding mode is fastembed/transformers.
 *
 * @module code-indexing/embed-subprocess
 */

'use strict';

const { configureCudaPath } = require('../memory/lancedb-client-helpers.cjs');
const { safeParseJSON } = require('../utils/safe-json.cjs');

// Configure CUDA path before loading any ONNX/embedding libraries
configureCudaPath();

let fastembedModel = null;
let transformersPipeline = null;
let embeddingMode = null;
let deviceInfo = { device: 'cpu', gpuName: null, gpuMemoryMB: 0 };

function getFastembedExecutionProviders(fastembed, preferGpu) {
  const providerEnum = fastembed && fastembed.ExecutionProvider ? fastembed.ExecutionProvider : {};
  const cpuProvider = providerEnum.CPU || 'cpu';
  const cudaProvider = providerEnum.CUDA || 'cuda';
  return preferGpu ? [cudaProvider] : [cpuProvider];
}

/**
 * Detect GPU using the project's GPUDetector
 */
async function detectGPU() {
  try {
    const { GPUDetector } = require('./gpu-detector.cjs');
    const detector = new GPUDetector();
    const gpuInfo = await detector.detectNVIDIA();
    if (gpuInfo.available) {
      deviceInfo = {
        device: 'gpu',
        gpuName: gpuInfo.gpuName,
        gpuMemoryMB: gpuInfo.totalMemoryMB,
      };
      // stderr so it doesn't interfere with the JSON protocol on stdout
      process.stderr.write(
        `[embed-worker] GPU detected: ${gpuInfo.gpuName} (${gpuInfo.totalMemoryMB}MB)\n`
      );
    } else {
      process.stderr.write('[embed-worker] No GPU detected, using CPU\n');
    }
  } catch (_err) {
    process.stderr.write('[embed-worker] GPU detection failed, using CPU\n');
  }
}

async function initFastembed(preferGpu = true) {
  if (preferGpu) {
    await detectGPU();
  } else {
    deviceInfo = { device: 'cpu', gpuName: null, gpuMemoryMB: 0 };
    process.stderr.write('[embed-worker] GPU disabled, using CPU\n');
  }

  const fastembed = require('fastembed');
  const initOptions = {
    model: fastembed.EmbeddingModel.BGESmallENV15,
    executionProviders: getFastembedExecutionProviders(
      fastembed,
      preferGpu && deviceInfo.device === 'gpu'
    ),
  };

  if (deviceInfo.device === 'gpu') {
    process.stderr.write('[embed-worker] FastEmbed initializing with GPU (CUDA) support\n');
  } else {
    process.stderr.write('[embed-worker] FastEmbed initializing with CPU\n');
  }

  try {
    fastembedModel = await fastembed.FlagEmbedding.init(initOptions);
    process.stderr.write(
      `[embed-worker] FastEmbed initialized (${deviceInfo.device === 'gpu' ? 'GPU' : 'CPU'} mode)\n`
    );
  } catch (e) {
    // If GPU init fails, retry CPU-only
    if (deviceInfo.device === 'gpu') {
      process.stderr.write(`[embed-worker] GPU init failed (${e.message}), retrying with CPU...\n`);
      deviceInfo = { device: 'cpu', gpuName: null, gpuMemoryMB: 0 };
      fastembedModel = await fastembed.FlagEmbedding.init({
        ...initOptions,
        executionProviders: getFastembedExecutionProviders(fastembed, false),
      });
      process.stderr.write('[embed-worker] FastEmbed initialized (CPU fallback)\n');
    } else {
      throw e;
    }
  }
}

async function initTransformers(modelName) {
  await detectGPU();

  const mod = await import('@xenova/transformers');
  const pipelineFn = mod.pipeline;

  const model = modelName || 'Xenova/all-MiniLM-L6-v2';
  process.stderr.write(`[embed-worker] Loading transformers model: ${model}\n`);

  transformersPipeline = await pipelineFn('feature-extraction', model);
  process.stderr.write('[embed-worker] Transformers pipeline ready\n');
}

async function embedFastembed(texts, batchSize) {
  const results = [];
  const gen = fastembedModel.embed(texts, batchSize);
  for await (const batch of gen) {
    for (const row of batch) {
      results.push(Array.from(row));
    }
  }
  return results;
}

async function embedTransformers(texts, batchSize) {
  const results = [];
  for (let i = 0; i < texts.length; i += batchSize) {
    const batch = texts.slice(i, i + batchSize);
    if (batch.length === 1) {
      const output = await transformersPipeline(batch[0], {
        pooling: 'mean',
        normalize: true,
      });
      results.push(Array.from(output.data));
    } else {
      try {
        const output = await transformersPipeline(batch, {
          pooling: 'mean',
          normalize: true,
        });
        const dims = output.dims;
        const [rows, dim] = dims;
        for (let r = 0; r < rows; r++) {
          results.push(Array.from(output.data.slice(r * dim, (r + 1) * dim)));
        }
      } catch (_err) {
        // Fallback to single-text
        for (const text of batch) {
          const output = await transformersPipeline(text, {
            pooling: 'mean',
            normalize: true,
          });
          results.push(Array.from(output.data));
        }
      }
    }
  }
  return results;
}

async function handleMessage(msg) {
  if (msg.action === 'init') {
    embeddingMode = msg.mode || 'fastembed';
    if (embeddingMode === 'fastembed') {
      await initFastembed(msg.preferGpu !== false);
    } else if (embeddingMode === 'transformers') {
      await initTransformers(msg.model);
    }
    return {
      ok: true,
      mode: embeddingMode,
      device: deviceInfo.device,
      gpuName: deviceInfo.gpuName,
    };
  }

  if (msg.action === 'embed') {
    const texts = msg.texts;
    const batchSize = msg.batchSize || 16;
    let vectors;
    if (embeddingMode === 'fastembed') {
      vectors = await embedFastembed(texts, batchSize);
    } else {
      vectors = await embedTransformers(texts, batchSize);
    }
    return { ok: true, vectors };
  }

  if (msg.action === 'exit') {
    process.exit(0);
  }

  return { ok: false, error: 'Unknown action: ' + msg.action };
}

// JSON-line protocol over stdin/stdout
let inputBuffer = '';

process.stdin.setEncoding('utf-8');
process.stdin.on('data', chunk => {
  inputBuffer += chunk;
  // Process complete lines
  let newlineIdx;
  while ((newlineIdx = inputBuffer.indexOf('\n')) !== -1) {
    const line = inputBuffer.slice(0, newlineIdx).trim();
    inputBuffer = inputBuffer.slice(newlineIdx + 1);
    if (!line) continue;

    let msg;
    try {
      msg = safeParseJSON(line);
    } catch (_e) {
      process.stdout.write(JSON.stringify({ ok: false, error: 'Invalid JSON' }) + '\n');
      continue;
    }

    handleMessage(msg)
      .then(result => {
        process.stdout.write(JSON.stringify(result) + '\n');
      })
      .catch(err => {
        process.stdout.write(
          JSON.stringify({ ok: false, error: err.message || String(err) }) + '\n'
        );
      });
  }
});

process.stdin.on('end', () => {
  process.exit(0);
});

// Signal ready
process.stdout.write(JSON.stringify({ ready: true }) + '\n');
