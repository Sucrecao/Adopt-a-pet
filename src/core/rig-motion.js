/** Source coordinates are 256px square; all ground contacts share y=226. */
export const RIG_GEOMETRY = Object.freeze({
 renderSize:256, groundY:226, pivot:{x:128,y:140}, bodyBounds:{x:45,y:50,width:180,height:125},
 hindHip:{x:80,y:147}, foreHip:{x:170,y:154}, hindLengths:[45,45], foreLengths:[38,40],
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
export function createRigController({species='cat',stride=64,random=Math.random}={}) {
 // Randomness changes only secondary idle motion, never contact or phase.
 const idleOffset=random()*Math.PI*2;
 let turnId=0,supportId=0;
 let direction,turn,contacts=[null,null,null,null];
 let phase=0,lastDistance,lastEpoch,lastSize,lastSpecies=species,lastNow,liftWeight=0,sequence=0,activeAction,activeToken,actionElapsed=0,activeClock=0,lastFrozen=false,lastMoving=false,lastPose;
 return {sample(props={},now=0) {
 const locomotion=props.locomotion||{},size=locomotion.spriteSizeDip>0?locomotion.spriteSizeDip:256;
 const currentSpecies=props.species||species;
 const distance=Number.isFinite(locomotion.distanceDip)?locomotion.distanceDip:0;
 const paused=!!(props.paused||locomotion.paused),dragging=!!locomotion.dragging;
 const frozen=paused||dragging||!!props.reducedMotion||props.ambient===false;
 const moving=!!locomotion.moving&&!frozen;
 const rebase=lastDistance===undefined||lastEpoch!==locomotion.epoch||lastSize!==size||lastSpecies!==currentSpecies;
 const travel=!rebase&&!frozen&&!lastFrozen?Math.max(0,distance-lastDistance)*256/size:0;
 const requestedFacing=locomotion.facing===-1?-1:1;
 if(direction===undefined)direction=requestedFacing;
 if(!rebase&&!frozen&&(moving||lastMoving)&&!lastFrozen)phase+=travel/stride;
 lastMoving=moving;
 lastDistance=distance;lastEpoch=locomotion.epoch;lastSize=size;lastSpecies=currentSpecies;
 const dt=lastNow===undefined||frozen||lastFrozen?0:Math.max(0,now-lastNow);lastNow=now;
 lastFrozen=frozen;
 // A paused sample still consumes telemetry, but returns the exact last pose.
 if(frozen&&lastPose)return lastPose;
 activeClock+=dt;
 if(rebase){turn=undefined;contacts=[null,null,null,null];direction=requestedFacing;}
 if(requestedFacing!==direction&&!turn&&lastPose){
 turn={id:++turnId,from:direction,to:requestedFacing,elapsed:0,replanted:[false,false,false,false],start:lastPose.legs.map(l=>({foot:{...l.foot},hip:{...l.hip},planted:l.planted,supportGeneration:l.supportKey})),travel:0};
 }
 if(turn){if(!props.action||props.action==='idle'||props.action==='play')turn.elapsed+=Math.min(50,dt);turn.travel+=travel*requestedFacing;}
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
 const duration=action==='pet'?2400:action==='feed'?3200:action==='groom'?2200:2600;
 const envelope=Math.sin(Math.PI*clamp(elapsed/duration,0,1));
 if(action==='stretch'){bodyY=2*envelope;bodyAngle=.18*envelope;}
 if(action==='trick'){
 if(elapsed<260)bodyY=5*Math.sin(Math.PI*elapsed/260);
 else if(elapsed<740){const u=(elapsed-260)/480;bodyY=-28*4*u*(1-u);airborne=u>0;bodyAngle=.08*Math.sin(Math.PI*2*u);}
 else if(elapsed<1040)bodyY=4*Math.sin(Math.PI*(elapsed-740)/300);
 }
 if(action==='pet')bodyAngle=-.025*envelope;
 if(action==='feed')bodyAngle=.025*envelope;
 if(turn&&action==='trick')bodyAngle=0;
 const body={x:0,y:bodyY,angle:bodyAngle,pivot:RIG_GEOMETRY.pivot};
 const legs=['nearHind','nearFore','farHind','farFore'].map((id,i)=>{
 const kind=i%2?'fore':'hind',side=i<2?'near':'far',far=side==='far'?4:0;
 const sourceHip=kind==='fore'?RIG_GEOMETRY.foreHip:RIG_GEOMETRY.hindHip;
 let hip=transform({x:sourceHip.x+far,y:sourceHip.y},body);
 const trajectory=footTrajectory(phase+i*.25,{stride,lift:15*liftWeight});
 let foot={x:sourceHip.x+far+trajectory.x,y:226+trajectory.y},planted=trajectory.planted&&!airborne;
 if(!moving&&liftWeight<.001){foot.y=226;planted=!airborne;}

 // Legs are already in canvas coordinates; reversing never mirrors planted paws.
 let supportGeneration=`gait:${lastEpoch}:${direction}:${Math.floor(phase+i*.25)}`;
 const facing=turn?turn.to:direction;
 hip.x=128+facing*(hip.x-128);foot.x=128+facing*(foot.x-128);
 let kneeTurn=1;
 let holdingTurnContact=false;
 if(turn){
 const start=turn.start[i],u=clamp((turn.elapsed-i*150)/350,0,1),weight=smooth(u);
 kneeTurn=weight;
 const heldX=start.foot.x-turn.travel;
 hip.x=(start.hip.x-turn.travel)*(1-weight)+hip.x*weight;
 if(u<1){foot={x:heldX*(1-weight)+foot.x*weight,y:start.foot.y*(1-weight)+226*weight-32*Math.sin(Math.PI*u)};planted=u===0&&start.planted;supportGeneration=start.supportGeneration;}
 else {
 if(!turn.replanted[i]){contacts[i]={x:foot.x,y:226,supportGeneration:`turn:${turn.id}:${i}`};turn.replanted[i]=true;}
 holdingTurnContact=!!contacts[i];
 }
 }
 if(contacts[i]&&(!turn||holdingTurnContact)){
 const contact=contacts[i];
 const nearingReach=Math.hypot(contact.x-hip.x,contact.y-(hip.y-(airborne?bodyY:0)))>(kind==='fore'?76:88);
 if((!turn&&!trajectory.planted&&moving)||nearingReach||contact.recovery!==undefined){
 contact.recovery=(contact.recovery||0)+((action==='idle'||action==='play')?dt:0);
 const weight=smooth(clamp(contact.recovery/180,0,1));
 foot={x:contact.x*(1-weight)+foot.x*weight,y:contact.y*(1-weight)+foot.y*weight-24*Math.sin(Math.PI*weight)};
 planted=false;
 if(weight===1){contacts[i]=null;planted=trajectory.planted;}
 }else {foot={x:contact.x,y:contact.y};supportGeneration=contact.supportGeneration;planted=foot.y===226;}
 }

 if(airborne){foot.y+=bodyY;planted=false;}
 if(action==='groom'&&i===1){const u=smooth(clamp(elapsed/300,0,1))*smooth(clamp((1800-elapsed)/300,0,1));foot={x:foot.x*(1-u)+(128+orientation*(62+Math.sin(elapsed/90)*3))*u,y:foot.y*(1-u)+108*u};planted=planted&&u===0;}
 const [upperLength,lowerLength]=kind==='fore'?RIG_GEOMETRY.foreLengths:RIG_GEOMETRY.hindLengths;
 const bend=facing*(kind==='fore'?1:-1);
 const joints=solveLeg(hip,foot,upperLength,lowerLength,bend);
 if(turn&&kneeTurn<1){
 const before=solveLeg(hip,foot,upperLength,lowerLength,turn.from*(kind==='fore'?1:-1));
 joints.knee={x:before.knee.x*(1-kneeTurn)+joints.knee.x*kneeTurn,y:before.knee.y*(1-kneeTurn)+joints.knee.y*kneeTurn};
 }
 const supportKey=supportGeneration,previous=lastPose?.legs[i];
 supportGeneration=previous&&previous.planted===planted&&previous.supportKey===supportKey?previous.supportGeneration:`support:${++supportId}`;
 return {id,side,kind,hip,supportKey,supportGeneration,...joints,planted,upperLength,lowerLength,bend};
 });
 if(turn&&turn.elapsed>=800){direction=turn.to;turn=undefined;}
 const headAngle=action==='groom'?.32*envelope+.06*Math.sin(elapsed/90)*envelope:action==='pet'?-.18*envelope:action==='feed'?.2*envelope+.035*Math.sin(elapsed/100)*envelope:0;
 const wingPhase=(activeClock%900)/900;
 lastPose={phase,sampleTime:now,motionEpoch:lastEpoch,motionDistance:distance,legs,body,bodyY,bodyAngle,tailAngle:.12*Math.sin(activeClock/550+idleOffset)+.08*Math.sin(phase*2*Math.PI)+(action==='pet'?.28*Math.sin(elapsed/80)*envelope:0),headAngle,expressionWeight:smooth(clamp(elapsed/200,0,1))*smooth(clamp((duration-elapsed)/200,0,1)),preen:action==='groom'?envelope:0,orientation,turning:turning&&!!turn,turnRemaining:turn?800-turn.elapsed:0,wingPhase,airborne,clip:action==='trick'?'hop':(action==='idle'||action==='play')&&moving?'walk':action,elapsed,sequence,facing:locomotion.facing===-1?-1:1,stopped:!moving,frame:Math.floor(elapsed/100),species:currentSpecies,geometry:RIG_GEOMETRY};
 return lastPose;
 }};
}
