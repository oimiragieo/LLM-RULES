---
name: fintech-engineer
description: Fintech engineering expertise — payment processing (Stripe, Plaid), PCI DSS compliance, financial data modeling (double-entry bookkeeping), fraud detection patterns, bank-grade security (encryption, tokenization), open banking APIs, cryptocurrency/blockchain integration, regulatory compliance (KYC/AML), and idempotent financial transaction design. Use for payment systems, banking apps, trading platforms, and fintech infrastructure.
version: 1.1.0
model: sonnet
invoked_by: both
user_invocable: true
tools: [Bash, Read, Write, Edit, WebFetch]
best_practices:
  - All financial operations must be idempotent (use idempotency keys)
  - Use double-entry bookkeeping — never modify existing ledger entries
  - Never store raw card numbers — use tokenization (Stripe Elements, etc.)
  - Encrypt PII at rest (AES-256-GCM) and in transit (TLS 1.3)
  - All monetary values must be stored as integers (cents/smallest unit)
  - Every financial action requires an audit log entry
error_handling: graceful
streaming: not_applicable
verified: false
lastVerifiedAt: 2026-03-15T00:00:00.000Z
---

# Fintech Engineer Skill

## Overview

Financial technology engineering covering payment processing, ledger design, compliance, security, and fintech API integration. Core principle: correctness over speed — financial bugs have real monetary consequences.

## Critical Rules

```
IRON LAWS OF FINANCIAL ENGINEERING:
1. Monetary values = integers (cents/pence/satoshis) — NEVER floats
2. All writes are idempotent (idempotency keys on every mutation)
3. Double-entry bookkeeping — debits always equal credits
4. Audit log every financial event — immutable, append-only
5. Fail safe — on error, roll back fully or do nothing
6. Never store card PANs — use tokenization providers
7. Assume network failures — design for exactly-once delivery
```

## Monetary Value Handling

```typescript
// ALWAYS store as integer (smallest currency unit)
// NEVER use floating point for money

// BAD — floating point arithmetic errors
const price = 9.99;
const tax = price * 0.08; // 0.7992000000000001 — WRONG

// GOOD — integer arithmetic in cents
const priceInCents = 999; // $9.99
const taxInCents = Math.round(priceInCents * 0.08); // 80 cents = $0.80

// Currency formatting (display only — never compute with these)
function formatMoney(cents: number, currency = 'USD'): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
  }).format(cents / 100);
}

// Money type for type safety
type Money = {
  amount: number; // Integer in smallest unit
  currency: string; // ISO 4217 (USD, EUR, GBP)
};

function addMoney(a: Money, b: Money): Money {
  if (a.currency !== b.currency) throw new Error('Currency mismatch');
  return { amount: a.amount + b.amount, currency: a.currency };
}
```

## Double-Entry Ledger Design

```sql
-- Ledger accounts table
CREATE TABLE accounts (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type        TEXT NOT NULL CHECK (type IN ('asset', 'liability', 'equity', 'revenue', 'expense')),
  name        TEXT NOT NULL,
  currency    TEXT NOT NULL DEFAULT 'USD',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Immutable ledger entries (double-entry)
CREATE TABLE ledger_entries (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_id  UUID NOT NULL,          -- Groups debit+credit pairs
  account_id      UUID NOT NULL REFERENCES accounts(id),
  amount          BIGINT NOT NULL,         -- Positive = debit, Negative = credit
  currency        TEXT NOT NULL,
  description     TEXT,
  reference_type  TEXT,                   -- 'payment', 'refund', 'fee', etc.
  reference_id    TEXT,                   -- External ID (Stripe charge ID, etc.)
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- Ledger entries are NEVER updated or deleted
  CONSTRAINT no_zero_amount CHECK (amount != 0)
);

-- Account balance view (computed from ledger)
CREATE VIEW account_balances AS
SELECT
  account_id,
  currency,
  SUM(amount) AS balance
FROM ledger_entries
GROUP BY account_id, currency;
```

