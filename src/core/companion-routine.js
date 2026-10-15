const beijingClock = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
});

const periods = {
  sleep: { key: 'sleep', label: '晚安时间', clip: 24 },
  morning: { key: 'morning', label: '早安时间', clip: 7 },
  focus: { key: 'focus', label: '安静陪你', clip: 22 },
  lunch: { key: 'lunch', label: '午饭时间', clip: 21 },
  affection: { key: 'affection', label: '抱抱时间', clip: 6 },
};

const daytimeWords = [
  '喝口水吧，我在这里陪你。',
  '伸个懒腰，和我歇一小会儿吧。',
  '慢慢来呀，我陪着你。',
  '今天也想给你一点小小的快乐。',
  '揉揉眼睛，看看远处吧。',
  '不用着急，我们一点点来。',
];
const affectionWords = [
  '辛苦啦，先给你一个抱抱。',
  '你已经很努力啦，陪我歇一会儿吧。',
  '忙了一天，记得对自己温柔一点呀。',
  '靠近一点，让我陪你放松一下。',
  '不用一直绷着，今天可以慢慢收尾啦。',
  '摸摸我的头，也让自己喘口气吧。',
  '累了就休息一会儿，我陪着你。',
  '今天的你也值得一个软软的抱抱。',
];

/** All schedule decisions use Beijing time, independent of the system timezone. */
export function getBeijingPeriod(now) {
  const parts = Object.fromEntries(beijingClock.formatToParts(now).map(part => [part.type, part.value]));
  const hour = Number(parts.hour);
  const key = hour < 7 || hour >= 23 ? 'sleep'
    : hour < 10 ? 'morning' : hour < 12 ? 'focus' : hour < 14 ? 'lunch'
      : hour < 19 ? 'focus' : 'affection';
  return { ...periods[key], dateKey: `${parts.year}-${parts.month}-${parts.day}`, timeLabel: `${parts.hour}:${parts.minute}` };
}

