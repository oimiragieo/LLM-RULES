/**
 * Shared Logger Utility
 * =====================
 *
 * Standardized JSON logging for the .claude runtime ecosystem.
 * Output: JSONL to stdout (info/debug) and stderr (warn/error/fatal).
 */

'use strict';

const LEVELS = {
    debug: 10,
    info: 20,
    warn: 30,
    error: 40,
    fatal: 50,
};

// Default level: info
const CURRENT_LEVEL = LEVELS[process.env.LOG_LEVEL || 'info'] || LEVELS.info;

function format(level, message, meta = {}, component = 'unknown') {
    return JSON.stringify({
        timestamp: new Date().toISOString(),
        level,
        message,
        component,
        ...meta,
    });
}

function log(levelName, message, meta, component) {
    const levelScore = LEVELS[levelName];
    if (levelScore < CURRENT_LEVEL) return;

    const output = format(levelName, message, meta, component);

    if (levelScore >= LEVELS.warn) {
        console.error(output);
    } else {
        console.log(output);
    }
}

class Logger {
    constructor(component) {
        this.component = component;
    }

    debug(message, meta = {}) {
        log('debug', message, meta, this.component);
    }

    info(message, meta = {}) {
        log('info', message, meta, this.component);
    }

    warn(message, meta = {}) {
        log('warn', message, meta, this.component);
    }

    error(message, meta = {}) {
        log('error', message, meta, this.component);
    }

    fatal(message, meta = {}) {
        log('fatal', message, meta, this.component);
    }
}

module.exports = {
    Logger,
    createLogger: (component) => new Logger(component),
};
