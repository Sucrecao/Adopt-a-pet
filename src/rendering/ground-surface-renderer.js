// Standalone surface renderer: poses and image assets belong to the caller.
const logicalSize = 256;
const targetNames = ['hip', 'knee', 'ankle', 'foot'];
const loadNames = ['bob', 'pitch', 'pelvis', 'shoulder'];

function fail(message) { throw new TypeError(`Ground surface: ${message}`); }
function finite(value, label) {
  if (!Number.isFinite(value) || !Number.isFinite(Math.fround(value))) fail(`${label} must be a finite GPU number`);
  return value;
}
function vector(value, size, label) {
  if (!Array.isArray(value) || value.length !== size) fail(`${label} must contain ${size} numbers`);
  return value.map((item, index) => finite(item, `${label}[${index}]`));
}
function dimensions(image, label) {
  if (!image) fail(`${label} is required`);
  const width = 'naturalWidth' in image ? image.naturalWidth : image.width;
  const height = 'naturalHeight' in image ? image.naturalHeight : image.height;
  if (!Number.isInteger(width) || !Number.isInteger(height) || width <= 0 || height <= 0) fail(`${label} must be a decoded image with positive integer dimensions`);
  return {width, height};
}
function bindLeg(leg, imageSize, index) {
  const label = `neutralPose.legs[${index}]`;
  if (!leg || typeof leg.id !== 'string' || !leg.id.length) fail(`${label}.id must be a nonempty string`);
  if (typeof leg.fore !== 'boolean' || typeof leg.near !== 'boolean') fail(`${label} fore and near must be booleans`);
  const scale = finite(leg.scale, `${label}.scale`);
  if (scale <= 0) fail(`${label}.scale must be positive`);
  const rect = vector(leg.source?.rect, 4, `${label}.source.rect`);
  if (rect.some(value => !Number.isInteger(value)) || rect[0] < 0 || rect[1] < 0 || rect[2] <= 0 || rect[3] <= 0 || rect[0] + rect[2] > imageSize.width || rect[1] + rect[3] > imageSize.height) fail(`${label}.source.rect must be an integer XYWH region inside skinImage`);
  if (!Array.isArray(leg.source?.joints) || leg.source.joints.length !== 4) fail(`${label}.source.joints must contain four ordered bind joints`);
  const sourceJoints = leg.source.joints.map((point, joint) => vector(point, 2, `${label}.source.joints[${joint}]`));
  for (let joint = 0; joint < 4; joint++) {
    const [x, y] = sourceJoints[joint];
    if (x < rect[0] || x > rect[0] + rect[2] || y < rect[1] || y > rect[1] + rect[3]) fail(`${label}.source.joints[${joint}] is outside its source rect`);
    if (joint && y <= sourceJoints[joint - 1][1]) fail(`${label}.source.joints must run from proximal root to distal paw in increasing source y`);
  }
  const joints = sourceJoints.map(([x, y]) => [(x - rect[0]) * scale, (y - rect[1]) * scale]);
  for (const point of joints) for (const value of point) finite(value, `${label} scaled bind joint`);
  return {id:leg.id, fore:leg.fore, near:leg.near, scale, rect, sourceJoints, joints, bindZ:vector(leg.hip, 3, `${label}.hip`)[2], rootEnd:(sourceJoints[2][1] - rect[1]) / rect[3]};
}
function validatePose(pose, bindings) {
  if (!pose || !Array.isArray(pose.legs) || pose.legs.length !== 4) fail('pose must contain four limbs');
  for (const name of loadNames) finite(pose[name], `pose.${name}`);
  const yaw = pose.yaw === undefined ? 0 : finite(pose.yaw, 'pose.yaw');
  const legs = new Map();
  for (const leg of pose.legs) {
    const bind = bindings.get(leg?.id);
    if (!bind || legs.has(leg.id)) fail('pose must contain each bound limb ID exactly once');
    if (leg.fore !== bind.fore || leg.near !== bind.near || leg.scale !== bind.scale) fail(`pose limb ${leg.id} changed its fixed fore/near/scale binding`);
    const rect = vector(leg.source?.rect, 4, `pose limb ${leg.id} rect`);
    if (rect.some((value, index) => value !== bind.rect[index])) fail(`pose limb ${leg.id} changed its source rect`);
    if (!Array.isArray(leg.source?.joints) || leg.source.joints.length !== 4) fail(`pose limb ${leg.id} changed its source joints`);
    for (let joint = 0; joint < 4; joint++) {
      const point = vector(leg.source.joints[joint], 2, `pose limb ${leg.id} source joint ${joint}`);
      if (point.some((value, axis) => value !== bind.sourceJoints[joint][axis])) fail(`pose limb ${leg.id} changed its source joint ${joint}`);
    }
    for (const name of [...targetNames, 'contact']) vector(leg[name], 3, `pose limb ${leg.id}.${name}`);
    for (const name of targetNames) if (Math.abs(leg[name][2] - leg.hip[2]) > 1e-6) fail(`pose limb ${leg.id} requires sagittal target joints at a shared z`);
    for (let joint = 0; joint < 3; joint++) {
      const a = leg[targetNames[joint]], b = leg[targetNames[joint + 1]];
      if (Math.hypot(b[0] - a[0], b[1] - a[1]) <= 1e-8) fail(`pose limb ${leg.id} has a zero-length target segment`);
    }
    legs.set(leg.id, leg);
  }
  return {legs, yaw};
}

