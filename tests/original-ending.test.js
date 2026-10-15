import test from 'node:test';
import assert from 'node:assert/strict';
import { createCompanionRoutineController } from '../src/core/companion-routine.js';

const at = time => Date.parse(`2026-10-14T${time}:00+08:00`);
const create = (random = () => 0) => createCompanionRoutineController({ random });
const done = sample => ({ clip: sample.clip, token: sample.token });

test('a completed original manual animation settles after 900 active milliseconds', () => {
  const controller = create(), now = at('14:00');
  const manual = controller.sample({ now, manualClip: 3, manualToken: now });
  const props = { manualClip: 3, manualToken: now, playback: done(manual) };
  assert.equal(controller.sample({ now: now + 2000, ...props }).token, manual.token);
  assert.equal(controller.sample({ now: now + 2899, ...props }).manual, true);
  const idle = controller.sample({ now: now + 2900, ...props });
  assert.equal(idle.clip, 22); assert.equal(idle.manual, false);
  assert.notEqual(idle.token, manual.token);
});

test('completion requires the currently presented clip and playback token', () => {
  for (const mismatch of [sample => ({ clip: 4, token: sample.token }), sample => ({ clip: 3, token: sample.token - 1 })]) {
    const controller = create(), now = at('14:00');
    const manual = controller.sample({ now, manualClip: 3, manualToken: now });
    const props = { manualClip: 3, manualToken: now, playback: mismatch(manual) };
    controller.sample({ now: now + 2000, ...props });
    const held = controller.sample({ now: now + 5000, ...props });
    assert.equal(held.manual, true); assert.equal(held.token, manual.token);
  }
});

test('a new manual choice wins over an old completion packet in the same sample', () => {
  const controller = create(), now = at('14:00');
  const first = controller.sample({ now, manualClip: 3, manualToken: now });
  const newer = controller.sample({ now: now + 1000, manualClip: 4, manualToken: now + 1000, playback: done(first) });
  const held = controller.sample({ now: now + 3000, manualClip: 4, manualToken: now + 1000, playback: done(first) });
  assert.equal(held.clip, 4); assert.equal(held.manual, true); assert.equal(held.token, newer.token);
  controller.sample({ now: now + 4000, manualClip: 4, manualToken: now + 1000, playback: done(newer) });
  assert.equal(controller.sample({ now: now + 4900 }).clip, 22);
});

test('an accepted completion keeps its whole 900 millisecond hold near the compatibility timeout', () => {
  const controller = create(), now = at('14:00');
  const manual = controller.sample({ now, manualClip: 3, manualToken: now });
  const props = { manualClip: 3, manualToken: now, playback: done(manual) };
  controller.sample({ now: now + 29500, ...props });
  assert.equal(controller.sample({ now: now + 30000, ...props }).token, manual.token);
  assert.equal(controller.sample({ now: now + 30399, ...props }).manual, true);
  assert.equal(controller.sample({ now: now + 30400, ...props }).clip, 22);
});

test('a final-frame packet arriving at the fallback boundary keeps its ending hold', () => {
  const controller = create(), now = at('14:00');
  const manual = controller.sample({ now, manualClip: 3, manualToken: now });
  const props = { manualClip: 3, manualToken: now, playback: done(manual) };
  const completed = controller.sample({ now: now + 30000, ...props });
  assert.equal(completed.token, manual.token); assert.equal(completed.manual, true);
  assert.equal(controller.sample({ now: now + 30899, ...props }).token, manual.token);
  assert.equal(controller.sample({ now: now + 30900, ...props }).clip, 22);
});

test('the ending hold freezes during pause and quiet menus', () => {
  for (const stopped of [{ paused: true }, { quiet: true }]) {
    const controller = create(), now = at('14:00');
    const manual = controller.sample({ now, manualClip: 3, manualToken: now });
    const props = { manualClip: 3, manualToken: now, playback: done(manual) };
    controller.sample({ now: now + 1000, ...props });
    controller.sample({ now: now + 1400, ...props });
    controller.sample({ now: now + 1500, ...props, ...stopped });
    controller.sample({ now: now + 60000, ...props, ...stopped });
    assert.equal(controller.sample({ now: now + 61000, ...props }).token, manual.token);
    assert.equal(controller.sample({ now: now + 61499, ...props }).manual, true);
    assert.equal(controller.sample({ now: now + 61500, ...props }).clip, 22);
  }
});

