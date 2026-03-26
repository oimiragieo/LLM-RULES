# Observability Standards

Rules for building observable systems using the three pillars: logs, metrics, and traces. Covers OpenTelemetry, structured logging, alerting, and SLO design.

## The Three Pillars

| Pillar      | Answers                     | Primary Tools                         |
| ----------- | --------------------------- | ------------------------------------- |
| **Logs**    | What happened?              | OpenTelemetry Logs, Loki, CloudWatch  |
| **Metrics** | How is the system behaving? | Prometheus, OTLP, Datadog, CloudWatch |
| **Traces**  | Why is it slow/broken?      | OpenTelemetry Traces, Jaeger, Tempo   |

## OpenTelemetry — Structured Instrumentation

```python
# Python — OpenTelemetry SDK setup
from opentelemetry import trace, metrics
from opentelemetry.sdk.trace import TracerProvider
from opentelemetry.sdk.metrics import MeterProvider
from opentelemetry.exporter.otlp.proto.grpc.trace_exporter import OTLPSpanExporter

# Initialize tracing
tracer_provider = TracerProvider()
tracer_provider.add_span_processor(
    BatchSpanProcessor(OTLPSpanExporter(endpoint="http://otel-collector:4317"))
)
trace.set_tracer_provider(tracer_provider)
tracer = trace.get_tracer(__name__)

# Instrument a function
def process_order(order_id: str) -> Order:
    with tracer.start_as_current_span("process_order") as span:
        span.set_attribute("order.id", order_id)
        span.set_attribute("service.component", "order-processor")

        try:
            order = db.get_order(order_id)
            span.set_attribute("order.status", order.status)
            return order
        except OrderNotFoundError as e:
            span.set_status(StatusCode.ERROR, str(e))
            span.record_exception(e)
            raise
```

```typescript
// TypeScript — OpenTelemetry Node.js
import { trace, SpanStatusCode, context, propagation } from '@opentelemetry/api';

const tracer = trace.getTracer('order-service', '1.0.0');

async function processPayment(orderId: string, amount: number): Promise<PaymentResult> {
  return tracer.startActiveSpan('payment.process', async span => {
    span.setAttributes({
      'order.id': orderId,
      'payment.amount': amount,
      'payment.currency': 'USD',
    });

    try {
      const result = await paymentGateway.charge(orderId, amount);
      span.setStatus({ code: SpanStatusCode.OK });
      return result;
    } catch (err) {
      span.setStatus({ code: SpanStatusCode.ERROR, message: (err as Error).message });
      span.recordException(err as Error);
      throw err;
    } finally {
      span.end();
    }
  });
}
```

## Structured Logging

```python
# GOOD: Structured log with context — machine-parseable
import structlog
log = structlog.get_logger()

log.info("order_created",
    order_id=order.id,
    user_id=user.id,
    total=order.total,
    item_count=len(order.items),
    trace_id=get_current_trace_id()  # Correlate logs with traces
)

# BAD: Unstructured string interpolation
print(f"Order {order.id} created for {user.email}")  # Can't query fields
logger.info("Order created: " + str(order.id))       # Not searchable
```

```json
// Target log format (JSON Lines)
{
  "timestamp": "2026-03-15T10:30:00.000Z",
  "level": "info",
  "message": "order_created",
  "service": "order-service",
  "version": "1.2.3",
  "order_id": "ord_123abc",
  "user_id": "usr_456def",
  "total": 99.99,
  "trace_id": "4bf92f3577b34da6a3ce929d0e0e4736",
  "span_id": "00f067aa0ba902b7"
}
```

## Prometheus Metrics

```python
# Metric naming conventions: <namespace>_<subsystem>_<name>_<unit>
from prometheus_client import Counter, Histogram, Gauge

# Counters — only go up, track event totals
http_requests_total = Counter(
    'http_requests_total',
    'Total HTTP requests',
    labelnames=['method', 'endpoint', 'status_code']
)

# Histograms — track distributions (latency, size)
http_request_duration_seconds = Histogram(
    'http_request_duration_seconds',
    'HTTP request latency',
    labelnames=['method', 'endpoint'],
    buckets=[.005, .01, .025, .05, .1, .25, .5, 1, 2.5, 5, 10]
)

# Gauges — current value (queue depth, connections)
active_connections = Gauge('active_db_connections', 'Active DB connections')

# Instrument a handler
@http_request_duration_seconds.labels(method='POST', endpoint='/orders').time()
def create_order(request):
    try:
        order = process(request)
        http_requests_total.labels('POST', '/orders', '201').inc()
        return order
    except ValueError:
        http_requests_total.labels('POST', '/orders', '400').inc()
        raise
```

## SLO Design

```yaml
# SLO Definition — service level objectives
slos:
  - name: 'API Availability'
    description: 'Order API responds with 2xx or 4xx for ≥99.9% of requests'
    target: 99.9 # percent
    window: '30d'
    sli:
      type: availability
      metric: "sum(rate(http_requests_total{status_code!~'5..'}[5m])) / sum(rate(http_requests_total[5m]))"

  - name: 'Order Processing Latency'
    description: '95th percentile order processing time ≤ 500ms'
    target: 99.0 # 99% of windows meet this
    window: '30d'
    sli:
      type: latency
      metric: "histogram_quantile(0.95, rate(http_request_duration_seconds_bucket{endpoint='/orders'}[5m]))"
      threshold: 0.5 # seconds


# Error budget = 100% - SLO target
# 99.9% availability → 0.1% error budget → 43.8 min/month downtime allowed
```

## Alerting Rules

```yaml
# Prometheus alerting rules — alert on SLO burn rate
groups:
  - name: api-slos
    rules:
      - alert: HighErrorBudgetBurn
        expr: |
          (
            sum(rate(http_requests_total{status_code=~"5.."}[1h])) /
            sum(rate(http_requests_total[1h]))
          ) > 0.014  # 14x burn rate = consuming 1h/month error budget in 1h
        for: 2m
        labels:
          severity: critical
        annotations:
          summary: 'High error budget burn rate detected'
          description: 'Error rate {{ $value | humanizePercentage }} — burning budget 14x fast'
          runbook_url: 'https://wiki/runbooks/high-error-rate'

      - alert: APIHighLatency
        expr: |
          histogram_quantile(0.99,
            sum(rate(http_request_duration_seconds_bucket[5m])) by (le, endpoint)
          ) > 1.0
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: 'API p99 latency > 1s for {{ $labels.endpoint }}'
```

## Anti-Patterns (NEVER)

- Never use `time.sleep()` for manual timing — use histogram timers
- Never log secrets, PII, or credentials — scrub before logging (email → hash, card → last4)
- Never create high-cardinality label dimensions (user IDs, request IDs as Prometheus labels)
- Never ignore trace context propagation — always extract + inject W3C TraceContext headers
- Never alert on symptoms you can't act on — every alert must have a runbook

## When to Invoke

Reference these standards when setting up monitoring for new services.
`Skill({ skill: 'cloud-devops-expert' })` for cloud-specific observability stacks (Datadog, CloudWatch, Azure Monitor).
