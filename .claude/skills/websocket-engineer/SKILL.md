---
name: websocket-engineer
description: Expert WebSocket and real-time communication engineering — WebSocket protocol (RFC 6455), ws/Socket.IO server implementation, authentication, heartbeat/reconnection, horizontal scaling with Redis pub/sub, Server-Sent Events (SSE), WebRTC signaling, and observability. Use for chat, live dashboards, multiplayer, collaborative editing, and event-driven real-time systems.
version: 1.0.0
model: sonnet
invoked_by: both
user_invocable: true
tools: [Bash, Read, Write, Edit]
best_practices:
  - Always implement heartbeat (ping/pong) to detect dead connections
  - Authenticate at upgrade time, not per-message
  - Use Redis pub/sub for horizontal scaling
  - Rate-limit message ingestion to prevent amplification attacks
  - Handle all error and close events explicitly
error_handling: graceful
streaming: supported
verified: false
lastVerifiedAt: 2026-03-14T00:00:00.000Z
source: builtin
trust_score: 100
provenance_sha: b764f6418ee0192b
---

# WebSocket Engineer Skill

## Overview

Real-time, bidirectional communication systems using WebSockets and related protocols. Covers protocol fundamentals, server implementation, authentication, scaling, fault tolerance, and browser client patterns.

## Protocol Fundamentals

```
HTTP Upgrade → WebSocket Handshake
GET /ws HTTP/1.1
Upgrade: websocket
Connection: Upgrade
Sec-WebSocket-Key: <base64 random>
Sec-WebSocket-Version: 13

HTTP/1.1 101 Switching Protocols
Upgrade: websocket
Connection: Upgrade
Sec-WebSocket-Accept: <SHA-1 of key + GUID>

After handshake: full-duplex binary framing
Frame types: text (0x1), binary (0x2), close (0x8), ping (0x9), pong (0xA)
```

## Server Implementation — ws (Node.js)

```javascript
const { WebSocketServer, WebSocket } = require('ws');
const http = require('http');

const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: '/ws' });

// Connection map for targeted sends
const clients = new Map(); // userId → Set<WebSocket>

wss.on('connection', (ws, req) => {
  // 1. Authenticate immediately
  const token = extractToken(req);
  const user = verifyToken(token);
  if (!user) {
    ws.close(4001, 'Unauthorized');
    return;
  }

  // 2. Register client
  if (!clients.has(user.id)) clients.set(user.id, new Set());
  clients.get(user.id).add(ws);
  ws.userId = user.id;

  // 3. Heartbeat setup
  ws.isAlive = true;
  ws.on('pong', () => {
    ws.isAlive = true;
  });

  // 4. Message handling
  ws.on('message', (data, isBinary) => {
    try {
      const msg = isBinary ? data : JSON.parse(data.toString());
      handleMessage(ws, msg);
    } catch (err) {
      ws.send(JSON.stringify({ type: 'error', message: 'Invalid message' }));
    }
  });

  // 5. Cleanup on close
  ws.on('close', (code, reason) => {
    clients.get(ws.userId)?.delete(ws);
    if (clients.get(ws.userId)?.size === 0) clients.delete(ws.userId);
    console.log(`Client ${ws.userId} disconnected: ${code} ${reason}`);
  });

  ws.on('error', err => {
    console.error(`WebSocket error for ${ws.userId}:`, err.message);
  });

  // 6. Send initial state
  ws.send(JSON.stringify({ type: 'connected', userId: user.id }));
});

// Heartbeat interval — terminate dead connections every 30s
const heartbeat = setInterval(() => {
  wss.clients.forEach(ws => {
    if (!ws.isAlive) {
      ws.terminate();
      return;
    }
    ws.isAlive = false;
    ws.ping();
  });
}, 30_000);

wss.on('close', () => clearInterval(heartbeat));

// Targeted send to specific user (all connections)
function sendToUser(userId, payload) {
  const userClients = clients.get(userId);
  if (!userClients) return;
  const data = JSON.stringify(payload);
  userClients.forEach(ws => {
    if (ws.readyState === WebSocket.OPEN) ws.send(data);
  });
}

// Broadcast to all connected clients
function broadcast(payload, excludeUserId = null) {
  const data = JSON.stringify(payload);
  wss.clients.forEach(ws => {
    if (ws.readyState === WebSocket.OPEN && ws.userId !== excludeUserId) {
      ws.send(data);
    }
  });
}
```

## Authentication Patterns

```javascript
// Token in query string (simple, TLS required)
wss.on('connection', (ws, req) => {
  const url = new URL(req.url, 'http://localhost');
  const token = url.searchParams.get('token');
  // ...
});

// Cookie-based (preferred for browsers)
wss.on('connection', (ws, req) => {
  const cookies = parseCookies(req.headers.cookie);
  const sessionId = cookies['session'];
  // ...
});

// Custom header via Sec-WebSocket-Protocol (workaround for headers limitation)
// Browser: new WebSocket(url, ['v1', token])
// Server: req.headers['sec-websocket-protocol']

// First message auth (for frameworks that don't support upgrade auth)
ws.once('message', data => {
  const { type, token } = JSON.parse(data);
  if (type !== 'auth') {
    ws.close(4001, 'Auth required');
    return;
  }
  const user = verifyToken(token);
  if (!user) {
    ws.close(4001, 'Unauthorized');
    return;
  }
  ws.userId = user.id;
  setupMessageHandler(ws);
});
```

