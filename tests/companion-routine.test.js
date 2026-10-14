import test from 'node:test';
import assert from 'node:assert/strict';
import { createCompanionRoutineController, getBeijingPeriod } from '../src/core/companion-routine.js';

const at = time => Date.parse(`2026-10-14T${time}:00+08:00`);
const create = () => createCompanionRoutineController({ random: () => 0 });
const advance = (controller, start, end, props = {}) => {
  let sample;
  for (let now = start; now <= end; now += 1000) sample = controller.sample({ now, ...props });
  return sample;
};

test('Beijing periods use the requested exact hour boundaries and original clips', () => {
  for (const [time, key, clip] of [
    ['00:00', 'sleep', 24], ['06:59', 'sleep', 24], ['07:00', 'morning', 7],
    ['09:59', 'morning', 7], ['10:00', 'focus', 22], ['11:59', 'focus', 22],
    ['12:00', 'lunch', 21], ['13:59', 'lunch', 21], ['14:00', 'focus', 22],
    ['18:59', 'focus', 22], ['19:00', 'affection', 6], ['22:59', 'affection', 6],
    ['23:00', 'sleep', 24], ['23:59', 'sleep', 24],
  ]) {
    const period = getBeijingPeriod(at(time));
    assert.equal(period.key, key, time);
    assert.equal(period.clip, clip, time);
    assert.equal(period.dateKey, '2026-10-14');
    assert.equal(period.timeLabel, time);
    assert.equal(typeof period.label, 'string');
    assert.ok(period.label.length > 0);
  }
});

test('Beijing time and midnight formatting do not follow the computer timezone', () => {
  const previous = process.env.TZ;
  try {
    for (const zone of ['UTC', 'America/New_York', 'Pacific/Honolulu']) {
      process.env.TZ = zone;
      assert.equal(getBeijingPeriod(Date.parse('2026-10-13T16:00:00Z')).timeLabel, '00:00');
      assert.equal(getBeijingPeriod(Date.parse('2026-10-13T16:00:00Z')).dateKey, '2026-10-14');
      assert.equal(getBeijingPeriod(Date.parse('2026-10-14T11:00:00Z')).key, 'affection');
    }
  } finally {
    if (previous === undefined) delete process.env.TZ;
    else process.env.TZ = previous;
  }
});

test('initial and repeated samples keep the same original clip and playback token', () => {
  const controller = create(), now = at('14:00');
  const first = controller.sample({ now });
  assert.equal(first.clip, 22); assert.equal(first.manual, false); assert.equal(first.speech, '');
  assert.equal(typeof first.token, 'number');
  const later = controller.sample({ now: now + 4000 });
  assert.equal(later.token, first.token); assert.equal(later.clip, first.clip); assert.equal(later.speech, '');
});

test('first warm greeting appears after eight active seconds and lasts six seconds', () => {
  const controller = create(), now = at('14:00');
  controller.sample({ now });
  assert.equal(controller.sample({ now: now + 7999 }).speech, '');
  const greeting = controller.sample({ now: now + 8000 });
  assert.ok(greeting.speech.length > 0);
  assert.equal(controller.sample({ now: now + 13999 }).speech, greeting.speech);
  assert.equal(controller.sample({ now: now + 14000 }).speech, '');
});

test('idle speech is occasional and does not repeat the preceding sentence', () => {
  const controller = create(), now = at('14:00');
  const first = advance(controller, now, now + 8000);
  assert.equal(advance(controller, now + 9000, now + 187000).speech, '');
  const second = controller.sample({ now: now + 188000 });
  assert.ok(second.speech.length > 0); assert.notEqual(second.speech, first.speech);
  assert.equal(second.token, first.token, 'idle speech must not restart the source animation');
});

test('the longest idle interval is five minutes', () => {
  const controller = createCompanionRoutineController({ random: () => 1 }), now = at('14:00');
  const first = advance(controller, now, now + 8000);
  assert.ok(first.speech);
  assert.equal(advance(controller, now + 9000, now + 307000).speech, '');
  assert.ok(controller.sample({ now: now + 308000 }).speech);
});

