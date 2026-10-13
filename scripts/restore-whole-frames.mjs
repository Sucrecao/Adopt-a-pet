import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';

// Restore photographed complete poses. Registration only crops, uniformly
// scales and translates each intact picture; no generated inbetween pixels.
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const report={date:'2026-10-13',renderMode:'discrete-whole-frame',species:{}};
for(const species of ['cat','dog','parrot']) {
  const source=`public/pets/${species}-whole-v3.json`,original=await readFile(source),meta=JSON.parse(original);
  meta.version=7;meta.renderMode='discrete-whole-frame';meta.stride=species==='parrot'?80:32;
  // The original dog's frame93 raises a paw while standing; it is not a
  // sleeping pose. The three actual settling pictures lead directly to rest.
  if(species==='dog')meta.transitions.rest={enter:{frames:[90,91,92],durations:[100,100,100]},exit:{frames:[92,91,90],durations:[100,100,100]}};
  meta.provenance={sourceMetadata:source,sourceMetadataSha256:sha(original),registration:'original complete-picture crops, uniform scales and offsets'};
  const pages=[];
  for(const page of meta.pages)pages.push({asset:page.asset,sha256:sha(await readFile(`public/${page.asset}`))});
  const output=`public/pets/${species}-whole-v7.json`,bytes=Buffer.from(JSON.stringify(meta,null,2)+'\n');
  await writeFile(output,bytes);report.species[species]={source,sourceSha256:sha(original),output,outputSha256:sha(bytes),frames:meta.frames.length,walkFrames:meta.clips.walk.frames.length,stride:meta.stride,pages};
}
await writeFile('docs/whole-frame-restore-provenance.json',JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({mode:report.renderMode,species:Object.keys(report.species),frames:128,walkFrames:32}));
