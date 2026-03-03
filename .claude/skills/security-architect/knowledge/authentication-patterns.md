# Authentication Patterns Reference

Production-ready patterns for OAuth 2.1, JWT (RFC 8725), Passkey/WebAuthn, and
session management. Use this when designing or reviewing authentication systems.

---

## OAuth 2.1 — Authorization Code + PKCE

OAuth 2.1 consolidates best practices from OAuth 2.0 RFC 6749 and subsequent RFCs.
**Key changes from 2.0**: PKCE required for all clients, implicit flow removed,
resource owner password credentials flow removed.

### Authorization Code Flow with PKCE

```javascript
const crypto = require('crypto');

// 1. Generate PKCE code verifier + challenge
function generatePKCE() {
  const codeVerifier = crypto.randomBytes(32).toString('base64url');
  const codeChallenge = crypto.createHash('sha256').update(codeVerifier).digest('base64url');
  return { codeVerifier, codeChallenge };
}

// 2. Build authorization URL
function buildAuthUrl({ clientId, redirectUri, scope, state }) {
  const { codeVerifier, codeChallenge } = generatePKCE();
  // Store codeVerifier in session for later exchange
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: clientId,
    redirect_uri: redirectUri,
    scope,
    state, // CSRF protection; verify on callback
    code_challenge: codeChallenge,
    code_challenge_method: 'S256',
  });
  return { url: `${AUTH_SERVER}/authorize?${params}`, codeVerifier };
}

// 3. Exchange code for tokens
async function exchangeCode({ code, codeVerifier, clientId, redirectUri }) {
  const response = await fetch(`${AUTH_SERVER}/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: redirectUri,
      client_id: clientId,
      code_verifier: codeVerifier, // PKCE verifier — no client_secret needed
    }),
  });
  if (!response.ok) throw new Error(`Token exchange failed: ${response.status}`);
  return response.json(); // { access_token, refresh_token, expires_in, token_type }
}
```

### State Validation (CSRF Protection)

```javascript
// Generate random state before redirect
function generateState() {
  return crypto.randomBytes(16).toString('hex');
}