```typescript
// Record a payment (debit cash, credit revenue)
async function recordPayment(
  db: Database,
  { userId, amountCents, currency, stripeChargeId, idempotencyKey }: PaymentParams
) {
  return db.transaction(async trx => {
    // Idempotency check
    const existing = await trx('transactions').where({ idempotency_key: idempotencyKey }).first();
    if (existing) return existing; // Return same result, do not double-process

    const txId = randomUUID();

    // Debit: cash/receivables account (asset increases)
    await trx('ledger_entries').insert({
      transaction_id: txId,
      account_id: CASH_ACCOUNT_ID,
      amount: amountCents, // Positive = debit
      currency,
      reference_type: 'payment',
      reference_id: stripeChargeId,
    });

    // Credit: revenue account (revenue increases = negative in double-entry)
    await trx('ledger_entries').insert({
      transaction_id: txId,
      account_id: REVENUE_ACCOUNT_ID,
      amount: -amountCents, // Negative = credit
      currency,
      reference_type: 'payment',
      reference_id: stripeChargeId,
    });

    // Record transaction with idempotency key
    const tx = await trx('transactions')
      .insert({
        id: txId,
        user_id: userId,
        idempotency_key: idempotencyKey,
        amount: amountCents,
        currency,
        status: 'completed',
        stripe_charge_id: stripeChargeId,
      })
      .returning('*');

    return tx[0];
  });
}
```

## Stripe Integration

```typescript
import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2024-12-18.acacia',
  typescript: true,
});

// Payment Intent (recommended flow)
async function createPaymentIntent(amountCents: number, currency: string, customerId: string) {
  return stripe.paymentIntents.create({
    amount: amountCents,
    currency,
    customer: customerId,
    automatic_payment_methods: { enabled: true },
    idempotency_key: `pi-${customerId}-${Date.now()}`, // Unique per attempt
    metadata: { orderId: 'order_123' },
  });
}

// Webhook handling (ALWAYS verify signature)
app.post('/webhook/stripe', express.raw({ type: 'application/json' }), (req, res) => {
  const sig = req.headers['stripe-signature']!;

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(
      req.body, // Raw body — do NOT parse as JSON first
      sig,
      process.env.STRIPE_WEBHOOK_SECRET!
    );
  } catch (err) {
    console.error('Webhook signature verification failed:', err);
    res.status(400).send('Invalid signature');
    return;
  }

  // Idempotent event processing
  switch (event.type) {
    case 'payment_intent.succeeded': {
      const pi = event.data.object as Stripe.PaymentIntent;
      await handlePaymentSucceeded(pi);
      break;
    }
    case 'payment_intent.payment_failed': {
      const pi = event.data.object as Stripe.PaymentIntent;
      await handlePaymentFailed(pi);
      break;
    }
    case 'customer.subscription.deleted': {
      const sub = event.data.object as Stripe.Subscription;
      await cancelSubscription(sub.id);
      break;
    }
  }

  res.json({ received: true });
});

// Refund
async function refundPayment(paymentIntentId: string, amountCents?: number) {
  return stripe.refunds.create({
    payment_intent: paymentIntentId,
    amount: amountCents, // Omit for full refund
    reason: 'requested_by_customer',
  });
}
```

## Plaid Integration (Bank Account Linking)

```typescript
import { PlaidApi, Configuration, PlaidEnvironments, Products, CountryCode } from 'plaid';

const plaid = new PlaidApi(
  new Configuration({
    basePath: PlaidEnvironments[process.env.PLAID_ENV as 'sandbox' | 'production'],
    baseOptions: {
      headers: {
        'PLAID-CLIENT-ID': process.env.PLAID_CLIENT_ID,
        'PLAID-SECRET': process.env.PLAID_SECRET,
      },
    },
  })
);

// 1. Create Link token (server-side)
async function createLinkToken(userId: string) {
  const response = await plaid.linkTokenCreate({
    user: { client_user_id: userId },
    client_name: 'My App',
    products: [Products.Auth, Products.Transactions],
    country_codes: [CountryCode.Us],
    language: 'en',
  });
  return response.data.link_token;
}

// 2. Exchange public token for access token (after user completes Link)
async function exchangeToken(publicToken: string) {
  const response = await plaid.itemPublicTokenExchange({ public_token: publicToken });
  // Store access_token securely — this is permanent
  return response.data.access_token;
}

// 3. Fetch transactions
async function getTransactions(accessToken: string, startDate: string, endDate: string) {
  let allTransactions: Transaction[] = [];
  let hasMore = true;
  let offset = 0;

  while (hasMore) {
    const response = await plaid.transactionsGet({
      access_token: accessToken,
      start_date: startDate,
      end_date: endDate,
      options: { count: 500, offset },
    });
    allTransactions = [...allTransactions, ...response.data.transactions];
    hasMore = allTransactions.length < response.data.total_transactions;
    offset = allTransactions.length;
  }

  return allTransactions;
}
```