## Horizontal Scaling with Redis

```javascript
const { createClient } = require('redis');
const { WebSocketServer } = require('ws');

const pub = createClient({ url: process.env.REDIS_URL });
const sub = createClient({ url: process.env.REDIS_URL });
await pub.connect();
await sub.connect();

const CHANNEL = 'ws:broadcast';

// Subscribe to Redis messages and relay to local clients
await sub.subscribe(CHANNEL, message => {
  const payload = JSON.parse(message);
  // Deliver to local connections matching the target
  wss.clients.forEach(ws => {
    if (ws.readyState === WebSocket.OPEN) {
      if (!payload.targetUserId || ws.userId === payload.targetUserId) {
        ws.send(JSON.stringify(payload.data));
      }
    }
  });
});

// Publish cross-instance — all servers receive and relay
async function broadcastViaRedis(data, targetUserId = null) {
  await pub.publish(
    CHANNEL,
    JSON.stringify({ data, targetUserId, serverId: process.env.SERVER_ID })
  );
}

// Rooms with Redis Sets
async function joinRoom(userId, room) {
  await pub.sAdd(`room:${room}`, userId);
}

async function broadcastToRoom(room, data) {
  const members = await pub.sMembers(`room:${room}`);
  for (const userId of members) {
    await pub.publish(`user:${userId}`, JSON.stringify(data));
  }
}
```

## Socket.IO (Higher-Level Abstraction)

```javascript
const { Server } = require('socket.io');
const { createAdapter } = require('@socket.io/redis-adapter');

const io = new Server(httpServer, {
  cors: { origin: process.env.FRONTEND_URL, credentials: true },
  adapter: createAdapter(pub, sub), // Redis adapter for scaling
  transports: ['websocket', 'polling'], // Prefer WebSocket, fallback to polling
  pingTimeout: 20_000,
  pingInterval: 10_000,
});

// Middleware for auth
io.use(async (socket, next) => {
  const token = socket.handshake.auth.token;
  const user = await verifyToken(token);
  if (!user) return next(new Error('Unauthorized'));
  socket.userId = user.id;
  next();
});

io.on('connection', socket => {
  socket.join(`user:${socket.userId}`); // Auto room per user

  socket.on('join-room', roomId => {
    socket.join(roomId);
    socket.to(roomId).emit('user-joined', { userId: socket.userId });
  });

  socket.on('message', ({ roomId, text }) => {
    // Broadcast to room except sender
    socket.to(roomId).emit('message', { userId: socket.userId, text, ts: Date.now() });
  });

  socket.on('disconnect', reason => {
    console.log(`${socket.userId} disconnected: ${reason}`);
  });
});

// Server-side targeted emit
io.to(`user:${userId}`).emit('notification', { message: 'You have a new message' });
io.to(roomId).emit('event', data);
```

## Browser Client

```javascript
class RealtimeClient {
  #ws = null;
  #reconnectDelay = 1_000;
  #maxDelay = 30_000;
  #handlers = new Map();

  constructor(url, token) {
    this.url = url;
    this.token = token;
    this.connect();
  }

  connect() {
    this.#ws = new WebSocket(`${this.url}?token=${this.token}`);

    this.#ws.onopen = () => {
      console.log('Connected');
      this.#reconnectDelay = 1_000; // Reset backoff
      this.emit('connected');
    };

    this.#ws.onmessage = ({ data }) => {
      try {
        const msg = JSON.parse(data);
        this.#handlers.get(msg.type)?.forEach(cb => cb(msg));
        this.#handlers.get('*')?.forEach(cb => cb(msg));
      } catch (e) {
        console.error('Parse error', e);
      }
    };

    this.#ws.onclose = event => {
      if (event.code === 4001) {
        this.emit('unauthorized');
        return; // Don't reconnect on auth failure
      }
      console.log(`Disconnected (${event.code}), retrying in ${this.#reconnectDelay}ms`);
      setTimeout(() => this.connect(), this.#reconnectDelay);
      this.#reconnectDelay = Math.min(this.#reconnectDelay * 2, this.#maxDelay);
    };

    this.#ws.onerror = err => {
      console.error('WebSocket error', err);
    };
  }

  on(type, handler) {
    if (!this.#handlers.has(type)) this.#handlers.set(type, new Set());
    this.#handlers.get(type).add(handler);
    return () => this.#handlers.get(type).delete(handler); // Returns unsubscribe fn
  }

  send(type, data = {}) {
    if (this.#ws?.readyState !== WebSocket.OPEN) {
      console.warn('Not connected, dropping message:', type);
      return;
    }
    this.#ws.send(JSON.stringify({ type, ...data }));
  }

  emit(type, data) {
    this.#handlers.get(type)?.forEach(cb => cb(data));
  }

  close() {
    this.#ws?.close(1000, 'Client closing');
  }
}

