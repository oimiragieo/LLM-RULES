/**
 * router.cjs — Event router
 *
 * Matches events to routes using glob-style patterns.
 * Like clawhip's router.rs — event type + filters → handler + sink.
 */
'use strict';

class Router {
  constructor(routes) {
    this.routes = routes || [];
  }

  /**
   * Find matching routes for an event.
   * Pattern matching: "telegram.*" matches "telegram.message"
   * Filter matching: { user: "john" } matches event.data.user === "john"
   */
  resolve(event) {
    const matches = [];
    for (const route of this.routes) {
      if (!this._matchPattern(route.event, event.type)) continue;
      if (route.filter && !this._matchFilter(route.filter, event.data)) continue;
      matches.push(route);
    }
    // Default route: if nothing matches, use claude + same-source sink
    if (matches.length === 0) {
      matches.push({ event: '*', handler: 'claude', sink: event.source });
    }
    return matches;
  }

  _matchPattern(pattern, eventType) {
    if (pattern === '*') return true;
    if (pattern === eventType) return true;
    // Glob: "telegram.*" matches "telegram.message"
    if (pattern.endsWith('.*')) {
      const prefix = pattern.slice(0, -2);
      return eventType.startsWith(prefix + '.');
    }
    return false;
  }

  _matchFilter(filter, data) {
    for (const [key, value] of Object.entries(filter)) {
      if (data[key] !== value) return false;
    }
    return true;
  }
}

module.exports = { Router };
