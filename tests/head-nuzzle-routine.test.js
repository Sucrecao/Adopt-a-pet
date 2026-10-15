import test from 'node:test';
import assert from 'node:assert/strict';
import { createCompanionRoutineController } from '../src/core/companion-routine.js';

const at = time => Date.parse(`2026-10-15T${time}:00+08:00`);
const create = () => createCompanionRoutineController({ random: () => 0 });
const cue = (sample, gestureId = 1) => ({ clip: sample.clip, token: sample.token, gestureId, direction: 1 });
const done = sample => ({ clip: sample.clip, token: sample.token });

test('touching a relaxed head replays the existing relaxed source without raising its head position', () => {
  const controller = create(), now = at('14:00');
  const idle = controller.sample({ now, playbackAware: true });
  const nuzzle = controller.sample({ now: now + 1000, playbackAware: true, headCue: cue(idle) });
  assert.equal(nuzzle.headNuzzle, true); assert.equal(nuzzle.clip, 22); assert.equal(nuzzle.manual, false);
  assert.notEqual(nuzzle.token, idle.token); assert.equal(nuzzle.speech, '蹭蹭～最喜欢你摸摸头啦。');
});

test('touching an upright head chooses the original paw-rubbing source', () => {
  const controller = create(), now = at('08:00');
  const wave = controller.sample({ now });
  const nuzzle = controller.sample({ now: now + 1000, headCue: cue(wave) });
  assert.equal(nuzzle.headNuzzle, true); assert.equal(nuzzle.clip, 16);
});

test('head speech lasts 3.2 active seconds and does not postpone the original eight second greeting', () => {
  const controller = create(), now = at('14:00');
  const idle = controller.sample({ now });
  const nuzzle = controller.sample({ now: now + 1000, headCue: cue(idle) });
  assert.equal(nuzzle.speech, '蹭蹭～最喜欢你摸摸头啦。');
  assert.equal(controller.sample({ now: now + 4199 }).speech, nuzzle.speech);
  assert.equal(controller.sample({ now: now + 4200 }).speech, '');
  assert.equal(controller.sample({ now: now + 7999 }).speech, '');
  assert.equal(controller.sample({ now: now + 8000 }).speech, '喝口水吧，我在这里陪你。');
});

test('stale head packets and a repeated gesture cannot replay a newly presented source', () => {
  const controller = create(), now = at('14:00');
  const idle = controller.sample({ now });
  for (const invalid of [{ ...cue(idle), clip: 7 }, { ...cue(idle), token: idle.token - 1 }]) {
    const ignored = controller.sample({ now: now + 100, headCue: invalid });
    assert.equal(ignored.token, idle.token); assert.equal(ignored.headNuzzle, false);
  }
  const nuzzle = controller.sample({ now: now + 1000, headCue: cue(idle, 2) });
  const duplicate = controller.sample({ now: now + 5000, headCue: cue(nuzzle, 2) });
  assert.equal(duplicate.token, nuzzle.token); assert.equal(duplicate.speech, '');
});

test('a delayed older gesture cannot replay a newer head gesture', () => {
  const controller = create(), now = at('14:00');
  const idle = controller.sample({ now });
  const first = controller.sample({ now: now + 1000, headCue: cue(idle, 1) });
  const second = controller.sample({ now: now + 12000, headCue: cue(first, 2) });
  const delayed = controller.sample({ now: now + 13000, headCue: cue(second, 1) });
  assert.equal(delayed.token, second.token);
});

test('paused, quiet, disabled, and night head cues are consumed without being queued', () => {
  for (const block of [{ paused: true }, { quiet: true }, { enabled: false }]) {
    const controller = create(), now = at('14:00');
    const idle = controller.sample({ now });
    const headCue = cue(idle);
    assert.equal(controller.sample({ now: now + 1000, ...block, headCue }).headNuzzle, false);
    assert.equal(controller.sample({ now: now + 2000, headCue }).token, idle.token);
  }
  const controller = create(), now = at('23:10'), sleep = controller.sample({ now });
  const held = controller.sample({ now: now + 1000, headCue: cue(sleep) });
  assert.equal(held.token, sleep.token); assert.equal(held.headNuzzle, false); assert.equal(held.speech, '');
});

test('a new manual selection wins over a matching head cue in the same sample', () => {
  const controller = create(), now = at('14:00');
  const idle = controller.sample({ now });
  const manual = controller.sample({ now: now + 1000, manualClip: 3, manualToken: now + 1000, headCue: cue(idle) });
  assert.equal(manual.clip, 3); assert.equal(manual.manual, true); assert.equal(manual.headNuzzle, false); assert.equal(manual.speech, '');
});

test('source 16 picked manually and scenes with props never become head nuzzles', () => {
  for (const [time, manualClip] of [['14:00', 16], ['19:00', undefined], ['12:00', undefined]]) {
    const controller = create(), now = at(time);
    const source = controller.sample({ now, ...(manualClip ? { manualClip, manualToken: now } : {}) });
    const ignored = controller.sample({ now: now + 1000, headCue: cue(source), ...(manualClip ? { manualClip, manualToken: now } : {}) });
    assert.equal(ignored.token, source.token); assert.equal(ignored.headNuzzle, false);
  }
});

test('upright head nuzzles complete their source and ending hold before settling', () => {
  const controller = create(), now = at('08:00');
  const wave = controller.sample({ now, playbackAware: true });
  const nuzzle = controller.sample({ now: now + 1000, playbackAware: true, headCue: cue(wave) });
  assert.equal(controller.sample({ now: now + 7000, playbackAware: true }).headNuzzle, true);
  controller.sample({ now: now + 8000, playbackAware: true, playback: done(nuzzle) });
  assert.equal(controller.sample({ now: now + 8899, playbackAware: true, playback: done(nuzzle) }).clip, 16);
  const idle = controller.sample({ now: now + 8900, playbackAware: true, playback: done(nuzzle) });
  assert.equal(idle.clip, 22); assert.equal(idle.headNuzzle, false);
});

test('a relaxed head nuzzle releases its presentation after the ending hold without replaying source 22', () => {
  const controller = create(), now = at('14:00');
  const idle = controller.sample({ now, playbackAware: true });
  const nuzzle = controller.sample({ now: now + 1000, playbackAware: true, headCue: cue(idle) });
  controller.sample({ now: now + 5000, playbackAware: true, playback: done(nuzzle) });
  const settled = controller.sample({ now: now + 5900, playbackAware: true, playback: done(nuzzle) });
  assert.equal(settled.clip, 22); assert.equal(settled.token, nuzzle.token); assert.equal(settled.headNuzzle, false);
});
