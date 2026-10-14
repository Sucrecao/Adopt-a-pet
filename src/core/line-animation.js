const total = track => track.durations.reduce((sum,time)=>sum+time,0);
const mobile = action => action === 'idle' || action === 'play';

export function validateLineAnimation(meta) {
  if (meta.authoring !== 'line-pet-v1') return true;
  const count=meta.frames.length, neutral=meta.neutralFrame, walk=meta.clips.walk.frames;
  const valid=track=>track && Array.isArray(track.frames) && track.frames.length>1
    && track.frames.every(frame=>Number.isInteger(frame)&&frame>=0&&frame<count)
    && Array.isArray(track.durations)&&track.durations.length===track.frames.length
    && track.durations.every(time=>Number.isFinite(time)&&time>0);
  if (!Array.isArray(meta.authoredStops)||meta.authoredStops.length!==walk.length
    ||meta.authoredStops.some((track,i)=>!valid(track)||track.frames[0]!==walk[i]||track.frames.at(-1)!==neutral)) {
    throw new Error('Invalid authored whole-pose stop tracks');
  }
  if (walk[0]!==neutral||meta.clips.idle.frames[0]!==neutral) throw new Error('Invalid line-pet neutral walking junction');
  for (const name of ['pet','feed','groom','stretch','hop']) {
    const frames=meta.clips[name].frames;
    if(frames[0]!==neutral||frames.at(-1)!==neutral||meta.clips[name].loop) throw new Error('Invalid authored care neutral junction');
  }
  const enter=meta.transitions?.rest?.enter,exit=meta.transitions?.rest?.exit;
  if (!valid(enter)||!valid(exit)||enter.frames[0]!==neutral||exit.frames.at(-1)!==neutral
    ||enter.frames.at(-1)!==meta.clips.rest.frames[0]||exit.frames[0]!==meta.clips.rest.frames[0]) throw new Error('Invalid authored rest junction');
  return true;
}

function at(track,elapsed) {
  const length=total(track);
  let time=track.loop ? Math.max(0,elapsed)%length : Math.min(Math.max(0,elapsed),length),index=0;
  while(index<track.frames.length-1&&time>=track.durations[index]) time-=track.durations[index++];
  return {frame:track.frames[index],index,done:!track.loop&&elapsed>=length};
}

