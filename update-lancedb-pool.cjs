const fs = require('fs');
const file = 'c:\\dev\\projects\\agent-studio\\.claude\\lib\\memory\\lancedb-client-impl.cjs';
const content = fs.readFileSync(file, 'utf8');

const newCode = `  async _embedViaSubprocessWorker(worker, texts, batchSize) {
    if (!worker.proc || worker.proc.killed || !worker.proc.stdin?.writable) {
      await this._initSingleWorker(worker);
    }

    worker.callCount += 1;
    if (worker.callCount > worker.maxCalls) {
      await this._killSingleWorker(worker);
      await this._initSingleWorker(worker);
      worker.callCount = 1;
    }

    return new Promise((resolve, reject) => {
      let resolved = false;

      const cleanup = () => {
        worker.proc.stdout.removeListener('data', onData);
        worker.proc.removeListener('error', onError);
        worker.proc.removeListener('exit', onExit);
      };

      const onError = err => {
        if (resolved) return;
        resolved = true;
        cleanup();
        reject(err);
      };

      const onExit = code => {
        if (resolved) return;
        resolved = true;
        cleanup();
        reject(new Error(\`Embed subprocess exited unexpectedly (code \${code})\`));
      };

      const onData = chunk => {
        worker.stdoutBuf = (worker.stdoutBuf || '') + chunk;
        let idx;
        while ((idx = worker.stdoutBuf.indexOf('\\n')) !== -1) {
          const line = worker.stdoutBuf.slice(0, idx).trim();
          worker.stdoutBuf = worker.stdoutBuf.slice(idx + 1);
          if (!line) continue;
          try {
            const msg = JSON.parse(line);
            if (msg.ready) continue;
            if (resolved) return;
            resolved = true;
            cleanup();
            if (msg.ok && msg.vectors) {
              resolve(msg.vectors);
            } else {
              reject(new Error(msg.error || 'Embed subprocess returned error'));
            }
          } catch (e) {
            if (resolved) return;
            resolved = true;
            cleanup();
            reject(e);
          }
          return;
        }
      };

      worker.proc.stdout.on('data', onData);
      worker.proc.on('error', onError);
      worker.proc.on('exit', onExit);

      try {
        worker.proc.stdin.write(JSON.stringify({ action: 'embed', texts, batchSize }) + '\\n');
      } catch (e) {
        if (!resolved) {
          resolved = true;
          cleanup();
          reject(e);
        }
      }
    });
  }

  async _spawnEmbedWorkers() {
    if (this._embedWorkers && this._embedWorkers.length > 0) return;

    let gpuCount = 1;
    try {
      const { GPUDetector } = require('../code-indexing/gpu-detector.cjs');
      const gpuInfo = await new GPUDetector().detectNVIDIA();
      if (gpuInfo && gpuInfo.gpuCount > 1) gpuCount = gpuInfo.gpuCount;
    } catch (_e) {}

    const count = process.env.EMBED_SUBPROCESS_MAX_WORKERS
      ? parseInt(process.env.EMBED_SUBPROCESS_MAX_WORKERS, 10)
      : gpuCount;

    this._embedWorkers = Array.from({ length: count }).map((_, i) => ({
      id: i,
      proc: null,
      stdoutBuf: '',
      callCount: 0,
      maxCalls: 50
    }));

    await Promise.all(this._embedWorkers.map(w => this._initSingleWorker(w)));
  }

  async _initSingleWorker(worker) {
    const { spawn } = require('child_process');
    const workerPath = require('path').resolve(
      __dirname,
      '..',
      'code-indexing',
      'embed-subprocess.cjs'
    );

    worker.stdoutBuf = '';
    worker.callCount = 0;

    // Distribute workers across GPUs safely
    const env = { ...process.env };
    if (this.config.embeddingMode !== 'transformers') {
      env.CUDA_VISIBLE_DEVICES = worker.id.toString();
    }

    worker.proc = spawn(process.execPath, [workerPath], {
      env,
      stdio: ['pipe', 'pipe', 'inherit'],
      shell: false,
      windowsHide: true,
    });

    worker.proc.stdout.setEncoding('utf-8');

    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Embed worker start timeout')), 60000);
      const onData = chunk => {
        worker.stdoutBuf += chunk;
        let idx;
        while ((idx = worker.stdoutBuf.indexOf('\\n')) !== -1) {
          const line = worker.stdoutBuf.slice(0, idx).trim();
          worker.stdoutBuf = worker.stdoutBuf.slice(idx + 1);
          if (!line) continue;
          try {
            const msg = JSON.parse(line);
            if (msg.ready) {
              clearTimeout(timeout);
              worker.proc.stdout.removeListener('data', onData);
              resolve();
              return;
            }
          } catch (_e) {}
        }
      };
      worker.proc.stdout.on('data', onData);
      worker.proc.on('error', err => {
        clearTimeout(timeout);
        reject(err);
      });
    });

    const initResult = await new Promise((resolve, reject) => {
      const onData = chunk => {
        worker.stdoutBuf += chunk;
        let idx;
        while ((idx = worker.stdoutBuf.indexOf('\\n')) !== -1) {
          const line = worker.stdoutBuf.slice(0, idx).trim();
          worker.stdoutBuf = worker.stdoutBuf.slice(idx + 1);
          if (!line) continue;
          try {
            const msg = JSON.parse(line);
            worker.proc.stdout.removeListener('data', onData);
            if (msg.ok) {
              resolve(msg);
            } else {
              reject(new Error(msg.error || 'Init failed'));
            }
          } catch (e) {
            worker.proc.stdout.removeListener('data', onData);
            reject(e);
          }
          return;
        }
      };
      worker.proc.stdout.on('data', onData);
      worker.proc.stdin.write(
        JSON.stringify({
          action: 'init',
          mode: this.config.embeddingMode,
          model: this.config.embeddingModel,
        }) + '\\n'
      );
    });

    logger.info(\`Embed subprocess worker \${worker.id} started\`, {
      mode: this.config.embeddingMode,
      device: initResult?.device || 'unknown',
      gpuName: initResult?.gpuName || null,
    });
  }

  async _killSingleWorker(worker) {
    if (worker.proc && !worker.proc.killed) {
      try {
        worker.proc.stdin.end();
        worker.proc.kill();
      } catch (_e) {}
      await new Promise(resolve => {
        if (worker.proc.killed) return resolve();
        worker.proc.on('exit', resolve);
        setTimeout(resolve, 2000);
      });
      logger.info(\`Embed subprocess worker \${worker.id} restarted (ONNX memory reclaim)\`);
    }
    worker.proc = null;
    worker.stdoutBuf = '';
  }

  async _killEmbedWorker() {
    if (!this._embedWorkers) return;
    await Promise.all(this._embedWorkers.map(w => this._killSingleWorker(w)));
    this._embedWorkers = null;
  }

  /**
   * Generate embeddings for multiple texts in batches.
   *
   * @param {string[]} texts
   * @param {number} [batchSize=32]
   * @param {{ onBatchComplete?: (batchDone: number, totalBatches: number) => void }} [progressOptions]
   * @returns {Promise<Array<number[]>>} Array of vectors in same order as texts
   */
  async generateEmbeddingsBatch(texts, batchSize = 32, progressOptions) {
    if (!texts || texts.length === 0) return [];
    if (this.config.embeddingMode === 'test') {
      return texts.map(t => stableTestEmbedding(t, 384));
    }
    if (this.config.embeddingMode === 'off' || this._embeddingStatus?.status === 'unavailable') {
      throw new Error('Embedder not available for batch');
    }

    const useSubprocess =
      process.env.EMBED_SUBPROCESS !== 'off' &&
      (this.config.embeddingMode === 'fastembed' || this.config.embeddingMode === 'transformers');

    if (useSubprocess) {
      await this._spawnEmbedWorkers();

      const batches = [];
      for (let i = 0; i < texts.length; i += batchSize) {
        batches.push(texts.slice(i, i + batchSize));
      }

      const results = new Array(batches.length);
      const totalBatches = batches.length;
      let batchDone = 0;

      // Group batches by worker index round-robin
      const workerTasks = this._embedWorkers.map(() => []);
      batches.forEach((batch, batchIdx) => {
        workerTasks[batchIdx % this._embedWorkers.length].push({ batch, batchIdx });
      });

      await Promise.all(
        this._embedWorkers.map(async (worker, wIdx) => {
          for (const { batch, batchIdx } of workerTasks[wIdx]) {
            const vectors = await this._embedViaSubprocessWorker(worker, batch, batchSize);
            results[batchIdx] = vectors;
            batchDone += 1;
            if (progressOptions?.onBatchComplete) {
              progressOptions.onBatchComplete(batchDone, totalBatches);
            }
          }
        })
      );

      return results.flat();
    }`;

const startIndex = content.indexOf('  async _embedViaSubprocess(texts, batchSize) {');
const endIndex = content.indexOf(
  '    // In-process fallback (for single queries / search, not bulk indexing)',
  startIndex
);

if (startIndex === -1 || endIndex === -1) {
  console.error('Could not find boundaries');
  process.exit(1);
}

const updatedContent =
  content.substring(0, startIndex) + newCode + '\n\n' + content.substring(endIndex);
fs.writeFileSync(file, updatedContent);
console.log('Update successful');
