'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const { WebhookSimulator } = require('../../.claude/lib/github/webhook-simulator.cjs');
const { EventTypes } = require('../../.claude/lib/events/event-types.cjs');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Create a lightweight mock EventBus that records emitted events.
 */
function createMockBus() {
  const emitted = [];
  return {
    emitted,
    async emit(eventType, payload) {
      emitted.push({ eventType, payload });
    },
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('WebhookSimulator', () => {
  // -------------------------------------------------------------------------
  // Constructor
  // -------------------------------------------------------------------------
  describe('constructor', () => {
    it('instantiates without arguments', () => {
      assert.doesNotThrow(() => new WebhookSimulator());
    });

    it('instantiates with an eventBus option', () => {
      const bus = createMockBus();
      assert.doesNotThrow(() => new WebhookSimulator({ eventBus: bus }));
    });
  });

  // -------------------------------------------------------------------------
  // createPayload — push
  // -------------------------------------------------------------------------
  describe('createPayload (push)', () => {
    it('returns an object with ref, commits, and repository fields', () => {
      const sim = new WebhookSimulator();
      const payload = sim.createPayload('push');

      assert.ok(typeof payload === 'object' && payload !== null, 'payload must be an object');
      assert.ok('ref' in payload, 'payload must have ref');
      assert.ok(Array.isArray(payload.commits), 'payload.commits must be an array');
      assert.ok(payload.commits.length > 0, 'payload.commits must be non-empty');
      assert.ok(
        typeof payload.repository === 'object' && payload.repository !== null,
        'payload.repository must be an object'
      );
    });

    it('commits array contains commit objects', () => {
      const sim = new WebhookSimulator();
      const payload = sim.createPayload('push');

      const commit = payload.commits[0];
      assert.ok(typeof commit === 'object' && commit !== null, 'commit must be an object');
    });

    it('merges overrides into the payload', () => {
      const sim = new WebhookSimulator();
      const payload = sim.createPayload('push', { ref: 'refs/heads/feature-x' });

      assert.equal(payload.ref, 'refs/heads/feature-x', 'override ref must be applied');
    });

    it('does not dispatch through EventBus', () => {
      const bus = createMockBus();
      const sim = new WebhookSimulator({ eventBus: bus });
      sim.createPayload('push');

      assert.equal(bus.emitted.length, 0, 'createPayload must not dispatch events');
    });
  });

  // -------------------------------------------------------------------------
  // createPayload — pull_request
  // -------------------------------------------------------------------------
  describe('createPayload (pull_request)', () => {
    it('returns an object with action, number, and pull_request fields', () => {
      const sim = new WebhookSimulator();
      const payload = sim.createPayload('pull_request');

      assert.ok(typeof payload === 'object' && payload !== null);
      assert.ok('action' in payload, 'payload must have action');
      assert.ok('number' in payload, 'payload must have number');
      assert.ok(
        typeof payload.pull_request === 'object' && payload.pull_request !== null,
        'payload.pull_request must be an object'
      );
    });

    it('pull_request object has title, body, and diff_url', () => {
      const sim = new WebhookSimulator();
      const { pull_request } = sim.createPayload('pull_request');

      assert.ok('title' in pull_request, 'pull_request must have title');
      assert.ok('body' in pull_request, 'pull_request must have body');
      assert.ok('diff_url' in pull_request, 'pull_request must have diff_url');
    });

    it('merges overrides into the payload', () => {
      const sim = new WebhookSimulator();
      const payload = sim.createPayload('pull_request', { action: 'closed', number: 42 });

      assert.equal(payload.action, 'closed');
      assert.equal(payload.number, 42);
    });
  });

  // -------------------------------------------------------------------------
  // createPayload — issue_comment
  // -------------------------------------------------------------------------
  describe('createPayload (issue_comment)', () => {
    it('returns an object with action, issue, and comment fields', () => {
      const sim = new WebhookSimulator();
      const payload = sim.createPayload('issue_comment');

      assert.ok(typeof payload === 'object' && payload !== null);
      assert.ok('action' in payload, 'payload must have action');
      assert.ok(
        typeof payload.issue === 'object' && payload.issue !== null,
        'payload.issue must be an object'
      );
      assert.ok(
        typeof payload.comment === 'object' && payload.comment !== null,
        'payload.comment must be an object'
      );
    });

    it('issue has a number field', () => {
      const sim = new WebhookSimulator();
      const { issue } = sim.createPayload('issue_comment');

      assert.ok('number' in issue, 'issue must have number');
      assert.ok(typeof issue.number === 'number', 'issue.number must be a number');
    });

    it('comment has body and user with login', () => {
      const sim = new WebhookSimulator();
      const { comment } = sim.createPayload('issue_comment');

      assert.ok('body' in comment, 'comment must have body');
      assert.ok(
        typeof comment.user === 'object' && comment.user !== null,
        'comment.user must be an object'
      );
      assert.ok('login' in comment.user, 'comment.user must have login');
    });

    it('merges overrides into the payload', () => {
      const sim = new WebhookSimulator();
      const payload = sim.createPayload('issue_comment', { action: 'edited' });

      assert.equal(payload.action, 'edited');
    });
  });

  // -------------------------------------------------------------------------
  // createPayload — unknown event type
  // -------------------------------------------------------------------------
  describe('createPayload (unknown event type)', () => {
    it('throws a descriptive error for unknown event types', () => {
      const sim = new WebhookSimulator();
      assert.throws(
        () => sim.createPayload('unknown_event'),
        err => {
          assert.ok(err instanceof Error, 'must throw an Error instance');
          assert.ok(
            err.message.includes('unknown_event'),
            'error message must include the unknown event type name'
          );
          return true;
        }
      );
    });

    it('error message mentions supported types', () => {
      const sim = new WebhookSimulator();
      let thrown;
      try {
        sim.createPayload('bad_event');
      } catch (err) {
        thrown = err;
      }
      assert.ok(thrown, 'should throw');
      // Message should hint at supported types
      const msg = thrown.message.toLowerCase();
      assert.ok(
        msg.includes('push') || msg.includes('pull_request') || msg.includes('issue_comment'),
        'error message should mention supported event types'
      );
    });
  });

  // -------------------------------------------------------------------------
  // simulate — without EventBus
  // -------------------------------------------------------------------------
  describe('simulate (no EventBus)', () => {
    it('returns the generated payload when no EventBus is provided', async () => {
      const sim = new WebhookSimulator();
      const result = await sim.simulate('push');

      assert.ok(typeof result === 'object' && result !== null, 'must return an object');
      assert.ok('ref' in result, 'returned payload must have ref for push event');
      assert.ok(Array.isArray(result.commits), 'returned payload must have commits');
      assert.ok('repository' in result, 'returned payload must have repository');
    });

    it('returns pull_request payload when no EventBus provided', async () => {
      const sim = new WebhookSimulator();
      const result = await sim.simulate('pull_request');

      assert.ok('action' in result);
      assert.ok('pull_request' in result);
    });

    it('returns issue_comment payload when no EventBus provided', async () => {
      const sim = new WebhookSimulator();
      const result = await sim.simulate('issue_comment');

      assert.ok('issue' in result);
      assert.ok('comment' in result);
    });

    it('applies payload overrides when no EventBus provided', async () => {
      const sim = new WebhookSimulator();
      const result = await sim.simulate('push', { ref: 'refs/heads/test' });

      assert.equal(result.ref, 'refs/heads/test');
    });
  });

  // -------------------------------------------------------------------------
  // simulate — with EventBus
  // -------------------------------------------------------------------------
  describe('simulate (with EventBus)', () => {
    it('dispatches an event through EventBus for push', async () => {
      const bus = createMockBus();
      const sim = new WebhookSimulator({ eventBus: bus });

      await sim.simulate('push');

      assert.equal(bus.emitted.length, 1, 'exactly one event should be emitted');
    });

    it('dispatches WEBHOOK_RECEIVED event type for push', async () => {
      const bus = createMockBus();
      const sim = new WebhookSimulator({ eventBus: bus });

      await sim.simulate('push');

      assert.equal(bus.emitted[0].eventType, EventTypes.WEBHOOK_RECEIVED);
    });

    it('dispatches PR_EVENT event type for pull_request', async () => {
      const bus = createMockBus();
      const sim = new WebhookSimulator({ eventBus: bus });

      await sim.simulate('pull_request');

      assert.equal(bus.emitted.length, 1);
      assert.equal(bus.emitted[0].eventType, EventTypes.PR_EVENT);
    });

    it('dispatches ISSUE_COMMENT event type for issue_comment', async () => {
      const bus = createMockBus();
      const sim = new WebhookSimulator({ eventBus: bus });

      await sim.simulate('issue_comment');

      assert.equal(bus.emitted.length, 1);
      assert.equal(bus.emitted[0].eventType, EventTypes.ISSUE_COMMENT);
    });

    it('returns the generated payload after dispatching', async () => {
      const bus = createMockBus();
      const sim = new WebhookSimulator({ eventBus: bus });

      const result = await sim.simulate('push');

      assert.ok(typeof result === 'object' && result !== null, 'must return the generated payload');
      assert.ok('ref' in result, 'returned payload must have ref');
      assert.ok(Array.isArray(result.commits), 'returned payload must have commits');
    });

    it('dispatched payload includes type field for EventBus validation', async () => {
      const bus = createMockBus();
      const sim = new WebhookSimulator({ eventBus: bus });

      await sim.simulate('push');

      const emittedPayload = bus.emitted[0].payload;
      assert.ok('type' in emittedPayload, 'dispatched payload must include type field');
    });

    it('applies overrides when dispatching', async () => {
      const bus = createMockBus();
      const sim = new WebhookSimulator({ eventBus: bus });

      await sim.simulate('push', { ref: 'refs/heads/feature-123' });

      const emittedPayload = bus.emitted[0].payload;
      assert.equal(emittedPayload.ref, 'refs/heads/feature-123');
    });

    it('dispatches issue_comment with correct structure in payload', async () => {
      const bus = createMockBus();
      const sim = new WebhookSimulator({ eventBus: bus });

      await sim.simulate('issue_comment');

      const emittedPayload = bus.emitted[0].payload;
      assert.ok('issue' in emittedPayload);
      assert.ok('comment' in emittedPayload);
    });
  });

  // -------------------------------------------------------------------------
  // simulate — unknown event type
  // -------------------------------------------------------------------------
  describe('simulate (unknown event type)', () => {
    it('throws for unknown event type', async () => {
      const sim = new WebhookSimulator();
      await assert.rejects(
        () => sim.simulate('bad_event'),
        err => {
          assert.ok(err instanceof Error);
          assert.ok(err.message.includes('bad_event'));
          return true;
        }
      );
    });

    it('throws even when EventBus is provided', async () => {
      const bus = createMockBus();
      const sim = new WebhookSimulator({ eventBus: bus });
      await assert.rejects(
        () => sim.simulate('totally_unknown'),
        err => {
          assert.ok(err instanceof Error);
          return true;
        }
      );
      // No events should be dispatched
      assert.equal(bus.emitted.length, 0);
    });
  });

  // -------------------------------------------------------------------------
  // Event type constants
  // -------------------------------------------------------------------------
  describe('EventTypes constants', () => {
    it('WEBHOOK_RECEIVED is defined in EventTypes', () => {
      assert.ok('WEBHOOK_RECEIVED' in EventTypes, 'EventTypes must include WEBHOOK_RECEIVED');
      assert.equal(EventTypes.WEBHOOK_RECEIVED, 'WEBHOOK_RECEIVED');
    });

    it('PR_EVENT is defined in EventTypes', () => {
      assert.ok('PR_EVENT' in EventTypes, 'EventTypes must include PR_EVENT');
      assert.equal(EventTypes.PR_EVENT, 'PR_EVENT');
    });

    it('ISSUE_COMMENT is defined in EventTypes', () => {
      assert.ok('ISSUE_COMMENT' in EventTypes, 'EventTypes must include ISSUE_COMMENT');
      assert.equal(EventTypes.ISSUE_COMMENT, 'ISSUE_COMMENT');
    });
  });
});
