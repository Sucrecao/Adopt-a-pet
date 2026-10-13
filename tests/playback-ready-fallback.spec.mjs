import { test, expect } from '@playwright/test';

test('failed whole-frame artwork keeps a complete photo and holds native travel',async({page})=>{
  await page.route('**/pets/*-whole-v*',route=>route.abort());
  await page.route(/pets\/.*-(motion|rig)\.png$/,route=>route.abort());
  await page.goto('/');await page.evaluate(()=>localStorage.clear());await page.reload();
  await page.getByRole('button',{name:/在预览中领养/}).click();
  const pet=page.locator('.stage-pet'),root=page.locator('.stage-pet-anchor');
  await expect(pet).toHaveAttribute('data-atlas','whole-fallback');
  await expect(pet).toHaveCSS('background-image',/cat\.png/);
  await page.getByRole('button',{name:'玩耍',exact:true}).click();
  const before=await root.boundingBox(),stage=await page.locator('.desktop-stage').boundingBox();
  await page.mouse.move(stage.x+stage.width*.9,stage.y+stage.height*.68);
  await page.waitForTimeout(500);
  const after=await root.boundingBox();expect(Math.abs(after.x-before.x)).toBeLessThan(.5);expect(Math.abs(after.y-before.y)).toBeLessThan(.5);
  await expect(pet).toHaveAttribute('data-atlas','whole-fallback');
});