## Idempotency Pattern

```typescript
// Idempotency key middleware for financial APIs
async function idempotentOperation<T>(
  key: string,
  operation: () => Promise<T>,
  ttlSeconds = 86400 // 24 hours
): Promise<T> {
  const cached = await redis.get(`idempotency:${key}`);
  if (cached) {
    return JSON.parse(cached) as T;
  }

  const result = await operation();

  // Cache result — subsequent calls return same result
  await redis.set(`idempotency:${key}`, JSON.stringify(result), { EX: ttlSeconds });
  return result;
}

// Usage
const charge = await idempotentOperation(`charge:${orderId}:${userId}`, () =>
  stripe.charges.create({ amount: 9999, currency: 'usd', source: tokenId })
);
```

## PCI DSS Compliance

```typescript
// Card data — NEVER store, log, or transmit raw PANs
// Use Stripe Elements or similar to keep card data out of your systems

// WRONG — PCI violation:
// const cardNumber = req.body.cardNumber; // Never touches your server with Stripe Elements

// CORRECT — Stripe Elements flow:
// 1. Browser: stripe.createToken(cardElement) → returns { token: { id: 'tok_xxx' } }
// 2. Browser sends tok_xxx to your server
// 3. Server uses tok_xxx with Stripe API — never sees card data

// Masking for logs
function maskPAN(pan: string): string {
  return `****-****-****-${pan.slice(-4)}`;
}

// PCI-required: no card data in logs
function sanitizeForLogging(obj: Record<string, unknown>): Record<string, unknown> {
  const REDACT_FIELDS = ['card_number', 'cvv', 'pan', 'ssn', 'account_number'];
  return Object.fromEntries(
    Object.entries(obj).map(([k, v]) => (REDACT_FIELDS.includes(k) ? [k, '[REDACTED]'] : [k, v]))
  );
}
```

## Encryption for PII at Rest

```typescript
import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const KEY = Buffer.from(process.env.ENCRYPTION_KEY!, 'hex'); // 32 bytes

function encryptPII(plaintext: string): { ciphertext: string; iv: string; tag: string } {
  const iv = randomBytes(12); // 96-bit IV for GCM
  const cipher = createCipheriv(ALGORITHM, KEY, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  return {
    ciphertext: encrypted.toString('base64'),
    iv: iv.toString('base64'),
    tag: cipher.getAuthTag().toString('base64'),
  };
}

function decryptPII(ciphertext: string, iv: string, tag: string): string {
  const decipher = createDecipheriv(ALGORITHM, KEY, Buffer.from(iv, 'base64'));
  decipher.setAuthTag(Buffer.from(tag, 'base64'));
  return Buffer.concat([
    decipher.update(Buffer.from(ciphertext, 'base64')),
    decipher.final(),
  ]).toString('utf8');
}
```

## KYC/AML Patterns

