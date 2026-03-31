'use strict';

/**
 * webhook-simulator.cjs — Local webhook event simulator for testing.
 *
 * Generates synthetic GitHub webhook payloads for push, pull_request, and
 * issue_comment events, and optionally dispatches them through an EventBus.
 * No real GitHub App or outbound network calls are required.
 *
 * Usage:
 *   const { WebhookSimulator } = require('.claude/lib/github/webhook-simulator.cjs');
 *
 *   // With EventBus (dispatches events)
 *   const eventBus = require('.claude/lib/events/event-bus.cjs');
 *   const sim = new WebhookSimulator({ eventBus });
 *   const payload = await sim.simulate('push');
 *
 *   // Without EventBus (returns payload only)
 *   const sim = new WebhookSimulator();
 *   const payload = sim.createPayload('pull_request', { action: 'closed' });
 */

const { EventTypes } = require('../events/event-types.cjs');

// ---------------------------------------------------------------------------
// Supported event type → EventBus event type mapping
// ---------------------------------------------------------------------------

const WEBHOOK_TO_BUS_EVENT = {
  push: EventTypes.WEBHOOK_RECEIVED,
  pull_request: EventTypes.PR_EVENT,
  issue_comment: EventTypes.ISSUE_COMMENT,
};

const SUPPORTED_TYPES = Object.keys(WEBHOOK_TO_BUS_EVENT);

// ---------------------------------------------------------------------------
// Default payload generators
// ---------------------------------------------------------------------------

/**
 * Generate a default synthetic push payload.
 * @param {object} overrides - Fields to merge into the generated payload.
 * @returns {object}
 */
function generatePushPayload(overrides) {
  return {
    ref: 'refs/heads/main',
    commits: [
      {
        id: 'abc1234def5678abc1234def5678abc1234def56',
        message: 'chore: example commit',
        author: {
          name: 'Developer',
          email: 'developer@example.com',
        },
      },
    ],
    repository: {
      id: 1,
      name: 'example-repo',
      full_name: 'owner/example-repo',
    },
    ...overrides,
  };
}

/**
 * Generate a default synthetic pull_request payload.
 * @param {object} overrides - Fields to merge into the generated payload.
 * @returns {object}
 */
function generatePullRequestPayload(overrides) {
  return {
    action: 'opened',
    number: 1,
    pull_request: {
      title: 'Example Pull Request',
      body: 'This pull request demonstrates the webhook simulator.',
      diff_url: 'https://github.com/owner/example-repo/pull/1.diff',
    },
    ...overrides,
  };
}

/**
 * Generate a default synthetic issue_comment payload.
 * @param {object} overrides - Fields to merge into the generated payload.
 * @returns {object}
 */
function generateIssueCommentPayload(overrides) {
  return {
    action: 'created',
    issue: {
      number: 1,
    },
    comment: {
      body: 'This is a simulated issue comment.',
      user: {
        login: 'commenter',
      },
    },
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// WebhookSimulator class
// ---------------------------------------------------------------------------

class WebhookSimulator {
  /**
   * @param {object} [opts]
   * @param {object} [opts.eventBus] - EventBus instance for dispatching events.
   *   If omitted, simulate() returns the payload without dispatching.
   */
  constructor({ eventBus } = {}) {
    this._eventBus = eventBus || null;
  }

  /**
   * Generate a synthetic GitHub webhook payload for the given event type
   * without dispatching it through the EventBus.
   *
   * @param {string} eventType - Webhook event type: 'push', 'pull_request', or 'issue_comment'.
   * @param {object} [overrides={}] - Fields to merge/override in the generated payload.
   * @returns {object} Generated webhook payload.
   * @throws {Error} If the event type is not supported.
   */
  createPayload(eventType, overrides = {}) {
    switch (eventType) {
      case 'push':
        return generatePushPayload(overrides);
      case 'pull_request':
        return generatePullRequestPayload(overrides);
      case 'issue_comment':
        return generateIssueCommentPayload(overrides);
      default:
        throw new Error(
          `Unknown webhook event type: "${eventType}". ` +
            `Supported types: ${SUPPORTED_TYPES.join(', ')}`
        );
    }
  }

  /**
   * Generate a synthetic GitHub webhook payload and, if an EventBus was
   * provided, dispatch it through the bus.
   *
   * @param {string} eventType - Webhook event type: 'push', 'pull_request', or 'issue_comment'.
   * @param {object} [payload={}] - Fields to merge/override in the generated payload.
   * @returns {Promise<object>} The generated webhook payload.
   * @throws {Error} If the event type is not supported.
   */
  async simulate(eventType, payload = {}) {
    const generated = this.createPayload(eventType, payload);

    if (!this._eventBus) {
      return generated;
    }

    const busEventType = WEBHOOK_TO_BUS_EVENT[eventType];

    await this._eventBus.emit(busEventType, {
      type: busEventType,
      webhookType: eventType,
      ...generated,
    });

    return generated;
  }
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

module.exports = { WebhookSimulator };