test('19:00 switches to the source hug and caring speech exactly once', () => {
  const controller = create();
  const before = controller.sample({ now: at('18:59') });
  const evening = controller.sample({ now: at('19:00') });
  assert.equal(evening.period.key, 'affection'); assert.equal(evening.clip, 6);
  assert.notEqual(evening.token, before.token); assert.ok(evening.speech);
  const later = controller.sample({ now: at('19:00') + 1000 });
  assert.equal(later.token, evening.token); assert.equal(later.speech, evening.speech);
});

test('a pause holds the presented source while time advances, then changes phase once', () => {
  const controller = create();
  const before = controller.sample({ now: at('18:59') });
  const paused = controller.sample({ now: at('19:05'), paused: true });
  assert.equal(paused.clip, before.clip); assert.equal(paused.token, before.token); assert.equal(paused.speech, '');
  const resumed = controller.sample({ now: at('19:06') });
  assert.equal(resumed.clip, 6); assert.notEqual(resumed.token, before.token); assert.ok(resumed.speech);
  assert.equal(controller.sample({ now: at('19:06') + 500 }).token, resumed.token);
});

test('speech and its remaining lifetime pause without catching up', () => {
  const controller = create(), now = at('14:00');
  controller.sample({ now });
  const spoken = controller.sample({ now: now + 8000 });
  assert.equal(controller.sample({ now: now + 9000, paused: true }).speech, '');
  assert.equal(controller.sample({ now: now + 60000, paused: true }).speech, '');
  assert.equal(controller.sample({ now: now + 61000 }).speech, spoken.speech);
  assert.equal(controller.sample({ now: now + 66999 }).speech, spoken.speech);
  assert.equal(controller.sample({ now: now + 67000 }).speech, '');
});

test('quiet menus hold automatic choices and defer speech until closed', () => {
  const controller = create();
  const before = controller.sample({ now: at('18:59') });
  assert.equal(controller.sample({ now: at('19:01'), quiet: true }).token, before.token);
  assert.equal(controller.sample({ now: at('19:02'), quiet: true }).speech, '');
  const after = controller.sample({ now: at('19:03') });
  assert.equal(after.clip, 6); assert.ok(after.speech); assert.notEqual(after.token, before.token);
});

test('manual selection holds for thirty active seconds before returning to the daily pose', () => {
  const controller = create(), now = at('14:00');
  const automatic = controller.sample({ now });
  const manual = controller.sample({ now: now + 1000, manualClip: 3, manualToken: now + 1000 });
  assert.equal(manual.clip, 3); assert.equal(manual.manual, true); assert.notEqual(manual.token, automatic.token);
  const pending = advance(controller, now + 2000, now + 30000, { manualClip: 3, manualToken: now + 1000 });
  assert.equal(pending.clip, 3); assert.equal(pending.token, manual.token);
  const returned = controller.sample({ now: now + 31000, manualClip: 3, manualToken: now + 1000 });
  assert.equal(returned.clip, 22); assert.equal(returned.manual, false); assert.notEqual(returned.token, manual.token);
});

test('manual hold pauses while a menu or pause is active', () => {
  const controller = create(), now = at('14:00'), props = { manualClip: 1, manualToken: now };
  const manual = controller.sample({ now, ...props });
  assert.equal(manual.manual, true);
  controller.sample({ now: now + 10000, ...props });
  controller.sample({ now: now + 11000, ...props, quiet: true });
  controller.sample({ now: now + 300000, ...props, quiet: true });
  assert.equal(controller.sample({ now: now + 301000, ...props }).token, manual.token);
  assert.equal(controller.sample({ now: now + 320999, ...props }).manual, true);
  assert.equal(controller.sample({ now: now + 321000, ...props }).manual, false);
});

