/**
 * GPU Detector - Detects NVIDIA GPU availability on Windows
 *
 * @module code-indexing/gpu-detector
 */

'use strict';

const { execFile } = require('child_process');
const { promisify } = require('util');

const execFileAsync = promisify(execFile);

/**
 * Detects GPU availability and recommends optimal batch sizes
 */
class GPUDetector {
  constructor() {
    this._gpuInfo = null;
  }

  /**
   * Detect NVIDIA GPU using nvidia-smi
   * @returns {Promise<{available: boolean, gpuName: string|null, totalMemoryMB: number}>}
   */
  async detectNVIDIA() {
    try {
      // Query nvidia-smi for GPU name and memory
      const { stdout } = await this._execCommand('nvidia-smi', [
        '--query-gpu=name,memory.total',
        '--format=csv,noheader,nounits',
      ]);

      const lines = stdout.trim().split('\n');
      if (lines.length === 0 || !lines[0]) {
        return { available: false, gpuName: null, totalMemoryMB: 0 };
      }

      // Parse first GPU (multi-GPU systems use first one for name/mem metrics)
      const parts = lines[0].split(',');
      const gpuName = parts[0]?.trim();
      const totalMemoryMB = parseInt(parts[1]?.trim(), 10);
      const gpuCount = lines.filter(line => line.trim().length > 0).length;

      if (!gpuName || !totalMemoryMB) {
        return { available: false, gpuName: null, totalMemoryMB: 0, gpuCount: 0 };
      }

      this._gpuInfo = { available: true, gpuName, totalMemoryMB, gpuCount };
      return this._gpuInfo;
    } catch (_error) {
      // nvidia-smi not found or execution failed
      this._gpuInfo = { available: false, gpuName: null, totalMemoryMB: 0 };
      return this._gpuInfo;
    }
  }

  /**
   * Execute command (allows mocking in tests)
   * @param {string} command
   * @param {string[]} args
   * @returns {Promise<{stdout: string, stderr: string}>}
   * @private
   */
  async _execCommand(command, args = []) {
    return execFileAsync(command, args, { windowsHide: true });
  }

  /**
   * Recommend batch size based on GPU memory
   * @param {number} memoryMB - GPU memory in MB
   * @returns {number} Recommended batch size
   */
  recommendBatchSize(memoryMB) {
    if (memoryMB >= 16384) return 256; // 16GB+
    if (memoryMB >= 8192) return 128; // 8GB
    if (memoryMB >= 4096) return 64; // 4GB
    return 32; // 2GB or less (minimum)
  }

  /**
   * Get device information
   * @returns {Promise<{device: string, name: string, memoryMB: number}>}
   */
  async getDeviceInfo() {
    if (!this._gpuInfo) {
      await this.detectNVIDIA();
    }

    if (this._gpuInfo.available) {
      return {
        device: 'gpu',
        name: this._gpuInfo.gpuName,
        memoryMB: this._gpuInfo.totalMemoryMB,
      };
    }

    return {
      device: 'cpu',
      name: 'CPU',
      memoryMB: 0,
    };
  }
}

module.exports = { GPUDetector };