```typescript
// Risk scoring
type RiskLevel = 'low' | 'medium' | 'high' | 'blocked';

interface KYCCheck {
  userId: string;
  identityVerified: boolean;
  pepMatch: boolean; // Politically Exposed Person
  sanctionsMatch: boolean; // OFAC, EU, UN sanctions lists
  countryRisk: 'low' | 'medium' | 'high';
  documentScore: number; // 0-100 from ID verification provider
}

function calculateRisk(check: KYCCheck): RiskLevel {
  if (check.sanctionsMatch) return 'blocked';
  if (check.pepMatch) return 'high';
  if (!check.identityVerified) return 'high';
  if (check.countryRisk === 'high') return 'medium';
  if (check.documentScore < 70) return 'medium';
  return 'low';
}

// Transaction monitoring — flag suspicious patterns
function flagSuspiciousTransaction(tx: Transaction): string[] {
  const flags: string[] = [];
  if (tx.amountCents > 1_000_000_00) flags.push('large_transaction'); // >$1M
  if (tx.amountCents === 999_99 || tx.amountCents === 9_999_99) flags.push('structuring_risk');
  if (tx.countryCode && HIGH_RISK_COUNTRIES.has(tx.countryCode)) flags.push('high_risk_country');
  return flags;
}

const HIGH_RISK_COUNTRIES = new Set(['KP', 'IR', 'SY', 'CU']); // OFAC restricted
```

## Audit Logging

```typescript
// Append-only audit log — never update, never delete
interface AuditEntry {
  id: string;
  timestamp: Date;
  actor: string; // userId or 'system'
  action: string; // 'payment.created', 'refund.issued', etc.
  resourceType: string; // 'payment', 'account', 'user'
  resourceId: string;
  before?: unknown; // State before change (for mutations)
  after?: unknown; // State after change
  ip?: string;
  userAgent?: string;
}

async function auditLog(entry: Omit<AuditEntry, 'id' | 'timestamp'>) {
  await db('audit_log').insert({
    id: randomUUID(),
    timestamp: new Date(),
    ...entry,
    before: entry.before ? JSON.stringify(entry.before) : null,
    after: entry.after ? JSON.stringify(entry.after) : null,
  });
}

// Usage
await auditLog({
  actor: userId,
  action: 'payment.created',
  resourceType: 'payment',
  resourceId: paymentId,
  after: { amount: 9999, currency: 'USD', status: 'completed' },
  ip: req.ip,
});
```

## Subscription Billing

```typescript
// Stripe subscriptions
async function createSubscription(customerId: string, priceId: string) {
  return stripe.subscriptions.create({
    customer: customerId,
    items: [{ price: priceId }],
    payment_behavior: 'default_incomplete', // Don't activate until payment confirmed
    expand: ['latest_invoice.payment_intent'],
  });
}

// Handle subscription lifecycle events
async function handleSubscriptionUpdated(subscription: Stripe.Subscription) {
  const status = subscription.status;
  // 'active', 'past_due', 'canceled', 'unpaid', 'trialing', 'paused'

  await db('subscriptions')
    .where({ stripe_id: subscription.id })
    .update({
      status,
      current_period_end: new Date(subscription.current_period_end * 1000),
      cancel_at_period_end: subscription.cancel_at_period_end,
    });

  if (status === 'past_due') {
    await sendPaymentFailedEmail(subscription.customer as string);
  }
}
```

## Stripe Advanced Best Practices

### Stripe API Version Pinning

Always pin the API version in the Stripe client constructor. Never rely on the account default:

```typescript
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2024-12-18.acacia', // Pin explicitly — never omit
  typescript: true,
  telemetry: false, // Disable telemetry in production if desired
});
```

Upgrade API versions deliberately in a test environment. Breaking changes in Stripe API versions can silently corrupt payment flows.

### Webhook Idempotency with Event ID Deduplication

Store processed webhook event IDs to prevent double-processing on retries:

```typescript
async function processWebhookEvent(event: Stripe.Event) {
  // Check if already processed
  const processed = await db('webhook_events').where({ stripe_event_id: event.id }).first();
  if (processed) {
    console.log(`Skipping duplicate event: ${event.id}`);
    return { status: 'already_processed' };
  }

  // Process the event
  await handleEvent(event);

  // Mark as processed (with upsert for race safety)
  await db('webhook_events')
    .insert({
      stripe_event_id: event.id,
      event_type: event.type,
      processed_at: new Date(),
    })
    .onConflict('stripe_event_id')
    .ignore();
}
```