test('another manual selection or a replay receives a new stable playback token', () => {
  const controller = create(), now = at('14:00');
  const first = controller.sample({ now, manualClip: 1, manualToken: now });
  const repeated = controller.sample({ now: now + 1000, manualClip: 1, manualToken: now + 1000 });
  assert.notEqual(repeated.token, first.token); assert.equal(repeated.clip, 1);
  const changed = controller.sample({ now: now + 2000, manualClip: 24, manualToken: now + 2000 });
  assert.notEqual(changed.token, repeated.token); assert.equal(changed.clip, 24);
});

test('a manual selection made while quiet is presented when the menu closes', () => {
  const controller = create(), now = at('14:00');
  const automatic = controller.sample({ now });
  const hidden = controller.sample({ now: now + 1000, manualClip: 4, manualToken: now + 1000, quiet: true });
  assert.equal(hidden.clip, automatic.clip); assert.equal(hidden.token, automatic.token);
  const shown = controller.sample({ now: now + 2000, manualClip: 4, manualToken: now + 1000 });
  assert.equal(shown.clip, 4); assert.equal(shown.manual, true); assert.notEqual(shown.token, automatic.token);
});

test('old saved manual timestamps do not override the Beijing pose', () => {
  const now = at('19:00');
  for (const manualToken of [0, now - 30001, now + 1000, NaN]) {
    const sample = create().sample({ now, manualClip: 2, manualToken });
    assert.equal(sample.clip, 6); assert.equal(sample.manual, false);
  }
  const saved = create();
  const recent = saved.sample({ now, manualClip: 2, manualToken: now - 20000 });
  assert.equal(recent.manual, true);
  assert.equal(saved.sample({ now: now + 9999, manualClip: 2, manualToken: now - 20000 }).manual, true);
  assert.equal(saved.sample({ now: now + 10000, manualClip: 2, manualToken: now - 20000 }).manual, false);
});

test('initial pause restores a recent manual choice and keeps its remaining hold for resume', () => {
  const controller = create(), now = at('19:00');
  const props = { manualClip: 7, manualToken: now - 20000 };
  const initial = controller.sample({ now, ...props, paused: true });
  assert.equal(initial.clip, 7); assert.equal(initial.manual, true); assert.equal(initial.speech, '');
  const stillPaused = controller.sample({ now: now + 600000, ...props, paused: true });
  assert.equal(stillPaused.token, initial.token); assert.equal(stillPaused.clip, 7);
  assert.equal(controller.sample({ now: now + 601000, ...props }).token, initial.token);
  assert.equal(controller.sample({ now: now + 610999, ...props }).manual, true);
  const automatic = controller.sample({ now: now + 611000, ...props });
  assert.equal(automatic.manual, false); assert.equal(automatic.clip, 6);
});

test('initial quiet presentation also restores the recent saved manual choice', () => {
  const controller = create(), now = at('19:00');
  const initial = controller.sample({ now, manualClip: 3, manualToken: now, quiet: true });
  assert.equal(initial.clip, 3); assert.equal(initial.manual, true); assert.equal(initial.speech, '');
  const resumed = controller.sample({ now: now + 1000, manualClip: 3, manualToken: now });
  assert.equal(resumed.token, initial.token); assert.equal(resumed.clip, 3);
});

test('night startup stays quiet and midnight does not replay the sleeping source', () => {
  const controller = create(), now = at('23:50');
  const first = controller.sample({ now });
  assert.equal(first.clip, 24); assert.equal(first.speech, '');
  const beforeMidnight = advance(controller, now + 1000, now + 599000);
  assert.equal(beforeMidnight.speech, '');
  const midnight = controller.sample({ now: at('00:00') + 86400000 });
  assert.equal(midnight.token, first.token); assert.equal(midnight.speech, '');
});

test('23:00 can offer one goodnight without ongoing nighttime reminders', () => {
  const controller = create();
  controller.sample({ now: at('22:59') });
  const goodnight = controller.sample({ now: at('23:00') });
  assert.equal(goodnight.clip, 24); assert.ok(goodnight.speech.includes('晚安'));
  const later = advance(controller, at('23:00') + 1000, at('23:20'));
  assert.equal(later.speech, ''); assert.equal(later.token, goodnight.token);
});

