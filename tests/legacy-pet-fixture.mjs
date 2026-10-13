// Tests for the retained optional rig explicitly opt into that older resource
// mode. Active v7 pets never select it after a complete-photo load failure.
export async function useLegacyPetResources(page) {
  await page.route('**/src/core/pets.js*',async route=>{
    const response=await route.fetch();
    const body=(await response.text()).replace(/wholeRenderMode:\s*(['"])discrete-whole-frame\1/g,'wholeRenderMode: undefined');
    await route.fulfill({response,body});
  });
}