/** Select complete authored images. Travel and drawing share the visual root clock. */
export function createLineAnimationController({species='dog',meta,random=Math.random}={}) {
  validateLineAnimation(meta);
  const {clips,neutralFrame:neutral,stride}=meta;
  const delay=()=>6500+6500*Math.max(0,Math.min(1,random()));
  let state={clock:0,lastNow:undefined,frozen:false,distance:undefined,epoch:undefined,size:undefined,nextAutomatic:delay(),automatic:undefined,busy:false,
    phase:0,walkOrigin:0,rebasePending:false,direction:undefined,mode:undefined,sequence:0,pose:undefined},backup;
  const begin=(type,name,track,started=state.clock,extra={})=>{
    state.mode={type,name,track,started,index:0,...extra};state.sequence++;
  };
  const returnToNeutral=mode=>{
    const finish=mode.track.frames.at(-1)===neutral&&mode.track.frames.length-1-mode.index<mode.index;
    const frames=finish?mode.track.frames.slice(mode.index):mode.track.frames.slice(0,mode.index+1).reverse();
    const durations=finish?mode.track.durations.slice(mode.index):mode.track.durations.slice(0,mode.index+1).reverse();
    begin('return',`${mode.name}.return`,{frames,durations,loop:false});
  };
  const settle=index=>begin('settle','walk.settle',{...meta.authoredStops[index],loop:false},state.clock,{stopSlot:index});
  return {
    rollback(){if(backup)state={...backup,lastNow:state.lastNow};},
    sample(props={},now=0) {
      backup=state;
      state={...state,mode:state.mode?{...state.mode}:undefined};
      const loc=props.locomotion??{},frozen=Boolean(props.paused||props.reducedMotion||props.ambient===false||loc.paused||loc.dragging);
      const time=Number.isFinite(now)?now:state.lastNow??0;
      const dt=state.lastNow===undefined||frozen||state.frozen?0:Math.max(0,time-state.lastNow);
      const distance=Number.isFinite(loc.distanceDip)?loc.distanceDip:0,size=loc.spriteSizeDip>0?loc.spriteSizeDip:256;
      const changedEpoch=state.distance!==undefined&&(loc.epoch!==state.epoch||size!==state.size);
      state.lastNow=Math.max(time,state.lastNow??time);state.distance=distance;state.epoch=loc.epoch;state.size=size;state.frozen=frozen;
      if(frozen&&state.pose){
        if(state.mode?.type==='walk') {
          state.walkOrigin=distance-state.phase*stride*size/256;
          state.rebasePending ||= changedEpoch;
        }
        return {...state.pose,stopped:true,firstStepReady:false};
      }
      state.clock+=dt;
      const facing=(loc.facing??props.facing)===-1?-1:1;
      state.direction??=facing;
      const action=props.action??'idle',care=!mobile(action);
      const intent=Boolean(loc.intentMoving??loc.moving??props.walking);
      const busy=care||intent;
      if(busy){state.automatic=undefined;if(!state.busy)state.nextAutomatic=state.clock+delay();}
      else if(state.busy)state.nextAutomatic=state.clock+delay();
      state.busy=busy;
      if(!busy&&!state.automatic&&state.clock>=state.nextAutomatic)state.automatic=['groom','stretch','hop'][Math.min(2,Math.floor(Math.max(0,random())*3))];
      let wanted=care ? action==='trick'?'hop':clips[action]?action:'idle' : intent ? 'walk':state.automatic??'idle';
      const token=props.actionStartedAt;
      if(!state.mode)begin('idle','idle',clips.idle);
      let mode=state.mode;
      const rebase=changedEpoch||state.rebasePending;
      if(mode.type==='walk'&&!rebase) {
        state.phase=Math.max(0,distance-state.walkOrigin)*256/size/stride;
        // Snap only numerical noise at an authored slot boundary. Accumulating
        // per-tick phase formerly chose opposite images at60Hz and120Hz.
        const boundary=Math.round(state.phase*clips.walk.frames.length);
        if(Math.abs(state.phase*clips.walk.frames.length-boundary)<1e-9)state.phase=boundary/clips.walk.frames.length;
      }
      if(rebase&&mode.type==='walk')settle(Math.floor((state.phase%1)*clips.walk.frames.length)%clips.walk.frames.length);
      if(rebase)state.phase=0;
      state.rebasePending=false;

      // Finish each complete-picture return before taking the latest request.
      // An interruption never substitutes a new neutral picture mid-pose.
      for(let pass=0;pass<5;pass++) {
        mode=state.mode;
        const elapsed=state.clock-mode.started;
        const pose=mode.type==='walk'?{frame:clips.walk.frames[Math.floor((state.phase%1)*clips.walk.frames.length)%clips.walk.frames.length],index:Math.floor((state.phase%1)*clips.walk.frames.length)%clips.walk.frames.length,done:false}:at(mode.track,elapsed);
        mode.index=pose.index;
        if(mode.type==='turn') {
          if(pose.done){state.direction=mode.to;begin('idle','idle',clips.idle,mode.started+total(mode.track));continue;}
          break;
        }
        if(['settle','return','rest-exit'].includes(mode.type)) {
          if(pose.done){state.phase=0;begin('idle','idle',clips.idle,mode.started+total(mode.track));continue;}
          break;
        }
        if(mode.type==='rest-enter') {
          if(wanted!=='rest'||facing!==state.direction){returnToNeutral(mode);break;}
          if(pose.done){begin('rest','rest',clips.rest,mode.started+total(mode.track),{token});continue;}
          break;
        }
        if(mode.type==='rest') {
          if(wanted!=='rest'||facing!==state.direction) {
            const exit=meta.transitions.rest.exit;
            begin('rest-exit','rest.exit',{frames:[pose.frame,...exit.frames],durations:[exit.durations[0],...exit.durations],loop:false});
          }
          break;
        }
        if(mode.type==='care') {
          if(pose.done){
            if(mode.automatic){state.automatic=undefined;state.nextAutomatic=state.clock+delay();begin('idle','idle',clips.idle);break;}
            begin('hold',mode.name,{frames:[neutral],durations:[1],loop:true},state.clock,{token:mode.token});continue;
          }
          if(wanted!==mode.name||token!==mode.token||facing!==state.direction){returnToNeutral(mode);}
          break;
        }
        if(mode.type==='hold'&&wanted===mode.name&&token===mode.token&&facing===state.direction)break;
        if(mode.type==='walk') {
          if(wanted!=='walk'||facing!==state.direction)settle(pose.index);
          break;
        }
        if(wanted==='idle'&&facing===state.direction) {
          if(mode.type==='hold')begin('idle','idle',clips.idle);
          break;
        }
        if(mode.type==='idle'&&pose.frame!==neutral){returnToNeutral(mode);break;}
        if(facing!==state.direction){begin('turn','turn',clips.turn,state.clock,{to:facing});break;}
        if(wanted==='walk'){state.phase=0;state.walkOrigin=distance;begin('walk','walk',clips.walk);break;}
        if(wanted==='rest'){begin('rest-enter','rest.enter',{...meta.transitions.rest.enter,loop:false},state.clock,{token});break;}
        begin('care',wanted,clips[wanted],state.clock,{token,automatic:state.automatic===wanted});break;
      }
      mode=state.mode;
      const elapsed=Math.max(0,state.clock-mode.started);
      const walkIndex=Math.floor((state.phase%1)*clips.walk.frames.length)%clips.walk.frames.length;
      const selected=mode.type==='walk'?{frame:clips.walk.frames[walkIndex],index:walkIndex,done:false}:at(mode.track,elapsed);
      mode.index=selected.index;
      const transition=['settle','return','rest-enter','rest-exit'].includes(mode.type)?mode.name:'';
      const clip=mode.type==='settle'?'idle':mode.type==='return'?mode.name.split('.')[0]:mode.type.startsWith('rest')?'rest':mode.type==='hold'?mode.name:mode.name;
      const firstStepReady=!frozen&&mode.type==='walk'&&wanted==='walk'&&facing===state.direction;
      state.pose={frame:selected.frame,nextFrame:selected.frame,mix:0,clip,facing:state.direction,targetFacing:mode.to??state.direction,
        elapsed,sequence:state.sequence,turning:mode.type==='turn',turnRemaining:mode.type==='turn'?Math.max(0,800-elapsed):0,
        transition,transitionRemaining:transition?Math.max(0,total(mode.track)-elapsed):0,phase:state.phase,
        stopSlot:mode.stopSlot,
        motionDistance:distance,motionEpoch:loc.epoch,sampleTime:time,stopped:frozen,species,firstStepReady,
        contacts:mode.type==='walk'?meta.walkContacts?.[walkIndex]?.feet.map(foot=>({...foot,supportGeneration:foot.supportGeneration+Math.floor(state.phase)})):undefined,
        preparing:wanted==='walk'&&!firstStepReady};
      return state.pose;
    },
  };
}