test('disabled speech remains silent, including phase changes', () => {
  const controller = create();
  controller.sample({ now: at('18:59'), enabled: false });
  assert.equal(controller.sample({ now: at('19:00'), enabled: false }).speech, '');
  assert.equal(advance(controller, at('19:00') + 1000, at('19:10'), { enabled: false }).speech, '');
});

test('a backward wall clock does not lengthen a greeting or restart the source', () => {
  const controller = create(), now = at('14:00');
  controller.sample({ now });
  const spoken = controller.sample({ now: now + 8000 });
  assert.ok(spoken.speech);
  const backward = controller.sample({ now: now + 3000 });
  assert.equal(backward.speech, spoken.speech); assert.equal(backward.token, spoken.token);
  assert.equal(controller.sample({ now: now + 14000 }).speech, '');
});

test('a long wall clock jump generates at most one cue and clamps active time to thirty seconds', () => {
  const controller = create(), now = at('14:00');
  const first = controller.sample({ now });
  const jump = controller.sample({ now: now + 3600000 });
  assert.ok(jump.speech); assert.equal(jump.token, first.token);
  assert.equal(controller.sample({ now: now + 3600001 }).speech, jump.speech);
  assert.equal(controller.sample({ now: now + 3606000 }).speech, '');
});

test('a new daypart waits for a manual animation, then appears with one caring cue', () => {
  const controller = create(), now = at('18:59') + 50000;
  const manual = controller.sample({ now, manualClip: 4, manualToken: now });
  const stillManual = controller.sample({ now: now + 10000, manualClip: 4, manualToken: now });
  assert.equal(stillManual.clip, 4); assert.equal(stillManual.token, manual.token); assert.equal(stillManual.speech, '');
  const automatic = controller.sample({ now: now + 30000, manualClip: 4, manualToken: now });
  assert.equal(automatic.clip, 6); assert.equal(automatic.manual, false); assert.ok(automatic.speech);
  assert.equal(controller.sample({ now: now + 31000, manualClip: 4, manualToken: now }).token, automatic.token);
});

test('opening a picker delays the first greeting rather than consuming its countdown', () => {
  const controller = create(), now = at('14:00');
  controller.sample({ now });
  controller.sample({ now: now + 4000 });
  controller.sample({ now: now + 5000, quiet: true });
  controller.sample({ now: now + 60000, quiet: true });
  assert.equal(controller.sample({ now: now + 61000 }).speech, '');
  assert.equal(controller.sample({ now: now + 64999 }).speech, '');
  assert.ok(controller.sample({ now: now + 65000 }).speech);
});

test('invalid clips cannot replace a valid scheduled original animation', () => {
  const now = at('19:00');
  for (const manualClip of [0, 25, 1.5, '2']) {
    const controller = create();
    const original = controller.sample({ now });
    const ignored = controller.sample({ now: now + 1000, manualClip, manualToken: now + 1000 });
    assert.equal(ignored.clip, 6); assert.equal(ignored.token, original.token); assert.equal(ignored.manual, false);
  }
});

test('a backward clock shows the actual Beijing time and changes to that period once', () => {
  const controller = create();
  const evening = controller.sample({ now: at('19:00') });
  const backward = controller.sample({ now: at('18:00') });
  assert.equal(backward.period.timeLabel, '18:00'); assert.equal(backward.period.key, 'focus');
  assert.equal(backward.clip, 22); assert.notEqual(backward.token, evening.token);
  assert.equal(controller.sample({ now: at('18:00') + 1000 }).token, backward.token);
  const forward = controller.sample({ now: at('19:00') + 1000 });
  assert.equal(forward.clip, 6); assert.notEqual(forward.token, backward.token);
  assert.equal(controller.sample({ now: at('19:00') + 2000 }).token, forward.token);
});
