const { test } = require('node:test');
const assert = require('node:assert/strict');
const { isValidCommand, isTrustedSender, isValidHitRegions, isValidPoint } = require('../electron/security.cjs');
const security = require('../electron/security.cjs');

test('adoption accepts only supported pets and sensible names', () => {
  for (const species of ['maltese', 'golden', 'parrot']) {
    assert.equal(isValidCommand({ type:'adopt', species, name:'我的伙伴' }), true);
    assert.equal(isValidCommand({ type:'adopt', species, name:'' }), false);
    assert.equal(isValidCommand({ type:'adopt', species, name:'a'.repeat(25) }), false);
  }
  for (const species of ['cat', 'dog', 'dragon']) assert.equal(isValidCommand({ type:'adopt', species, name:'老朋友' }), false);
  assert.equal(isValidCommand({type:'adopt',species:'parrot',name:'a'.repeat(41)}), false);
  assert.equal(isValidCommand({type:'adopt',species:'parrot',name:42}), false);
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

test('visual hit regions stay in the logical pet box, independent of its screen origin', () => {
  assert.equal(isValidHitRegions([{ type:'rect', x:300, y:10, width:200, height:30 }], { width:340, height:360 }), false);
  assert.equal(isValidHitRegions([{ type:'ellipse', x:30, y:50, width:220, height:240 }], { width:340, height:360 }), true);
});

test('visual commits require current geometry, increasing sequence and matching finite travel', () => {
  assert.equal(typeof security.isValidVisualCommit, 'function');
  const context = { epoch:3, geometrySeq:2, sequence:5, distanceDip:4, allowMovement:true,
    rect:{x:1200,y:100,width:340,height:360}, area:{x:0,y:0,width:2000,height:1000} };
  const packet = { clockKind:'visual-root-v1', epoch:3, geometrySeq:2, sequence:6,
    rectGlobal:{x:1200.125,y:100,width:340,height:360}, distanceDip:4.125, selectedFrame:10, phase:.2 };
  assert.equal(security.isValidVisualCommit(packet, context), true);
  for (const invalid of [{...packet,epoch:2}, {...packet,sequence:5}, {...packet,geometrySeq:1},
    {...packet,distanceDip:20}, {...packet,rectGlobal:{...packet.rectGlobal,x:Infinity}},
    {...packet,rectGlobal:{...packet.rectGlobal,width:2000}}, {...packet,rectGlobal:{...packet.rectGlobal,y:101}}]) {
    assert.equal(security.isValidVisualCommit(invalid, context), false);
  }
  assert.equal(security.isValidVisualCommit(packet, {...context,allowMovement:false}), false);
});