test('a completion received while quiet waits a full active hold after the menu closes', () => {
  const controller = create(), now = at('14:00');
  const manual = controller.sample({ now, manualClip: 3, manualToken: now });
  controller.sample({ now: now + 1000, quiet: true, playback: done(manual) });
  controller.sample({ now: now + 60000, quiet: true, playback: done(manual) });
  assert.equal(controller.sample({ now: now + 61000, playback: done(manual) }).token, manual.token);
  assert.equal(controller.sample({ now: now + 61899, playback: done(manual) }).manual, true);
  assert.equal(controller.sample({ now: now + 61900, playback: done(manual) }).clip, 22);
});

test('a queued manual choice supersedes an old completed source when a quiet menu closes', () => {
  const controller = create(), now = at('14:00');
  const old = controller.sample({ now });
  controller.sample({ now: now + 1000, quiet: true, manualClip: 4, manualToken: now + 1000, playback: done(old) });
  const manual = controller.sample({ now: now + 2000, manualClip: 4, manualToken: now + 1000, playback: done(old) });
  assert.equal(manual.clip, 4); assert.equal(manual.manual, true);
  assert.equal(controller.sample({ now: now + 4000, playback: done(old) }).token, manual.token);
});

test('manual completion across a Beijing period first presents that period entry', () => {
  const controller = create(), now = at('18:59') + 58000;
  const manual = controller.sample({ now, manualClip: 4, manualToken: now });
  const props = { manualClip: 4, manualToken: now, playback: done(manual) };
  controller.sample({ now: now + 3000, ...props });
  const evening = controller.sample({ now: now + 3900, ...props });
  assert.equal(evening.clip, 6); assert.equal(evening.manual, false); assert.ok(evening.speech);
  controller.sample({ now: now + 5000, playback: done(evening) });
  const idle = controller.sample({ now: now + 5900, playback: done(evening) });
  assert.equal(idle.clip, 22); assert.notEqual(idle.token, evening.token);
});

test('an automatic entry settles into the relaxed source only after actual completion', () => {
  const controller = create(), now = at('19:00');
  const entry = controller.sample({ now });
  assert.equal(controller.sample({ now: now + 5000 }).token, entry.token);
  controller.sample({ now: now + 6000, playback: done(entry) });
  assert.equal(controller.sample({ now: now + 6899, playback: done(entry) }).clip, 6);
  const idle = controller.sample({ now: now + 6900, playback: done(entry) });
  assert.equal(idle.clip, 22); assert.equal(idle.manual, false);
});

test('manual relaxed source clears manual mode without restarting the completed source', () => {
  const controller = create(), now = at('19:00');
  const manual = controller.sample({ now, manualClip: 22, manualToken: now });
  controller.sample({ now: now + 1000, playback: done(manual) });
  const idle = controller.sample({ now: now + 1900, playback: done(manual) });
  assert.equal(idle.clip, 22); assert.equal(idle.manual, false); assert.equal(idle.token, manual.token);
  assert.equal(controller.sample({ now: now + 15899, playback: done(manual) }).token, idle.token);
  assert.notEqual(controller.sample({ now: now + 15900, playback: done(manual) }).token, idle.token);
});

test('a relaxed idle source waits until it completes before scheduling a small reaction', () => {
  const controller = create(), now = at('14:00');
  const idle = controller.sample({ now });
  assert.equal(controller.sample({ now: now + 30000 }).token, idle.token);
  controller.sample({ now: now + 31000, playback: done(idle) });
  controller.sample({ now: now + 31900, playback: done(idle) });
  assert.equal(controller.sample({ now: now + 45899, playback: done(idle) }).token, idle.token);
  const reaction = controller.sample({ now: now + 45900, playback: done(idle) });
  assert.equal(reaction.clip, 22); assert.notEqual(reaction.token, idle.token);
  assert.equal(reaction.speech, '', 'small reactions do not create an extra spoken cue');
  assert.equal(controller.sample({ now: now + 60000, playback: done(idle) }).token, reaction.token);
});

test('the longest reaction delay is 24 seconds and daytime reactions stay in the gentle pool', () => {
  const controller = create(() => 1), now = at('14:00');
  const idle = controller.sample({ now });
  controller.sample({ now: now + 1000, playback: done(idle) });
  controller.sample({ now: now + 1900, playback: done(idle) });
  assert.equal(controller.sample({ now: now + 25899, playback: done(idle) }).token, idle.token);
  const reaction = controller.sample({ now: now + 25900, playback: done(idle) });
  assert.equal(reaction.clip, 16); assert.notEqual(reaction.token, idle.token);
});

