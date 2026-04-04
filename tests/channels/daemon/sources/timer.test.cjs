'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { TimerSource } = require('../../../../scripts/channels/daemon/sources/timer.cjs');

describe('TimerSource', () => {
  it('module loads without error', () => {
    assert.ok(TimerSource);
  });

  it('constructor accepts config with schedules', () => {
    const source = new TimerSource({
      schedules: [{ name: 'test', cron: '0 9 * * *', prompt: 'hello' }],
      tickIntervalMs: 1000,
    }, () => {});
    assert.equal(source.schedules.length, 1);
    assert.equal(source.running, false);
  });

  it('_matchesCron matches exact hour:minute', () => {
    const source = new TimerSource({ schedules: [] }, () => {});
    assert.equal(source._matchesCron('30 9 * * *', 9, 30, 1), true);
    assert.equal(source._matchesCron('30 9 * * *', 9, 31, 1), false);
    assert.equal(source._matchesCron('30 9 * * *', 10, 30, 1), false);
  });

  it('_matchesCron matches wildcard', () => {
    const source = new TimerSource({ schedules: [] }, () => {});
    assert.equal(source._matchesCron('* * * * *', 14, 30, 3), true);
    assert.equal(source._matchesCron('0 * * * *', 14, 0, 3), true);
    assert.equal(source._matchesCron('0 * * * *', 14, 1, 3), false);
  });

  it('_matchesCron matches day-of-week range (1-5 = Mon-Fri)', () => {
    const source = new TimerSource({ schedules: [] }, () => {});
    assert.equal(source._matchesCron('0 9 * * 1-5', 9, 0, 1), true);  // Monday
    assert.equal(source._matchesCron('0 9 * * 1-5', 9, 0, 5), true);  // Friday
    assert.equal(source._matchesCron('0 9 * * 1-5', 9, 0, 0), false); // Sunday
    assert.equal(source._matchesCron('0 9 * * 1-5', 9, 0, 6), false); // Saturday
  });

  it('_matchesCron handles step intervals', () => {
    const source = new TimerSource({ schedules: [] }, () => {});
    assert.equal(source._matchesCron('*/5 * * * *', 10, 0, 1), true);
    assert.equal(source._matchesCron('*/5 * * * *', 10, 5, 1), true);
    assert.equal(source._matchesCron('*/5 * * * *', 10, 3, 1), false);
  });

  it('fires dispatch when cron matches', (t, done) => {
    const now = new Date();
    const dispatched = [];
    const source = new TimerSource({
      schedules: [{
        name: 'test-fire',
        cron: `${now.getMinutes()} ${now.getHours()} * * *`,
        prompt: 'test prompt',
        chatIds: ['123'],
      }],
      tickIntervalMs: 100,
    }, (event) => dispatched.push(event), () => Infinity); // Infinity = very idle

    source.start();
    setTimeout(() => {
      source.stop();
      assert.ok(dispatched.length >= 1, 'Should have dispatched at least once');
      assert.equal(dispatched[0].type, 'timer.test-fire');
      assert.equal(dispatched[0].data.prompt, 'test prompt');
      done();
    }, 300);
  });

  it('does not fire when user is active (<5min idle)', (t, done) => {
    const now = new Date();
    const dispatched = [];
    const source = new TimerSource({
      schedules: [{
        name: 'test-suppress',
        cron: `${now.getMinutes()} ${now.getHours()} * * *`,
        prompt: 'should not fire',
      }],
      tickIntervalMs: 100,
    }, (event) => dispatched.push(event), () => 60000); // 1 min idle — too active

    source.start();
    setTimeout(() => {
      source.stop();
      assert.equal(dispatched.length, 0, 'Should NOT have dispatched — user is active');
      done();
    }, 300);
  });

  it('deduplicates — fires only once per schedule per day', (t, done) => {
    const now = new Date();
    const dispatched = [];
    const source = new TimerSource({
      schedules: [{
        name: 'test-dedup',
        cron: `${now.getMinutes()} ${now.getHours()} * * *`,
        prompt: 'dedup test',
      }],
      tickIntervalMs: 50,
    }, (event) => dispatched.push(event), () => Infinity);

    source.start();
    setTimeout(() => {
      source.stop();
      assert.equal(dispatched.length, 1, 'Should fire exactly once (deduped)');
      done();
    }, 300);
  });

  it('stop() clears timer', () => {
    const source = new TimerSource({ schedules: [], tickIntervalMs: 100 }, () => {});
    source.start();
    assert.equal(source.running, true);
    source.stop();
    assert.equal(source.running, false);
    assert.equal(source.timer, null);
  });
});
