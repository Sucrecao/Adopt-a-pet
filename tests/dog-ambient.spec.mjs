import { test, expect } from '@playwright/test';

async function mountPlayback(page) {
  await page.goto('/');
  await page.evaluate(async () => {
    const [{ default: React }, { default: ReactDOMClient }, { default: ReactDOM }, { default: Pet }, { PETS }] = await Promise.all([
      import('/node_modules/.vite/deps/react.js'),
      import('/node_modules/.vite/deps/react-dom_client.js'),
      import('/node_modules/.vite/deps/react-dom.js'),
      import('/src/Pet.jsx'),
      import('/src/core/pets.js'),
    ]);
    let now = 0, nextId = 0, randomValue = 0;
    const callbacks = new Map();
    Math.random = () => randomValue;
    Object.defineProperty(performance, 'now', { configurable: true, value: () => now });
    window.requestAnimationFrame = callback => { const id = ++nextId; callbacks.set(id, callback); return id; };
    window.cancelAnimationFrame = id => callbacks.delete(id);
    const mount = document.createElement('div');
    mount.className = 'ambient-fixture';
    document.body.append(mount);
    const root = ReactDOMClient.createRoot(mount);
    const locomotionRef = { current: { epoch: 1, distanceDip: 0, spriteSizeDip: 256, facing: 1, moving: false } };
    let props = { pet: PETS.find(pet => pet.id === 'dog'), size: 256, action: 'idle', locomotionRef };
    const render = () => ReactDOM.flushSync(() => root.render(React.createElement(Pet, props)));
    render();
    window.dogPlayback = {
      step(time, motion = {}) {
        now = time;
        Object.assign(locomotionRef.current, motion);
        const frame = [...callbacks.values()]; callbacks.clear();
        frame.forEach(callback => callback(now));
        const sprite = mount.querySelector('.pet-sprite');
        return { ...sprite.dataset };
      },
      random(value) { randomValue = value; },
      action(action) { props = { ...props, action }; render(); },
    };
  });
  await expect(page.locator('.ambient-fixture .pet-sprite')).toHaveAttribute('data-atlas', 'rig');
}

for (const [ambient, random] of [['groom', 0], ['stretch', .3], ['hop', .6]]) {
  for (const alreadyActive of [false, true]) {
    test(`dog finishes its movement hold when ambient ${ambient} ${alreadyActive ? 'is active before' : 'would start at'} a reversal`, async ({ page }) => {
      await mountPlayback(page);
      const result = await page.evaluate(({ random, alreadyActive }) => {
        window.dogPlayback.step(6480);
        window.dogPlayback.random(random);
        const ambient = alreadyActive ? window.dogPlayback.step(6500) : null;
        const start = alreadyActive ? 6516 : 6500;
        const frames = [window.dogPlayback.step(start, { facing: -1 })];
        for (let now = start + 16; now <= start + 800; now += 16) frames.push(window.dogPlayback.step(now));
        const moving = window.dogPlayback.step(start + 816, { moving: true, distanceDip: 1 });
        return { ambient, frames, moving };
      }, { random, alreadyActive });
      if (alreadyActive) expect(result.ambient.clip).toBe(ambient);
      const turning = result.frames.filter(frame => frame.turning === 'true');
      expect(turning.length).toBeGreaterThan(0);
      expect(turning.every(frame => frame.clip === 'idle')).toBeTruthy();
      expect(Number(result.frames.at(-1).orientation)).toBe(-1);
      expect(Number(result.frames.at(-1).turnRemaining)).toBe(0);
      expect(result.moving.turning).toBe('false');
      expect(result.moving.clip).toBe('walk');
    });
  }
}

test('dog turn still pauses for explicit care and resumes after it', async ({ page }) => {
  await mountPlayback(page);
  const before = await page.evaluate(() => {
    window.dogPlayback.step(16, { facing: -1 });
    return window.dogPlayback.step(160);
  });
  await page.evaluate(() => window.dogPlayback.action('pet'));
  const care = await page.evaluate(() => window.dogPlayback.step(800));
  await page.evaluate(() => window.dogPlayback.action('idle'));
  const resumed = await page.evaluate(() => window.dogPlayback.step(816));
  expect(care.clip, JSON.stringify({ before, care, resumed })).toBe('pet');
  expect(care.orientation).toBe(before.orientation);
  expect(Number(resumed.turnRemaining)).toBeLessThan(Number(care.turnRemaining));
});
