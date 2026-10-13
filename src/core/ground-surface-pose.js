import { solveLegPose, groundHandoffPose } from './ground-surface-handoff.js';
import { launchEnterPose, launchWalkPose } from './ground-surface-launch.js';

const TAU=Math.PI*2;
const mod=x=>((x%1)+1)%1;
export const minimumJerk=q=>q*q*q*(10+q*(-15+6*q));

/** Local travel subtracts the accepted root distance while the sole supports. */
export function groundStepAt(phase,stride,support=.65,lift=12) {
  const p=mod(phase);
  if(p<support)return {x:stride*(support/2-p),y:0,p,planted:true};
  const q=(p-support)/(1-support);
  return {x:-stride*support/2+stride*(minimumJerk(q)-(1-support)*q),
    y:-lift*Math.sin(Math.PI*q)**4,p,planted:false};
}

export function validateGroundPoseConfig(config) {
  const fail=()=>{throw new TypeError('Invalid ground surface pose binding');};
  const vector=(value,size)=>Array.isArray(value)&&value.length===size&&value.every(Number.isFinite);
  if(config?.version!==2||!['cat','dog'].includes(config.species)
      ||!(Number.isFinite(config.stride)&&config.stride>0&&config.stride<=64)
      ||config.support!==.65||config.lift!==12||config.launchPhase!==.65
      ||!vector(config.sourceSize,2)||config.sourceSize.some(v=>v<=0)
      ||!vector(config.bodySize,2)||config.bodySize.some(v=>v!==256)
      ||!['skinAsset','bodyAsset'].every(k=>typeof config[k]==='string'&&config[k].length>0))fail();
  const neutral=config.neutralPose;
  if(!neutral||neutral.species!==config.species||!Array.isArray(neutral.legs)||neutral.legs.length!==4
      ||!['phase','bob','pitch','pelvis','shoulder'].every(k=>Number.isFinite(neutral[k])))fail();
  const ids=new Set();
  for(const leg of neutral.legs) {
    if(!['nearHind','farHind','nearFore','farFore'].includes(leg.id)||ids.has(leg.id))fail();
    ids.add(leg.id);
    if(leg.fore!==leg.id.includes('Fore')||leg.near!==leg.id.startsWith('near')
      ||!(Number.isFinite(leg.scale)&&leg.scale>0&&leg.scale<=1)
      ||!Number.isFinite(config.gaitCenters?.[leg.id])||!Number.isFinite(leg.phaseOffset)
      ||!Number.isFinite(leg.roll)||typeof leg.planted!=='boolean'
      ||!['hip','knee','ankle','foot','contact'].every(k=>vector(leg[k],3))
      ||!vector(leg.lengths,3)||leg.lengths.some(v=>v<=0))fail();
    const {rect,joints,hull}=leg.source??{};
    if(!vector(rect,4)||rect[0]<0||rect[1]<0||rect[2]<=0||rect[3]<=0
      ||rect[0]+rect[2]>config.sourceSize[0]||rect[1]+rect[3]>config.sourceSize[1]
      ||!Array.isArray(joints)||joints.length!==4||!joints.every(p=>vector(p,2))
      ||!hull||!['center','heel','toe'].every(k=>vector(hull[k],2))
      ||!Array.isArray(hull.points)||hull.points.length<3||!hull.points.every(p=>vector(p,2)))fail();
    for(let i=0;i<2;i++) {
      const distance=Math.hypot(joints[i+1][0]-joints[i][0],joints[i+1][1]-joints[i][1])*leg.scale;
      if(Math.abs(distance-leg.lengths[i])>1e-6)fail();
    }
    try {
      const solved=solveLegPose(leg,leg.hip,leg.contact,leg.roll,leg.planted,false);
      if(['knee','ankle','foot'].some(k=>solved[k].some((v,i)=>Math.abs(v-leg[k][i])>1e-6)))fail();
    }catch {fail();}
  }
  return true;
}

/** Pure fixed-bone pose solver. Display time never enters a walking pose. */
export function createGroundPoseModel(config) {
  validateGroundPoseConfig(config);
  const binding=structuredClone(config),neutral=binding.neutralPose;
  function walk(phase) {
    if(!Number.isFinite(phase))throw new TypeError('Invalid walking phase');
    const bob=-.6*Math.cos(2*TAU*phase),pitch=.006*Math.sin(TAU*phase);
    const pelvis=.45*Math.cos(TAU*phase),shoulder=.6*Math.cos(TAU*phase+.35);
    const legs=neutral.legs.map(template=>{
      const step=groundStepAt(phase+template.phaseOffset,binding.stride,binding.support,binding.lift),n=step.p/binding.support;
      const roll=step.planted?(n<.18?-.08*(1-minimumJerk(n/.18))
        :n>.78?.23*minimumJerk((n-.78)/.22):0)
        :.23-.31*minimumJerk((step.p-binding.support)/(1-binding.support));
      const [x,y,z]=template.hip;
      const hip=[x+(template.fore?shoulder:pelvis),y+bob+pitch*(x-128),z];
      const contact=[binding.gaitCenters[template.id]+step.x,template.contact[1]+step.y,z];
      return {...solveLegPose(template,hip,contact,roll,step.planted,false),phaseOffset:template.phaseOffset};
    });
    return {species:binding.species,phase,bob,pitch,pelvis,shoulder,legs};
  }
  const start=walk(binding.launchPhase);
  const enter=progress=>launchEnterPose(start,neutral,progress);
  const firstWalk=(phase,cycles)=>launchWalkPose(walk(phase),neutral,start,cycles,binding);
  const settle=(from,progress)=>groundHandoffPose(from,neutral,{mode:'settle',progress});
  function resolve(ground) {
    if(!ground)return neutral;
    if(ground.mode==='enter')return enter(ground.progress);
    if(ground.mode==='walk')return firstWalk(ground.phase,ground.travelCycles??Infinity);
    if(ground.mode==='settle') {
      const from=Number.isFinite(ground.fromEnterProgress)?enter(ground.fromEnterProgress)
        :firstWalk(ground.phase,ground.fromTravelCycles??Infinity);
      return settle(from,ground.progress);
    }
    throw new TypeError('Unknown ground surface pose mode');
  }
  return {neutral,walk,enter,firstWalk,settle,resolve};
}
