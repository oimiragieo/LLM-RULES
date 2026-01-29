/**
 * @file tests/unit/observability/batch-processor.test.mjs
 * @description Unit tests for BatchSpanProcessor configuration in telemetry-client.cjs
 *
 * Task: #42 (P1-6.2)
 * Date: 2026-01-29
 *
 * Tests:
 * - BatchSpanProcessor configuration
 * - Environment variable handling (OTEL_BATCH_SIZE, OTEL_BATCH_TIMEOUT)
 * - Resource attributes (service.name, environment)
 * - Batch size validation
 * - Batch timeout validation
 */

import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

describe('BatchSpanProcessor Configuration', () => {
  let originalEnv;

  beforeEach(() => {
    // Save original environment variables
    originalEnv = { ...process.env };

    // Reset module cache to force re-initialization
    const telemetryPath =
      require.resolve('../../../.claude/lib/observability/telemetry-client.cjs');
    delete require.cache[telemetryPath];
  });

  afterEach(() => {
    // Restore original environment
    process.env = originalEnv;
  });

  describe('Default Configuration', () => {
    test('uses default batch size (512 spans)', async () => {
      process.env.OTEL_ENABLED = 'true';

      const telemetryClient = require('../../../.claude/lib/observability/telemetry-client.cjs');
      const result = await telemetryClient.init();

      assert.strictEqual(result.initialized, true);
      assert.strictEqual(result.batchProcessor.maxExportBatchSize, 512);

      await telemetryClient.shutdown();
    });

    test('uses default batch timeout (5000ms)', async () => {
      process.env.OTEL_ENABLED = 'true';

      const telemetryClient = require('../../../.claude/lib/observability/telemetry-client.cjs');
      const result = await telemetryClient.init();

      assert.strictEqual(result.initialized, true);
      assert.strictEqual(result.batchProcessor.scheduledDelayMillis, 5000);

      await telemetryClient.shutdown();
    });

    test('uses default max queue size (2048)', async () => {
      process.env.OTEL_ENABLED = 'true';

      const telemetryClient = require('../../../.claude/lib/observability/telemetry-client.cjs');
      const result = await telemetryClient.init();

      assert.strictEqual(result.initialized, true);
      assert.strictEqual(result.batchProcessor.maxQueueSize, 2048);

      await telemetryClient.shutdown();
    });

    test('uses default export timeout (30000ms)', async () => {
      process.env.OTEL_ENABLED = 'true';

      const telemetryClient = require('../../../.claude/lib/observability/telemetry-client.cjs');
      const result = await telemetryClient.init();

      assert.strictEqual(result.initialized, true);
      assert.strictEqual(result.batchProcessor.exportTimeoutMillis, 30000);

      await telemetryClient.shutdown();
    });
  });

  describe('Environment Variable Configuration', () => {
    test('respects OTEL_BATCH_SIZE environment variable', async () => {
      process.env.OTEL_ENABLED = 'true';
      process.env.OTEL_BATCH_SIZE = '256';

      const telemetryClient = require('../../../.claude/lib/observability/telemetry-client.cjs');
      const result = await telemetryClient.init();

      assert.strictEqual(result.initialized, true);
      assert.strictEqual(result.batchProcessor.maxExportBatchSize, 256);

      await telemetryClient.shutdown();
    });

    test('respects OTEL_BATCH_TIMEOUT environment variable', async () => {
      process.env.OTEL_ENABLED = 'true';
      process.env.OTEL_BATCH_TIMEOUT = '10000';

      const telemetryClient = require('../../../.claude/lib/observability/telemetry-client.cjs');
      const result = await telemetryClient.init();

      assert.strictEqual(result.initialized, true);
      assert.strictEqual(result.batchProcessor.scheduledDelayMillis, 10000);

      await telemetryClient.shutdown();
    });

    test('handles custom batch size and timeout together', async () => {
      process.env.OTEL_ENABLED = 'true';
      process.env.OTEL_BATCH_SIZE = '128';
      process.env.OTEL_BATCH_TIMEOUT = '3000';

      const telemetryClient = require('../../../.claude/lib/observability/telemetry-client.cjs');
      const result = await telemetryClient.init();

      assert.strictEqual(result.initialized, true);
      assert.strictEqual(result.batchProcessor.maxExportBatchSize, 128);
      assert.strictEqual(result.batchProcessor.scheduledDelayMillis, 3000);

      await telemetryClient.shutdown();
    });

    test('falls back to defaults for invalid OTEL_BATCH_SIZE', async () => {
      process.env.OTEL_ENABLED = 'true';
      process.env.OTEL_BATCH_SIZE = 'invalid';

      const telemetryClient = require('../../../.claude/lib/observability/telemetry-client.cjs');
      const result = await telemetryClient.init();

      assert.strictEqual(result.initialized, true);
      assert.strictEqual(result.batchProcessor.maxExportBatchSize, 512); // Default

      await telemetryClient.shutdown();
    });

    test('falls back to defaults for invalid OTEL_BATCH_TIMEOUT', async () => {
      process.env.OTEL_ENABLED = 'true';
      process.env.OTEL_BATCH_TIMEOUT = 'not-a-number';

      const telemetryClient = require('../../../.claude/lib/observability/telemetry-client.cjs');
      const result = await telemetryClient.init();

      assert.strictEqual(result.initialized, true);
      assert.strictEqual(result.batchProcessor.scheduledDelayMillis, 5000); // Default

      await telemetryClient.shutdown();
    });
  });

  describe('Resource Attributes', () => {
    test('sets service.name to agent-studio', async () => {
      process.env.OTEL_ENABLED = 'true';

      const telemetryClient = require('../../../.claude/lib/observability/telemetry-client.cjs');
      const result = await telemetryClient.init();

      assert.strictEqual(result.initialized, true);
      assert.strictEqual(result.resource['service.name'], 'agent-studio');

      await telemetryClient.shutdown();
    });

    test('sets deployment.environment from AGENT_STUDIO_ENV', async () => {
      process.env.OTEL_ENABLED = 'true';
      process.env.AGENT_STUDIO_ENV = 'staging';

      const telemetryClient = require('../../../.claude/lib/observability/telemetry-client.cjs');
      const result = await telemetryClient.init();

      assert.strictEqual(result.initialized, true);
      // Check using the same key format as the telemetry client uses
      assert.strictEqual(result.resource['deployment.environment'], 'staging');

      await telemetryClient.shutdown();
    });

    test('defaults deployment.environment to development', async () => {
      process.env.OTEL_ENABLED = 'true';
      // Save and delete, then restore
      const savedEnv = process.env.AGENT_STUDIO_ENV;
      delete process.env.AGENT_STUDIO_ENV;

      const telemetryClient = require('../../../.claude/lib/observability/telemetry-client.cjs');
      const result = await telemetryClient.init();

      assert.strictEqual(result.initialized, true);
      assert.strictEqual(result.resource['deployment.environment'], 'development');

      await telemetryClient.shutdown();

      // Restore
      if (savedEnv !== undefined) {
        process.env.AGENT_STUDIO_ENV = savedEnv;
      }
    });

    test('sets service.version to 2.2.1', async () => {
      process.env.OTEL_ENABLED = 'true';

      const telemetryClient = require('../../../.claude/lib/observability/telemetry-client.cjs');
      const result = await telemetryClient.init();

      assert.strictEqual(result.initialized, true);
      assert.strictEqual(result.resource['service.version'], '2.2.1');

      await telemetryClient.shutdown();
    });
  });

  describe('Batch Processing Behavior', () => {
    test('batching enabled (not simple processor)', async () => {
      process.env.OTEL_ENABLED = 'true';

      const telemetryClient = require('../../../.claude/lib/observability/telemetry-client.cjs');
      const result = await telemetryClient.init();

      assert.strictEqual(result.initialized, true);
      assert.strictEqual(result.batchProcessor.type, 'BatchSpanProcessor');

      await telemetryClient.shutdown();
    });

    test('configureTracer() method available for advanced config', async () => {
      process.env.OTEL_ENABLED = 'true';

      const telemetryClient = require('../../../.claude/lib/observability/telemetry-client.cjs');
      await telemetryClient.init();

      assert.strictEqual(typeof telemetryClient.configureTracer, 'function');

      await telemetryClient.shutdown();
    });

    test('configureTracer() allows custom exporter', async () => {
      process.env.OTEL_ENABLED = 'true';

      const telemetryClient = require('../../../.claude/lib/observability/telemetry-client.cjs');
      await telemetryClient.init();

      // Mock exporter
      const customExporter = {
        export: async () => {},
        shutdown: async () => {},
      };

      const config = telemetryClient.configureTracer({
        exporter: customExporter,
      });

      assert.strictEqual(config.exporter, customExporter);

      await telemetryClient.shutdown();
    });
  });

  describe('Graceful Degradation', () => {
    test('returns no-op configuration when OTEL_ENABLED=false', async () => {
      process.env.OTEL_ENABLED = 'false';

      const telemetryClient = require('../../../.claude/lib/observability/telemetry-client.cjs');
      const result = await telemetryClient.init();

      assert.strictEqual(result.initialized, false);
      assert.strictEqual(result.enabled, false);

      // Should not have batchProcessor config
      assert.strictEqual(result.batchProcessor, undefined);
    });

    test('initializes successfully even with invalid endpoint (fails on export, not init)', async () => {
      process.env.OTEL_ENABLED = 'true';
      process.env.OTEL_EXPORTER_OTLP_ENDPOINT = 'http://invalid-endpoint-12345:9999';

      const telemetryClient = require('../../../.claude/lib/observability/telemetry-client.cjs');
      const result = await telemetryClient.init();

      // gRPC exporters don't fail on init - they fail on export
      // So initialization succeeds, exports will fail silently later
      assert.strictEqual(result.initialized, true);
      assert.strictEqual(result.enabled, true);

      await telemetryClient.shutdown();
    });
  });

  describe('Initialization Metadata', () => {
    test('returns full configuration metadata on successful init', async () => {
      process.env.OTEL_ENABLED = 'true';
      process.env.OTEL_BATCH_SIZE = '256';
      process.env.OTEL_BATCH_TIMEOUT = '7500';

      const telemetryClient = require('../../../.claude/lib/observability/telemetry-client.cjs');
      const result = await telemetryClient.init();

      assert.strictEqual(result.initialized, true);
      assert.strictEqual(result.enabled, true);
      assert.ok(result.endpoint);
      assert.ok(result.resource);
      assert.ok(result.batchProcessor);
      assert.strictEqual(result.batchProcessor.maxExportBatchSize, 256);
      assert.strictEqual(result.batchProcessor.scheduledDelayMillis, 7500);

      await telemetryClient.shutdown();
    });
  });
});
