import asar from '@electron/asar';
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import {PETS} from '../src/core/pets.js';

const archive='.artifacts/whole-frame-release/mac-arm64/PawPal.app/Contents/Resources/app.asar';
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const version=JSON.parse(await readFile('package.json')).version;
const sourceManifest=JSON.parse(await readFile('package.json')),packagedManifest=JSON.parse(asar.extractFile(archive,'package.json'));
assert.equal(version,'0.4.5');
for(const key of ['version','name','main'])assert.equal(packagedManifest[key],sourceManifest[key]);
const html=await readFile('dist/index.html','utf8');
const assets=[...html.matchAll(/assets\/index-[^" ]+\.(?:js|css)/g)].map(match=>`dist/${match[0]}`);
const files=['electron/main.cjs','electron/preload.cjs','src/core/pets.js','src/core/whole-animation.js','dist/index.html',...assets];
for(const pet of PETS){
  assert.equal(pet.wholeRenderMode,'discrete-whole-frame');
  const meta=JSON.parse(await readFile(`public/${pet.wholeMetaAsset}`));
  assert.equal(meta.version,7);assert.equal(meta.renderMode,pet.wholeRenderMode);assert.equal(meta.frames.length,128);
  assert.equal(meta.clips.walk.frames.length,32);
  for(const key of ['flow','handoffs','groundGait','groundRise'])assert.equal(meta[key],undefined);
  files.push(`dist/${pet.wholeMetaAsset}`,...meta.pages.map(page=>`dist/${page.asset}`));
}
const records=[];
for(const file of new Set(files)){
  const bytes=await readFile(file),packaged=asar.extractFile(archive,file);
  assert.equal(sha(packaged),sha(bytes),file);
  if(file.startsWith('dist/pets/'))assert.equal(sha(bytes),sha(await readFile(file.replace('dist/','public/'))),file);
  records.push({path:file,sha256:sha(packaged)});
}
const previous='release/PawPal-0.4.4-mac-arm64.zip';
assert.equal(sha(await readFile(previous)),'df174779aa139596852a9f20ca855d64b2a528d7a74461ecfe8d63be1264cfc6');
await writeFile('.artifacts/whole-frame-package-integrity.json',JSON.stringify({version,archive,files:records,packagedManifest:{name:packagedManifest.name,version,main:packagedManifest.main,note:'electron-builder removes development fields from the packaged manifest'},previousArchiveUnchanged:true},null,2)+'\n');
console.log(`PawPal ${version}: ${records.length} packaged files match current sources; previous archive unchanged.`);
