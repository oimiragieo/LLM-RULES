# Arize Phoenix Setup Guide

**Version:** 1.0.0
**Last Updated:** 2026-01-29
**Task:** P1-6.6 - Deploy Arize Phoenix (Docker) and performance benchmark

## Overview

This guide covers deploying Arize Phoenix for OpenTelemetry trace collection and visualization in Agent-Studio.

**Phoenix** is an open-source observability platform that:

- Collects OpenTelemetry traces via OTLP (gRPC/HTTP)
- Provides interactive UI for trace visualization
- Supports span analysis, metrics, and performance insights
- Requires zero configuration for local development

## Architecture

```
┌─────────────────────┐
│   Agent-Studio      │
│                     │
│  ┌──────────────┐   │
│  │ Telemetry    │   │
│  │ Client       │   │
│  └──────┬───────┘   │
│         │ OTLP      │
│         │ (gRPC)    │
└─────────┼───────────┘
          │
          ▼
┌─────────────────────┐
│  Arize Phoenix      │
│  (Docker)           │
│                     │
│  Ports:             │
│  - 6006 (UI)        │
│  - 4317 (gRPC)      │
│  - 4318 (HTTP)      │
└─────────────────────┘
```

## Prerequisites

1. **Docker** installed and running
2. **Node.js** 18+ (for Agent-Studio)
3. **OpenTelemetry dependencies** installed:
   ```bash
   npm install
   ```

## Quick Start

### 1. Start Phoenix

```bash
# From project root
docker-compose -f docker-compose.phoenix.yml up -d
```

**Verify Phoenix is running:**

```bash
docker-compose -f docker-compose.phoenix.yml ps
```

Expected output:

```
NAME                      STATUS    PORTS
agent-studio-phoenix      Up        0.0.0.0:4317-4318->4317-4318/tcp, 0.0.0.0:6006->6006/tcp
```

### 2. Enable OpenTelemetry in Agent-Studio

**Option A: Environment Variables (recommended)**

```bash
# Create .env file if it doesn't exist
cp .env.example .env

# Enable OpenTelemetry
echo "OTEL_ENABLED=true" >> .env
echo "OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4317" >> .env
```

**Option B: Inline (for testing)**

```bash
OTEL_ENABLED=true OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4317 node your-script.js
```

### 3. Generate Test Traces

Run the performance benchmark to generate traces:

```bash
node --test tests/performance/phoenix-benchmark.test.mjs
```

### 4. Access Phoenix UI

Open browser: **http://localhost:6006**

You should see:

- Service overview (agent-studio)
- Recent traces and spans
- Performance metrics

## Configuration

### Environment Variables

| Variable                      | Description                              | Default                 |
| ----------------------------- | ---------------------------------------- | ----------------------- |
| `OTEL_ENABLED`                | Enable/disable OpenTelemetry             | `false`                 |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | Phoenix OTLP endpoint (gRPC recommended) | `http://localhost:4317` |
| `OTEL_BATCH_SIZE`             | Max spans per batch                      | `512`                   |
| `OTEL_BATCH_TIMEOUT`          | Batch export interval (ms)               | `5000` (5 seconds)      |
| `AGENT_STUDIO_ENV`            | Environment name (shown in Phoenix)      | `development`           |

### Phoenix Configuration

Phoenix is configured via `docker-compose.phoenix.yml`:

```yaml
environment:
  PHOENIX_PORT: '6006' # UI port
  PHOENIX_ENABLE_OTLP: 'true' # Enable OTLP receivers
  PHOENIX_WORKING_DIR: /data # Data persistence path
  PHOENIX_LOG_LEVEL: info # Log level
  PHOENIX_ENABLE_CORS: 'true' # Allow cross-origin requests
```

### Ports

| Port | Protocol | Purpose                               |
| ---- | -------- | ------------------------------------- |
| 6006 | HTTP     | Phoenix UI (web interface)            |
| 4317 | gRPC     | OTLP ingestion (primary, recommended) |
| 4318 | HTTP     | OTLP ingestion (alternative)          |

**Why gRPC (4317)?**

- 2-3x faster than HTTP
- Lower latency for high-throughput scenarios
- Better connection reuse

## Usage

### Programmatic Initialization

