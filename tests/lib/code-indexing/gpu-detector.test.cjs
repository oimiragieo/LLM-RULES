#!/usr/bin/env node
/**
 * GPU Detector Tests
 *
 * Tests GPU detection and batch size recommendation for Windows.
 */

'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { GPUDetector } = require('../../../.claude/lib/code-indexing/gpu-detector.cjs');

test('GPUDetector - detectNVIDIA - should detect GPU when nvidia-smi available', async () => {
  const detector = new GPUDetector();
  const result = await detector.detectNVIDIA();

  // Should return structure even if no GPU (graceful fallback)
  assert.ok('available' in result, 'Should have available property');
  assert.strictEqual(typeof result.available, 'boolean', 'available should be boolean');

  if (result.available) {
    assert.ok('gpuName' in result, 'Should have gpuName property');
    assert.ok('totalMemoryMB' in result, 'Should have totalMemoryMB property');
    assert.strictEqual(typeof result.gpuName, 'string', 'gpuName should be string');
    assert.strictEqual(typeof result.totalMemoryMB, 'number', 'totalMemoryMB should be number');
    assert.ok(result.totalMemoryMB > 0, 'totalMemoryMB should be greater than 0');
  }
});

test('GPUDetector - detectNVIDIA - should return unavailable when nvidia-smi not found', async () => {
  const detector = new GPUDetector();

  // Mock exec to simulate nvidia-smi not found
  detector._execCommand = async () => {
    const error = new Error('Command failed');
    error.code = 'ENOENT';
    throw error;
  };

  const result = await detector.detectNVIDIA();

  assert.strictEqual(result.available, false, 'Should not be available');
  assert.strictEqual(result.gpuName, null, 'gpuName should be null');
  assert.strictEqual(result.totalMemoryMB, 0, 'totalMemoryMB should be 0');
});

test('GPUDetector - detectNVIDIA - should parse nvidia-smi output correctly', async () => {
  const detector = new GPUDetector();

  // Mock nvidia-smi output
  const mockOutput = `NVIDIA GeForce RTX 3080, 10240`;

  detector._execCommand = async () => ({ stdout: mockOutput, stderr: '' });

  const result = await detector.detectNVIDIA();

  assert.strictEqual(result.available, true, 'Should be available');
  assert.strictEqual(result.gpuName, 'NVIDIA GeForce RTX 3080', 'Should parse GPU name');
  assert.strictEqual(result.totalMemoryMB, 10240, 'Should parse memory');
});

test('GPUDetector - recommendBatchSize - should recommend 32 for 2GB memory', () => {
  const detector = new GPUDetector();
  assert.strictEqual(detector.recommendBatchSize(2048), 32);
});

test('GPUDetector - recommendBatchSize - should recommend 64 for 4GB memory', () => {
  const detector = new GPUDetector();
  assert.strictEqual(detector.recommendBatchSize(4096), 64);
});

test('GPUDetector - recommendBatchSize - should recommend 128 for 8GB memory', () => {
  const detector = new GPUDetector();
  assert.strictEqual(detector.recommendBatchSize(8192), 128);
});

test('GPUDetector - recommendBatchSize - should recommend 256 for 16GB+ memory', () => {
  const detector = new GPUDetector();
  assert.strictEqual(detector.recommendBatchSize(16384), 256);
  assert.strictEqual(detector.recommendBatchSize(24576), 256);
});

test('GPUDetector - recommendBatchSize - should return minimum 32 for low memory', () => {
  const detector = new GPUDetector();
  assert.strictEqual(detector.recommendBatchSize(1024), 32);
  assert.strictEqual(detector.recommendBatchSize(512), 32);
});

test('GPUDetector - getDeviceInfo - should return GPU info when available', async () => {
  const detector = new GPUDetector();

  // Mock GPU detection
  detector._gpuInfo = {
    available: true,
    gpuName: 'NVIDIA GeForce RTX 3080',
    totalMemoryMB: 10240
  };

  const info = await detector.getDeviceInfo();

  assert.strictEqual(info.device, 'gpu', 'device should be gpu');
  assert.strictEqual(info.name, 'NVIDIA GeForce RTX 3080', 'name should match');
  assert.strictEqual(info.memoryMB, 10240, 'memory should match');
});

test('GPUDetector - getDeviceInfo - should return CPU when GPU unavailable', async () => {
  const detector = new GPUDetector();

  // Mock no GPU
  detector._gpuInfo = {
    available: false,
    gpuName: null,
    totalMemoryMB: 0
  };

  const info = await detector.getDeviceInfo();

  assert.strictEqual(info.device, 'cpu', 'device should be cpu');
  assert.strictEqual(info.name, 'CPU', 'name should be CPU');
  assert.strictEqual(info.memoryMB, 0, 'memory should be 0');
});
