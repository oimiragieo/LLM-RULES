# Phoenix Deployment Notes

**Task:** P1-6.6 - Deploy Arize Phoenix (Docker) and performance benchmark
**Date:** 2026-01-29
**Status:** Infrastructure prepared, Docker Desktop required for deployment

## Deployment Status

### ✅ Completed

1. **Docker Compose Configuration** (`docker-compose.phoenix.yml`)
   - Phoenix container configured with OTLP receivers
   - Ports: 6006 (UI), 4317 (gRPC), 4318 (HTTP)
   - Volume persistence for trace data
   - Health checks configured
   - Network: `agent-studio-observability`

2. **Environment Configuration** (`.env.example`)
   - Added OTEL configuration section
   - Added Phoenix startup instructions
   - Documented gRPC vs HTTP endpoints

3. **Performance Benchmark** (`tests/performance/phoenix-benchmark.test.mjs`)
   - Trace generation performance (100 spans)
   - Nested span performance (3-level hierarchy, 210 spans)
   - Batch export performance
   - Real-world agent workflow simulation
   - Phoenix UI verification test

4. **Comprehensive Documentation** (`.claude/docs/PHOENIX_SETUP.md`)
   - Quick start guide
   - Configuration reference
   - Usage examples (programmatic + CLI)
   - Troubleshooting section
   - Performance tuning guide
   - Integration with Agent operations
   - Maintenance procedures

5. **Telemetry Client Integration**
   - Existing `telemetry-client.cjs` ready for Phoenix
   - gRPC exporter configured (default: localhost:4317)
   - BatchSpanProcessor with configurable settings
   - Lazy initialization (only when OTEL_ENABLED=true)

### ⏸️ Pending Docker Desktop

**Current Blocker:** Docker Desktop not running

**Error:**

```
unable to get image 'arizephoenix/phoenix:latest':
error during connect: open //./pipe/dockerDesktopLinuxEngine:
The system cannot find the file specified.
```

**Resolution Required:**

1. Start Docker Desktop
2. Wait for Docker Engine to initialize
3. Run: `docker-compose -f docker-compose.phoenix.yml up -d`

## Deployment Steps (When Docker Available)

### 1. Start Docker Desktop

Windows: Open Docker Desktop from Start Menu

Verify:

```bash
docker info
```

Expected: Docker engine info (not connection error)

### 2. Deploy Phoenix

```bash
cd C:\dev\projects\agent-studio
docker-compose -f docker-compose.phoenix.yml up -d
```

Expected output:

```
[+] Running 3/3
 ✔ Network agent-studio-observability  Created
 ✔ Volume agent-studio-phoenix-data    Created
 ✔ Container agent-studio-phoenix      Started
```

### 3. Verify Deployment

```bash
# Check container status
docker-compose -f docker-compose.phoenix.yml ps

# Check health
curl http://localhost:6006/healthz

# View logs
docker-compose -f docker-compose.phoenix.yml logs phoenix
```

### 4. Enable Telemetry

```bash
# Create .env if doesn't exist
cp .env.example .env

# Add to .env:
echo "OTEL_ENABLED=true" >> .env
echo "OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4317" >> .env
```

### 5. Run Performance Benchmark

```bash
node --test tests/performance/phoenix-benchmark.test.mjs
```

Expected:

- All tests pass
- Traces generated (100+ spans)
- Performance metrics printed
- Traces visible in Phoenix UI at http://localhost:6006

## Verification Checklist

When Docker Desktop is available:

- [ ] Docker Desktop running and responsive
- [ ] `docker info` returns engine info (not error)
- [ ] Phoenix container started successfully
- [ ] Health check passes: `curl http://localhost:6006/healthz` → 200 OK
- [ ] Phoenix UI accessible: http://localhost:6006
- [ ] Telemetry initialized: OTEL_ENABLED=true in .env
- [ ] Benchmark tests pass: `node --test tests/performance/phoenix-benchmark.test.mjs`
- [ ] Traces visible in Phoenix UI with attributes (agent.name, task.id, etc.)
- [ ] Performance targets met:
  - Span creation: <1ms avg
  - Trace generation (100 spans): <500ms
  - Nested spans (210 spans): <1000ms
  - Batch export: <2000ms