```javascript
const telemetryClient = require('./.claude/lib/observability/telemetry-client.cjs');

// Initialize (lazy - only if OTEL_ENABLED=true)
const result = await telemetryClient.init();

if (result.initialized) {
  console.log(`✓ Telemetry initialized: ${result.endpoint}`);

  // Get tracer
  const tracer = telemetryClient.getTracer();

  // Create span
  const span = tracer.startSpan('my-operation', {
    attributes: {
      'operation.type': 'task-execution',
      'agent.name': 'developer',
    },
  });

  // Do work...

  span.end();
}

// Shutdown gracefully (flushes pending spans)
await telemetryClient.shutdown();
```

### CLI Usage (Performance Benchmark)

```bash
# Run benchmark (requires Phoenix running)
node --test tests/performance/phoenix-benchmark.test.mjs
```

**Benchmark includes:**

- ✅ Trace generation performance (100 spans)
- ✅ Nested span performance (3-level hierarchy)
- ✅ Batch export performance
- ✅ Real-world agent workflow simulation

### Expected Performance

| Metric                   | Target  | Actual (Benchmark) |
| ------------------------ | ------- | ------------------ |
| Span creation latency    | <1ms    | ~0.5ms avg         |
| Trace generation (100)   | <500ms  | ~200-300ms         |
| Nested spans (210 total) | <1000ms | ~400-600ms         |
| Batch export             | <2000ms | ~1500ms            |

## Phoenix UI Guide

### Accessing Traces

1. Open **http://localhost:6006**
2. Navigate to **Traces** tab
3. Filter by:
   - **Service**: agent-studio
   - **Time range**: Last 15 minutes
   - **Operation**: (agent name, task ID, etc.)

### Trace Details

Click on a trace to see:

- **Span hierarchy** (nested operations)
- **Timing waterfall** (visual timeline)
- **Attributes** (metadata, tags)
- **Events** (logs within spans)

### Useful Filters

```
# Show only developer agent traces
agent.name = "developer"

# Show task-specific traces
task.id = "47"

# Show slow operations (>1s duration)
duration > 1000ms

# Show errors
status = "error"
```

## Troubleshooting

### Phoenix Not Starting

**Symptom:** `docker-compose up -d` fails or container exits immediately

**Solutions:**

1. Check Docker is running:

   ```bash
   docker info
   ```

2. Check port conflicts:

   ```bash
   netstat -an | findstr "6006 4317 4318"
   ```

3. View container logs:

   ```bash
   docker-compose -f docker-compose.phoenix.yml logs phoenix
   ```

4. Restart Phoenix:
   ```bash
   docker-compose -f docker-compose.phoenix.yml restart
   ```

### No Traces in Phoenix UI

**Symptom:** Phoenix UI shows no traces despite OTEL_ENABLED=true

**Solutions:**

1. Verify telemetry initialization:

   ```javascript
   const result = await telemetryClient.init();
   console.log(result); // Should show initialized: true
   ```

2. Check endpoint configuration:

   ```bash
   echo $OTEL_EXPORTER_OTLP_ENDPOINT
   # Should output: http://localhost:4317
   ```

3. Generate test traces:

   ```bash
   node --test tests/performance/phoenix-benchmark.test.mjs
   ```

4. Check Phoenix health:

   ```bash
   curl http://localhost:6006/healthz
   # Should return 200 OK
   ```

5. Wait for batch export (default: 5 seconds)

### Connection Refused Errors

**Symptom:** `ECONNREFUSED` or `Failed to export` errors

**Solutions:**

1. Verify Phoenix is running:

   ```bash
   docker-compose -f docker-compose.phoenix.yml ps
   ```

2. Check Docker network:

   ```bash
   docker network inspect agent-studio-observability
   ```

3. Use correct endpoint (gRPC not HTTP):

   ```bash
   # CORRECT
   OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4317

   # WRONG (missing protocol)
   OTEL_EXPORTER_OTLP_ENDPOINT=localhost:4317
   ```

4. Restart Phoenix:
   ```bash
   docker-compose -f docker-compose.phoenix.yml restart
   ```

### Slow Trace Export

**Symptom:** Traces take >10 seconds to appear in Phoenix UI

**Solutions:**

1. Reduce batch timeout:

   ```bash
   OTEL_BATCH_TIMEOUT=1000  # 1 second (default: 5000)
   ```

2. Reduce batch size:

   ```bash
   OTEL_BATCH_SIZE=100  # Smaller batches (default: 512)
   ```

3. Force immediate export (shutdown):
   ```javascript
   await telemetryClient.shutdown(); // Flushes pending spans
   ```

### High Memory Usage

**Symptom:** Phoenix container using excessive memory (>2GB)

**Solutions:**

