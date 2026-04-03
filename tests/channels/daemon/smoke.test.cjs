'use strict';

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('http');

// Start daemon in-process with mocked Telegram source
// (no actual Telegram polling — just test HTTP API and dispatcher)
const { Router } = require('../../../scripts/channels/daemon/router.cjs');
const { Dispatcher } = require('../../../scripts/channels/daemon/dispatcher.cjs');
const { DaemonMemory } = require('../../../scripts/channels/daemon/memory.cjs');
const fs = require('fs');
const path = require('path');
const os = require('os');

function httpGet(port, urlPath) {
  return new Promise((resolve, reject) => {
    const req = http.get(`http://127.0.0.1:${port}${urlPath}`, res => {
      let data = '';
      res.on('data', c => (data += c));
      res.on('end', () => resolve({ status: res.statusCode, data }));
    });
    req.on('error', reject);
    req.setTimeout(3000, () => {
      req.destroy();
      reject(new Error('timeout'));
    });
  });
}

function httpPost(port, urlPath, body) {
  return new Promise((resolve, reject) => {
    const json = JSON.stringify(body);
    const req = http.request(
      {
        hostname: '127.0.0.1',
        port,
        path: urlPath,
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(json) },
      },
      res => {
        let data = '';
        res.on('data', c => (data += c));
        res.on('end', () => resolve({ status: res.statusCode, data }));
      }
    );
    req.on('error', reject);
    req.setTimeout(3000, () => {
      req.destroy();
      reject(new Error('timeout'));
    });
    req.write(json);
    req.end();
  });
}

describe('Smoke Test — In-process daemon HTTP API', () => {
  const PORT = 13101; // Use non-standard port to avoid conflicts
  let server;
  let dispatcher;
  let tmpDir;

  // Minimal in-process daemon (no Telegram source, just HTTP + dispatcher)
  before(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'daemon-smoke-'));
    const router = new Router([{ event: '*', handler: 'echo', sink: 'test' }]);
    const memory = new DaemonMemory(tmpDir, {});
    const mockRenderer = { render: () => 'mock response', renderProactive: () => 'proactive' };
    const mockSink = {
      async send() {
        return 1;
      },
    };
    dispatcher = new Dispatcher(router, mockRenderer, { test: mockSink }, () => {}, memory, {});

    server = http.createServer((req, res) => {
      const url = new URL(req.url, `http://${req.headers.host}`);
      res.setHeader('Content-Type', 'application/json');

      if (url.pathname === '/health') {
        res.end(JSON.stringify({ status: 'ok', uptime: process.uptime() }));
        return;
      }
      if (url.pathname === '/status') {
        res.end(
          JSON.stringify({
            status: 'running',
            pid: process.pid,
            dispatcher: dispatcher.getStats(),
            memory: memory.getStats(),
          })
        );
        return;
      }
      if (url.pathname === '/event' && req.method === 'POST') {
        let body = '';
        req.on('data', c => (body += c));
        req.on('end', () => {
          try {
            const event = JSON.parse(body);
            if (!event.type) throw new Error('event.type required');
            event.timestamp = event.timestamp || new Date().toISOString();
            event.source = event.source || 'api';
            dispatcher.enqueue(event);
            res.statusCode = 202;
            res.end(JSON.stringify({ accepted: true }));
          } catch (err) {
            res.statusCode = 400;
            res.end(JSON.stringify({ error: err.message }));
          }
        });
        return;
      }
      if (url.pathname === '/history') {
        res.end(JSON.stringify({ events: dispatcher.getHistory(20) }));
        return;
      }
      if (url.pathname === '/memory') {
        res.end(JSON.stringify({ memory: memory.getStats() }));
        return;
      }
      res.statusCode = 404;
      res.end(JSON.stringify({ error: 'not found' }));
    });

    await new Promise(resolve => server.listen(PORT, '127.0.0.1', resolve));
  });

  after(async () => {
    if (server) await new Promise(resolve => server.close(resolve));
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {}
  });

  it('/health returns ok', async () => {
    const { status, data } = await httpGet(PORT, '/health');
    assert.equal(status, 200);
    const body = JSON.parse(data);
    assert.equal(body.status, 'ok');
    assert.equal(typeof body.uptime, 'number');
  });

  it('/status returns correct shape', async () => {
    const { status, data } = await httpGet(PORT, '/status');
    assert.equal(status, 200);
    const body = JSON.parse(data);
    assert.equal(body.status, 'running');
    assert.ok(body.dispatcher);
    assert.ok(body.memory);
    assert.equal(typeof body.dispatcher.received, 'number');
  });

  it('POST /event accepts and processes event', async () => {
    const { status, data } = await httpPost(PORT, '/event', {
      type: 'test.message',
      data: { chatId: '123', text: 'smoke test', user: 'tester', messageId: 1 },
    });
    assert.equal(status, 202);
    const body = JSON.parse(data);
    assert.equal(body.accepted, true);

    // Wait for processing
    await new Promise(r => setTimeout(r, 200));

    // Verify it was processed
    const statusRes = await httpGet(PORT, '/status');
    const statusBody = JSON.parse(statusRes.data);
    assert.ok(statusBody.dispatcher.received >= 1);
  });

  it('POST /event rejects invalid body', async () => {
    const { status } = await httpPost(PORT, '/event', { noType: true });
    assert.equal(status, 400);
  });

  it('/history returns events after processing', async () => {
    await new Promise(r => setTimeout(r, 300));
    const { status, data } = await httpGet(PORT, '/history');
    assert.equal(status, 200);
    const body = JSON.parse(data);
    assert.ok(Array.isArray(body.events));
  });

  it('/memory returns stats', async () => {
    const { status, data } = await httpGet(PORT, '/memory');
    assert.equal(status, 200);
    const body = JSON.parse(data);
    assert.ok(body.memory);
    assert.equal(typeof body.memory.chats, 'number');
  });

  it('404 for unknown route', async () => {
    const { status } = await httpGet(PORT, '/nonexistent');
    assert.equal(status, 404);
  });
});
