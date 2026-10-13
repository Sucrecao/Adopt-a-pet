const MAX_DURATION = 800;
const ENTER_DURATION = 160;
const ease = value => (1 - Math.cos(Math.PI * value)) / 2;
const mobile = action => action === 'idle' || action === 'play';
const visual = pose => ({ frame:pose.frame, nextFrame:pose.nextFrame ?? pose.frame,
  mix:pose.mix ?? 0, facing:pose.facing, ...(pose.ground ? {ground:{...pose.ground}} : {}) });

/** An interruptible visual route; legacy owns authored clip/turn scheduling. */
export function createWholeHandoffController({ species, meta, random, clips, frameAt, createLegacy }) {
  const config = meta.handoffs, neutral = config.neutralFrame;
  if (!Number.isInteger(neutral) || !meta.frames[neutral]
      || ![config.edgeDuration,config.settleDuration].every(value => Number.isFinite(value) && value > 0)) throw new Error('Invalid whole handoff configuration');
  const grounded = species !== 'parrot', mirror = config.mirroredNeutralFrame;
  const surface = meta.version===6 && meta.groundGait?.version===2;
  const legacy = createLegacy({ species, random, meta:{...meta,version:4,transitions:undefined} });
  const frameClips=new Map();
  for(const [name,track] of Object.entries(clips))for(const frame of track.frames)frameClips.set(frame,name);
  for(const [name,paths] of Object.entries(meta.transitions??{}))for(const track of Object.values(paths))for(const frame of track.frames)frameClips.set(frame,name);
  const graph = new Map();
  const add=(a,b,sourceOnly=false)=>{
    if (!meta.frames[a] || !meta.frames[b] || a===b) return;
    for(const [from,to] of [[a,b],[b,a]]) {
      if(!graph.has(from)) graph.set(from,new Map());
      const old=graph.get(from).get(to);
      if(!old || old.sourceOnly) graph.get(from).set(to,{sourceOnly});
    }
  };
  for(const pair of meta.flow?.pairs??[]) add(...pair);
  for(const pair of meta.flow?.sourcePairs??[]) add(...pair,true);
  const edgeDuration=(a,b)=>meta.groundRise?.frames.some((v,i,sequence)=>i>0
    &&(sequence[i-1]===a&&v===b||sequence[i-1]===b&&v===a))
    ?meta.groundRise.pairDuration:config.edgeDuration;
  const key=(frame,facing)=>`${frame}:${facing}`;
  function path(from,to,facing,targetFacing=facing) {
    const start=key(from,facing),target=key(to,targetFacing),cost=new Map([[start,0]]),previous=new Map(),pending=new Set([start]);
    while(pending.size) {
      const current=[...pending].reduce((a,b)=>cost.get(a)<=cost.get(b)?a:b);pending.delete(current);
      if(current===target) {
        const edges=[];let at=target;
        while(at!==start) {const step=previous.get(at);edges.unshift(step.edge);at=step.before;}
        return edges;
      }
      const [frame,side]=current.split(':').map(Number);
      const neighbors=[...(graph.get(frame)??[])].map(([next,details])=>({a:frame,b:next,facing:side,start:0,end:1,duration:edgeDuration(frame,next),...details}));
      if(Number.isInteger(mirror)&&meta.frames[mirror]&&(frame===neutral||frame===mirror)) neighbors.push({a:frame,b:frame===neutral?mirror:neutral,facing:side,nextFacing:-side,duration:0,alias:true});
      for(const edge of neighbors) {
        const next=key(edge.b,edge.nextFacing??side),candidate=cost.get(current)+edge.duration*(edge.sourceOnly?8:1);
        if(candidate<(cost.get(next)??Infinity)) {cost.set(next,candidate);previous.set(next,{before:current,edge});pending.add(next);}
      }
    }
    return null;
  }
  function route(source, destination) {
    const from=visual(source),target=destination.clip==='walk'&&grounded?neutral:destination.clip==='idle'?neutral:clips[destination.clip].frames[0];
    const goalFacing=destination.facing,origin=source.handoffSourceClip??source.clip;
    let candidates=[];
    if(from.ground) {
      const progress=from.ground.mode==='settle'?from.ground.progress:0;
      const fromEnterProgress=from.ground.mode==='enter'?from.ground.progress:from.ground.fromEnterProgress;
      const fromWeight=from.ground.mode==='enter'?ease(from.ground.progress):from.ground.fromWeight??1;
      const fromTravelCycles=from.ground.mode==='walk'?from.ground.travelCycles:from.ground.fromTravelCycles;
      const settle={settle:true,phase:from.ground.phase,start:progress,end:1,facing:from.facing,duration:config.settleDuration*(1-progress),sourceClip:'walk',...(fromWeight!==1?{fromWeight}:{}),...(fromEnterProgress!==undefined?{fromEnterProgress}:{}),...(fromTravelCycles!==undefined?{fromTravelCycles}:{})};
      const remainder=path(neutral,neutral,from.facing,goalFacing),entry=path(neutral,target,goalFacing);
      if(remainder&&entry)candidates.push([settle,...remainder,...entry]);
    } else {
      const mixed=from.frame!==from.nextFrame&&from.mix>0&&from.mix<1;
      const endpoints=mixed?[{frame:from.frame,end:0},{frame:from.nextFrame,end:1}]:[{frame:from.mix>=1?from.nextFrame:from.frame}];
      for(const endpoint of endpoints) {
        let prefix=mixed?[{a:from.frame,b:from.nextFrame,start:from.mix,end:endpoint.end,facing:from.facing,duration:config.edgeDuration*Math.abs(endpoint.end-from.mix),sourceClip:origin}]:[];
        let cursor=endpoint.frame;
        if(origin==='hop'&&clips.hop.frames.includes(from.frame)&&from.frame!==clips.hop.frames.at(-1)) {
          if(mixed&&endpoint.end!==1)continue;
          const index=clips.hop.frames.indexOf(cursor);
          if(index<0)continue;
          let safe=true;
          for(let i=index;i<clips.hop.frames.length-1;i++) {
            const a=clips.hop.frames[i],b=clips.hop.frames[i+1],details=graph.get(a)?.get(b);
            if(!details){safe=false;break;}
            prefix.push({a,b,start:0,end:1,facing:from.facing,duration:config.edgeDuration,...details,sourceClip:'hop'});
          }
          if(!safe)continue;
          cursor=clips.hop.frames.at(-1);
        }
        // A flight source has no invented correspondence fields. Finish the
        // authored cycle forward, then use its declared landing ports.
        if(!grounded&&origin==='walk'&&clips.walk.frames.slice(1,-1).includes(from.frame)) {
          if(mixed&&endpoint.end!==1)continue;
          const index=clips.walk.frames.indexOf(cursor);
          if(index<0)continue;
          for(let i=index;i<clips.walk.frames.length-1;i++)prefix.push({a:clips.walk.frames[i],b:clips.walk.frames[i+1],start:0,end:1,facing:from.facing,duration:clips.walk.durations[i],sourceOnly:true,sourceClip:'walk'});
          cursor=clips.walk.frames.at(-1);
        }
        // Repeating sleep continues to its shared curled endpoint rather than
        // walking back through the standing hub and lying down again.
        if(origin==='rest'&&destination.clip==='rest') {
          const continuation=path(cursor,target,from.facing,goalFacing);
          if(continuation)candidates.push([...prefix,...continuation]);
        } else {
          const exit=path(cursor,neutral,from.facing,goalFacing),entry=path(neutral,target,goalFacing);
          if(exit&&entry)candidates.push([...prefix,...exit,...entry]);
        }
      }
    }
    if(!candidates.length)return {from,edges:[],duration:config.edgeDuration,rawDuration:config.edgeDuration,unsupported:true};
    const total=edges=>edges.reduce((sum,edge)=>sum+edge.duration,0);
    const edges=candidates.reduce((a,b)=>total(a)<=total(b)?a:b);
    if(destination.clip==='walk'&&grounded)edges.push({enter:true,start:0,end:1,facing:goalFacing,duration:ENTER_DURATION,sourceClip:'walk'});
    const rawDuration=total(edges),duration=Math.min(MAX_DURATION,rawDuration);
    const scale=rawDuration?duration/rawDuration:1;
    for(const edge of edges)edge.duration*=scale;
    return {from,edges,duration,rawDuration,origin};
  }
  function normalTurn(source,destination) {
    const origin=source.handoffSourceClip??source.clip,last=clips.turn.frames.at(-1);
    if(!Number.isInteger(mirror))return null;
    const tailEdges=path(last,mirror,destination.facing);
    if(!tailEdges?.length||surface&&tailEdges.some(edge=>edge.sourceOnly))return null;
    const entry=route(source,destination);
    if(entry.unsupported)return null;
    const returningFromCare=!source.ground&&!['idle','walk'].includes(origin);
    const entryDuration=returningFromCare?320:source.ground||entry.rawDuration>config.edgeDuration?160:120;
    const tailDuration=tailEdges.length>1?160:120;
    const rawTail=tailEdges.reduce((sum,edge)=>sum+edge.duration,0);
    for(const edge of entry.edges)edge.duration*=entry.duration?entryDuration/entry.duration:1;
    for(const edge of tailEdges)edge.duration*=tailDuration/rawTail;
    return {...entry,normalTurn:true,duration:800,rawDuration:800,entryDuration,
      authorDuration:800-entryDuration-tailDuration,tailDuration,tailEdges,
      fromFacing:destination.facing,targetFacing:destination.targetFacing};
  }
  function partialTurn(source,destination) {
    const budget=destination.turnRemaining;
    if(!Number.isFinite(budget)||budget<=0)return null;
    // Care can replace an already painted yaw pose while its turn clock is
    // held. Resume from that care image through the measured graph to the
    // target neutral; do not drop it on the old authored midpoint next frame.
    const planned=route(source,{...destination,clip:'idle',facing:destination.targetFacing});
    if(planned.unsupported||!planned.duration)return null;
    for(const edge of planned.edges)edge.duration*=budget/planned.duration;
    return {...planned,duration:budget,turnLimited:false};
  }
  function routePose(handoff,elapsed,phase) {
    if(elapsed<=0)return {...handoff.from};
    if(handoff.unsupported)return {...handoff.from};
    if(handoff.normalTurn&&elapsed>=handoff.entryDuration) {
      const authored=elapsed-handoff.entryDuration;
      if(authored<handoff.authorDuration) {
        const total=clips.turn.durations.reduce((a,b)=>a+b,0);
        return {...frameAt(clips.turn,authored/handoff.authorDuration*total,true),facing:handoff.fromFacing,handoffSourceClip:'turn'};
      }
      return edgesPose(handoff,handoff.tailEdges,authored-handoff.authorDuration,phase,'turn');
    }
    return edgesPose(handoff,handoff.edges,elapsed,phase);
  }
  function edgesPose(handoff,edges,elapsed,phase,sourceClip) {
    let remaining=elapsed;
    for(const edge of edges) {
      if(remaining>=edge.duration) {remaining-=edge.duration;continue;}
      const progress=remaining/edge.duration,mix=edge.start+(edge.end-edge.start)*progress;
      if(edge.settle)return {frame:neutral,nextFrame:neutral,mix:0,facing:edge.facing,ground:{mode:'settle',phase:edge.phase,progress:mix,...(edge.fromWeight!==undefined?{fromWeight:edge.fromWeight}:{}),...(edge.fromEnterProgress!==undefined?{fromEnterProgress:edge.fromEnterProgress}:{}),...(edge.fromTravelCycles!==undefined?{fromTravelCycles:edge.fromTravelCycles}:{})},handoffSourceClip:'walk'};
      if(edge.enter)return {frame:neutral,nextFrame:neutral,mix:0,facing:edge.facing,ground:{mode:'enter',phase,progress:mix},handoffSourceClip:'walk'};
      return {frame:edge.a,nextFrame:edge.b,mix,facing:edge.facing,handoffSourceClip:sourceClip??edge.sourceClip??frameClips.get(edge.a===neutral?edge.b:edge.a)??handoff.origin};
    }
    return null;
  }
  let lastNow,lastFrozen=false,lastDistance,lastEpoch,lastSize,lastMoving=false,phase=0;
  let travelCycles=0;
  let routeClock=0,delegateClock=0,handoff,lastPose,lastIntent,lastAction,lastToken,sequence=0,flightOffset=0;
  return {
    sample(props={},now=0) {
      const locomotion=props.locomotion??{},action=props.action??'idle',care=!mobile(action);
      const frozen=Boolean(props.paused||props.reducedMotion||props.ambient===false||locomotion.paused||locomotion.dragging);
      const distance=Number.isFinite(locomotion.distanceDip)?locomotion.distanceDip:0,size=locomotion.spriteSizeDip>0?locomotion.spriteSizeDip:256;
      const actualMoving=Boolean(locomotion.moving??props.walking);
      const moving=Boolean(locomotion.intentMoving??actualMoving),rebase=lastDistance===undefined||lastEpoch!==locomotion.epoch||lastSize!==size;
      const dt=lastNow===undefined||frozen||lastFrozen?0:Math.max(0,now-lastNow);
      const travel=rebase||frozen||lastFrozen?0:Math.max(0,distance-lastDistance)*256/size;
      const wasMoving=lastMoving;
      lastNow=Math.max(lastNow??now,now);lastDistance=distance;lastEpoch=locomotion.epoch;lastSize=size;lastMoving=moving;lastFrozen=frozen;
      const routeRemaining=handoff?Math.max(0,handoff.duration-(routeClock-handoff.started)):0;
      routeClock+=dt;
      delegateClock+=!handoff||['walk','turn'].includes(handoff.intent)?dt:Math.max(0,dt-routeRemaining);
      // Epoch resets are movement rebases, not requests to throw away visual
      // care or paused-turn state. Distance itself still comes from telemetry.
      const restarted=care&&(lastAction!==action||lastToken!==props.actionStartedAt);
      const desired=legacy.sample({...props,actionElapsed:lastPose&&restarted?0:props.actionElapsed,locomotion:{...locomotion,moving,actualMoving,epoch:1}},delegateClock);
      if(frozen&&lastPose)return {...lastPose,stopped:true};
      const cycles=travel/(meta.stride??64);
      // A final packet can contain travel and a stop/care/turn request together.
      // Apply that accepted root displacement to the walking source before
      // routing, so its planted paw remains at the same world coordinate.
      if(surface&&lastIntent==='walk'&&lastPose?.ground?.mode==='walk'&&wasMoving&&cycles>0) {
        phase+=cycles;travelCycles+=cycles;
        lastPose={...lastPose,phase,ground:{...lastPose.ground,phase,travelCycles}};
      } else if(!care&&!desired.turning&&(moving||wasMoving)) {
        phase+=cycles;
        if(surface&&lastIntent==='walk')travelCycles+=cycles;
      }
      if(handoff?.normalTurn&&!care&&!desired.turning&&desired.facing===handoff.targetFacing) {
        // Alias128 is the exact mirrored source0. Finish the planned tail
        // inside the scheduler's hold, without queuing another idle exit.
        lastPose={...lastPose,frame:neutral,nextFrame:neutral,mix:0,facing:desired.facing,ground:undefined,handoffSourceClip:'idle'};
        handoff=undefined;
        if(desired.clip==='idle')lastIntent='idle';
      }
      const changed=lastIntent!==desired.clip||restarted;
      // The decoded ground group can become ready after movement was already
      // requested. Its first sample still starts from the complete neutral.
      if(surface&&!lastPose)lastPose={...desired,frame:neutral,nextFrame:neutral,mix:0,
        facing:desired.facing,ground:undefined,handoffSourceClip:'idle'};
      if(surface&&changed&&desired.clip==='walk') {
        travelCycles=travel/(meta.stride??64);
        phase=meta.groundGait.launchPhase+travelCycles;
      }
      if(changed&&lastPose) {
        sequence++;
        if(desired.clip==='turn') {
          const planned=desired.turnRemaining===800?normalTurn(lastPose,desired):partialTurn(lastPose,desired);
          // A malformed or disconnected optional atlas still exposes its
          // unsupported seam rather than inventing a correspondence field.
          handoff={...(planned??{from:visual(lastPose),edges:[],duration:0,rawDuration:0,unsupported:true,turnLimited:true}),started:routeClock,intent:desired.clip};
        } else {
          handoff={...route(lastPose,desired),started:routeClock,intent:desired.clip};
        }
      }
      lastIntent=desired.clip;lastAction=action;lastToken=props.actionStartedAt;
      const elapsed=handoff?routeClock-handoff.started:0;
      let painted;
      if(handoff&&(changed||elapsed<handoff.duration))painted=routePose(handoff,elapsed,phase);
      else if(handoff) {if(handoff.intent==='walk'&&!grounded)flightOffset=phase;handoff=undefined;}
      if(!painted) {
        painted=visual(desired);
        if(desired.clip==='walk') {
          if(grounded)painted={frame:neutral,nextFrame:neutral,mix:0,facing:desired.facing,ground:{mode:'walk',phase,...(surface?{travelCycles}:{})}};
          else {const track=clips.walk,at=frameAt(track,(phase-flightOffset)*track.durations.reduce((a,b)=>a+b,0),false);painted={frame:at.frame,nextFrame:at.frame,mix:0,facing:desired.facing};}
        }
      }
      lastPose={...desired,...painted,phase,sequence,motionDistance:distance,motionEpoch:locomotion.epoch,sampleTime:now,stopped:frozen,
        transition:handoff?`handoff.${handoff.intent}`:'',transitionRemaining:handoff?Math.max(0,handoff.duration-elapsed):0,
        handoffRawDuration:handoff?.rawDuration??0,handoffUnsupported:Boolean(handoff?.unsupported)};
      return lastPose;
    },
  };
}