test('daytime and evening reactions use only their weighted gentle source pools', () => {
  for (const [time, chance, expected] of [
    ['14:00', 0, 22], ['14:00', 0.49, 22], ['14:00', 0.74, 22], ['14:00', 0.75, 16],
    ['19:00', 0, 22], ['19:00', 0.39, 22], ['19:00', 0.4, 16], ['19:00', 0.6, 1], ['19:00', 0.8, 6],
  ]) {
    const controller = create(() => chance), now = at(time);
    const idle = controller.sample({ now, manualClip: 22, manualToken: now });
    controller.sample({ now: now + 1000, playback: done(idle) });
    controller.sample({ now: now + 1900, playback: done(idle) });
    const reaction = controller.sample({ now: now + 1900 + 14000 + chance * 10000, playback: done(idle) });
    assert.equal(reaction.clip, expected, `${time} / ${chance}`);
    assert.notEqual(reaction.token, idle.token);
  }
});

test('evening small reactions can offer a source hug then return to the relaxed source', () => {
  const controller = create(() => 1), now = at('19:00');
  const manual = controller.sample({ now, manualClip: 22, manualToken: now });
  controller.sample({ now: now + 1000, playback: done(manual) });
  controller.sample({ now: now + 1900, playback: done(manual) });
  const reaction = controller.sample({ now: now + 25900, playback: done(manual) });
  assert.equal(reaction.clip, 6);
  controller.sample({ now: now + 26900, playback: done(reaction) });
  const returned = controller.sample({ now: now + 27800, playback: done(reaction) });
  assert.equal(returned.clip, 22); assert.notEqual(returned.token, reaction.token);
  assert.equal(controller.sample({ now: now + 50000, playback: done(reaction) }).token, returned.token);
});

test('the next small reaction freezes while paused or using a quiet menu', () => {
  for (const stopped of [{ paused: true }, { quiet: true }]) {
    const controller = create(), now = at('14:00');
    const idle = controller.sample({ now });
    controller.sample({ now: now + 1000, playback: done(idle) });
    controller.sample({ now: now + 1900, playback: done(idle) });
    controller.sample({ now: now + 4900, playback: done(idle) });
    controller.sample({ now: now + 5000, playback: done(idle), ...stopped });
    controller.sample({ now: now + 60000, playback: done(idle), ...stopped });
    assert.equal(controller.sample({ now: now + 61000, playback: done(idle) }).token, idle.token);
    assert.equal(controller.sample({ now: now + 71999, playback: done(idle) }).token, idle.token);
    assert.notEqual(controller.sample({ now: now + 72000, playback: done(idle) }).token, idle.token);
  }
});

test('a new period clears an old completion and reaction countdown', () => {
  const controller = create(), now = at('18:59') + 50000;
  const idle = controller.sample({ now });
  controller.sample({ now: now + 1000, playback: done(idle) });
  controller.sample({ now: now + 1900, playback: done(idle) });
  const evening = controller.sample({ now: now + 10000, playback: done(idle) });
  assert.equal(evening.clip, 6);
  assert.equal(controller.sample({ now: now + 20000, playback: done(idle) }).token, evening.token);
  controller.sample({ now: now + 21000, playback: done(evening) });
  assert.equal(controller.sample({ now: now + 21900, playback: done(evening) }).clip, 22);
});

test('night manual endings return to sleep and completed sleep stays quiet without periodic replay', () => {
  const controller = create(), now = at('23:10');
  const manual = controller.sample({ now, manualClip: 3, manualToken: now });
  controller.sample({ now: now + 1000, playback: done(manual) });
  const sleep = controller.sample({ now: now + 1900, playback: done(manual) });
  assert.equal(sleep.clip, 24); assert.equal(sleep.manual, false);
  controller.sample({ now: now + 2900, playback: done(sleep) });
  for (let offset = 3900; offset <= 90000; offset += 1000) {
    const quiet = controller.sample({ now: now + offset, playback: done(sleep) });
    assert.equal(quiet.token, sleep.token); assert.equal(quiet.clip, 24); assert.equal(quiet.speech, '');
  }
});

test('a completed manual sleeping source is released without restarting its bed scene', () => {
  const controller = create(), now = at('23:10');
  const manual = controller.sample({ now, manualClip: 24, manualToken: now });
  controller.sample({ now: now + 1000, playback: done(manual) });
  const sleep = controller.sample({ now: now + 1900, playback: done(manual) });
  assert.equal(sleep.clip, 24); assert.equal(sleep.manual, false); assert.equal(sleep.token, manual.token);
  assert.equal(controller.sample({ now: now + 30000, playback: done(manual) }).token, manual.token);
});