## Files Created

| File                                              | Purpose                            | Size   |
| ------------------------------------------------- | ---------------------------------- | ------ |
| `docker-compose.phoenix.yml`                      | Phoenix container configuration    | ~2.5KB |
| `.env.example` (updated)                          | Environment variable documentation | ~11KB  |
| `tests/performance/phoenix-benchmark.test.mjs`    | Performance benchmark test suite   | ~8KB   |
| `.claude/docs/PHOENIX_SETUP.md`                   | Comprehensive setup guide          | ~15KB  |
| `.claude/docs/PHOENIX_DEPLOYMENT_NOTES.md` (this) | Deployment status and blockers     | ~3KB   |

Total: 5 files (3 new, 1 updated, 1 notes)

## Configuration Details

### Phoenix Container

```yaml
Image: arizephoenix/phoenix:latest
Restart: unless-stopped
Ports:
  - 6006:6006 # UI
  - 4317:4317 # OTLP gRPC
  - 4318:4318 # OTLP HTTP
Environment:
  PHOENIX_PORT: 6006
  PHOENIX_ENABLE_OTLP: true
  PHOENIX_WORKING_DIR: /data
  PHOENIX_LOG_LEVEL: info
  PHOENIX_ENABLE_CORS: true
Volumes:
  - phoenix_data:/data
Networks:
  - agent-studio-observability
```

### Telemetry Client

```javascript
Endpoint: http://localhost:4317 (gRPC)
Exporter: OTLPTraceExporter
Processor: BatchSpanProcessor
  - Max queue: 2048 spans
  - Batch size: 512 spans (configurable via OTEL_BATCH_SIZE)
  - Batch timeout: 5000ms (configurable via OTEL_BATCH_TIMEOUT)
  - Export timeout: 30000ms
Resource:
  - service.name: agent-studio
  - service.version: 2.2.1
  - deployment.environment: development (configurable via AGENT_STUDIO_ENV)
```

## Performance Expectations

### Trace Generation

| Operation                | Expected Latency | Benchmark Target |
| ------------------------ | ---------------- | ---------------- |
| Span creation            | <1ms             | <1ms avg         |
| Span end                 | <0.5ms           | <0.5ms avg       |
| Trace generation (100)   | 200-300ms        | <500ms           |
| Nested spans (210 total) | 400-600ms        | <1000ms          |
| Batch export             | 1000-1500ms      | <2000ms          |

### Throughput

| Metric            | Expected | Minimum Acceptable |
| ----------------- | -------- | ------------------ |
| Spans/second      | 200-500  | >100               |
| Traces/second     | 20-50    | >10                |
| Concurrent agents | 10+      | 5+                 |

### Resource Usage (Phoenix Container)

| Metric          | Expected     | Maximum Limit |
| --------------- | ------------ | ------------- |
| Memory (idle)   | 100-200MB    | 1GB           |
| Memory (active) | 200-500MB    | 1GB           |
| CPU (idle)      | <1%          | 10%           |
| CPU (active)    | 5-15%        | 50%           |
| Disk (traces)   | 10-100MB/day | 10GB total    |

## Integration Points

### 1. Telemetry Client (`telemetry-client.cjs`)

Already integrated and ready:

- Lazy initialization (OTEL_ENABLED=true required)
- gRPC exporter to localhost:4317
- BatchSpanProcessor configured
- Graceful shutdown (flushes pending spans)

### 2. Agent Operations

Instrumentation points (when implemented):

- Agent spawns → Root span
- Tool calls → Child spans
- Hook executions → Child spans
- Memory operations → Child spans

### 3. EventBus Correlation

