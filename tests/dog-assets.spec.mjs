import { test, expect } from '@playwright/test';
import {useLegacyPetResources} from './legacy-pet-fixture.mjs';
test.beforeEach(async({page})=>useLegacyPetResources(page));

async function adoptDog(page) {
  await page.route('**/pets/*-whole-v*', route => route.abort());
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.getByRole('button', { name: /选择小狗/ }).click();
  await page.getByRole('button', { name: /在预览中领养/ }).click();
}

test('actual fallback dog rig preview loads its coherent head, body views and leg group', async ({ page }) => {
  await adoptDog(page);
  await expect(page.locator('.stage-pet canvas')).toHaveAttribute('data-body-rig', 'matched-views-v3');
  await expect(page.locator('.stage-pet canvas')).toHaveAttribute('data-limb-skin', 'connected-v2');
  await expect(page.locator('.stage-pet canvas')).toHaveAttribute('data-head-rig', 'registered-v2');
});

for (const asset of ['dog-cohesive-v3.png', 'dog-head-rig-v3.json', 'dog-limb-rig-v3.json']) {
  test(`fallback dog rig optional group falls back together when ${asset} cannot load`, async ({ page }) => {
    await page.route(`**/pets/${asset}`, route => route.abort());
    await adoptDog(page);
    await expect(page.locator('.stage-pet canvas')).toHaveAttribute('data-body-rig', 'side-profile');
    await expect(page.locator('.stage-pet canvas')).toHaveAttribute('data-head-rig', 'registered-v2');
    await expect(page.locator('.stage-pet canvas')).toHaveAttribute('data-limb-skin', 'connected-v2');
  });
}

for (const kind of ['body crop outside source', 'limb landmark outside source']) {
  test(`fallback dog rig optional group falls back together for ${kind}`, async ({ page }) => {
    const asset = kind.startsWith('body') ? 'dog-head-rig-v3.json' : 'dog-limb-rig-v3.json';
    await page.route(`**/pets/${asset}`, async route => {
      const response = await route.fetch(), metadata = await response.json();
      if (kind.startsWith('body')) metadata.registration.bodyViews[2].rect = [6000, 6000, 344, 235];
      else metadata.parts[metadata.species.dog.fore].joints[0] = [2, .1];
      await route.fulfill({ response, json: metadata });
    });
    await adoptDog(page);
    await expect(page.locator('.stage-pet canvas')).toHaveAttribute('data-body-rig', 'side-profile');
    await expect(page.locator('.stage-pet canvas')).toHaveAttribute('data-head-rig', 'registered-v2');
    await expect(page.locator('.stage-pet canvas')).toHaveAttribute('data-limb-skin', 'connected-v2');
  });
}
