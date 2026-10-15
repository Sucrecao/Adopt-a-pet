import test from 'node:test';
import assert from 'node:assert/strict';
import { createStandReminderController, STAND_REMINDER_INTERVAL, STAND_REMINDER_DURATION } from '../src/core/stand-reminder.js';
import { createState, normalizeState, transition } from '../src/core/state.js';

function clock() {
  const controller = createStandReminderController();
  let now = 0;
  controller.sample({ now, enabled: true, available: true });
  return { controller, get now() { return now; },
    tick(ms = 1000, options = {}) { now += ms; return controller.sample({ now, enabled: true, available: true, ...options }); },
    advance(ms, options = {}) { let cue; while (ms > 0) { const step = Math.min(ms, 1000); cue = this.tick(step, options); ms -= step; } return cue; } };
}

test('stand reminder is opt-out, persists only a boolean setting and accepts no non-boolean patch', () => {
  assert.equal(createState(0).settings.standReminder, true);
  assert.equal(normalizeState({ settings: { standReminder: false } }, 0).settings.standReminder, false);
  assert.equal(normalizeState({ settings: { standReminder: 'false' }, standReminder: { id: 1 } }, 0).settings.standReminder, true);
  const disabled = transition(createState(0), { type: 'settings', patch: { standReminder: false } }, 0);
  assert.equal(normalizeState(JSON.parse(JSON.stringify(disabled)), 0).settings.standReminder, false);
  assert.equal(Object.hasOwn(disabled, 'standReminder'), false);
  assert.throws(() => transition(disabled, { type: 'settings', patch: { standReminder: 'yes' } }, 0));
});

test('one pending cue appears after exactly thirty active minutes and waits for presentation', () => {
  const timer = clock();
  assert.equal(STAND_REMINDER_INTERVAL, 30 * 60 * 1000);
  assert.equal(timer.advance(STAND_REMINDER_INTERVAL - 1), null);
  const pending = timer.tick(1);
  assert.equal(pending.phase, 'pending');
  assert.ok(Number.isSafeInteger(pending.id) && pending.id > 0);
  assert.match(pending.text, /站/);
  assert.equal(Object.hasOwn(pending, 'until'), false);
  assert.deepEqual(timer.advance(STAND_REMINDER_INTERVAL * 2), pending, 'a waiting cue never stacks or expires');
});

test('presented cue lasts twelve seconds, may be dismissed, and stale ids never alter another cue', () => {
  const timer = clock(), pending = timer.advance(STAND_REMINDER_INTERVAL);
  assert.deepEqual(timer.controller.present(pending.id + 1, timer.now), pending);
  const visible = timer.controller.present(pending.id, timer.now);
  assert.equal(STAND_REMINDER_DURATION, 12000);
  assert.deepEqual(visible, { ...pending, phase: 'visible', until: timer.now + 12000 });
  assert.deepEqual(timer.controller.present(pending.id, timer.now + 1000), visible, 'repeated present cannot extend the cue');
  assert.deepEqual(timer.controller.dismiss(pending.id + 1), visible);
  assert.equal(timer.advance(11999).phase, 'visible');
  assert.equal(timer.tick(1), null);
  const next = timer.advance(STAND_REMINDER_INTERVAL - 12000);
  assert.ok(next.id > pending.id);
  assert.deepEqual(timer.controller.dismiss(pending.id), next);
  assert.equal(timer.controller.dismiss(next.id), null);
});

for (const reason of ['disabled', 'paused', 'hidden', 'sleep']) {
  test(`${reason} clears a cue and resumes with a complete thirty minute interval`, () => {
    const timer = clock(), pending = timer.advance(STAND_REMINDER_INTERVAL);
    timer.controller.present(pending.id, timer.now);
    assert.equal(timer.tick(1000, reason === 'disabled' ? { enabled: false } : { available: false }), null);
    assert.equal(timer.tick(1000), null, 'resume only establishes a new baseline');
    assert.equal(timer.advance(STAND_REMINDER_INTERVAL - 1), null);
    const next = timer.tick(1);
    assert.equal(next.phase, 'pending');
    assert.ok(next.id > pending.id, 'old acknowledgements cannot dismiss a later cue');
  });
}

test('suspend, long timer gaps, backward clock changes and invalid timestamps cannot send a backlog', () => {
  const timer = clock();
  timer.advance(STAND_REMINDER_INTERVAL - 1000);
  assert.equal(timer.tick(3600000), null);
  assert.equal(timer.tick(1000), null, 'the first resumed sample establishes a fresh baseline');
  assert.equal(timer.advance(STAND_REMINDER_INTERVAL - 1), null);
  assert.equal(timer.tick(1).phase, 'pending');
  timer.controller.reset(timer.now);
  assert.equal(timer.tick(1), null);
  assert.equal(timer.advance(STAND_REMINDER_INTERVAL - 1), null);
  assert.equal(timer.tick(1).phase, 'pending');
  assert.equal(timer.controller.sample({ now: NaN, enabled: true, available: true }), null);
  assert.equal(timer.controller.sample({ now: timer.now - 10, enabled: true, available: true }), null);
});

test('callers receive immutable snapshots rather than access to the timer cue', () => {
  const timer = clock(), pending = timer.advance(STAND_REMINDER_INTERVAL);
  pending.phase = 'visible'; pending.id = 999;
  assert.equal(timer.tick().phase, 'pending');
  assert.notEqual(timer.tick().id, 999);
});
