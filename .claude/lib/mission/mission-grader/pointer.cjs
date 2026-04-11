// Agent: code-simplifier | Task: #37 | Session: 2026-04-10
'use strict';

// ---------------------------------------------------------------------------
// JSON Pointer (RFC 6901) resolver
// ---------------------------------------------------------------------------

function resolvePointer(obj, pointer) {
  if (!pointer || pointer === '') return obj;
  const parts = pointer.replace(/^\//, '').split('/');
  let current = obj;
  for (const part of parts) {
    const decoded = part.replace(/~1/g, '/').replace(/~0/g, '~');
    if (current == null || typeof current !== 'object') return undefined;
    current = current[decoded];
  }
  return current;
}

module.exports = { resolvePointer };