// Validate on callback
function validateCallback(req) {
  const storedState = req.session.oauthState;
  const returnedState = req.query.state;
  if (!storedState || storedState !== returnedState) {
    throw new Error('OAuth state mismatch — potential CSRF attack');
  }
  delete req.session.oauthState;
}
```

### Token Refresh

```javascript
async function refreshTokens({ refreshToken, clientId }) {
  const response = await fetch(`${AUTH_SERVER}/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      client_id: clientId,
    }),
  });
  return response.json();
}
```

**OAuth 2.1 Checklist**:

- [ ] PKCE required for all client types (public and confidential)
- [ ] `state` parameter validated on callback
- [ ] `redirect_uri` validated against pre-registered allowlist
- [ ] Access tokens short-lived (≤15 minutes)
- [ ] Refresh token rotation: issue new refresh token on each use; revoke old
- [ ] Token introspection endpoint for resource servers

---

## JWT — RFC 8725 Best Practices

RFC 8725 (JSON Web Token Best Current Practices) addresses known JWT vulnerabilities.

### Secure JWT Creation

```javascript
const jwt = require('jsonwebtoken');

// SECURE JWT issuance following RFC 8725
function issueToken(payload, secret) {
  // RFC 8725 § 3.1: Use explicit algorithm in options, not payload
  return jwt.sign(
    {
      sub: payload.userId, // Subject: who the token is about
      iss: 'https://myapp.com', // Issuer: who issued the token
      aud: 'https://api.myapp.com', // Audience: intended recipient
      iat: Math.floor(Date.now() / 1000),
      // DO NOT include sensitive data in payload (base64-decodable without secret)
    },
    secret,
    {
      algorithm: 'HS256', // Explicitly specify algorithm
      expiresIn: '15m', // Short-lived access token
    }
  );
}

// SECURE JWT verification
function verifyToken(token, secret) {
  return jwt.verify(token, secret, {
    algorithms: ['HS256'], // RFC 8725 § 3.1: allowlist algorithms explicitly
    audience: 'https://api.myapp.com',
    issuer: 'https://myapp.com',
    // reject if missing 'alg' header, 'iss', 'aud', 'exp' claims
  });
}
```

### RFC 8725 Vulnerability Mitigations

```javascript
// VULNERABLE: Algorithm confusion attack
// Attacker changes alg=RS256 to alg=HS256 and signs with public key
// NEVER do this:
jwt.verify(token, publicKey); // No algorithm allowlist — vulnerable

// SECURE: Allowlist algorithms explicitly
jwt.verify(token, publicKey, { algorithms: ['RS256'] });

// VULNERABLE: "alg": "none" attack
// SECURE: algorithms allowlist excludes 'none' by default in jsonwebtoken ≥9

// VULNERABLE: Sensitive data in payload
jwt.sign({ userId, email, password: hashedPw }, secret); // Never include passwords

// SECURE: Only non-sensitive identifiers
jwt.sign({ sub: userId, role: 'user' }, secret, { expiresIn: '15m' });
```

### JWT Token Blocklist (Logout)

```javascript
// Redis-based token blocklist for logout
const redis = require('redis');
const client = redis.createClient();

async function revokeToken(token) {
  const decoded = jwt.decode(token);
  const ttl = decoded.exp - Math.floor(Date.now() / 1000);
  if (ttl > 0) {
    await client.setEx(`blocklist:${decoded.jti}`, ttl, '1');
  }
}

async function isTokenRevoked(token) {
  const decoded = jwt.decode(token);
  if (!decoded.jti) return false; // No jti claim — cannot blocklist
  return !!(await client.get(`blocklist:${decoded.jti}`));
}

// In middleware:
async function authMiddleware(req, res, next) {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'No token' });
  try {
    const payload = verifyToken(token, JWT_SECRET);
    if (await isTokenRevoked(token)) return res.status(401).json({ error: 'Token revoked' });
    req.user = payload;
    next();
  } catch (err) {
    res.status(401).json({ error: 'Invalid token' });
  }
}
```

**JWT Checklist**:

- [ ] Algorithm explicitly specified and allowlisted (never `alg: none`)
- [ ] `iss` (issuer) and `aud` (audience) claims validated
- [ ] Short expiry for access tokens (≤15 min); longer for refresh (≤7 days)
- [ ] `jti` (JWT ID) claim for revocation support
- [ ] No sensitive data in payload (it's base64-encoded, not encrypted)
- [ ] Use RS256 (asymmetric) for tokens verified by multiple services
- [ ] Use HS256 (symmetric) only when same service issues and verifies

---

## Passkey / WebAuthn

WebAuthn (Web Authentication API) provides phishing-resistant authentication using
public key cryptography. Passkeys = WebAuthn credentials synced to a password manager.

### Registration Flow

```javascript
// Server: generate registration options
const { generateRegistrationOptions } = require('@simplewebauthn/server');

async function beginRegistration(userId, username) {
  const options = await generateRegistrationOptions({
    rpName: 'My App',
    rpID: 'myapp.com',
    userID: userId,
    userName: username,
    attestationType: 'none', // 'direct' for enterprise
    authenticatorSelection: {
      residentKey: 'required', // Required for passkeys
      userVerification: 'required', // Biometric/PIN required
      authenticatorAttachment: 'platform', // Device passkey
    },
    excludeCredentials: await getUserCredentials(userId), // Prevent duplicates
  });
  // Store challenge in session (expires in 60s)
  await storeChallenge(userId, options.challenge, 60);
  return options;
}

// Server: verify registration response
const { verifyRegistrationResponse } = require('@simplewebauthn/server');

async function finishRegistration(userId, response) {
  const expectedChallenge = await getStoredChallenge(userId);
  const verification = await verifyRegistrationResponse({
    response,
    expectedChallenge,
    expectedOrigin: 'https://myapp.com',
    expectedRPID: 'myapp.com',
  });
  if (!verification.verified) throw new Error('Registration failed');
  await saveCredential(userId, verification.registrationInfo);
  return { success: true };
}
```

### Authentication Flow

```javascript
const {
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
} = require('@simplewebauthn/server');

async function beginAuthentication(userId) {
  const credentials = await getUserCredentials(userId);
  const options = await generateAuthenticationOptions({
    rpID: 'myapp.com',
    userVerification: 'required',
    allowCredentials: credentials.map(c => ({ id: c.credentialID, type: 'public-key' })),
  });
  await storeChallenge(userId, options.challenge, 60);
  return options;
}

async function finishAuthentication(userId, response) {
  const credential = await getCredentialById(response.id);
  const verification = await verifyAuthenticationResponse({
    response,
    expectedChallenge: await getStoredChallenge(userId),
    expectedOrigin: 'https://myapp.com',
    expectedRPID: 'myapp.com',
    authenticator: {
      credentialPublicKey: credential.publicKey,
      credentialID: credential.credentialID,
      counter: credential.counter,
    },
  });
  if (!verification.verified) throw new Error('Authentication failed');
  // Update counter (replay attack prevention)
  await updateCredentialCounter(
    credential.credentialID,
    verification.authenticationInfo.newCounter
  );
  return { success: true };
}
```

**WebAuthn Checklist**:

- [ ] Challenge is random (≥16 bytes) and single-use
- [ ] Challenge expires (store with TTL, default 60s)
- [ ] `expectedOrigin` validates against registered domain
- [ ] `expectedRPID` validates relying party ID
- [ ] Counter incremented and validated (replay attack prevention)
- [ ] User verification required (`userVerification: 'required'`)

---

## Session Management

Secure session patterns for server-rendered applications.

### Session Configuration (Express)

```javascript
const session = require('express-session');
const RedisStore = require('connect-redis').default;

app.use(
  session({
    store: new RedisStore({ client: redisClient }),
    secret: process.env.SESSION_SECRET, // ≥32 random bytes
    resave: false,
    saveUninitialized: false,
    cookie: {
      secure: process.env.NODE_ENV === 'production', // HTTPS only in prod
      httpOnly: true, // Prevents XSS access to cookie
      sameSite: 'strict', // CSRF protection
      maxAge: 8 * 60 * 60 * 1000, // 8 hours
    },
    name: '__Host-sessionid', // __Host- prefix: enforces secure+path=/+no domain
  })
);
```

### Session Regeneration (Prevents Session Fixation)

```javascript
// CRITICAL: Regenerate session ID after login
app.post('/login', async (req, res) => {
  const user = await authenticateUser(req.body.email, req.body.password);
  if (!user) return res.status(401).json({ error: 'Invalid credentials' });

  // Destroy old session, create new one with new ID
  req.session.regenerate(err => {
    if (err) return res.status(500).json({ error: 'Session error' });
    req.session.userId = user.id;
    req.session.role = user.role;
    res.json({ success: true });
  });
});

// Destroy session on logout
app.post('/logout', (req, res) => {
  req.session.destroy(err => {
    res.clearCookie('__Host-sessionid');
    res.json({ success: true });
  });
});
```

### Absolute vs. Idle Session Timeout

```javascript
// Enforce both absolute timeout AND idle timeout
const ABSOLUTE_TIMEOUT_MS = 8 * 60 * 60 * 1000; // 8 hours
const IDLE_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes

function checkSessionTimeout(req, res, next) {
  if (!req.session.userId) return next();

  const now = Date.now();
  const loginTime = req.session.loginTime || now;
  const lastActivity = req.session.lastActivity || now;

  if (now - loginTime > ABSOLUTE_TIMEOUT_MS || now - lastActivity > IDLE_TIMEOUT_MS) {
    return req.session.destroy(() => {
      res.status(401).json({ error: 'Session expired' });
    });
  }

  req.session.lastActivity = now;
  next();
}
app.use(checkSessionTimeout);
```

**Session Management Checklist**:

- [ ] Session ID regenerated after login (prevents session fixation)
- [ ] `HttpOnly` and `Secure` flags on session cookie
- [ ] `SameSite=Strict` or `SameSite=Lax` on session cookie
- [ ] Use `__Host-` cookie prefix for additional security
- [ ] Both absolute timeout AND idle timeout enforced
- [ ] Session destroyed (server-side) on logout; cookie cleared client-side
- [ ] Session data stored server-side (Redis), not in cookie

---

## Password Reset Security

```javascript
const crypto = require('crypto');

// SECURE password reset token
async function initiatePasswordReset(email) {
  const user = await User.findOne({ email });
  // Always return success (prevent user enumeration)
  if (!user) return { success: true };

  const token = crypto.randomBytes(32).toString('hex'); // 256-bit random
  const hash = crypto.createHash('sha256').update(token).digest('hex'); // Store hash
  const expires = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

  await PasswordReset.create({ userId: user.id, tokenHash: hash, expires });
  await sendResetEmail(email, token); // Email contains raw token
  return { success: true };
}

async function resetPassword(token, newPassword) {
  const hash = crypto.createHash('sha256').update(token).digest('hex');
  const reset = await PasswordReset.findOne({
    tokenHash: hash,
    expires: { $gt: new Date() },
    used: false,
  });
  if (!reset) throw new Error('Invalid or expired reset token');

  await reset.updateOne({ used: true }); // Single-use
  const passwordHash = await bcrypt.hash(newPassword, 12);
  await User.updateOne({ _id: reset.userId }, { passwordHash });
  // Invalidate all existing sessions for the user
  await destroyAllUserSessions(reset.userId);
}
```

**Password Reset Checklist**:

- [ ] Token: ≥32 random bytes, never sequential or predictable
- [ ] Store hash of token server-side (not raw token)
- [ ] Token expires (≤1 hour)
- [ ] Single-use: mark used immediately on consumption
- [ ] Never expose user enumeration: same response for valid/invalid email
- [ ] Invalidate all sessions after password change
- [ ] Rate limit reset requests (1 per email per 5 minutes)

---

## Quick Reference: Algorithm Selection

| Use Case             | Recommended                              | Avoid                               |
| -------------------- | ---------------------------------------- | ----------------------------------- |
| Password hashing     | bcrypt (cost≥12), argon2id               | MD5, SHA-1, SHA-256                 |
| JWT symmetric        | HS256, HS384                             | HS512 (slower, no security benefit) |
| JWT asymmetric       | RS256, ES256                             | RS512, none                         |
| Random tokens        | `crypto.randomBytes(32)`                 | `Math.random()`, timestamp-based    |
| Session secrets      | `crypto.randomBytes(32).toString('hex')` | Human-chosen strings                |
| Symmetric encryption | AES-256-GCM                              | AES-ECB, DES, RC4                   |
