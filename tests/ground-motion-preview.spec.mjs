import {test,expect} from '@playwright/test';
import fs from 'node:fs/promises';

async function inlineSandbox(page) {
  const [fragment,css]=await Promise.all([
    fs.readFile(new URL('../.artifacts/ground-motion-comparison-candidate.html',import.meta.url),'utf8'),
    fs.readFile(new URL('../.artifacts/ground-motion-preview-runtime.css',import.meta.url),'utf8')]);
  // Exercise the fragment in a scripts-only iframe with the real host's state
  // echo contract. The optional standalone tooltip toolkit needs CDN libraries
  // and is unrelated to motion rendering or the fragment's controls.
  const host=`<script>window.openai={setWidgetState:async function(state){this.widgetState=state;window.dispatchEvent(new CustomEvent('openai:set_globals',{detail:{globals:{widgetState:state}}}));}};</script>`;
  await page.setContent('<iframe sandbox="allow-scripts" style="display:block;width:100%;height:900px;border:0"></iframe>');
  await page.locator('iframe').evaluate((element,source)=>element.srcdoc=source,`<meta charset="utf-8"><style>${css}</style>${host}${fragment}`);
  return page.frames().find(f=>f.parentFrame());
}

for(const surface of ['full','inline'])test(`${surface}: walking review shows every indexed pose and remains usable at phone width`,async({page})=>{
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  if(surface==='full')await page.goto('/.artifacts/ground-motion-comparison-full-candidate.html');
  const frame=surface==='inline'?await inlineSandbox(page):page;
  const root=frame.locator('#pet-motion-comparison');
  await expect(root).toHaveAttribute('data-ready','1');
  await expect(root.locator('[data-review-sprite="current"]')).toBeHidden();
  for(const species of ['cat','dog']) {
    await root.locator('[data-species]').selectOption(species);
    if(await root.locator('[data-action]').isVisible())await root.locator('[data-action]').selectOption('walk');
    else await expect(root.locator('[data-action]')).toHaveValue('walk');
    await expect(root.locator('[data-frame-label]')).toBeVisible();
    const hashes=await frame.evaluate(async()=>{
      const root=document.getElementById('pet-motion-comparison'),slider=root.querySelector('input[data-frame]'),canvas=root.querySelector('[data-current]'),sprite=root.querySelector('[data-review-sprite="current"]');
      const values=[];
      for(let i=0;i<64;i++) {
        slider.value=String(i);slider.dispatchEvent(new Event('input',{bubbles:true}));
        if(Number(canvas.dataset.phase)!==i/64)throw new Error(`Phase ${i} did not reach the real renderer`);
        if(canvas.dataset.groundMode!=='walk')throw new Error('Walking review fell back to a care source');
        if(canvas.dataset.groundRenderer!=='jointed-surface-webgl')throw new Error('The jointed GPU backend is unavailable');
        values.push(sprite.toDataURL());
      }
      return new Set(values).size;
    });
    expect(hashes).toBe(64);
    await root.locator('[data-pause]').click();
    await expect(root.locator('[data-current]')).toHaveAttribute('data-ready','true');
    const first=await root.locator('[data-current]').getAttribute('data-distance');
    await expect.poll(()=>root.locator('[data-current]').getAttribute('data-distance')).not.toBe(first);
  }
  await page.setViewportSize({width:360,height:900});
  expect(await frame.evaluate(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth+1)).toBe(true);
  expect(errors).toEqual([]);
});

test('walk inspection starts the reviewed walking route and exposes its frame scrubber',async({page})=>{
  await page.goto('/.artifacts/ground-walk-review-only.html');
  const root=page.locator('#pet-motion-comparison');
  await expect(root).toHaveAttribute('data-ready','1');
  await expect(root.locator('[data-action]')).toBeHidden();
  await expect(root.locator('[data-frame-label]')).toBeVisible();
  for(const species of ['cat','dog']) {
    await root.locator('[data-species]').selectOption(species);
    await expect(root.locator('[data-current]')).toHaveAttribute('data-ground-mode','walk');
    await expect(root.locator('[data-current]')).toHaveAttribute('data-ground-renderer','jointed-surface-webgl');
    await root.screenshot({path:`.artifacts/ground-walk-review-${species}.png`});
  }
});
