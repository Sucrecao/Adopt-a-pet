const FRAME_SIZE = 256;
const GRID_SIZE = 32;

const warpVertex = `
attribute vec2 point;
attribute vec4 field;
uniform float amount;
uniform float endpoint;
varying vec2 uv;
void main() {
  uv = point;
  vec2 shift = endpoint < .5 ? field.xy * amount : field.zw * (1.0 - amount);
  vec2 at = point + shift;
  gl_Position = vec4(at.x * 2.0 - 1.0, 1.0 - at.y * 2.0, 0.0, 1.0);
}`;
const warpFragment = `
precision highp float;
varying vec2 uv;
uniform sampler2D image;
void main() {
  vec4 pose = texture2D(image, uv);
  // Foreground mesh safety does not prohibit folded empty-background cells.
  // Empty triangles must not erase fur painted by another warped triangle.
  if (pose.a < 1.0 / 255.0) discard;
  gl_FragColor = pose;
}`;
const blendVertex = `
attribute vec2 point;
varying vec2 uv;
void main() {
  uv = vec2(point.x, 1.0 - point.y);
  gl_Position = vec4(point.x * 2.0 - 1.0, 1.0 - point.y * 2.0, 0.0, 1.0);
}`;
const blendFragment = `
precision highp float;
varying vec2 uv;
uniform sampler2D first;
uniform sampler2D second;
uniform sampler2D contourAtlas;
uniform float amount;
uniform float topologyEnabled;
float contourAt(float index) {
  float cell=floor(index/3.0),channel=index-cell*3.0;
  vec2 tile=vec2(mod(cell,4.0),floor(cell/4.0));
  vec2 pixel=tile*260.0+vec2(2.0)+vec2(uv.x,1.0-uv.y)*256.0;
  vec3 coverage=texture2D(contourAtlas,pixel/vec2(1040.0,1560.0)).rgb;
  return channel<0.5?coverage.r:channel<1.5?coverage.g:coverage.b;
}
vec4 commonAt(vec2 at) { return mix(texture2D(first,at),texture2D(second,at),amount); }
vec3 normalizedColor(vec4 common) {
  if(common.a>0.0001)return common.rgb/common.a;
  // Between recorded contours a covered edge can be just outside both current
  // donor texels. Extend the nearest available fur color by at most two pixels.
  vec4 nearby=vec4(0.0);
  for(int radius=1;radius<=2;radius++)for(int axis=0;axis<4;axis++) {
    vec2 shift=axis==0?vec2(1.0,0.0):axis==1?vec2(-1.0,0.0):axis==2?vec2(0.0,1.0):vec2(0.0,-1.0);
    vec4 candidate=commonAt(uv+shift*float(radius)/256.0);
    if(nearby.a<0.0001&&candidate.a>0.0001)nearby=candidate;
  }
  return nearby.a>0.0001?nearby.rgb/nearby.a:vec3(0.0);
}
void main() {
  // Both textures already occupy the common intermediate geometry.
  // Uploaded endpoint colors and framebuffer colors are premultiplied.
  vec4 common=commonAt(uv);
  if(topologyEnabled<0.5){gl_FragColor=common;return;}
  float phase=clamp(amount*64.0,0.0,64.0),lower=floor(phase),upper=min(64.0,lower+1.0);
  float coverage=mix(contourAt(lower),contourAt(upper),phase-lower);
  gl_FragColor=vec4(normalizedColor(common)*coverage,coverage);
}`;

/** A contour is bound to the stored flow orientation, before reverse playback. */
export function validateWholeContours(meta,images) {
  const contours=meta?.flow?.contours??[];
  if(!Array.isArray(contours)||contours.length>64)throw new Error('Invalid whole contour registry');
  if(contours.length&&meta?.version!==6)throw new Error('Whole contours require v6');
  const keys=new Set();
  for(const c of contours) {
    const pair=c?.pair,key=Array.isArray(pair)?pair.join(':'):'';
    if(c?.version!==1||!Array.isArray(pair)||pair.length!==2
        ||pair.some(v=>!Number.isInteger(v)||v<0||v>=meta.frames.length)||pair[0]===pair[1]
        ||!(meta.flow.pairs??[]).some(p=>p[0]===pair[0]&&p[1]===pair[1])||keys.has(key)
        ||typeof c.asset!=='string'||!c.asset||c.encoding!=='opaque-rgb-temporal-coverage'
        ||c.samples!==65||c.frameSize!==FRAME_SIZE||c.columns!==4||c.rows!==6||c.gutter!==2
        ||!Array.isArray(c.sourceSize)||c.sourceSize.length!==2||c.sourceSize[0]!==1040||c.sourceSize[1]!==1560)
      throw new Error('Invalid whole contour descriptor');
    keys.add(key);
  }
  if(images!==undefined) {
    if(!Array.isArray(images)||images.length!==contours.length)throw new Error('Whole contour images are incomplete');
    for(const [i,image] of images.entries())if((image?.naturalWidth??image?.width)!==contours[i].sourceSize[0]
        ||(image?.naturalHeight??image?.height)!==contours[i].sourceSize[1])throw new Error('Whole contour source dimensions do not match');
  }
  return true;
}

