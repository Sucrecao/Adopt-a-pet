const SIZE = 256, GRID = 64;
const clamp = value => Math.max(0, Math.min(1, value));
const ease = value => (1 - Math.cos(Math.PI * clamp(value))) / 2;
const radial = (a,b) => {
  const squared=(a[0]-b[0])**2+(a[1]-b[1])**2;
  return squared ? squared*Math.log(squared)/2 : 0;
};

function invert(matrix) {
  const n=matrix.length,rows=matrix.map((row,i)=>[...row,...Array.from({length:n},(_,j)=>Number(i===j))]);
  for(let column=0;column<n;column++) {
    let pivot=column;
    for(let row=column+1;row<n;row++)if(Math.abs(rows[row][column])>Math.abs(rows[pivot][column]))pivot=row;
    if(Math.abs(rows[pivot][column])<1e-12)throw new Error('Degenerate whole-paw constraints');
    [rows[column],rows[pivot]]=[rows[pivot],rows[column]];
    const factor=rows[column][column];rows[column]=rows[column].map(value=>value/factor);
    for(let row=0;row<n;row++)if(row!==column){const amount=rows[row][column];for(let j=0;j<n*2;j++)rows[row][j]-=amount*rows[column][j];}
  }
  return rows.map(row=>row.slice(n));
}

/** Ground support moves opposite to accepted travel; elapsed time never drives a step. */
export function groundPawTargets(config, ground) {
  const phase=Number.isFinite(ground.phase)?ground.phase:0;
  const stance=config.support??.625,stride=config.stride,lift=config.lift??8;
  const entering = ground.mode==='settle'&&Number.isFinite(ground.fromEnterProgress)
    ? groundPawTargets(config,{mode:'enter',phase,progress:ground.fromEnterProgress}) : null;
  return config.paws.map((paw,index)=>{
    const local=((phase+(paw.phase??0))%1+1)%1;
    let dx,dy;
    if(local<stance){dx=stride*(stance/2-local);dy=0;}
    else {const swing=(local-stance)/(1-stance);dx=stride*stance*(ease(swing)-.5);dy=-lift*Math.sin(Math.PI*swing);}
    if(ground.mode==='enter'){
      const progress=clamp(((ground.progress??1)-index*.12)/.64),weight=ease(progress);
      dx*=weight;dy=dy*weight-6*Math.sin(Math.PI*progress);
    }
    if(ground.mode==='settle'){
      // Reset feet with a visible lift-and-place, one after another. A planted
      // paw is never simply dragged back to the source's standing footprint.
      const startWeight=Number.isFinite(ground.fromWeight)?clamp(ground.fromWeight):1;
      if(entering){dx=entering[index].dx;dy=entering[index].dy;}
      else {dx*=startWeight;dy*=startWeight;}
      const progress=clamp(((ground.progress??0)-index*.12)/.64),weight=1-ease(progress);
      dx*=weight;dy=dy*weight-6*Math.sin(Math.PI*progress);
    }
    return {id:paw.id,x:paw.center[0]+dx,y:paw.center[1]+dy,dx,dy,planted:local<stance};
  });
}