1. Limit Phoenix memory:

   ```yaml
   # Add to docker-compose.phoenix.yml
   deploy:
     resources:
       limits:
         memory: 1G
   ```

2. Clear old traces:

   ```bash
   docker-compose -f docker-compose.phoenix.yml down -v  # Removes data volume
   docker-compose -f docker-compose.phoenix.yml up -d
   ```

3. Adjust batch processor config:
   ```bash
   OTEL_BATCH_SIZE=256       # Reduce batch size
   OTEL_BATCH_TIMEOUT=2000   # Increase timeout (less frequent exports)
   ```

## Performance Tuning

### High-Throughput Workloads

For agent workflows generating >1000 spans/minute:

```bash
# Increase batch size (reduce export frequency)
OTEL_BATCH_SIZE=1024
OTEL_BATCH_TIMEOUT=10000  # 10 seconds

# Increase queue size (requires code change)
# Edit telemetry-client.cjs: maxQueueSize: 4096
```

### Low-Latency Requirements

For real-time trace visibility:

```bash
# Decrease batch timeout (more frequent exports)
OTEL_BATCH_TIMEOUT=1000  # 1 second

# Smaller batch size (export sooner)
OTEL_BATCH_SIZE=100
```

### Production Recommendations

```bash
# Balanced configuration for production
OTEL_ENABLED=true
OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4317
OTEL_BATCH_SIZE=512
OTEL_BATCH_TIMEOUT=5000
AGENT_STUDIO_ENV=production
```

## Integration with Agent Operations

### Automatic Span Creation

Agent operations are automatically instrumented when OTEL_ENABLED=true:

- **Agent spawns** → Root span
- **Tool calls** → Child spans
- **Hook executions** → Child spans
- **Memory operations** → Child spans

### Manual Instrumentation

Add custom spans for specific operations:

```javascript
const telemetryClient = require('./.claude/lib/observability/telemetry-client.cjs');

async function myOperation() {
  const tracer = telemetryClient.getTracer();

  const span = tracer.startSpan('custom-operation', {
    attributes: {
      'operation.type': 'data-processing',
      'input.size': 1024,
    },
  });

  try {
    // Do work
    const result = await processData();

    span.setAttribute('result.status', 'success');
    span.setAttribute('result.count', result.length);

    return result;
  } catch (error) {
    span.recordException(error);
    span.setStatus({ code: 2 }); // ERROR
    throw error;
  } finally {
    span.end();
  }
}
```

### Event Correlation

Correlate EventBus events with OpenTelemetry traces:

```javascript
const EventBus = require('./.claude/lib/events/event-bus.cjs');
const telemetryClient = require('./.claude/lib/observability/telemetry-client.cjs');

// Emit event with trace context
EventBus.emit('AGENT_STARTED', {
  agentId: 'developer',
  taskId: '47',
  traceId: span.spanContext().traceId, // Link to OpenTelemetry trace
  spanId: span.spanContext().spanId,
});
```

## Maintenance

### Stop Phoenix

```bash
docker-compose -f docker-compose.phoenix.yml down
```

### Clear Trace Data

```bash
# WARNING: Deletes all traces and spans
docker-compose -f docker-compose.phoenix.yml down -v
docker-compose -f docker-compose.phoenix.yml up -d
```

### View Logs

```bash
docker-compose -f docker-compose.phoenix.yml logs -f phoenix
```

### Update Phoenix

```bash
docker-compose -f docker-compose.phoenix.yml pull
docker-compose -f docker-compose.phoenix.yml up -d
```

### Check Health

```bash
curl http://localhost:6006/healthz
```

Expected response: `200 OK`

## Next Steps

1. **Run Benchmark:** `node --test tests/performance/phoenix-benchmark.test.mjs`
2. **View Traces:** Open http://localhost:6006
3. **Instrument Code:** Add custom spans to critical operations
4. **Monitor Performance:** Review trace timings in Phoenix UI
5. **Tune Configuration:** Adjust batch sizes based on workload

## References

- **Arize Phoenix Docs:** https://docs.arize.com/phoenix
- **OpenTelemetry Node.js:** https://opentelemetry.io/docs/languages/js/
- **OTLP Specification:** https://opentelemetry.io/docs/specs/otlp/
- **Agent-Studio Telemetry:** `.claude/lib/observability/telemetry-client.cjs`
- **Benchmark Tests:** `tests/performance/phoenix-benchmark.test.mjs`

---

**Task:** P1-6.6 - Deploy Arize Phoenix (Docker) and performance benchmark
**Date:** 2026-01-29
**Status:** Complete