function validFields(meta, bytes) {
  const flow = meta?.flow;
  const keys = new Set();
  return [4,5,6].includes(meta?.version) && flow?.version === 1 && flow.size === GRID_SIZE
    && flow.frameSize === FRAME_SIZE && flow.encoding === 'signed-one-pixel-rgba'
    && typeof flow.asset === 'string' && flow.asset.length > 0 && Array.isArray(flow.pairs) && flow.pairs.length > 0
    && flow.pairs.every(pair => {
      if (!Array.isArray(pair) || pair.length !== 2 || pair[0] === pair[1]
          || pair.some(frame => !Number.isInteger(frame) || frame < 0 || frame >= meta.frames.length)) return false;
      const key = pair.slice().sort((a,b) => a-b).join(':');
      if (keys.has(key)) return false;
      keys.add(key); return true;
    }) && bytes?.byteLength === flow.pairs.length * GRID_SIZE * GRID_SIZE * 4;
}

/** Optional whole-pose mesh; the visible canvas always retains its 2D context. */
export function createWholeFlowRenderer({ images, meta, flowBytes, contourImages=[], canonicalFrame }) {
  validateWholeContours(meta,contourImages);
  if (!validFields(meta, flowBytes)) return null;
  const bytes = flowBytes instanceof ArrayBuffer ? new Uint8Array(flowBytes)
    : ArrayBuffer.isView(flowBytes) ? new Uint8Array(flowBytes.buffer, flowBytes.byteOffset, flowBytes.byteLength) : null;
  if (!bytes) return null;
  const canvas = document.createElement('canvas'); canvas.width = canvas.height = FRAME_SIZE;
  const gl = canvas.getContext('webgl', { alpha:true, premultipliedAlpha:true, antialias:false, preserveDrawingBuffer:true });
  if (!gl) { canvas.width = canvas.height = 0; return null; }
  const resources = { textures:[], buffers:[], programs:[], shaders:[], framebuffers:[] };
  const scratch = document.createElement('canvas'); scratch.width = scratch.height = FRAME_SIZE;
  const scratchContext = scratch.getContext('2d');
  const textures = new Map(), meshes = new Map(), contourTextures=new Map();
  const contours=new Map((meta.flow.contours??[]).map((c,i)=>[c.pair.join(':'),i]));
  const pairs = new Map(meta.flow.pairs.map((pair,index) => [pair.join(':'),index]));
  const scales = meta.pages.map(page => FRAME_SIZE / Math.max(page.sourceSize[0] / page.columns, page.sourceSize[1] / page.rows) * (page.scale ?? 1));
  let disposed = false;
  function dispose() {
    if (disposed) return;
    disposed = true;
    for (const [kind, remove] of [['textures','deleteTexture'],['buffers','deleteBuffer'],['framebuffers','deleteFramebuffer'],['programs','deleteProgram'],['shaders','deleteShader']])
      for (const resource of resources[kind]) gl[remove](resource);
    textures.clear(); meshes.clear();contourTextures.clear();
    canvas.width = canvas.height = scratch.width = scratch.height = 0;
    gl.getExtension('WEBGL_lose_context')?.loseContext();
  }
  try {
    if (!scratchContext) throw new Error('Missing canonical 2D context');
    function shader(type, source) {
      const shader = gl.createShader(type); resources.shaders.push(shader);
      gl.shaderSource(shader,source); gl.compileShader(shader);
      if (!gl.getShaderParameter(shader,gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(shader));
      return shader;
    }
    function program(vertex, fragment) {
      const program = gl.createProgram(); resources.programs.push(program);
      gl.attachShader(program,shader(gl.VERTEX_SHADER,vertex)); gl.attachShader(program,shader(gl.FRAGMENT_SHADER,fragment)); gl.linkProgram(program);
      if (!gl.getProgramParameter(program,gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program));
      return program;
    }
    function buffer(data, target = gl.ARRAY_BUFFER) {
      const buffer = gl.createBuffer(); resources.buffers.push(buffer);
      gl.bindBuffer(target,buffer); gl.bufferData(target,data,gl.STATIC_DRAW); return buffer;
    }
    function texture(image) {
      const texture = gl.createTexture(); resources.textures.push(texture); gl.bindTexture(gl.TEXTURE_2D,texture);
      gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
      if (image) gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,image);
      else gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,FRAME_SIZE,FRAME_SIZE,0,gl.RGBA,gl.UNSIGNED_BYTE,null);
      return texture;
    }
    const warp = program(warpVertex,warpFragment), blend = program(blendVertex,blendFragment);
    const warpLocations = { point:gl.getAttribLocation(warp,'point'),field:gl.getAttribLocation(warp,'field'),
      amount:gl.getUniformLocation(warp,'amount'),endpoint:gl.getUniformLocation(warp,'endpoint'),image:gl.getUniformLocation(warp,'image') };
    const blendLocations = { point:gl.getAttribLocation(blend,'point'),amount:gl.getUniformLocation(blend,'amount'),
      first:gl.getUniformLocation(blend,'first'),second:gl.getUniformLocation(blend,'second'),
      contourAtlas:gl.getUniformLocation(blend,'contourAtlas'),topologyEnabled:gl.getUniformLocation(blend,'topologyEnabled') };
    const triangles = [];
    for (let y=0;y<GRID_SIZE;y++) for(let x=0;x<GRID_SIZE;x++) {
      const a=y*(GRID_SIZE+1)+x,b=a+1,c=a+GRID_SIZE+1,d=c+1;
      triangles.push(a,c,b,b,c,d);
    }
    const indices = buffer(new Uint16Array(triangles),gl.ELEMENT_ARRAY_BUFFER);
    const quad = buffer(new Float32Array([0,0,0,1,1,0,1,0,0,1,1,1]));
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL,true);
    const targets = [0,1].map(() => {
      const image=texture(),framebuffer=gl.createFramebuffer(); resources.framebuffers.push(framebuffer);
      gl.bindFramebuffer(gl.FRAMEBUFFER,framebuffer); gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT0,gl.TEXTURE_2D,image,0);
      if (gl.checkFramebufferStatus(gl.FRAMEBUFFER)!==gl.FRAMEBUFFER_COMPLETE) throw new Error('Incomplete whole flow target');
      return { image,framebuffer };
    });
    function canonicalTexture(index) {
      if (textures.has(index)) return textures.get(index);
      if(canonicalFrame){gl.activeTexture(gl.TEXTURE0);const result=texture(canonicalFrame(index));textures.set(index,result);return result;}
      const frame=meta.frames[index],page=frame.page,[x,y,w,h]=frame.rect,scale=scales[page];
      scratchContext.setTransform(1,0,0,1,0,0); scratchContext.clearRect(0,0,FRAME_SIZE,FRAME_SIZE); scratchContext.save();
      if (frame.mirror===-1) { scratchContext.translate(FRAME_SIZE,0); scratchContext.scale(-1,1); }
      scratchContext.drawImage(images[page],x,y,w,h,(FRAME_SIZE-w*scale)/2+(frame.offsetX??0),(FRAME_SIZE-h*scale)/2+(frame.offsetY??0),w*scale,h*scale);
      scratchContext.restore(); gl.activeTexture(gl.TEXTURE0);
      const result=texture(scratch); textures.set(index,result); return result;
    }
    function mesh(index) {
      if (meshes.has(index)) return meshes.get(index);
      const data=new Float32Array((GRID_SIZE+1)**2*6),base=index*GRID_SIZE*GRID_SIZE*4;
      let at=0;
      for(let y=0;y<=GRID_SIZE;y++) for(let x=0;x<=GRID_SIZE;x++) {
        const sx=Math.max(0,Math.min(GRID_SIZE-1,x-.5)),sy=Math.max(0,Math.min(GRID_SIZE-1,y-.5));
        const x0=Math.floor(sx),y0=Math.floor(sy),x1=Math.min(GRID_SIZE-1,x0+1),y1=Math.min(GRID_SIZE-1,y0+1),tx=sx-x0,ty=sy-y0;
        data[at++]=x/GRID_SIZE; data[at++]=y/GRID_SIZE;
        for(let channel=0;channel<4;channel++) {
          const value=(xx,yy)=>bytes[base+(yy*GRID_SIZE+xx)*4+channel];
          const top=value(x0,y0)*(1-tx)+value(x1,y0)*tx,bottom=value(x0,y1)*(1-tx)+value(x1,y1)*tx;
          data[at++]=(top*(1-ty)+bottom*ty-128)/FRAME_SIZE;
        }
      }
      const result=buffer(data); meshes.set(index,result); return result;
    }
    gl.viewport(0,0,FRAME_SIZE,FRAME_SIZE); gl.disable(gl.BLEND); gl.clearColor(0,0,0,0);
    return {
      get available() { return !disposed && !gl.isContextLost(); },
      draw(sample, context) {
        if (disposed || gl.isContextLost()) return false;
        let index=pairs.get(`${sample.frame}:${sample.nextFrame}`),amount=Math.max(0,Math.min(1,sample.mix));
        if (index===undefined) { index=pairs.get(`${sample.nextFrame}:${sample.frame}`); amount=1-amount; }
        if (index===undefined || !Number.isFinite(amount) || amount<=0 || amount>=1) return false;
        // Always draw stored endpoint order, so reverse(t) equals forward(1-t)
        // through the identical GPU operations, not just approximately.
        const pair=meta.flow.pairs[index],geometry=mesh(index);
        const sourceTextures=pair.map(canonicalTexture);
        gl.useProgram(warp); gl.bindBuffer(gl.ARRAY_BUFFER,geometry); gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER,indices);
        gl.enableVertexAttribArray(warpLocations.point); gl.vertexAttribPointer(warpLocations.point,2,gl.FLOAT,false,24,0);
        gl.enableVertexAttribArray(warpLocations.field); gl.vertexAttribPointer(warpLocations.field,4,gl.FLOAT,false,24,8);
        gl.uniform1f(warpLocations.amount,amount); gl.uniform1i(warpLocations.image,0);
        for(let endpoint=0;endpoint<2;endpoint++) {
          gl.bindFramebuffer(gl.FRAMEBUFFER,targets[endpoint].framebuffer); gl.clear(gl.COLOR_BUFFER_BIT);
          gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D,sourceTextures[endpoint]); gl.uniform1f(warpLocations.endpoint,endpoint);
          gl.drawElements(gl.TRIANGLES,triangles.length,gl.UNSIGNED_SHORT,0);
        }
        gl.bindFramebuffer(gl.FRAMEBUFFER,null); gl.clear(gl.COLOR_BUFFER_BIT); gl.useProgram(blend);
        gl.disableVertexAttribArray(warpLocations.field); gl.bindBuffer(gl.ARRAY_BUFFER,quad);
        gl.enableVertexAttribArray(blendLocations.point); gl.vertexAttribPointer(blendLocations.point,2,gl.FLOAT,false,0,0);
        for(let endpoint=0;endpoint<2;endpoint++) { gl.activeTexture(gl.TEXTURE0+endpoint); gl.bindTexture(gl.TEXTURE_2D,targets[endpoint].image); }
        const contourIndex=contours.get(pair.join(':'));
        gl.activeTexture(gl.TEXTURE2);
        if(contourIndex!==undefined&&!contourTextures.has(contourIndex))contourTextures.set(contourIndex,texture(contourImages[contourIndex]));
        gl.bindTexture(gl.TEXTURE_2D,contourIndex===undefined?targets[0].image:contourTextures.get(contourIndex));
        gl.uniform1i(blendLocations.contourAtlas,2);gl.uniform1f(blendLocations.topologyEnabled,contourIndex===undefined?0:1);
        gl.uniform1i(blendLocations.first,0); gl.uniform1i(blendLocations.second,1); gl.uniform1f(blendLocations.amount,amount);
        gl.drawArrays(gl.TRIANGLES,0,6);
        if (gl.isContextLost()) return false;
        context.save();
        if (sample.facing===-1) { context.translate(FRAME_SIZE,0); context.scale(-1,1); }
        context.drawImage(canvas,0,0); context.restore(); return true;
      },
      dispose,
    };
  } catch { dispose(); return null; }
}

