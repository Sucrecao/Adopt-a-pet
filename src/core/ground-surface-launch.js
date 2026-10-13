// First stance offsets disappear through each foot's first complete swing.
import {solveLegPose} from './ground-surface-handoff.js';
export const START_PHASE=.65;
export const SUPPORT=.65;
const clamp=x=>Math.max(0,Math.min(1,x)),mod=x=>((x%1)+1)%1;
const jerk=q=>{q=clamp(q);return q*q*q*(10+q*(-15+6*q));};
const vector=(a,b,w)=>a.map((value,i)=>value+(b[i]-value)*w);

export function launchEnterPose(startWalk,neutral,progress) {
  const p=clamp(progress);if(p===0)return neutral;
  const weight=jerk(p),pose={...startWalk};
  for(const field of ['bob','pitch','pelvis','shoulder'])pose[field]=neutral[field]+(startWalk[field]-neutral[field])*weight;
  pose.legs=neutral.legs.map(initial=>{
    const goal=startWalk.legs.find(leg=>leg.id===initial.id),prepared=initial.id==='farFore';
    const contact=prepared?vector(initial.contact,goal.contact,weight):[...initial.contact];
    if(prepared)contact[1]-=7*Math.sin(Math.PI*p)**4;
    const roll=initial.roll+(goal.roll-initial.roll)*weight;
    return solveLegPose(initial,vector(initial.hip,goal.hip,weight),contact,roll,prepared?(p===1?goal.planted:false):true,prepared&&p<1);
  });
  return pose;
}

export function launchWalkPose(walkCurrent,neutral,startWalk,travelCycles,config={}) {
  const cycles=Math.max(0,travelCycles);if(cycles===0)return launchEnterPose(startWalk,neutral,1);if(cycles>=1)return walkCurrent;
  return {...walkCurrent,legs:walkCurrent.legs.map(current=>{
    const initial=neutral.legs.find(leg=>leg.id===current.id),start=startWalk.legs.find(leg=>leg.id===current.id),local=mod(startWalk.phase+start.phaseOffset);
    if(current.id==='farFore') {
      const landing=1-local;if(local<=SUPPORT||cycles>=landing)return current;
      const stride=config.stride;if(!(Number.isFinite(stride)&&stride>0))throw new TypeError('Airborne launch landing requires canonical stride');
      const startQ=(local-SUPPORT)/(1-SUPPORT),startX=-SUPPORT/2+jerk(startQ)-(1-SUPPORT)*startQ;
      const center=config.gaitCenters?.farFore??start.contact[0]-stride*startX;
      const destination=[center+stride*(SUPPORT/2+landing),initial.contact[1],start.contact[2]],weight=jerk(cycles/landing);
      const contact=vector(start.contact,destination,weight);contact[0]-=stride*cycles;
      // The steady landing endpoint has a heel-down roll and zero first/second
      // derivatives. This one initial descent follows accepted travel only.
      const roll=start.roll+(-.08-start.roll)*weight;
      return solveLegPose(current,current.hip,contact,roll,false,true);
    }
    const q=clamp((cycles+local-SUPPORT)/(1-SUPPORT)),remaining=1-jerk(q);
    if(remaining===0)return current;
    const contact=current.contact.map((value,i)=>value+(initial.contact[i]-start.contact[i])*remaining);
    return solveLegPose(current,current.hip,contact,current.roll,q===0?true:current.planted,q>0&&q<1);
  })};
}
