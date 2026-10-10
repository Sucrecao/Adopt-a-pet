const { test } = require('node:test');
const assert = require('node:assert/strict');
const { isValidCommand, isTrustedSender, isValidHitRegions, isValidPoint } = require('../electron/security.cjs');

test('adoption accepts only supported pets and sensible names', () => {
  assert.equal(isValidCommand({type:'adopt',species:'cat',name:'奶糖'}), true);
  assert.equal(isValidCommand({type:'adopt',species:'dragon',name:'a'}), false);
  assert.equal(isValidCommand({type:'adopt',species:'dog',name:'a'.repeat(41)}), false);
  assert.equal(isValidCommand({type:'adopt',species:'dog',name:42}), false);
});

test('renderer cannot dispatch arbitrary actions or unknown settings', () => {
  assert.equal(isValidCommand({type:'interact',action:'play'}), true);
  assert.equal(isValidCommand({type:'interact',action:'shell'}), false);
  assert.equal(isValidCommand({type:'settings',patch:{size:1.2,movement:'edge',sound:true}}), true);
  for (const patch of [{size:Infinity},{size:99},{movement:'space'},{sound:'yes'},{exec:'open'},{__proto__:null,unknown:true}]) {
    assert.equal(isValidCommand({type:'settings',patch}), false);
  }
  assert.equal(isValidCommand(null), false);
  assert.equal(isValidCommand({type:'delete-files'}), false);
});

test('new action IPC accepts stretch and trick only by their exact identifiers', () => {
  assert.equal(isValidCommand({ type: 'interact', action: 'stretch' }), true);
  assert.equal(isValidCommand({ type: 'interact', action: 'trick' }), true);
  assert.equal(isValidCommand({ type: 'interact', action: 'hop' }), false);
  assert.equal(isValidCommand({ type: 'interact', action: '伸懒腰' }), false);
});

test('only known window main frames may call IPC', () => {
  const mainFrame = {url:'file:///app/index.html'};
  const webContents = {mainFrame};
  const window = {isDestroyed:()=>false,webContents};
  assert.equal(isTrustedSender({sender:webContents,senderFrame:mainFrame}, [window]), true);
  assert.equal(isTrustedSender({sender:webContents,senderFrame:{}}, [window]), false);
  assert.equal(isTrustedSender({sender:{mainFrame},senderFrame:mainFrame}, [window]), false);
  assert.equal(isTrustedSender({sender:webContents,senderFrame:mainFrame}, [{...window,isDestroyed:()=>true}]), false);
});

test('hit regions are finite, bounded and use known shapes', () => {
  assert.equal(isValidHitRegions([{type:'ellipse',x:20,y:30,width:200,height:220}]), true);
  assert.equal(isValidHitRegions([]), true);
  for (const region of [{type:'rect',x:NaN,y:0,width:4,height:4},{type:'evil',x:0,y:0,width:4,height:4},{type:'rect',x:0,y:0,width:1e8,height:4}]) {
    assert.equal(isValidHitRegions([region]), false);
  }
  assert.equal(isValidHitRegions(Array(20).fill({type:'rect',x:0,y:0,width:1,height:1})), false);
  assert.equal(isValidPoint({x:-1440,y:300}), true);
  assert.equal(isValidPoint({x:Infinity,y:300}), false);
});