/** Four feet and their continuous leg surfaces belong to one original texture. */
export function createWholeGroundRenderer({images,meta}) {
  const config=meta.groundGait;
  if(meta.version!==5||config?.version!==1||!Array.isArray(config.paws)||config.paws.length!==4
    ||!Number.isFinite(config.stride)||config.stride<=0||!meta.frames[config.sourceFrame])return null;
  const canvas=document.createElement('canvas');canvas.width=canvas.height=SIZE;
  const gl=canvas.getContext('webgl',{alpha:true,premultipliedAlpha:true,antialias:false,preserveDrawingBuffer:true});
  if(!gl)return null;
  const resources={buffers:[],shaders:[],programs:[],textures:[]};let disposed=false;
  const scratch=document.createElement('canvas');scratch.width=scratch.height=SIZE;
  function dispose(){if(disposed)return;disposed=true;for(const [key,method] of [['buffers','deleteBuffer'],['shaders','deleteShader'],['programs','deleteProgram'],['textures','deleteTexture']])for(const item of resources[key])gl[method](item);canvas.width=canvas.height=scratch.width=scratch.height=0;gl.getExtension('WEBGL_lose_context')?.loseContext();}
  try {
    const frame=meta.frames[config.sourceFrame],page=meta.pages[frame.page],[x,y,width,height]=frame.rect;
    const scale=SIZE/Math.max(page.sourceSize[0]/page.columns,page.sourceSize[1]/page.rows)*(page.scale??1);
    const ink=scratch.getContext('2d');ink.save();if(frame.mirror===-1){ink.translate(SIZE,0);ink.scale(-1,1);}
    ink.drawImage(images[frame.page],x,y,width,height,(SIZE-width*scale)/2+(frame.offsetX??0),(SIZE-height*scale)/2+(frame.offsetY??0),width*scale,height*scale);ink.restore();
    const pins=[],seen=new Set();
    function pin(point,paw=-1,weight=0){if(!point)return;const key=point.join(':');if(seen.has(key))return;seen.add(key);pins.push({point:point.map(value=>value/SIZE),paw,weight});}
    config.paws.forEach((paw,i)=>{pin(paw.center,i,1);pin(paw.sole,i,1);pin(paw.bend,i,.45);});
    for(const point of config.fixedPins??[[0,150],[48,150],[96,150],[144,150],[192,150],[256,150]])pin(point);
    config.paws.forEach(paw=>pin(paw.upper));
    const n=pins.length,points=pins.map(pin=>pin.point);
    const matrix=Array.from({length:n+3},(_,i)=>Array.from({length:n+3},(_,j)=>{
      if(i<n&&j<n)return radial(points[i],points[j]);
      if(i<n)return [1,...points[i]][j-n];if(j<n)return [1,...points[j]][i-n];return 0;
    }));
    const inverse=invert(matrix);
    const coefficients=Array.from({length:4},(_,paw)=>inverse.map(row=>row.slice(0,n).reduce((sum,value,i)=>sum+value*(pins[i].paw===paw?pins[i].weight:0),0)));
    const data=new Float32Array((GRID+1)**2*4),weights=new Float32Array((GRID+1)**2*4);
    let offset=0;
    for(let row=0;row<=GRID;row++)for(let column=0;column<=GRID;column++){
      const point=[column/GRID,row/GRID],values=[...points.map(p=>radial(point,p)),1,...point];
      data[offset]=point[0];data[offset+1]=point[1];
      // The upper body and face are an untouched source surface. The smooth
      // lower-body taper does not alter the independently marked paw controls.
      const taper=ease((row*SIZE/GRID-(config.fixedBodyY??154))/26);
      for(let paw=0;paw<4;paw++)weights[offset+paw]=taper*coefficients[paw].reduce((sum,value,i)=>sum+value*values[i],0);
      offset+=4;
    }
    function shader(type,source){const item=gl.createShader(type);resources.shaders.push(item);gl.shaderSource(item,source);gl.compileShader(item);if(!gl.getShaderParameter(item,gl.COMPILE_STATUS))throw new Error(gl.getShaderInfoLog(item));return item;}
    const program=gl.createProgram();resources.programs.push(program);
    gl.attachShader(program,shader(gl.VERTEX_SHADER,'attribute vec2 point; attribute vec2 shift; varying vec2 uv; void main(){uv=point;vec2 at=point+shift;gl_Position=vec4(at.x*2.0-1.0,1.0-at.y*2.0,0.0,1.0);}'));
    gl.attachShader(program,shader(gl.FRAGMENT_SHADER,'precision highp float;uniform sampler2D image;varying vec2 uv;void main(){vec4 value=texture2D(image,uv);if(value.a<1.0/255.0)discard;gl_FragColor=value;}'));
    gl.linkProgram(program);if(!gl.getProgramParameter(program,gl.LINK_STATUS))throw new Error(gl.getProgramInfoLog(program));
    const mesh=gl.createBuffer(),indices=gl.createBuffer();resources.buffers.push(mesh,indices);
    const triangles=[];for(let row=0;row<GRID;row++)for(let column=0;column<GRID;column++){const a=row*(GRID+1)+column,b=a+1,c=a+GRID+1,d=c+1;triangles.push(a,c,b,b,c,d);}
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER,indices);gl.bufferData(gl.ELEMENT_ARRAY_BUFFER,new Uint16Array(triangles),gl.STATIC_DRAW);
    const texture=gl.createTexture();resources.textures.push(texture);gl.bindTexture(gl.TEXTURE_2D,texture);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL,true);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,scratch);
    const point=gl.getAttribLocation(program,'point'),shift=gl.getAttribLocation(program,'shift');
    gl.useProgram(program);gl.uniform1i(gl.getUniformLocation(program,'image'),0);gl.disable(gl.BLEND);gl.viewport(0,0,SIZE,SIZE);gl.clearColor(0,0,0,0);
    return {
      get available(){return !disposed&&!gl.isContextLost();},
      draw(sample,context){
        if(disposed||gl.isContextLost()||!sample.ground)return false;
        const ground=sample.ground;
        if(!['walk','enter','settle'].includes(ground.mode)||!Number.isFinite(ground.phase))return false;
        context.save();if(sample.facing===-1){context.translate(SIZE,0);context.scale(-1,1);}
        if((ground.mode==='settle'&&ground.progress>=1)||(ground.mode==='enter'&&ground.progress<=0))context.drawImage(scratch,0,0);
        else {
          const targets=groundPawTargets(config,ground);
          for(let at=0;at<data.length;at+=4){let dx=0,dy=0;for(let paw=0;paw<4;paw++){dx+=weights[at+paw]*targets[paw].dx;dy+=weights[at+paw]*targets[paw].dy;}data[at+2]=dx/SIZE;data[at+3]=dy/SIZE;}
          gl.useProgram(program);gl.bindBuffer(gl.ARRAY_BUFFER,mesh);gl.bufferData(gl.ARRAY_BUFFER,data,gl.DYNAMIC_DRAW);gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER,indices);gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,texture);
          gl.enableVertexAttribArray(point);gl.vertexAttribPointer(point,2,gl.FLOAT,false,16,0);gl.enableVertexAttribArray(shift);gl.vertexAttribPointer(shift,2,gl.FLOAT,false,16,8);
          gl.clear(gl.COLOR_BUFFER_BIT);gl.drawElements(gl.TRIANGLES,triangles.length,gl.UNSIGNED_SHORT,0);context.drawImage(canvas,0,0);
        }
        context.restore();return true;
      },
      dispose,
    };
  }catch{dispose();return null;}
}