export function createGroundSurfaceRenderer(canvas, {skinImage, bodyImage, neutralPose} = {}) {
  if (!canvas || typeof canvas.getContext !== 'function') fail('canvas is required');
  const skinSize = dimensions(skinImage, 'skinImage'), bodySize = dimensions(bodyImage, 'bodyImage');
  if (bodySize.width !== logicalSize || bodySize.height !== logicalSize) fail('bodyImage must be the retained canonical 256 × 256 body topology');
  if (!neutralPose || !Array.isArray(neutralPose.legs) || neutralPose.legs.length !== 4) fail('neutralPose must bind exactly four limbs');
  const binds = neutralPose.legs.map((leg, index) => bindLeg(leg, skinSize, index));
  const bindings = new Map(binds.map(bind => [bind.id, bind]));
  if (bindings.size !== 4 || new Set(binds.map(bind => `${bind.fore}:${bind.near}`)).size !== 4) fail('neutralPose must contain four unique IDs and one limb for each fore/hind and near/far pair');
  validatePose(neutralPose, bindings);
  const ordered = [...binds].sort((a, b) => Number(a.near) - Number(b.near) || Number(a.fore) - Number(b.fore));
  let gl = null, program = null, live = false, disposed = false, reason = null, listenerAttached = false;
  const resources = {buffer:new Set(), texture:new Set(), shader:new Set(), program:new Set()};
  const release = () => {
    live = false;
    if (gl) for (const [kind, values] of Object.entries(resources)) {
      const method = `delete${kind[0].toUpperCase()}${kind.slice(1)}`;
      for (const value of values) {try {gl[method](value);} catch { /* A lost context may reject deletion. */ }}
      values.clear();
    }
  };
  const onLost = event => {try {event.preventDefault?.();} catch {}reason = 'WebGL context lost';release();};
  const removeListener = () => {if (listenerAttached) {try {canvas.removeEventListener?.('webglcontextlost', onLost);} catch {}}listenerAttached = false;};
  const dispose = () => {if (disposed) return;disposed = true;reason ??= 'Renderer disposed';removeListener();release();};
  const usable = () => {
    if (!live || disposed) return false;
    if (gl.isContextLost()) {reason = 'WebGL context lost';release();return false;}
    return true;
  };
  const api = {
    get available() {return usable();},
    get reason() {return reason;},
    render:() => false,
    drawToContext:() => false,
    dispose,
  };
  const own = (kind, value) => {if (!value) throw new Error(`Could not allocate WebGL ${kind}`);resources[kind].add(value);return value;};
  const scratch = (width, height) => {
    const document = canvas.ownerDocument ?? globalThis.document;
    const result = document?.createElement ? document.createElement('canvas') : new globalThis.OffscreenCanvas(width, height);
    result.width = width;result.height = height;return result;
  };
  try {
    gl = canvas.getContext('webgl', {alpha:true, antialias:true, preserveDrawingBuffer:true});
    if (!gl) {reason = 'WebGL unavailable';return api;}
    canvas.addEventListener?.('webglcontextlost', onLost);listenerAttached = true;
    const compile = (type, code) => {
      const item = own('shader', gl.createShader(type));gl.shaderSource(item, code);gl.compileShader(item);
      if (!gl.getShaderParameter(item, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(item) || 'Shader compilation failed');
      return item;
    };
    program = own('program', gl.createProgram());
    gl.attachShader(program, compile(gl.VERTEX_SHADER, `
      attribute vec3 point;
      attribute vec2 uv;
      attribute vec3 skin;
      uniform vec4 bone0;
      uniform vec4 bone1;
      uniform vec4 bone2;
      uniform vec4 bodyLoad;
      uniform float body;
      uniform float zOffset;
      uniform float yaw;
      varying vec2 coord;
      vec4 selectBone(float index) { return index<0.5?bone0:(index<1.5?bone1:bone2); }
      void main() {
        vec3 position=point;
        if (body>0.5) {
          float load=skin.x, u=skin.y;
          position.x+=(bodyLoad.z*(1.-u)+bodyLoad.w*u)*load;
          position.y+=(bodyLoad.x+bodyLoad.y*(point.x-128.))*load;
        } else {
          vec4 a=selectBone(skin.x), b=selectBone(skin.y);
          float sign=dot(a.xy,b.xy)<0.?-1.:1.;
          vec4 q=(a*(1.-skin.z)+b*skin.z*sign);
          q/=length(q.xy);
          float c=1.-2.*q.x*q.x, s=2.*q.x*q.y;
          position.xy=vec2(c*point.x-s*point.y+2.*(q.z*q.y-q.w*q.x),
                           s*point.x+c*point.y+2.*(q.z*q.x+q.w*q.y));
        }
        position.z+=zOffset;
        float x=position.x-128., z=position.z;
        float X=x*cos(yaw)+z*sin(yaw), Z=-x*sin(yaw)+z*cos(yaw);
        gl_Position=vec4(X/128.,1.-position.y/128.,-Z/160.,1.);
        coord=uv;
      }
    `));
    gl.attachShader(program, compile(gl.FRAGMENT_SHADER, `
      precision mediump float;
      varying vec2 coord;
      uniform sampler2D atlas;
      uniform float shade;
      uniform vec2 rootRect;
      uniform float rootEnd;
      uniform float skinPass;
      void main() {
        float v=(coord.y-rootRect.x)/rootRect.y;
        if(skinPass>.5&&skinPass<1.5&&v>=rootEnd)discard;
        if(skinPass>1.5&&v<rootEnd)discard;
        vec4 c=texture2D(atlas,coord);
        if(c.a<.06)discard;
        gl_FragColor=vec4(c.rgb*shade,c.a);
      }
    `));
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program) || 'Shader link failed');
    gl.useProgram(program);
    const locations = {};
    for (const name of ['bone0','bone1','bone2','bodyLoad','body','zOffset','yaw','shade','rootRect','rootEnd','skinPass']) locations[name] = gl.getUniformLocation(program, name);
    const attributes = [['point',3,0],['uv',2,12],['skin',3,20]].map(([name,size,offset]) => ({at:gl.getAttribLocation(program,name),size,offset}));
    if (attributes.some(attribute => attribute.at < 0) || Object.values(locations).some(location => !location)) throw new Error('Shader binding unavailable');
    gl.uniform1i(gl.getUniformLocation(program,'atlas'),0);gl.uniform2f(locations.rootRect,0,1);gl.uniform1f(locations.rootEnd,1);
    gl.activeTexture(gl.TEXTURE0);gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL,true);gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,false);
    const maximum = gl.getParameter(gl.MAX_TEXTURE_SIZE);
    const upload = (image, size, mipmapped) => {
      let source = image;
      if (mipmapped && ((size.width & (size.width-1)) || (size.height & (size.height-1)))) {
        source = scratch(2**Math.ceil(Math.log2(size.width)),2**Math.ceil(Math.log2(size.height)));
        const context = source.getContext('2d');if (!context) throw new Error('No scratch 2D context');
        context.imageSmoothingQuality = 'high';context.drawImage(image,0,0,source.width,source.height);
      }
      if (source.width > maximum || source.height > maximum) throw new Error('Image exceeds GPU texture limit');
      const texture = own('texture',gl.createTexture());gl.bindTexture(gl.TEXTURE_2D,texture);
      gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,mipmapped?gl.LINEAR_MIPMAP_LINEAR:gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
      gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,source);if (mipmapped) gl.generateMipmap(gl.TEXTURE_2D);
      if (gl.getError() !== gl.NO_ERROR) throw new Error('GPU texture upload failed');
      return texture;
    };
    const skinTexture = upload(skinImage,skinSize,true), bodyTexture = upload(bodyImage,bodySize,false);
    const ink = scratch(skinSize.width,skinSize.height), context = ink.getContext('2d');if (!context) throw new Error('No source alpha context');
    context.drawImage(skinImage,0,0);const rgba = context.getImageData(0,0,skinSize.width,skinSize.height).data, hullCache = new Map();
    const hullRows = rect => {
      const key = rect.join(',');if (hullCache.has(key)) return hullCache.get(key);
      const [x,y,w,h] = rect, rows = Array.from({length:h},(_,v) => {let a=w,b=0;for(let u=0;u<w;u++)if(rgba[((y+v)*skinSize.width+x+u)*4+3]>=16){a=Math.min(a,u);b=Math.max(b,u);}return[a,b];});
      hullCache.set(key,rows);return rows;
    };
    const build = (rect, size, texture, project, rows, columns) => {
      const [x,y,w,h] = rect, vertices = [];
      const vertex = (u,v) => {const {point,skin} = project(u,v);return [...point,(x+u*w)/size.width,(y+v*h)/size.height,...skin];};
      for(let r=0;r<rows;r++)for(let c=0;c<columns;c++) {
        const u=c/columns,v=r/rows,U=(c+1)/columns,V=(r+1)/rows,a=vertex(u,v),b=vertex(U,v),C=vertex(u,V),d=vertex(U,V);vertices.push(...a,...b,...C,...b,...d,...C);
      }
      const buffer = own('buffer',gl.createBuffer());gl.bindBuffer(gl.ARRAY_BUFFER,buffer);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(vertices),gl.STATIC_DRAW);
      if (gl.getError() !== gl.NO_ERROR) throw new Error('GPU geometry upload failed');
      return {buffer,count:vertices.length/8,texture,rect,size};
    };
    const geometry = new Map();
    for (const bind of binds) {
      const {rect,joints,scale} = bind, hulls = hullRows(rect);
      const item = build(rect,skinSize,skinTexture,(u,v) => {
        const x=u*rect[2]*scale,y=v*rect[3]*scale;
        let bone=y<joints[1][1]?0:y<joints[2][1]?1:2,first=bone,second=bone,weight=0;
        for(const at of [1,2]) {const radius=(joints[at+1][1]-joints[at-1][1])*.045,d=y-joints[at][1];if(Math.abs(d)<radius){first=at-1;second=at;const t=(d/radius+1)/2;weight=t*t*(3-2*t);}}
        const hull=hulls[Math.min(rect[3]-1,Math.round(v*(rect[3]-1)))],center=(hull[0]+hull[1])/2,width=Math.max(1,(hull[1]-hull[0])/2),radial=(u*rect[2]-center)/width;
        let z=bind.bindZ+5*Math.sqrt(Math.max(0,1-radial*radial));if(bind.near&&y<joints[1][1])z-=35*Math.max(0,1-(y-joints[0][1])/(joints[1][1]-joints[0][1]));
        return {point:[x,y,z],skin:[first,second,weight]};
      },60,18);
      geometry.set(bind.id,item);
    }
    const torso = build([0,0,256,256],bodySize,bodyTexture,(u,v) => {
      const x=u*256,y=v*256,load=(1-Math.min(1,Math.max(0,(120-y)/40)))*Math.min(1,Math.max(0,(230-x)/70));
      return {point:[x,y,6+10*Math.sin(Math.PI*u)*Math.sin(Math.PI*y/256)],skin:[load,u,0]};
    },64,64);
    gl.disable(gl.CULL_FACE);gl.disable(gl.SCISSOR_TEST);gl.enable(gl.DEPTH_TEST);gl.depthFunc(gl.LESS);gl.depthMask(true);gl.clearDepth(1);
    gl.enable(gl.BLEND);gl.blendEquationSeparate(gl.FUNC_ADD,gl.FUNC_ADD);gl.blendFuncSeparate(gl.ONE,gl.ONE_MINUS_SRC_ALPHA,gl.ONE,gl.ONE_MINUS_SRC_ALPHA);gl.clearColor(0,0,0,0);
    const draw = (item, shade, pass=0, end=1) => {
      gl.bindBuffer(gl.ARRAY_BUFFER,item.buffer);for(const {at,size,offset} of attributes){gl.enableVertexAttribArray(at);gl.vertexAttribPointer(at,size,gl.FLOAT,false,32,offset);}
      gl.bindTexture(gl.TEXTURE_2D,item.texture);gl.uniform1f(locations.shade,shade);gl.uniform1f(locations.skinPass,pass);
      if(pass){gl.uniform2f(locations.rootRect,item.rect[1]/item.size.height,item.rect[3]/item.size.height);gl.uniform1f(locations.rootEnd,end);}
      gl.drawArrays(gl.TRIANGLES,0,item.count);
    };
    const drawLeg = (bind,leg,pass=0) => {
      gl.uniform1f(locations.body,0);gl.uniform1f(locations.zOffset,leg.hip[2]-bind.bindZ);
      for(let joint=0;joint<3;joint++) {
        const point=bind.joints[joint],other=bind.joints[joint+1],target=leg[targetNames[joint]],next=leg[targetNames[joint+1]];
        const angle=Math.atan2(next[1]-target[1],next[0]-target[0])-Math.atan2(other[1]-point[1],other[0]-point[0]),c=Math.cos(angle),s=Math.sin(angle);
        const x=target[0]-point[0]*c+point[1]*s,y=target[1]-point[0]*s-point[1]*c,z=Math.sin(angle/2),w=Math.cos(angle/2);
        gl.uniform4fv(locations[`bone${joint}`],[z,w,(x*w+y*z)/2,(y*w-x*z)/2]);
      }
      draw(geometry.get(bind.id),bind.near?1:.96,pass,bind.rootEnd);
    };
    api.render = pose => {
      if (!usable()) return false;
      const {legs,yaw} = validatePose(pose,bindings);
      if (!canvas.width || !canvas.height) return false;
      try {
        gl.useProgram(program);gl.activeTexture(gl.TEXTURE0);gl.viewport(0,0,canvas.width,canvas.height);gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);gl.uniform1f(locations.yaw,yaw);
        for(const bind of ordered)if(!bind.near)drawLeg(bind,legs.get(bind.id));
        gl.depthMask(false);gl.disable(gl.DEPTH_TEST);for(const bind of ordered)if(bind.near)drawLeg(bind,legs.get(bind.id),1);
        gl.enable(gl.DEPTH_TEST);gl.depthMask(true);gl.uniform1f(locations.body,1);gl.uniform1f(locations.zOffset,0);gl.uniform4f(locations.bodyLoad,pose.bob,pose.pitch,pose.pelvis,pose.shoulder);draw(torso,1);
        for(const bind of ordered)if(bind.near)drawLeg(bind,legs.get(bind.id),2);
        return true;
      } catch(error) {reason=error?.message??'GPU draw failed';removeListener();release();return false;}
    };
    api.drawToContext = (pose,context,facing=1) => {
      if (!usable()) return false;
      if (!context || typeof context.drawImage !== 'function' || typeof context.save !== 'function' || typeof context.restore !== 'function') fail('a destination 2D context is required');
      finite(facing,'facing');if(facing===0)fail('facing must be nonzero');
      if (!api.render(pose)) return false;
      context.save();try {if(facing<0){context.translate(256,0);context.scale(-1,1);}context.drawImage(canvas,0,0,256,256);} finally {context.restore();}
      return true;
    };
    live = true;return api;
  } catch(error) {reason=error?.message??'GPU initialization failed';removeListener();release();return api;}
}