Future integration:

- Add traceId/spanId to EventBus events
- Correlate events with OpenTelemetry traces
- Unified observability (events + traces)

## Next Steps (After Docker Available)

1. **Deploy Phoenix** (5 min)
   - Start Docker Desktop
   - Run docker-compose up
   - Verify health check

2. **Enable Telemetry** (2 min)
   - Update .env: OTEL_ENABLED=true
   - Verify endpoint: localhost:4317

3. **Run Benchmark** (5 min)
   - Execute: node --test tests/performance/phoenix-benchmark.test.mjs
   - Verify all tests pass
   - Check traces in Phoenix UI

4. **Document Results** (10 min)
   - Update learnings.md with performance metrics
   - Record any deployment issues in issues.md
   - Update decisions.md with configuration choices

5. **Instrument Agent Operations** (Task #44 already completed)
   - Verify span creation in real agent workflows
   - Test nested span hierarchy
   - Validate attributes and metadata

## Troubleshooting (Anticipated)

### Issue: Phoenix UI Not Accessible

**Solution:**

```bash
# Check container logs
docker-compose -f docker-compose.phoenix.yml logs phoenix

# Restart container
docker-compose -f docker-compose.phoenix.yml restart

# Check port binding
netstat -an | findstr "6006"
```

### Issue: No Traces in Phoenix

**Solution:**

```bash
# Verify telemetry enabled
node -e "console.log(process.env.OTEL_ENABLED)"  # Should output: true

# Generate test trace
node --test tests/performance/phoenix-benchmark.test.mjs

# Wait for batch export (5 seconds default)
timeout 5

# Check Phoenix UI
start http://localhost:6006
```

### Issue: Connection Refused (ECONNREFUSED)

**Solution:**

```bash
# Verify Phoenix running
docker-compose -f docker-compose.phoenix.yml ps

# Check network connectivity
docker network inspect agent-studio-observability

# Verify endpoint
echo $OTEL_EXPORTER_OTLP_ENDPOINT  # Should be: http://localhost:4317
```

## Acceptance Criteria

Task #47 (P1-6.6) will be considered complete when:

- [x] docker-compose.yml created for Phoenix deployment
- [x] OpenTelemetry configured to export to Phoenix (telemetry-client.cjs)
- [x] OTEL_EXPORTER_OTLP_ENDPOINT documented in .env.example
- [x] Performance benchmark created (phoenix-benchmark.test.mjs)
- [ ] Phoenix container running and healthy (requires Docker Desktop)
- [ ] Traces visible in Phoenix UI (requires Docker Desktop)
- [x] Documentation complete (PHOENIX_SETUP.md)

**Current Status:** 5/7 complete (Docker Desktop required for remaining 2)

## Related Tasks

- **P1-6.1** (Completed): Install OpenTelemetry SDK
- **P1-6.2** (Completed): Configure TracerProvider with BatchSpanProcessor
- **P1-6.3** (Completed): Instrument agent operations with spans
- **P1-6.4** (Completed): Modify hooks to emit events
- **P1-6.5** (Completed): Write integration tests for hooks + events
- **P1-6.6** (This task): Deploy Arize Phoenix (Docker) and performance benchmark

## Notes

1. **Why gRPC over HTTP?**
   - 2-3x faster serialization
   - Lower latency (binary protocol)
   - Better connection reuse
   - Industry standard for OTLP

2. **Why Arize Phoenix?**
   - Open-source (free)
   - Zero configuration for local dev
   - Docker-based (easy deployment)
   - Full OTLP support (gRPC + HTTP)
   - Interactive trace visualization

3. **Production Considerations**
   - For production, consider:
     - Managed Phoenix (Arize Cloud)
     - Alternative: Jaeger, Zipkin, Tempo
     - Centralized trace storage
     - Retention policies
     - Security (TLS, authentication)

---

**Status:** Infrastructure prepared, awaiting Docker Desktop for final deployment verification.
