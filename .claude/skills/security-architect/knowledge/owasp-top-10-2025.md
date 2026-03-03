# OWASP Top 10 (2021/2025) — Security Reference

Quick-reference for the security-architect skill. Use this when reviewing code for
common web application vulnerabilities. Each entry includes detection patterns,
prevention checklists, and example vulnerable code.

---

## A01:2021 — Broken Access Control

**Risk**: Users can act outside their intended permissions. Most common OWASP category.

**Detection Patterns**:

- Direct object references without authorization checks (e.g., `/api/user/1234/data`)
- Missing function-level access control (admin endpoints accessible to regular users)
- CORS misconfiguration allowing unauthorized origins
- Path traversal: `../../../etc/passwd` in file paths
- Privilege escalation via parameter manipulation (`role=admin` in request body)

**Vulnerable Code Example**:

```javascript
// VULNERABLE: No ownership check before returning data
app.get('/api/documents/:id', authenticate, async (req, res) => {
  const doc = await Document.findById(req.params.id); // Anyone can get any doc
  res.json(doc);
});

// SECURE: Verify ownership
app.get('/api/documents/:id', authenticate, async (req, res) => {
  const doc = await Document.findOne({ _id: req.params.id, owner: req.user.id });
  if (!doc) return res.status(404).json({ error: 'Not found' });
  res.json(doc);
});
```

**Prevention Checklist**:

- [ ] Deny by default; explicitly grant permissions
- [ ] Enforce access control server-side, not client-side
- [ ] Log access control failures and alert on high frequency
- [ ] Invalidate JWT tokens on logout (use token blocklist or short expiry)
- [ ] Rate-limit API calls to minimize automated attack surface
- [ ] Test: authenticated user can only access their own resources

---

## A02:2021 — Cryptographic Failures

**Risk**: Sensitive data exposed due to weak/absent encryption. Formerly "Sensitive Data Exposure."

**Detection Patterns**:

- Passwords stored as MD5/SHA-1 (weak hashing)
- HTTP (not HTTPS) for sensitive data transmission
- Weak cipher suites: RC4, DES, 3DES, MD5
- Hardcoded secrets in source code
- Cleartext credentials in logs
- Missing `Secure` / `HttpOnly` flags on cookies containing session tokens

**Vulnerable Code Example**:

```javascript
// VULNERABLE: MD5 is broken for passwords
const hash = crypto.createHash('md5').update(password).digest('hex');

// VULNERABLE: Hardcoded secret
const JWT_SECRET = 'mysecretkey123';

// SECURE: bcrypt with work factor >= 12
const bcrypt = require('bcrypt');
const hash = await bcrypt.hash(password, 12);

// SECURE: Secret from environment
const JWT_SECRET = process.env.JWT_SECRET; // Must be ≥32 random bytes
if (!JWT_SECRET) throw new Error('JWT_SECRET not configured');
```

**Prevention Checklist**:

- [ ] Use bcrypt/scrypt/argon2 for passwords (never MD5/SHA-1)
- [ ] TLS 1.2+ for all data in transit; disable TLS 1.0/1.1
- [ ] Never log sensitive fields: passwords, tokens, PII, card numbers
- [ ] Rotate secrets and use a secrets manager (Vault, AWS Secrets Manager)
- [ ] Set `Secure; HttpOnly; SameSite=Strict` on session cookies
- [ ] Verify: `grep -r 'MD5\|SHA1\|createHash' src/` for hash usage

---

## A03:2021 — Injection

**Risk**: Hostile data sent to interpreter as part of a command/query.

**Detection Patterns**:

- String concatenation in SQL queries
- Unsanitized user input in shell commands
- Template injection (`{{7*7}}` evaluating in server responses)
- XSS: user HTML/JS rendered without escaping
- LDAP injection in directory queries

**Vulnerable Code Example**:

```javascript
// VULNERABLE: SQL injection
const query = `SELECT * FROM users WHERE email = '${userEmail}'`;
// Attack: userEmail = "' OR '1'='1"

// VULNERABLE: Command injection
const { exec } = require('child_process');
exec(`convert ${req.body.filename} output.png`);
// Attack: filename = "x; rm -rf /"

// SECURE: Parameterized query
const result = await db.query('SELECT * FROM users WHERE email = $1', [userEmail]);

// SECURE: shell: false with array args
const { spawn } = require('child_process');
spawn('convert', [req.body.filename, 'output.png'], { shell: false });
```

**Prevention Checklist**:

- [ ] Use parameterized queries / prepared statements for ALL database calls
- [ ] Always use `shell: false` with array args for child process spawning
- [ ] Validate/sanitize input with an allowlist (not a denylist)
- [ ] Use ORM/query builder instead of raw SQL when possible
- [ ] Escape output in HTML context (React JSX escapes by default)
- [ ] Run: `pnpm audit` and static analysis (SonarQube, semgrep) in CI

