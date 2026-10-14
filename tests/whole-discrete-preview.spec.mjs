import {test,expect} from '@playwright/test';

test('whole-picture preview supports all source frames, slow play, pause and both facings',async({page})=>{
  test.setTimeout(60_000);
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  await page.goto('/.artifacts/pet-motion-comparison-preview-v7-retained.html');
  const frame=page.frameLocator('iframe'),canvas=frame.locator('#whole-pet-motion canvas');
  await expect(canvas).toHaveAttribute('data-renderer','whole-frame-2d');
  await frame.locator('[data-play]').click();
  const context=page.frames().find(f=>f!==page.mainFrame());
  const frozen=await context.evaluate(()=>document.querySelector('canvas').toDataURL());
  await page.waitForTimeout(100);expect(await context.evaluate(()=>document.querySelector('canvas').toDataURL())).toBe(frozen);
  for(const species of ['cat','dog','parrot']) {
    await frame.locator('select[data-species]').selectOption(species);await expect(canvas).toHaveAttribute('data-species',species);
    for(const action of ['walk','idle','turn','pet','feed','groom','stretch','hop','rest']) {
      await frame.locator('select[data-action]').selectOption(action);
      const result=await context.evaluate(()=>{
        const api=window.wholeFramePreview,frames=api.snapshot().sourceFrames,images=[];
        for(let i=0;i<frames.length;i++){api.selectFrame(i);images.push(document.querySelector('canvas').toDataURL());}
        return {frames,pictureCount:new Set(images).size,backend:document.querySelector('canvas').dataset.renderer,ground:document.querySelector('canvas').dataset.groundRenderer};
      });
      expect(result.pictureCount).toBe(result.frames.length);expect(result.backend).toBe('whole-frame-2d');expect(result.ground).toBe('');
    }
  }
  await frame.locator('select[data-action]').selectOption('walk');await frame.locator('select[data-speed]').selectOption('0.25');await frame.locator('[data-mirror]').click();
  await frame.locator('[data-play]').click();await expect.poll(()=>context.evaluate(()=>window.wholeFramePreview.snapshot().index)).toBeGreaterThan(0);
  expect(await context.evaluate(()=>window.wholeFramePreview.snapshot().facing)).toBe(-1);
  await page.setViewportSize({width:328,height:780});expect(await context.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await page.screenshot({path:'/tmp/pawpal-whole-frame-preview.png',fullPage:true});expect(errors).toEqual([]);
});