// Usage
const client = new RealtimeClient('wss://api.example.com/ws', authToken);
const unsubscribe = client.on('message', msg => displayMessage(msg));
client.send('join-room', { roomId: 'general' });
// Cleanup:
unsubscribe();
```

## Server-Sent Events (SSE) — Unidirectional Alternative

```javascript
// Server — simpler than WebSockets for server → client push
app.get('/events', (req, res) => {
  const user = authenticate(req);
  if (!user) {
    res.sendStatus(401);
    return;
  }

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  // Send events
  const send = (event, data) => {
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  };

  send('connected', { userId: user.id });

  // Register for push events
  const unsubscribe = eventBus.on(`user:${user.id}`, data => send('update', data));
  const heartbeat = setInterval(() => res.write(':heartbeat\n\n'), 15_000);

  req.on('close', () => {
    clearInterval(heartbeat);
    unsubscribe();
  });
});

// Browser — SSE client
const source = new EventSource('/events');
source.addEventListener('update', e => {
  const data = JSON.parse(e.data);
  updateUI(data);
});
source.onerror = () => {
  // EventSource auto-reconnects — onerror fires on reconnect attempts too
  console.log('SSE connection lost, browser will reconnect automatically');
};
```

## Message Protocol Design

```javascript
// Typed message envelope (recommended pattern)
const MessageTypes = {
  // Client → Server
  JOIN_ROOM: 'join_room',
  LEAVE_ROOM: 'leave_room',
  SEND_MESSAGE: 'send_message',
  TYPING_START: 'typing_start',
  TYPING_STOP: 'typing_stop',
  // Server → Client
  ROOM_JOINED: 'room_joined',
  MESSAGE_RECEIVED: 'message_received',
  USER_JOINED: 'user_joined',
  USER_LEFT: 'user_left',
  ERROR: 'error',
};

// Example message schema
const sendMessageSchema = {
  type: 'send_message',
  roomId: 'string (required)',
  text: 'string (max 2000 chars)',
  replyTo: 'string | null (message ID)',
};

// Server validation
function validateMessage(msg) {
  if (!msg.type || typeof msg.type !== 'string') throw new Error('Missing type');
  if (!MessageTypes[msg.type.toUpperCase()]) throw new Error(`Unknown type: ${msg.type}`);
  // Type-specific validation
  switch (msg.type) {
    case MessageTypes.SEND_MESSAGE:
      if (!msg.roomId || !msg.text) throw new Error('Missing roomId or text');
      if (msg.text.length > 2000) throw new Error('Text too long');
      break;
  }
}
```

## Rate Limiting

```javascript
const rateLimiters = new Map(); // userId → { count, resetAt }

function checkRateLimit(userId, limit = 60, windowMs = 60_000) {
  const now = Date.now();
  const limiter = rateLimiters.get(userId) ?? { count: 0, resetAt: now + windowMs };

  if (now > limiter.resetAt) {
    limiter.count = 0;
    limiter.resetAt = now + windowMs;
  }

  limiter.count++;
  rateLimiters.set(userId, limiter);

  if (limiter.count > limit) {
    throw new Error(`Rate limit exceeded: ${limit} messages per ${windowMs / 1000}s`);
  }
}
```

## Observability

```javascript
// Metrics to track
const metrics = {
  connections: 0, // Current active connections
  messagesIn: 0, // Messages received per second
  messagesOut: 0, // Messages sent per second
  errors: 0, // Error count
  avgLatency: 0, // Round-trip time (using ping/pong timestamps)
};

// Emit latency metric with custom ping payload
function measureLatency(ws) {
  const start = Date.now();
  const payload = Buffer.alloc(8);
  payload.writeBigInt64BE(BigInt(start));
  ws.ping(payload);
  ws.once('pong', data => {
    const sent = Number(data.readBigInt64BE());
    metrics.avgLatency = Date.now() - sent;
  });
}
```

## Security

- Always use `wss://` (TLS) in production — plain `ws://` is MITM-vulnerable
- Authenticate at the HTTP upgrade stage, not per-message
- Rate-limit both connection attempts and message frequency
- Validate and sanitize ALL incoming message content (treat as untrusted)
- Set `maxPayload` on `ws.WebSocketServer` to prevent memory exhaustion attacks
- Use `ws.close(code, reason)` for intentional closes; `ws.terminate()` only for dead connections
- Never echo user-controlled data without sanitization (XSS via message relay)
- Enable CORS properly for Socket.IO — do not use `origin: '*'` in production

```javascript
// Limit message payload size (default is 100MB — too large)
const wss = new WebSocketServer({ server, maxPayload: 64 * 1024 }); // 64KB max
```

## Related

- ws npm package: <https://github.com/websockets/ws>
- Socket.IO: <https://socket.io/docs/v4/>
- RFC 6455 (WebSocket Protocol): <https://www.rfc-editor.org/rfc/rfc6455>
- MDN WebSocket API: <https://developer.mozilla.org/en-US/docs/Web/API/WebSocket>
