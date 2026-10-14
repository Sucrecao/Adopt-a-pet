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
  let speech = '', lastSpeech = '', speechUntil = 0, nextSpeechAt = 8000;

  const chance = () => Math.max(0, Math.min(1, random()));
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
    sample({ now = 0, paused = false, quiet = false, manualClip = 7, manualToken = 0, enabled = true } = {}) {
      const timestamp = now;
      const period = getBeijingPeriod(timestamp);
      const stopped = Boolean(paused || quiet);
      const initial = !token;
      if (initial) {
        clip = period.clip; token++; presentedPeriod = period.key;
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
        clip = pendingManual.clip; token++; manual = true;
        manualUntil = activeElapsed + pendingManual.remaining;
        pendingManual = undefined; speech = ''; speechUntil = 0;
        nextSpeechAt = Math.max(nextSpeechAt, manualUntil);
      }
      if (!stopped) {
        if (manual && activeElapsed >= manualUntil) {
          manual = false; clip = period.clip; token++;
        }
        if (!manual && period.key !== presentedPeriod) {
          clip = period.clip; token++; presentedPeriod = period.key;
          if (enabled) speak(period, true);
          else nextSpeechAt = period.key === 'sleep' ? Infinity : activeElapsed + 8000;
        }
        if (activeElapsed >= speechUntil) speech = '';
        if (!enabled) {
          speech = '';
          if (period.key !== 'sleep') nextSpeechAt = Math.max(nextSpeechAt, activeElapsed + 8000);
        } else if (!manual && period.key !== 'sleep' && activeElapsed >= nextSpeechAt) {
          speak(period);
        }
      }
      return { period, clip, token, speech: stopped || !enabled || manual ? '' : speech, manual };
    },
  };
}