---

## A04:2021 — Insecure Design

**Risk**: Missing or ineffective control design; security not considered at design time.

**Detection Patterns**:

- Business logic bypasses (skip checkout steps, negative quantities)
- Missing rate limiting on sensitive actions (login, password reset, OTP)
- No multi-factor for high-privilege operations
- Predictable resource identifiers (sequential IDs)
- Insufficient separation between tenants in multi-tenant systems

**Examples**:

- Password reset link not expiring → account takeover
- Sending OTP over SMS without rate limit → brute force attack
- Sequential user IDs exposing user count and enabling enumeration

**Prevention Checklist**:

- [ ] Threat-model new features before implementation
- [ ] Use secure design patterns: fail-safe defaults, least privilege
- [ ] Rate limit sensitive endpoints (10 attempts/min for login)
- [ ] Use UUIDs, not sequential IDs, for user-facing resources
- [ ] Require MFA for admin/financial operations
- [ ] Write security user stories alongside functional stories

---

## A05:2021 — Security Misconfiguration

**Risk**: Missing security hardening, default credentials, overly permissive settings.

**Detection Patterns**:

- Default admin credentials unchanged
- Debug mode enabled in production (`NODE_ENV=development`)
- Stack traces / verbose errors exposed to users
- Unnecessary features enabled (sample apps, admin panels)
- Missing security headers
- Cloud storage buckets publicly accessible (S3, GCS)

**Vulnerable Code Example**:

```javascript
// VULNERABLE: Debug mode exposes stack traces
app.use((err, req, res, next) => {
  res.status(500).json({ error: err.message, stack: err.stack }); // Never in prod!
});

// SECURE: Generic error in prod
app.use((err, req, res, next) => {
  if (process.env.NODE_ENV === 'production') {
    res.status(500).json({ error: 'Internal server error' });
  } else {
    res.status(500).json({ error: err.message, stack: err.stack });
  }
});
```

**Security Headers (add via helmet.js)**:

```javascript
const helmet = require('helmet');
app.use(helmet()); // Sets: CSP, HSTS, X-Frame-Options, etc.
```

**Prevention Checklist**:

- [ ] Automated config validation in CI (Checkov, tfsec)
- [ ] Set `NODE_ENV=production` in prod deployments
- [ ] Security headers: CSP, HSTS, X-Content-Type-Options, X-Frame-Options
- [ ] Remove/disable unused features, APIs, docs in production
- [ ] Regular review of cloud IAM policies and storage permissions
- [ ] Change all default passwords before deployment

---

## A06:2021 — Vulnerable and Outdated Components

**Risk**: Using components with known vulnerabilities.

**Detection Patterns**:

- `npm audit` shows critical/high CVEs
- Outdated dependencies (check with `npm outdated`)
- Using EOL frameworks (Node.js 14, React 16)
- No dependency scanning in CI/CD pipeline

**Prevention Checklist**:

- [ ] Run `pnpm audit` in CI; fail on critical CVEs
- [ ] Use Dependabot or Renovate for automated dependency updates
- [ ] Subscribe to security advisories for critical dependencies
- [ ] Pin dependency versions in lockfile (`pnpm-lock.yaml`)
- [ ] Remove unused dependencies (`depcheck`)
- [ ] Track EOL dates for runtime versions (Node.js, etc.)

---

## A07:2021 — Identification and Authentication Failures

**Risk**: Weaknesses in authentication allowing account compromise.

**Detection Patterns**:

- Permitting weak/common passwords (`password123`)
- No brute force protection on login endpoint
- Insecure "forgot password" flows (predictable tokens, no expiry)
- Storing session IDs in URL (leaked in logs/referer)
- Missing session invalidation on logout

**Vulnerable Code Example**:

```javascript
// VULNERABLE: No rate limiting, no lockout
app.post('/login', async (req, res) => {
  const user = await User.findOne({ email: req.body.email });
  if (user && user.password === req.body.password) {
    // plaintext!
    req.session.userId = user.id;
    res.json({ success: true });
  }
});

// SECURE: Rate limited, hashed passwords, account lockout
const rateLimit = require('express-rate-limit');
const loginLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 5 });

app.post('/login', loginLimiter, async (req, res) => {
  const user = await User.findOne({ email: req.body.email });
  if (!user || !(await bcrypt.compare(req.body.password, user.passwordHash))) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }
  req.session.regenerate(() => {
    req.session.userId = user.id;
    res.json({ success: true });
  });
});
```

**Prevention Checklist**:

- [ ] Enforce minimum password length (≥12 chars) and complexity
- [ ] Rate limit login: max 5 attempts per 15 min per IP
- [ ] Use secure, random tokens for password reset (min 32 bytes, expire in 1hr)
- [ ] Regenerate session ID after successful login (prevents session fixation)
- [ ] Implement MFA for sensitive operations
- [ ] See `authentication-patterns.md` for OAuth 2.1 and JWT patterns