test('a sleep source that completes automatically does not schedule an idle reaction', () => {
  const controller = create(), now = at('23:10');
  const sleep = controller.sample({ now });
  controller.sample({ now: now + 1000, playback: done(sleep) });
  for (let offset = 1900; offset <= 301900; offset += 1000) {
    const quiet = controller.sample({ now: now + offset, playback: done(sleep) });
    assert.equal(quiet.token, sleep.token); assert.equal(quiet.speech, '');
  }
});

test('missing playback completion preserves the thirty second compatibility fallback', () => {
  const controller = create(), now = at('14:00');
  const manual = controller.sample({ now, manualClip: 3, manualToken: now });
  assert.equal(controller.sample({ now: now + 29999 }).token, manual.token);
  const idle = controller.sample({ now: now + 30000 });
  assert.equal(idle.manual, false); assert.equal(idle.clip, 22);
});

test('a restored manual choice with completion support finishes its full restarted source', () => {
  const controller = create(), now = at('14:00');
  const props = { playbackAware: true, manualClip: 3, manualToken: now - 29000 };
  const manual = controller.sample({ now, ...props });
  assert.equal(manual.manual, true);
  const stillPlaying = controller.sample({ now: now + 1000, ...props });
  assert.equal(stillPlaying.token, manual.token); assert.equal(stillPlaying.manual, true);
  controller.sample({ now: now + 4000, ...props, playback: done(manual) });
  assert.equal(controller.sample({ now: now + 4899, ...props, playback: done(manual) }).token, manual.token);
  const resting = controller.sample({ now: now + 4900, ...props, playback: done(manual) });
  assert.equal(resting.clip, 22); assert.equal(resting.manual, false);
});

test('a Beijing period change waits for the playing source and its ending hold with completion support', () => {
  const controller = create(), now = at('18:59') + 58000, props = { playbackAware: true };
  const playing = controller.sample({ now, ...props });
  const boundary = controller.sample({ now: now + 2000, ...props });
  assert.equal(boundary.period.key, 'affection'); assert.equal(boundary.clip, 22);
  assert.equal(boundary.token, playing.token); assert.equal(boundary.speech, '');
  controller.sample({ now: now + 4000, ...props, playback: done(playing) });
  assert.equal(controller.sample({ now: now + 4899, ...props, playback: done(playing) }).token, playing.token);
  const evening = controller.sample({ now: now + 4900, ...props, playback: done(playing) });
  assert.equal(evening.clip, 6); assert.notEqual(evening.token, playing.token); assert.ok(evening.speech);
});

test('a deferred period does not offer its speech before its entry source can start', () => {
  const controller = create(), now = at('18:59') + 58000, props = { playbackAware: true };
  const playing = controller.sample({ now, ...props });
  const stillPlaying = controller.sample({ now: now + 10000, ...props });
  assert.equal(stillPlaying.token, playing.token); assert.equal(stillPlaying.speech, '');
  controller.sample({ now: now + 11000, ...props, playback: done(playing) });
  const evening = controller.sample({ now: now + 11900, ...props, playback: done(playing) });
  assert.equal(evening.clip, 6); assert.ok(evening.speech);
});

test('an already completed and settled resting source can enter the next period immediately', () => {
  const controller = create(), now = at('18:59') + 55000, props = { playbackAware: true };
  const idle = controller.sample({ now, ...props });
  controller.sample({ now: now + 1000, ...props, playback: done(idle) });
  controller.sample({ now: now + 1900, ...props, playback: done(idle) });
  const evening = controller.sample({ now: now + 5000, ...props, playback: done(idle) });
  assert.equal(evening.clip, 6); assert.notEqual(evening.token, idle.token); assert.ok(evening.speech);
});

test('completion-aware sleeping source settles once and remains quiet without replays', () => {
  const controller = create(), now = at('23:10'), props = { playbackAware: true };
  const sleep = controller.sample({ now, ...props });
  controller.sample({ now: now + 1000, ...props, playback: done(sleep) });
  for (let offset = 1900; offset <= 901900; offset += 1000) {
    const quiet = controller.sample({ now: now + offset, ...props, playback: done(sleep) });
    assert.equal(quiet.token, sleep.token); assert.equal(quiet.clip, 24); assert.equal(quiet.speech, '');
  }
});
