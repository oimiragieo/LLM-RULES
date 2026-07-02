'use strict';

const assert = require('node:assert/strict');
const http = require('node:http');
const { test } = require('node:test');
const path = require('node:path');

const CTL_PATH = path.join(__dirname, '..', '..', 'scripts', 'channels', 'telegram-ctl.cjs');

function loadCtl(env = {}) {
  const keys = ['CHANNEL_DAEMON_API_TOKEN', 'CHANNEL_DAEMON_TOKEN', 'CHANNEL_DAEMON_PORT'];
  const previous = new Map(keys.map(key => [key, process.env[key]]));

  for (const key of keys) {
    if (Object.hasOwn(env, key)) {
      process.env[key] = env[key];
    } else {
      delete process.env[key];
    }
  }

  delete require.cache[require.resolve(CTL_PATH)];
  const ctl = require(CTL_PATH);

  return {
    ctl,
    restore() {
      delete require.cache[require.resolve(CTL_PATH)];
      for (const [key, value] of previous) {
        if (value === undefined) {
          delete process.env[key];
        } else {
          process.env[key] = value;
        }
      }
    },
  };
}

function listen(server) {
  return new Promise(resolve => {
    server.listen(0, '127.0.0.1', () => resolve(server.address().port));
  });
}

function close(server) {
  return new Promise(resolve => server.close(resolve));
}

test('telegram-ctl sends daemon bearer token for protected routes', async () => {
  let authorization = null;
  const server = http.createServer((req, res) => {
    authorization = req.headers.authorization || null;
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end('{"stopping":true}');
  });
  const port = await listen(server);
  const loaded = loadCtl({
    CHANNEL_DAEMON_API_TOKEN: 'ctl-secret',
    CHANNEL_DAEMON_PORT: String(port),
  });

  try {
    assert.equal(await loaded.ctl.httpGet('/stop'), '{"stopping":true}');
    assert.equal(authorization, 'Bearer ctl-secret');
  } finally {
    loaded.restore();
    await close(server);
  }
});

test('telegram-ctl treats daemon auth failures as unsuccessful HTTP calls', async () => {
  const server = http.createServer((_req, res) => {
    res.writeHead(503, { 'content-type': 'application/json' });
    res.end('{"error":"CHANNEL_DAEMON_API_TOKEN required"}');
  });
  const port = await listen(server);
  const loaded = loadCtl({ CHANNEL_DAEMON_PORT: String(port) });

  try {
    assert.equal(await loaded.ctl.httpGet('/stop'), null);
  } finally {
    loaded.restore();
    await close(server);
  }
});
