/**
 * @file tests/unit/observability/telemetry-init.test.mjs
 * @description Unit tests for OpenTelemetry SDK initialization
 *
 * Tests telemetry-client.cjs lazy initialization, environment variable handling,
 * and graceful degradation when OTEL is disabled.
 *
 * Task: #41 (P1-6.1)
 * Date: 2026-01-29
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const PROJECT_ROOT = 'C:\\dev\\projects\\agent-studio';

describe('OpenTelemetry SDK Initialization', () => {
  let telemetryClient;
  let originalEnv;

  beforeEach(async () => {
    // Save original environment
    originalEnv = { ...process.env };

    // Clear any cached module
    const modulePath = `${PROJECT_ROOT}/.claude/lib/observability/telemetry-client.cjs`;
    delete require.cache[require.resolve(modulePath)];
  });

  afterEach(() => {
    // Restore original environment
    process.env = originalEnv;
  });

  describe('Module Export', () => {
    it('should export an object with init() method', async () => {
      process.env.OTEL_ENABLED = 'false';
      telemetryClient = require(`${PROJECT_ROOT}/.claude/lib/observability/telemetry-client.cjs`);

      assert.strictEqual(typeof telemetryClient, 'object', 'Should export an object');
      assert.strictEqual(typeof telemetryClient.init, 'function', 'Should export init() method');
    });

    it('should export getTracer() method', async () => {
      process.env.OTEL_ENABLED = 'false';
      telemetryClient = require(`${PROJECT_ROOT}/.claude/lib/observability/telemetry-client.cjs`);

      assert.strictEqual(
        typeof telemetryClient.getTracer,
        'function',
        'Should export getTracer() method'
      );
    });

    it('should export shutdown() method', async () => {
      process.env.OTEL_ENABLED = 'false';
      telemetryClient = require(`${PROJECT_ROOT}/.claude/lib/observability/telemetry-client.cjs`);

      assert.strictEqual(
        typeof telemetryClient.shutdown,
        'function',
        'Should export shutdown() method'
      );
    });
  });

  describe('Lazy Initialization (OTEL_ENABLED=true)', () => {
    it('should initialize OpenTelemetry when init() is called with OTEL_ENABLED=true', async () => {
      process.env.OTEL_ENABLED = 'true';
      process.env.OTEL_EXPORTER_OTLP_ENDPOINT = 'http://localhost:4317';

      telemetryClient = require(`${PROJECT_ROOT}/.claude/lib/observability/telemetry-client.cjs`);
      const result = await telemetryClient.init();

      assert.strictEqual(result.initialized, true, 'Should initialize successfully');
      assert.strictEqual(result.enabled, true, 'Should be enabled');
    });

    it('should return tracer after initialization', async () => {
      process.env.OTEL_ENABLED = 'true';
      process.env.OTEL_EXPORTER_OTLP_ENDPOINT = 'http://localhost:4317';

      telemetryClient = require(`${PROJECT_ROOT}/.claude/lib/observability/telemetry-client.cjs`);
      await telemetryClient.init();

      const tracer = telemetryClient.getTracer();
      assert.notStrictEqual(tracer, null, 'Should return a tracer');
      assert.strictEqual(
        typeof tracer.startActiveSpan,
        'function',
        'Tracer should have startActiveSpan method'
      );
    });

    it('should use OTEL_EXPORTER_OTLP_ENDPOINT environment variable', async () => {
      const customEndpoint = 'http://custom-phoenix:4317';
      process.env.OTEL_ENABLED = 'true';
      process.env.OTEL_EXPORTER_OTLP_ENDPOINT = customEndpoint;

      telemetryClient = require(`${PROJECT_ROOT}/.claude/lib/observability/telemetry-client.cjs`);
      const result = await telemetryClient.init();

      assert.strictEqual(result.endpoint, customEndpoint, 'Should use custom endpoint');
    });

    it('should default to http://localhost:4317 if OTEL_EXPORTER_OTLP_ENDPOINT not set', async () => {
      process.env.OTEL_ENABLED = 'true';
      delete process.env.OTEL_EXPORTER_OTLP_ENDPOINT;

      telemetryClient = require(`${PROJECT_ROOT}/.claude/lib/observability/telemetry-client.cjs`);
      const result = await telemetryClient.init();

      assert.strictEqual(result.endpoint, 'http://localhost:4317', 'Should use default endpoint');
    });

    it('should only initialize once (idempotent)', async () => {
      process.env.OTEL_ENABLED = 'true';
      process.env.OTEL_EXPORTER_OTLP_ENDPOINT = 'http://localhost:4317';

      telemetryClient = require(`${PROJECT_ROOT}/.claude/lib/observability/telemetry-client.cjs`);
      const result1 = await telemetryClient.init();
      const result2 = await telemetryClient.init();

      assert.strictEqual(result1.initialized, true, 'First init should succeed');
      assert.strictEqual(result2.initialized, true, 'Second init should succeed');
      assert.strictEqual(result2.alreadyInitialized, true, 'Should indicate already initialized');
    });
  });

  describe('Graceful Degradation (OTEL_ENABLED=false)', () => {
    it('should not initialize when OTEL_ENABLED=false', async () => {
      process.env.OTEL_ENABLED = 'false';

      telemetryClient = require(`${PROJECT_ROOT}/.claude/lib/observability/telemetry-client.cjs`);
      const result = await telemetryClient.init();

      assert.strictEqual(result.initialized, false, 'Should not initialize');
      assert.strictEqual(result.enabled, false, 'Should be disabled');
      assert.strictEqual(result.reason, 'OTEL_ENABLED is false', 'Should provide reason');
    });

    it('should not initialize when OTEL_ENABLED is not set (defaults to false)', async () => {
      delete process.env.OTEL_ENABLED;

      telemetryClient = require(`${PROJECT_ROOT}/.claude/lib/observability/telemetry-client.cjs`);
      const result = await telemetryClient.init();

      assert.strictEqual(result.initialized, false, 'Should not initialize');
      assert.strictEqual(result.enabled, false, 'Should be disabled');
    });

    it('should return no-op tracer when disabled', async () => {
      process.env.OTEL_ENABLED = 'false';

      telemetryClient = require(`${PROJECT_ROOT}/.claude/lib/observability/telemetry-client.cjs`);
      await telemetryClient.init();

      const tracer = telemetryClient.getTracer();
      assert.notStrictEqual(tracer, null, 'Should return a tracer');
      assert.strictEqual(
        typeof tracer.startActiveSpan,
        'function',
        'Should have startActiveSpan method (no-op)'
      );
    });
  });

  describe('Shutdown', () => {
    it('should shutdown gracefully when initialized', async () => {
      process.env.OTEL_ENABLED = 'true';
      process.env.OTEL_EXPORTER_OTLP_ENDPOINT = 'http://localhost:4317';

      telemetryClient = require(`${PROJECT_ROOT}/.claude/lib/observability/telemetry-client.cjs`);
      await telemetryClient.init();

      const result = await telemetryClient.shutdown();
      assert.strictEqual(result.success, true, 'Should shutdown successfully');
    });

    it('should shutdown gracefully when not initialized', async () => {
      process.env.OTEL_ENABLED = 'false';

      telemetryClient = require(`${PROJECT_ROOT}/.claude/lib/observability/telemetry-client.cjs`);
      const result = await telemetryClient.shutdown();

      assert.strictEqual(result.success, true, 'Should succeed even when not initialized');
    });
  });

  describe('Error Handling', () => {
    it('should handle initialization errors gracefully', async () => {
      process.env.OTEL_ENABLED = 'true';
      process.env.OTEL_EXPORTER_OTLP_ENDPOINT = 'invalid-url'; // Invalid URL

      telemetryClient = require(`${PROJECT_ROOT}/.claude/lib/observability/telemetry-client.cjs`);
      const result = await telemetryClient.init();

      // Should still initialize but log warning
      assert.strictEqual(
        typeof result.initialized,
        'boolean',
        'Should return initialization status'
      );
    });
  });
});
