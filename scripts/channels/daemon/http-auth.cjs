'use strict';

const PROTECTED_PATHS = new Set([
  '/event',
  '/api/event',
  '/send',
  '/api/send',
  '/dream',
  '/api/dream',
  '/stop',
  '/api/stop',
]);

function normalizePathname(pathname) {
  return String(pathname || '').replace(/\/+$/, '') || '/';
}

function isProtectedDaemonRoute(_method, pathname) {
  const normalized = normalizePathname(pathname);
  return PROTECTED_PATHS.has(normalized) || normalized === '/webhook' || normalized.startsWith('/webhook/');
}

function getDaemonApiToken(env = process.env) {
  return String(env.CHANNEL_DAEMON_API_TOKEN || env.CHANNEL_DAEMON_TOKEN || '').trim();
}

function getBearerToken(req) {
  const raw = req?.headers?.authorization || req?.headers?.Authorization || '';
  const match = String(raw).match(/^Bearer\s+(.+)$/i);
  return match ? match[1].trim() : '';
}

function isAuthorizedDaemonRequest(req, options = {}) {
  const method = options.method || req?.method || 'GET';
  const pathname = options.pathname || '/';
  if (!isProtectedDaemonRoute(method, pathname)) return true;

  const token = String(options.token ?? getDaemonApiToken()).trim();
  if (!token) return false;

  return getBearerToken(req) === token;
}

function writeDaemonAuthFailure(res, options = {}) {
  const hasToken = Boolean(String(options.token || '').trim());
  res.statusCode = hasToken ? 401 : 503;
  res.end(
    JSON.stringify({
      error: hasToken ? 'unauthorized' : 'CHANNEL_DAEMON_API_TOKEN required',
    })
  );
}

module.exports = {
  getDaemonApiToken,
  getBearerToken,
  isProtectedDaemonRoute,
  isAuthorizedDaemonRequest,
  writeDaemonAuthFailure,
};