---

## A08:2021 — Software and Data Integrity Failures

**Risk**: Code and infrastructure not protected against integrity violations.

**Detection Patterns**:

- No signature verification for software updates
- Insecure deserialization of user-supplied data
- CI/CD pipeline allows untrusted sources to inject code
- npm packages installed from unknown sources
- Missing subresource integrity (SRI) on CDN scripts

**Vulnerable Code Example**:

```javascript
// VULNERABLE: Deserializing untrusted data (node-serialize RCE)
const data = JSON.parse(req.body.data);
// Attack using IIFE in serialized object: {"x":"_$$ND_FUNC$$_function(){require('child_process').exec('...')}()"}

// SECURE: Schema validation before processing
const Joi = require('joi');
const schema = Joi.object({ name: Joi.string().max(100), age: Joi.number().min(0).max(150) });
const { error, value } = schema.validate(req.body);
if (error) return res.status(400).json({ error: error.details[0].message });
```

**Prevention Checklist**:

- [ ] Sign and verify software packages (`npm audit signatures`)
- [ ] Use SRI hashes for CDN-hosted scripts
- [ ] Validate all deserialized data with strict schemas
- [ ] Review CI/CD pipeline for unauthorized access; pin action versions
- [ ] Use `package-lock.json`/`pnpm-lock.yaml` to prevent supply chain attacks

---

## A09:2021 — Security Logging and Monitoring Failures

**Risk**: Insufficient logging prevents detection and forensics of breaches.

**Detection Patterns**:

- Authentication events not logged
- No alerting on repeated access control failures
- Logs contain PII or credentials (HIPAA/GDPR violation)
- No centralized logging (logs lost when containers restart)
- Log injection possible via user-controlled data in log messages

**Prevention Checklist**:

- [ ] Log: login success/failure, privilege changes, access control failures
- [ ] Never log: passwords, tokens, PII, full card numbers
- [ ] Use structured logging (JSON) for machine parsing
- [ ] Centralize logs (ELK, Datadog, CloudWatch) — don't rely on container logs
- [ ] Alert on: 5+ auth failures from one IP, access to admin endpoints by non-admins
- [ ] Retain security logs for ≥90 days (compliance requirement)

---

## A10:2021 — Server-Side Request Forgery (SSRF)

**Risk**: Attacker tricks server into making requests to internal/unintended systems.

**Detection Patterns**:

- User-supplied URL passed directly to `fetch()`, `axios.get()`, `curl`
- Webhook URL validation missing (can point to internal services)
- URL redirect without host validation

**Vulnerable Code Example**:

```javascript
// VULNERABLE: SSRF — attacker can probe internal network
app.post('/fetch-preview', async (req, res) => {
  const response = await fetch(req.body.url); // Attack: http://169.254.169.254/
  res.json({ content: await response.text() });
});

// SECURE: Allowlist external URLs only
const { URL } = require('url');
const ALLOWED_PROTOCOLS = ['https:'];
const BLOCKED_HOSTS = /^(localhost|127\.|10\.|172\.(1[6-9]|2\d|3[01])\.|192\.168\.)/;

app.post('/fetch-preview', async (req, res) => {
  let parsed;
  try {
    parsed = new URL(req.body.url);
  } catch {
    return res.status(400).json({ error: 'Invalid URL' });
  }
  if (!ALLOWED_PROTOCOLS.includes(parsed.protocol))
    return res.status(400).json({ error: 'HTTPS only' });
  if (BLOCKED_HOSTS.test(parsed.hostname))
    return res.status(400).json({ error: 'Internal addresses not allowed' });
  const response = await fetch(req.body.url);
  res.json({ content: await response.text() });
});
```

**Prevention Checklist**:

- [ ] Validate and sanitize all user-supplied URLs
- [ ] Use allowlist of permitted domains for outbound requests
- [ ] Block private IP ranges, loopback, and cloud metadata endpoints (169.254.169.254)
- [ ] Enforce HTTPS-only for external requests
- [ ] Deploy network segmentation to limit server outbound access
- [ ] Monitor outbound traffic for anomalous patterns

---

## Quick Audit Checklist

For rapid security review, check these high-impact items first:

1. **Input validation**: All user input validated/sanitized before use?
2. **Auth on every route**: Protected routes check authentication?
3. **Authorization**: Users can only access their own data?
4. **Secrets**: No hardcoded credentials; secrets from environment?
5. **Dependencies**: `pnpm audit` clean?
6. **Error handling**: No stack traces/internals exposed in production?
7. **Logging**: Auth events logged? No PII in logs?
8. **HTTPS**: All sensitive data transmitted over TLS?
