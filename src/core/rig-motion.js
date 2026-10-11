/** Source coordinates are 256px square; all ground contacts share y=226. */
export const RIG_GEOMETRY = Object.freeze({
 renderSize:256, groundY:226, pivot:{x:128,y:140}, bodyBounds:{x:45,y:50,width:180,height:125},
 hindHip:{x:80,y:147}, foreHip:{x:170,y:135}, hindLengths:[35,40], foreLengths:[44.5,44.5],
});
const CAT_GEOMETRY = Object.freeze({
 ...RIG_GEOMETRY,
 hindHip:{x:80,y:151}, foreHip:{x:170,y:145}, hindLengths:[32,34], foreLengths:[40,40],
});
export const DOG_GEOMETRY = Object.freeze({
 ...RIG_GEOMETRY,
 hindHip:{x:80,y:151},foreHip:{x:170,y:145},hindLengths:[34,35],foreLengths:[39.5,39.5],
 foreDepth:16,hindDepth:12,
});
export const DOG_TURN_WINDOWS=Object.freeze({
 lead:Object.freeze([[0,160],[320,480],[640,800]].map(Object.freeze)),
 other:Object.freeze([[160,320],[480,640]].map(Object.freeze)),
});
const clamp=(v,min,max)=>Math.max(min,Math.min(max,v));
const smooth=u=>u*u*(3-2*u);
export function footTrajectory(phase,{stride=64,stance=.65,lift=15}={}) {
 const p=((phase%1)+1)%1;
 if(p<stance)return {x:stride*stance/2-stride*p,y:0,planted:true};
 const u=(p-stance)/(1-stance);
 return {x:-stride*stance/2+stride*stance*smooth(u),y:-lift*Math.sin(Math.PI*u),planted:false};
}
/** The requested endpoint is preserved; unreachable requests clamp the knee solve. */
export function solveLeg(hip,foot,upperLength,lowerLength,bend=1) {
 const dx=foot.x-hip.x,dy=foot.y-hip.y;
 const d=clamp(Math.hypot(dx,dy),Math.abs(upperLength-lowerLength)+1e-6,upperLength+lowerLength-1e-6);
 const angle=Math.atan2(dy,dx)+(bend<0?-1:1)*Math.acos(clamp((upperLength**2+d*d-lowerLength**2)/(2*upperLength*d),-1,1));
 return {knee:{x:hip.x+upperLength*Math.cos(angle),y:hip.y+upperLength*Math.sin(angle)},foot:{...foot}};
}
function transform(point,body) {
 const x=point.x-body.pivot.x,y=point.y-body.pivot.y,c=Math.cos(body.angle),s=Math.sin(body.angle);
 return {x:body.pivot.x+x*c-y*s+body.x,y:body.pivot.y+x*s+y*c+body.y};
}
const standingX=(geometry,index,species='cat')=>{
 const fore=index%2===1,root=fore?geometry.foreHip:geometry.hindHip;
 return root.x+(fore?2:species==='dog'?6:3)+(index<2?0:9);
};
function projectedX(geometry,index,orientation,species,sole=false) {
 const fore=index%2===1,root=fore?geometry.foreHip:geometry.hindHip;
 const profile=sole?standingX(geometry,index,species):root.x+(index<2?0:4);
 const depth=species==='dog'?(fore?geometry.foreDepth:geometry.hindDepth)*(index<2?-1:1)*(1-orientation**2):0;
 return 128+orientation*(profile-128)+depth;
}
function dogTurnStep(turn,index,geometry,body) {
 const at=time=>turn.from+(turn.to-turn.from)*smooth(clamp(time/800,0,1));
 turn.pairLead??=(()=>{
  const scores=[0,1].map(pair=>Math.max(...turn.start.map((old,j)=>{
   if((j===0||j===3?0:1)!==pair)return -Infinity;
   const fore=j%2===1,root=fore?geometry.foreHip:geometry.hindHip;
   const hip=transform({x:projectedX(geometry,j,at(160),'dog'),y:root.y},body);
   return Math.hypot(old.foot.x-(fore?2:6)*at(160)-hip.x,old.foot.y-(fore?9:15)-hip.y)
    -(fore?geometry.foreLengths:geometry.hindLengths).reduce((a,b)=>a+b);
  })));
  const pairs=[[0,3],[1,2]],airborne=pairs.findIndex(pair=>pair.every(j=>!turn.start[j].planted&&turn.start[j].foot.y<226-1e-8));
  // Finish a whole airborne pair before lifting the two remaining supports.
  // Their predicted hold must still fit the chain; other phases use reach.
  if(airborne>=0&&pairs[1-airborne].every(j=>turn.start[j].planted)&&scores[1-airborne]<=0)return airborne;
  return scores[1]>scores[0]?1:0;
 })();
 turn.landings??=Array.from({length:4},()=>[]);
 const lead=(index===0||index===3?0:1)===turn.pairLead;
 const windows=lead?DOG_TURN_WINDOWS.lead:DOG_TURN_WINDOWS.other,start=turn.start[index];
 let foot={x:start.foot.x-turn.travel,y:start.foot.y},planted=start.planted,supportGeneration=start.supportGeneration;
 if(turn.resume&&turn.resume.at<=windows[0][0]){
  const saved=turn.resume.feet[index];foot={x:saved.foot.x-(turn.travel-turn.resume.travel),y:saved.foot.y};
  planted=saved.planted;supportGeneration=saved.supportKey;
 }
 for(const [step,[begin,end]]of windows.entries()){
  if(turn.elapsed<begin)break;
  const fore=index%2===1,root=fore?geometry.foreHip:geometry.hindHip,final=step===windows.length-1;
  const pawX=fore?2:6,pawY=fore?9:15,length=(fore?geometry.foreLengths:geometry.hindLengths).reduce((a,b)=>a+b)-(fore?.75:1.5);
  let left=-Infinity,right=Infinity;
  // A planted landing must remain reachable throughout its hold, including
  // the following pair's swing. Both end roots bound that monotone projection.
  for(const time of[end,windows[step+1]?.[0]??800]){
   const landingOrientation=at(time),hip=transform({x:projectedX(geometry,index,landingOrientation,'dog'),y:root.y},body);
   const horizontal=Math.sqrt(Math.max(0,length**2-(226-pawY-hip.y)**2));
   const translation=(turn.travelRate??0)*(time-end);
   left=Math.max(left,hip.x-horizontal+pawX*landingOrientation+translation);right=Math.min(right,hip.x+horizontal+pawX*landingOrientation+translation);
  }
  // First landings and the lead pair's middle step share one frontal stance.
  // The final two windows then place both pairs in the new profile stance.
  const desired=projectedX(geometry,index,final?turn.to:0,'dog',true);
  const target={x:clamp(desired,left,right),y:226};
  if(turn.elapsed<end){
   let u=(turn.elapsed-begin)/(end-begin),amplitude=22;
   if(turn.resume&&turn.resume.at>=begin&&turn.resume.at<end){
    const saved=turn.resume.feet[index];foot={x:saved.foot.x-(turn.travel-turn.resume.travel),y:saved.foot.y};
    planted=saved.planted;supportGeneration=saved.supportKey;
    u=(turn.elapsed-turn.resume.at)/(end-turn.resume.at);amplitude*=(end-turn.resume.at)/(end-begin);
   }
   const weight=smooth(u);
   return {foot:{x:foot.x*(1-weight)+target.x*weight,y:foot.y*(1-weight)+226*weight-amplitude*Math.sin(Math.PI*u)},
    planted:u===0&&planted,supportGeneration};
  }
  turn.landings[index][step]??={x:target.x+turn.travel,y:226};
  foot={x:turn.landings[index][step].x-turn.travel,y:226};planted=true;
  supportGeneration=`turn:${turn.id}:${index}:${step}`;
 }
 return {foot,planted,supportGeneration};
}
function pairedTurnStep(turn,index,geometry,body,species='cat') {
 // App and native locomotion stop before changing a dog's facing. Keep the
 // moving-telemetry recovery path for callers that instead translate in turn.
 if(species==='dog'&&!turn.continuousMotion)return dogTurnStep(turn,index,geometry,body);
 const at=time=>turn.from+(turn.to-turn.from)*smooth(clamp(time/800,0,1));
 // Move the diagonal pair nearest its reach limit first. Roots remain on the
 // turning torso; only the soles perform these two alternating replants.
 turn.pairLead??=(()=>{
  const scores=[0,1].map(pair=>Math.max(...turn.start.map((old,j)=>{
   if((j===0||j===3?0:1)!==pair)return -Infinity;
   const fore=j%2===1,root=fore?geometry.foreHip:geometry.hindHip;
   const hip=transform({x:projectedX(geometry,j,at(200),species),y:root.y},body);
   return Math.hypot(old.foot.x-(fore?2:species==='dog'?6:7)*at(200)-hip.x,old.foot.y-(fore?9:species==='dog'?15:17)-hip.y)
    -(fore?geometry.foreLengths:geometry.hindLengths).reduce((a,b)=>a+b);
  })));
  return scores[1]>scores[0]?1:0;
 })();
 turn.landings??=Array.from({length:4},()=>[]);
 const lead=(index===0||index===3?0:1)===turn.pairLead;
 const firstStart=lead?0:200,secondStart=lead?400:600,start=turn.start[index];
 turn.earlySecond??=[];
 let foot={x:start.foot.x-turn.travel,y:start.foot.y},planted=start.planted,supportGeneration=start.supportGeneration;
 if(turn.resume&&turn.resume.at<=firstStart){
  const saved=turn.resume.feet[index];foot={x:saved.foot.x-(turn.travel-turn.resume.travel),y:saved.foot.y};
  planted=saved.planted;supportGeneration=saved.supportKey;
 }
 for(const step of [0,1]) {
  const begin=step===0?firstStart:turn.earlySecond[index]??secondStart;
  const end=step===0?firstStart+200:turn.travel?800:secondStart+200;
  const target={x:projectedX(geometry,index,step===0?at(end+100):turn.to,species,true),y:226};
  if(turn.elapsed<begin)break;
  if(turn.elapsed<end){
   let u=(turn.elapsed-begin)/(end-begin),amplitude=species==='dog'&&!turn.travel?22:32;
   if(turn.resume&&turn.resume.at>=begin&&turn.resume.at<end){
    const saved=turn.resume.feet[index];foot={x:saved.foot.x-(turn.travel-turn.resume.travel),y:saved.foot.y};
    planted=saved.planted;supportGeneration=saved.supportKey;
    u=(turn.elapsed-turn.resume.at)/(end-turn.resume.at);amplitude*=(end-turn.resume.at)/(end-begin);
   }
   const weight=smooth(u);
   return {foot:{x:foot.x*(1-weight)+target.x*weight,y:foot.y*(1-weight)+226*weight-amplitude*Math.sin(Math.PI*u)},
    planted:u===0&&planted,supportGeneration};
  }
  turn.landings[index][step]??={x:target.x+turn.travel,y:226};
  foot={x:turn.landings[index][step].x-turn.travel,y:226};planted=true;
  supportGeneration=`turn:${turn.id}:${index}:${step}`;
  if(step===0&&turn.elapsed<secondStart){
   const fore=index%2===1,root=fore?geometry.foreHip:geometry.hindHip;
   const hip=transform({x:projectedX(geometry,index,at(turn.elapsed),species),y:root.y},body);
   const distance=Math.hypot(foot.x-(fore?2:species==='dog'?6:7)*at(turn.elapsed)-hip.x,foot.y-(fore?9:species==='dog'?15:17)-hip.y);
   if(distance>(fore?geometry.foreLengths:geometry.hindLengths).reduce((a,b)=>a+b)-(species==='dog'&&!turn.travel?1:4))turn.earlySecond[index]??=turn.elapsed;
  }
 }
 return {foot,planted,supportGeneration};
}
export function createRigController({species='cat',stride=64,random=Math.random}={}) {
 // Randomness changes only secondary idle motion, never contact or phase.
 const idleOffset=random()*Math.PI*2;
 let turnId=0,supportId=0,standId=0,catSettle;
 let direction,turn,contacts=[null,null,null,null],contactHips=[];
 let phase=0,lastDistance,lastEpoch,lastSize,lastSpecies=species,lastNow,liftWeight=0,sequence=0,activeAction,activeToken,actionElapsed=0,activeClock=0,lastFrozen=false,lastMoving=false,lastPose;
 return {sample(props={},now=0) {
 const locomotion=props.locomotion||{},size=locomotion.spriteSizeDip>0?locomotion.spriteSizeDip:256;
 const currentSpecies=props.species||species;
 const geometry=currentSpecies==='cat'?CAT_GEOMETRY:currentSpecies==='dog'?DOG_GEOMETRY:RIG_GEOMETRY;
 const coordinated=currentSpecies==='cat'||currentSpecies==='dog';
 const distance=Number.isFinite(locomotion.distanceDip)?locomotion.distanceDip:0;
 const paused=!!(props.paused||locomotion.paused),dragging=!!locomotion.dragging;
 const frozen=paused||dragging||!!props.reducedMotion||props.ambient===false;
 const moving=!!locomotion.moving&&!frozen;
 const rebase=lastDistance===undefined||lastEpoch!==locomotion.epoch||lastSize!==size||lastSpecies!==currentSpecies;
 const travel=!rebase&&!frozen&&!lastFrozen?Math.max(0,distance-lastDistance)*256/size:0;
 const requestedFacing=locomotion.facing===-1?-1:1;
 if(direction===undefined)direction=requestedFacing;
 if(!rebase&&!frozen&&(moving||lastMoving)&&!lastFrozen)phase+=travel/stride;
 const wasMoving=lastPose&&!lastPose.stopped;lastMoving=moving;
 lastDistance=distance;lastEpoch=locomotion.epoch;lastSize=size;lastSpecies=currentSpecies;
 const dt=lastNow===undefined||frozen||lastFrozen?0:Math.max(0,now-lastNow);lastNow=now;
 lastFrozen=frozen;
 // A paused sample still consumes telemetry, but returns the exact last pose.
 if(frozen&&lastPose)return lastPose;
 activeClock+=dt;
 if(rebase){turn=undefined;contacts=[null,null,null,null];direction=requestedFacing;}
 if(requestedFacing!==direction&&!turn&&lastPose){
 turn={id:++turnId,from:direction,to:requestedFacing,elapsed:0,replanted:[false,false,false,false],start:lastPose.legs.map((l,i)=>({contactHip:{...contactHips[i]},foot:{...l.foot},hip:{...l.hip},planted:l.planted,supportGeneration:l.supportKey})),travel:0,...(currentSpecies==='dog'?{continuousMotion:moving}:{})};
 }
 if(coordinated){
  if((catSettle||currentSpecies==='dog'&&!wasMoving)&&moving&&!rebase&&!turn&&lastPose){
   contacts=lastPose.legs.map(leg=>({...leg.foot,x:leg.foot.x-(currentSpecies==='dog'?0:travel*requestedFacing),supportGeneration:leg.supportKey,...(!leg.planted?{recovery:0,recoveryLift:0}:{})}));
  }
  if(rebase||moving||turn)catSettle=undefined;
  else if(wasMoving&&lastPose){
   const start=lastPose.legs.map(l=>({foot:{...l.foot},planted:l.planted,supportKey:l.supportKey}));
   catSettle={id:++standId,elapsed:dt,start,lead:[1,2].filter(i=>!start[i].planted).length>[0,3].filter(i=>!start[i].planted).length?1:0};
  }else if(catSettle)catSettle.elapsed+=dt;
  if(turn&&(props.action==='idle'||props.action==='play'||!props.action)&&activeAction&&activeAction!=='idle'&&activeAction!=='play'){
   turn.resume={at:turn.elapsed,travel:turn.travel,feet:lastPose.legs.map(l=>({foot:{...l.foot},planted:l.planted,supportKey:l.supportKey}))};
  }
 }
 if(turn){if(!props.action||props.action==='idle'||props.action==='play')turn.elapsed+=Math.min(50,dt);turn.travel+=travel*requestedFacing;if(currentSpecies==='dog')turn.travelRate=dt?travel*requestedFacing/Math.min(50,dt):0;}
 for(const contact of contacts)if(contact)contact.x-=travel*requestedFacing;
 const turning=!!turn,turnProgress=turn?smooth(clamp(turn.elapsed/800,0,1)):1;
 const orientation=turn?turn.from+(turn.to-turn.from)*turnProgress:direction;
 liftWeight+=(Number(moving)-liftWeight)*(1-Math.exp(-dt/90));
 const action=props.action||'idle',token=props.actionStartedAt;
 if(action!==activeAction||token!==activeToken){activeAction=action;activeToken=token;actionElapsed=Math.max(0,Number(props.actionElapsed)||0);sequence++;}
 else actionElapsed+=dt;
 const elapsed=actionElapsed;
 let bodyY=0,bodyAngle=0,airborne=false;
 bodyY=-1.2*(1-Math.cos(phase*4*Math.PI))*liftWeight;
 if(coordinated&&['pet','feed','groom'].includes(action))bodyY=0;
 const duration=action==='pet'?2400:action==='feed'?3200:action==='groom'?2200:2600;
 const envelope=Math.sin(Math.PI*clamp(elapsed/duration,0,1));
 if(action==='stretch'){bodyY=(currentSpecies==='cat'?6:currentSpecies==='dog'?4:2)*envelope;bodyAngle=(currentSpecies==='cat'?.16:currentSpecies==='dog'?.12:.18)*envelope;}
 if(action==='trick'){
 if(elapsed<260)bodyY=5*Math.sin(Math.PI*elapsed/260);
 else if(elapsed<740){const u=(elapsed-260)/480;bodyY=-28*4*u*(1-u);airborne=u>0;bodyAngle=(coordinated?.035:.08)*Math.sin(Math.PI*2*u);}
 else if(elapsed<1040)bodyY=4*Math.sin(Math.PI*(elapsed-740)/300);
 }
 if(action==='pet')bodyAngle=-.025*envelope;
 if(action==='feed')bodyAngle=.025*envelope;
 if(turn&&action==='trick')bodyAngle=0;
 const body={x:0,y:bodyY,angle:bodyAngle,pivot:RIG_GEOMETRY.pivot};
 const legs=['nearHind','nearFore','farHind','farFore'].map((id,i)=>{
 const kind=i%2?'fore':'hind',side=i<2?'near':'far',far=side==='far'?4:0;
 const sourceHip=kind==='fore'?geometry.foreHip:geometry.hindHip;
 const [restUpperLength,restLowerLength]=kind==='fore'?geometry.foreLengths:geometry.hindLengths;
 const pawX=kind==='fore'?2:currentSpecies==='cat'?7:currentSpecies==='dog'?6:8,pawY=kind==='fore'?9:currentSpecies==='cat'?17:currentSpecies==='dog'?15:21;
 let hip=transform({x:coordinated?projectedX(geometry,i,orientation,currentSpecies):sourceHip.x+far,y:sourceHip.y},body);
 // Contact release retains the accepted old attachment geometry independently of the skin joints.
 let contactHip=transform({x:sourceHip.x+far,y:kind==='fore'?154:sourceHip.y},body);
 const trajectory=footTrajectory(phase+i*.25,{stride,lift:15*liftWeight});
 let foot={x:sourceHip.x+far+trajectory.x,y:226+trajectory.y},planted=trajectory.planted&&!airborne;
 if(!moving&&liftWeight<.001){foot.y=226;planted=!airborne;}
 if(coordinated&&!moving&&!turn){foot={x:standingX(geometry,i,currentSpecies),y:226};planted=!airborne;}

 // Legs are already in canvas coordinates; reversing never mirrors planted paws.
 let supportGeneration=`gait:${lastEpoch}:${direction}:${Math.floor(phase+i*.25)}`;
 const facing=turn?turn.to:direction;
 if(!coordinated)hip.x=128+facing*(hip.x-128);
 contactHip.x=128+facing*(contactHip.x-128);foot.x=128+facing*(foot.x-128);
 if(catSettle&&coordinated&&!turn){
  const start=catSettle.start[i],pair=i===0||i===3?0:1,begin=pair===catSettle.lead?0:220,u=clamp((catSettle.elapsed-begin)/220,0,1),weight=smooth(u);
  foot={x:start.foot.x*(1-weight)+foot.x*weight,y:start.foot.y*(1-weight)+226*weight-(start.planted?15:0)*Math.sin(Math.PI*u)};
  planted=u===0?start.planted:u===1&&!airborne;
  supportGeneration=u===0?start.supportKey:`stand:${catSettle.id}:${i}`;
  if(u===1)contacts[i]={...foot,supportGeneration};
 }
 let kneeTurn=1;
 let holdingTurnContact=false;
 if(turn&&coordinated){
  ({foot,planted,supportGeneration}=pairedTurnStep(turn,i,geometry,body,currentSpecies));kneeTurn=turnProgress;
  if(turn.elapsed>=800)contacts[i]={...foot,supportGeneration};
 }else if(turn){
 const start=turn.start[i],u=clamp((turn.elapsed-i*150)/350,0,1),weight=smooth(u);
 kneeTurn=weight;
 const heldX=start.foot.x-turn.travel;
 hip.x=(start.hip.x-turn.travel)*(1-weight)+hip.x*weight;
 contactHip.x=(start.contactHip.x-turn.travel)*(1-weight)+contactHip.x*weight;
 if(u<1){foot={x:heldX*(1-weight)+foot.x*weight,y:start.foot.y*(1-weight)+226*weight-32*Math.sin(Math.PI*u)};planted=u===0&&start.planted;supportGeneration=start.supportGeneration;}
 else {
 if(!turn.replanted[i]){contacts[i]={x:foot.x,y:226,supportGeneration:`turn:${turn.id}:${i}`};turn.replanted[i]=true;}
 holdingTurnContact=!!contacts[i];
 }
 }
 if(contacts[i]&&!catSettle&&(!turn||!coordinated&&holdingTurnContact)){
 const contact=contacts[i];
 const contactOrientation=coordinated?orientation:turn?turn.from+(turn.to-turn.from)*kneeTurn:direction;
 const nearingReach=coordinated
   ? Math.hypot(contact.x-pawX*contactOrientation-hip.x,contact.y-pawY-(hip.y-(airborne?bodyY:0)))>restUpperLength+restLowerLength-4
   : Math.hypot(contact.x-contactHip.x,contact.y-(contactHip.y-(airborne?bodyY:0)))>(kind==='fore'?76:88);
 if((!turn&&!trajectory.planted&&moving)||nearingReach||contact.recovery!==undefined){
 contact.recovery=(contact.recovery||0)+((action==='idle'||action==='play')?dt:0);
 const weight=smooth(clamp(contact.recovery/180,0,1));
 foot={x:contact.x*(1-weight)+foot.x*weight,y:contact.y*(1-weight)+foot.y*weight-(contact.recoveryLift??24)*Math.sin(Math.PI*weight)};
 planted=false;
 if(weight===1){contacts[i]=null;planted=trajectory.planted;}
 }else {foot={x:contact.x,y:contact.y};supportGeneration=contact.supportGeneration;planted=foot.y===226;}
 }

 if(currentSpecies==='dog'&&turn&&!turn.continuousMotion&&action!=='idle'&&action!=='play'){
  // Care pauses the turn and lands its raised paws once. Keep those new floor
  // contacts independent of later body bends and the hop's vertical motion.
  if(turn.care?.sequence!==sequence){
   turn.care={sequence,travel:turn.travel,start:lastPose.legs.map(leg=>({foot:{...leg.foot},planted:leg.planted,supportKey:leg.supportKey})),targets:[]};
  }
  const saved=turn.care.start[i],drift=turn.travel-turn.care.travel;
  if(!turn.care.targets[i]){
   let left=-Infinity,right=Infinity;
   for(const weight of[0,.5,1]){
    const angle=(action==='pet'?-.025:action==='feed'?.025:action==='stretch'?.12:0)*weight;
    const careBody={...body,y:action==='stretch'?4*weight:0,angle};
    const root=transform({x:projectedX(geometry,i,orientation,'dog'),y:sourceHip.y},careBody);
    const length=restUpperLength+restLowerLength-.5;
    const horizontal=Math.sqrt(Math.max(0,length**2-(226-pawY-root.y)**2));
    left=Math.max(left,root.x-horizontal+pawX*orientation);right=Math.min(right,root.x+horizontal+pawX*orientation);
   }
   turn.care.targets[i]={x:saved.planted?saved.foot.x:clamp(saved.foot.x,left,right),y:226};
  }
  const target=turn.care.targets[i],weight=smooth(clamp(elapsed/180,0,1));
  foot=saved.planted?{x:saved.foot.x-drift,y:saved.foot.y}
   :{x:saved.foot.x*(1-weight)+target.x*weight-drift,y:saved.foot.y*(1-weight)+226*weight};
  planted=(saved.planted||weight===1)&&!airborne;
  supportGeneration=saved.planted?saved.supportKey:weight===1?`care:${sequence}:${i}`:saved.supportKey;
 }else if(coordinated&&turn&&action!=='idle'&&action!=='play'&&!(action==='groom'&&i===1)){
  const weight=smooth(clamp(elapsed/180,0,1));
  const pair=i===0||i===3?0:1,firstStart=pair===turn.pairLead?0:currentSpecies==='dog'&&!turn.continuousMotion?160:200;
  if(!planted&&turn.elapsed<=firstStart)foot.x=foot.x*(1-weight)+projectedX(geometry,i,orientation,currentSpecies,true)*weight;
  foot.y=foot.y*(1-weight)+226*weight;planted=foot.y===226&&!airborne;
 }
 contactHips[i]=contactHip;
 if(airborne){foot.y+=bodyY;planted=false;}
 const groomElapsed=currentSpecies==='dog'&&turn&&!turn.continuousMotion?Math.max(0,elapsed-180):elapsed;
 const groomWeight=action==='groom'&&i===1?smooth(clamp(groomElapsed/300,0,1))*smooth(clamp((1800-elapsed)/300,0,1)):0;
 if(action==='groom'&&i===1){const u=groomWeight;foot={x:foot.x*(1-u)+(128+orientation*(62+Math.sin(elapsed/90)*3))*u,y:foot.y*(1-u)+108*u};planted=planted&&u===0;}
 const limbOrientation=coordinated?orientation:turn?turn.from+(turn.to-turn.from)*kneeTurn:direction;
 const ankle={x:foot.x-pawX*limbOrientation,y:foot.y-pawY};
 const pawLength=Math.hypot(foot.x-ankle.x,foot.y-ankle.y);
 // Raised grooming bends toward the viewer; its screen projection folds without changing the sole.
 const foldedLength=Math.hypot(Math.hypot(ankle.x-hip.x,ankle.y-hip.y)/2,4);
 const projectionWeight=action==='groom'&&i===1?smooth(clamp(groomElapsed/120,0,1))*smooth(clamp((1800-elapsed)/120,0,1)):0;
 let perspectiveFactor=1-projectionWeight+projectionWeight*foldedLength/restUpperLength;
 if(currentSpecies==='dog'){
  // A leg pointing toward the camera projects into a straight narrow chain.
  // Solve that projected chain; interpolating opposing knees collapses bones.
  const frontWeight=1-orientation**2,distance=Math.hypot(ankle.x-hip.x,ankle.y-hip.y);
  if(kind==='fore'){
   const elbowOffset=(8*(1-projectionWeight)+4*projectionWeight)*(1-frontWeight)+2*frontWeight;
   const projected=Math.min(1,Math.sqrt(distance**2+4*elbowOffset**2)/(restUpperLength+restLowerLength));
   perspectiveFactor=Math.min(perspectiveFactor,projected);
  }else{
   const frontFactor=Math.min(1,Math.sqrt(distance**2+16)/(restUpperLength+restLowerLength));
   perspectiveFactor=perspectiveFactor*(1-frontWeight)+frontFactor*frontWeight;
  }
 }
 const upperLength=restUpperLength*perspectiveFactor,lowerLength=restLowerLength*perspectiveFactor;
 const skinLength=restUpperLength+restLowerLength;
 const bend=(currentSpecies==='dog'?(orientation<0?-1:1):facing)*(kind==='fore'?1:-1);
 const joints=solveLeg(hip,ankle,upperLength,lowerLength,bend);
 if(turn&&kneeTurn<1&&currentSpecies!=='dog'){
 const before=solveLeg(hip,ankle,upperLength,lowerLength,turn.from*(kind==='fore'?1:-1));
 joints.knee={x:before.knee.x*(1-kneeTurn)+joints.knee.x*kneeTurn,y:before.knee.y*(1-kneeTurn)+joints.knee.y*kneeTurn};
 }
 const supportKey=supportGeneration,previous=lastPose?.legs[i];
 supportGeneration=previous&&previous.planted===planted&&previous.supportKey===supportKey?previous.supportGeneration:`support:${++supportId}`;
 return {id,side,kind,hip,supportKey,supportGeneration,...joints,foot,ankle,orientation:limbOrientation,pawLength,perspectiveFactor,skinLength,planted,upperLength,lowerLength,bend};
 });
 if(catSettle?.elapsed>=440)catSettle=undefined;
 if(turn&&turn.elapsed>=800){direction=turn.to;turn=undefined;}
 const headAngle=action==='groom'?.32*envelope+.06*Math.sin(elapsed/90)*envelope:action==='pet'?-.18*envelope:action==='feed'?.2*envelope+.035*Math.sin(elapsed/100)*envelope:0;
 const wingPhase=(activeClock%900)/900;
 lastPose={phase,sampleTime:now,motionEpoch:lastEpoch,motionDistance:distance,legs,body,bodyY,bodyAngle,tailAngle:.12*Math.sin(activeClock/550+idleOffset)+.08*Math.sin(phase*2*Math.PI)+(action==='pet'?.28*Math.sin(elapsed/80)*envelope:0),headAngle,expressionWeight:smooth(clamp(elapsed/200,0,1))*smooth(clamp((duration-elapsed)/200,0,1)),preen:action==='groom'?envelope:0,orientation,turning:turning&&!!turn,turnRemaining:turn?800-turn.elapsed:0,wingPhase,airborne,clip:action==='trick'?'hop':(action==='idle'||action==='play')&&moving?'walk':action,elapsed,sequence,facing:locomotion.facing===-1?-1:1,stopped:!moving,frame:Math.floor(elapsed/100),species:currentSpecies,geometry};
 return lastPose;
 }};
}