/** Select existing whole-frame animations and occasional speech on an active clock. */
export function createCompanionRoutineController({ random = Math.random } = {}) {
  let previousNow, previousStopped = true, activeElapsed = 0;
  let clip, token = 0, presentedPeriod, manual = false, manualUntil = 0;
  let seenManualToken, pendingManual;
  let seenHeadGesture = 0, headNuzzle = false, headSpeechUntil = 0;
  let completedToken, settleAt = Infinity, nextReactionAt = Infinity;
  let speech = '', lastSpeech = '', speechUntil = 0, nextSpeechAt = 8000;

  const chance = () => Math.max(0, Math.min(1, random()));
  const present = nextClip => {
    clip = nextClip; token++;
    headNuzzle = false; headSpeechUntil = 0;
    completedToken = undefined; settleAt = Infinity; nextReactionAt = Infinity;
  };
  const speak = (period, isTransition = false) => {
    const words = period.key === 'affection' ? affectionWords : daytimeWords;
    let index = Math.min(words.length - 1, Math.floor(chance() * words.length));
    if (words[index] === lastSpeech) index = (index + 1) % words.length;
    speech = period.key === 'sleep' && isTransition ? '晚安啦，今天已经很努力了。' : words[index];
    lastSpeech = speech;
    speechUntil = activeElapsed + 6000;
    nextSpeechAt = period.key === 'sleep' ? Infinity : activeElapsed + 180000 + chance() * 120000;
  };

  return {
    sample({ now = 0, paused = false, quiet = false, manualClip = 7, manualToken = 0, enabled = true, playback, playbackAware = false, headCue } = {}) {
      const timestamp = now;
      const period = getBeijingPeriod(timestamp);
      const stopped = Boolean(paused || quiet);
      const initial = !token;
      if (initial) {
        present(period.clip); presentedPeriod = period.key;
        if (period.key === 'sleep') nextSpeechAt = Infinity;
      } else if (!stopped && !previousStopped) {
        // Resuming a suspended computer or adjusting its clock must not replay a backlog.
        activeElapsed += Math.max(0, Math.min(30000, timestamp - previousNow));
      }
      previousNow = timestamp;
      previousStopped = stopped;

      if (!Object.is(manualToken, seenManualToken)) {
        seenManualToken = manualToken;
        const age = timestamp - manualToken;
        if (Number.isFinite(manualToken) && manualToken > 0 && age >= 0 && age < 30000
          && Number.isInteger(manualClip) && manualClip >= 1 && manualClip <= 24) {
          pendingManual = { clip: manualClip, remaining: 30000 - age };
        }
      }

      // A saved paused presentation must start on its selected original frame.
      // Later changes stay queued while the user is paused or using a menu.
      if (pendingManual && (initial || !stopped)) {
        present(pendingManual.clip); manual = true;
        manualUntil = activeElapsed + pendingManual.remaining;
        pendingManual = undefined; speech = ''; speechUntil = 0;
        nextSpeechAt = Math.max(nextSpeechAt, manualUntil);
      }
      if (!stopped) {
        // Older renderers have no completion notification; retain their bounded hold.
        if (!playbackAware && manual && completedToken !== token && activeElapsed >= manualUntil
          && !(playback?.clip === clip && playback.token === token)) {
          manual = false; present(period.clip);
        }
        // A completion-aware renderer must finish its current source before a
        // clock boundary replaces it. Infinity after a completion means settled.
        const canChangePeriod = !playbackAware || (completedToken === token
          && (settleAt === Infinity || activeElapsed >= settleAt));
        if (!manual && period.key !== presentedPeriod && canChangePeriod) {
          present(period.clip); presentedPeriod = period.key;
          if (enabled) speak(period, true);
          else nextSpeechAt = period.key === 'sleep' ? Infinity : activeElapsed + 8000;
        }
      }

      // Consume even a rejected cue: closing a menu or resuming must not replay it.
      // A fresh manual choice has already been processed and always takes priority.
      if (Number.isSafeInteger(headCue?.gestureId) && headCue.gestureId > seenHeadGesture) {
        seenHeadGesture = headCue.gestureId;
        if (!stopped && enabled && !manual && !pendingManual && period.key !== 'sleep'
          && [7, 16, 22].includes(clip) && headCue.clip === clip && headCue.token === token) {
          present(clip === 22 ? 22 : 16);
          headNuzzle = true; headSpeechUntil = activeElapsed + 3200;
        }
      }

      // The renderer reports only a successfully drawn final frame. A repeated or
      // stale packet must not reset this hold or finish a newer manual choice.
      if (playback?.clip === clip && playback.token === token && completedToken !== token) {
        completedToken = token;
        settleAt = activeElapsed + 900;
      }
      if (!stopped) {
        if (activeElapsed >= settleAt) {
          settleAt = Infinity;
          manual = false;
          headNuzzle = false;
          if (period.key !== presentedPeriod) {
            present(period.clip); presentedPeriod = period.key;
            if (enabled) speak(period, true);
            else nextSpeechAt = period.key === 'sleep' ? Infinity : activeElapsed + 8000;
          } else {
            const restingClip = period.key === 'sleep' ? 24 : 22;
            if (clip !== restingClip) present(restingClip);
            else if (period.key !== 'sleep') nextReactionAt = activeElapsed + 14000 + chance() * 10000;
          }
        }
        if (!manual && period.key !== 'sleep' && activeElapsed >= nextReactionAt) {
          const pool = period.key === 'affection' ? [22, 22, 16, 1, 6] : [22, 22, 22, 16];
          present(pool[Math.min(pool.length - 1, Math.floor(chance() * pool.length))]);
        }
        if (activeElapsed >= speechUntil) speech = '';
        if (!enabled) {
          speech = '';
          if (period.key !== 'sleep') nextSpeechAt = Math.max(nextSpeechAt, activeElapsed + 8000);
        } else if (!manual && period.key !== 'sleep' && activeElapsed >= nextSpeechAt
          && (!playbackAware || period.key === presentedPeriod)) {
          speak(period);
        }
      }
      return { period, clip, token, speech: stopped || !enabled || manual ? ''
        : activeElapsed < headSpeechUntil ? '蹭蹭～最喜欢你摸摸头啦。' : speech, manual, headNuzzle };
    },
  };
}