### Radar Fraud Rules (Stripe Radar)

Configure Stripe Radar rules for fraud detection. Use metadata to pass risk signals:

```typescript
// Pass risk metadata to Radar
const paymentIntent = await stripe.paymentIntents.create({
  amount: amountCents,
  currency,
  customer: customerId,
  metadata: {
    user_account_age_days: String(accountAgeDays),
    is_first_purchase: String(isFirstPurchase),
    shipping_matches_billing: String(shippingMatchesBilling),
    risk_score: String(computedRiskScore),
  },
});

// Radar rule example (configured in Stripe Dashboard):
// Block if: :risk_level: = 'high' AND :metadata.is_first_purchase: = 'true'
```

### Strong Customer Authentication (SCA) for PSD2

For European payments, handle SCA challenges properly:

```typescript
// On frontend: handle requires_action status
const { paymentIntent, error } = await stripe.confirmCardPayment(clientSecret);

if (paymentIntent?.status === 'requires_action') {
  // Stripe.js handles 3DS challenge automatically
  // Server webhook will fire payment_intent.succeeded when complete
}

// Never mark order as paid until webhook payment_intent.succeeded fires
// Frontend confirmation is NOT authoritative
```

### Connect Platform Patterns

For marketplace/platform Stripe Connect:

```typescript
// Create charge on behalf of connected account
const charge = await stripe.charges.create(
  {
    amount: 10000, // $100.00
    currency: 'usd',
    source: token,
    application_fee_amount: 500, // $5.00 platform fee
  },
  {
    stripeAccount: connectedAccountId, // 'acct_xxx'
  }
);

// Transfer to connected account (separate transfers model)
const transfer = await stripe.transfers.create({
  amount: 9500, // $100 - $5 fee
  currency: 'usd',
  destination: connectedAccountId,
  transfer_group: orderId,
});
```

### Stripe Testing Checklist

| Scenario           | Test Card             | Expected                          |
| ------------------ | --------------------- | --------------------------------- |
| Successful payment | `4242 4242 4242 4242` | `payment_intent.succeeded`        |
| Declined card      | `4000 0000 0000 0002` | `payment_intent.payment_failed`   |
| Requires 3DS       | `4000 0025 0000 3155` | `requires_action` → 3DS → success |
| Insufficient funds | `4000 0000 0000 9995` | `card_declined`                   |
| Expired card       | `4000 0000 0000 0069` | `expired_card`                    |

Always test webhook delivery with `stripe listen --forward-to localhost:3000/webhook` during development.

## Anti-Patterns

- Floating-point arithmetic for monetary values (`0.1 + 0.2 !== 0.3`)
- Non-idempotent financial mutations (double charges on retry)
- Updating or deleting ledger entries (they must be immutable)
- Storing card PANs, CVVs, or magnetic stripe data
- Logging full request bodies in payment flows (may contain card data)
- Skipping webhook signature verification
- Using `Date.now()` for financial timestamps (use database server time)
- Rollback without audit log entry (must log failed attempts too)
- Currency conversion at ingestion time (store in original currency, convert at display)

## Regulatory References

| Regulation  | Scope            | Key Requirements                                         |
| ----------- | ---------------- | -------------------------------------------------------- |
| PCI DSS 4.0 | Card payments    | Encrypt PANs, tokenize, audit logs, penetration testing  |
| GDPR        | EU users         | Right to erasure, data minimization, breach notification |
| PSD2        | EU payments      | Strong Customer Authentication (SCA), Open Banking APIs  |
| SOX         | Public companies | Financial controls, audit trails, immutable records      |
| BSA/AML     | US transactions  | KYC, CTR >$10K, SAR filing, sanctions screening          |
| CCPA        | California users | Data access rights, opt-out of sale                      |

## Related

- Stripe docs: <https://stripe.com/docs>
- Plaid docs: <https://plaid.com/docs/>
- PCI DSS v4.0: <https://www.pcisecuritystandards.org/>
- OWASP Financial Security: <https://owasp.org/www-project-top-ten/>
