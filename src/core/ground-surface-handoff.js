// Fixed-bone, one-foot-at-a-time grounded transfers between complete poses.
const clamp=x=>Math.max(0,Math.min(1,x));
const jerk=x=>{const q=clamp(x);return q*q*q*(10+q*(-15+6*q));};
const lerp=(a,b,w)=>a+(b-a)*w;
const vector=(a,b,w)=>a.map((v,i)=>lerp(v,b[i],w));

export function solveLegPose(template,hip,contact,roll,planted,transferring) {
  const {source,scale,lengths,fore}=template;
  const c=Math.cos(roll),s=Math.sin(roll),z=hip[2];
  let foot,ankle;
  if(source.hull) {
    const hull=source.hull,ref=hull.center,pivot=roll<0?hull.heel:hull.toe;
    let maxY=-Infinity;
    for(const [x,y]of hull.points)maxY=Math.max(maxY,x*s+y*c);
    const tx=contact[0]-ref[0]*scale+pivot[0]*scale-(pivot[0]*c-pivot[1]*s)*scale;
    const ty=contact[1]-maxY*scale;
    const project=([x,y])=>[tx+(x*c-y*s)*scale,ty+(x*s+y*c)*scale,z];
    foot=project(ref);ankle=project(source.joints[2]);
  } else {
    foot=[...contact];
    const paw=source.joints[3].map((v,i)=>(v-source.joints[2][i])*scale);
    ankle=[foot[0]-(paw[0]*c-paw[1]*s),foot[1]-(paw[0]*s+paw[1]*c),z];
  }
  const [a,b]=lengths,dx=ankle[0]-hip[0],dy=ankle[1]-hip[1],r=Math.hypot(dx,dy);
  if(r>=a+b||r<=Math.abs(a-b))throw new Error(`Unreachable transfer ${template.id}: ${r} outside (${Math.abs(a-b)},${a+b})`);
  const angle=Math.atan2(dy,dx)+(fore?1:-1)*Math.acos((a*a+r*r-b*b)/(2*a*r));
  const knee=[hip[0]+a*Math.cos(angle),hip[1]+a*Math.sin(angle),z];
  return {...template,hip,knee,ankle,foot,contact,roll,planted,transferring};
}

export function groundHandoffPose(walk,neutral,ground) {
  if(ground.mode==='walk')return walk;
  if(!['enter','settle'].includes(ground.mode))throw new Error('Unknown grounded pose mode');
  const entering=ground.mode==='enter',progress=clamp(ground.progress??0);
  const from=entering?neutral:Number.isFinite(ground.fromEnterProgress)
    ?groundHandoffPose(walk,neutral,{mode:'enter',progress:ground.fromEnterProgress}):walk;
  const to=entering?walk:neutral;
  if(progress<=0)return from;
  if(progress>=1)return to;
  const weight=jerk(progress),ordered=from.legs.filter(start=>{
    const end=to.legs.find(l=>l.id===start.id);
    return Math.hypot(...start.contact.map((v,i)=>v-end.contact[i]))>1e-9
      ||Math.abs(start.roll-end.roll)>1e-9||start.planted!==end.planted;
  }).sort((a,b)=>{
    // Entry places already-supporting goal feet first and airborne goals last.
    // Stopping first lands a currently airborne foot before resetting support.
    const priority=leg=>entering?Number(!to.legs.find(l=>l.id===leg.id).planted):Number(leg.planted);
    return priority(a)-priority(b);
  }),slots=new Map(ordered.map((leg,i)=>[leg.id,i]));
  const pose={...walk};
  for(const field of ['bob','pitch','pelvis','shoulder'])pose[field]=lerp(from[field],to[field],weight);
  pose.legs=from.legs.map(start=>{
    const end=to.legs.find(l=>l.id===start.id),q=slots.has(start.id)?clamp(progress*ordered.length-slots.get(start.id)):0;
    const w=jerk(q),contact=vector(start.contact,end.contact,w);
    contact[1]-=7*Math.sin(Math.PI*q)**4;
    const hip=vector(start.hip,end.hip,weight),roll=lerp(start.roll,end.roll,w);
    const transferring=q>0&&q<1,planted=q<=0?start.planted:q>=1?end.planted:false;
    return solveLegPose(start,hip,contact,roll,planted,transferring);
  });
  return pose;
}
