import { spriteBaselineOffset } from '../core/animation.js';

const FRAME_SIZE = 256;
const TRANSITION_MS = 180;
const clampMix = value => Math.max(0, Math.min(1, value || 0));
const clipKey = sample => `${sample.atlas}:${sample.clip}:${sample.sequence ?? ''}`;
const offset = (species, atlas, frame) => atlas === 'motion' ? spriteBaselineOffset(species, frame) : 0;

function presentationClock() {
  let previousNow, frozen = false, elapsed = 0;
  return (sample, now) => {
    if (previousNow !== undefined && !frozen) elapsed += Math.max(0, now - previousNow);
    previousNow = Math.max(previousNow ?? now, now);
    frozen = Boolean(sample.stopped);
    return elapsed;
  };
}

const vertexSource = `
attribute vec2 position;
varying vec2 uv;
void main() {
  gl_Position = vec4(position, 0.0, 1.0);
  uv = vec2(position.x * .5 + .5, .5 - position.y * .5);
}`;

const fragmentSource = `
precision highp float;
varying vec2 uv;
uniform sampler2D currentImage;
uniform sampler2D nextImage;
uniform sampler2D previousImage;
uniform float transition;
uniform float amount;
void main() {
  vec2 at = vec2(uv.x, 1.0 - uv.y);
  vec4 pose = mix(texture2D(currentImage, at), texture2D(nextImage, at), amount);
  gl_FragColor = mix(texture2D(previousImage, at), pose, transition);
}`;

const meshVertexSource = `
attribute vec2 point;
attribute vec4 field;
uniform float amount;
uniform float direction;
varying vec2 uv;
void main() {
  uv = point;
  vec2 shift = direction < .5 ? field.xy * amount : field.zw * (1.0 - amount);
  vec2 at = point + shift;
  gl_Position = vec4(at.x * 2.0 - 1.0, 1.0 - at.y * 2.0, 0.0, 1.0);
}`;

const meshFragmentSource = `
precision highp float;
varying vec2 uv;
uniform sampler2D motionAtlas;
uniform sampler2D legacyAtlas;
uniform vec2 frames;
uniform vec2 offsets;
uniform vec2 layout;
uniform float legacy;
uniform float amount;
uniform float direction;

vec4 pose(float frame, vec2 point, float baseline) {
  point.y -= baseline;
  if (point.x < 0.0 || point.x > 1.0 || point.y < 0.0 || point.y > 1.0) return vec4(0.0);
  // Half-texel inset prevents filtering a neighboring atlas cell at its edge.
  point = clamp(point, vec2(.5 / 256.0), vec2(1.0 - .5 / 256.0));
  vec2 cell = vec2(mod(frame, layout.x), floor(frame / layout.x));
  vec2 at = (cell + point) / layout;
  return legacy > .5 ? texture2D(legacyAtlas, at) : texture2D(motionAtlas, at);
}

void main() {
  vec4 color = direction < .5 ? pose(frames.x, uv, offsets.x) : pose(frames.y, uv, offsets.y);
  if (color.a < .0039) discard;
  gl_FragColor = color;
}`;

function validFlow(meta, bytes) {
  return meta?.version === 1 && meta.size === 64 && meta.frameSize === FRAME_SIZE
    && ['signed-half-pixel-rgba', 'signed-one-pixel-rgba'].includes(meta.encoding) && Array.isArray(meta.pairs)
    && meta.pairs.every(pair => Array.isArray(pair) && pair.length === 2 && pair.every(frame => Number.isInteger(frame) && frame >= 0 && frame < 24))
    && bytes?.byteLength === meta.pairs.length * meta.size * meta.size * 4;
}

function shader(gl, type, source) {
  const result = gl.createShader(type);
  gl.shaderSource(result, source); gl.compileShader(result);
  if (!gl.getShaderParameter(result, gl.COMPILE_STATUS)) {
    const message = gl.getShaderInfoLog(result); gl.deleteShader(result); throw new Error(message);
  }
  return result;
}

function gpuRenderer(canvas, options, gl) {
  const { species, motionImage, legacyImage, flowMeta, flowBytes } = options;
  const resources = { textures: [], shaders: [], programs: [], buffers: [], framebuffers: [] };
  const clock = presentationClock();
  let disposed = false, key = null, transitionStarted = -TRANSITION_MS, flowIndex = -1;
  function dispose() {
    if (disposed) return;
    disposed = true;
    resources.textures.forEach(texture => gl.deleteTexture(texture));
    resources.shaders.forEach(item => gl.deleteShader(item));
    resources.buffers.forEach(buffer => gl.deleteBuffer(buffer));
    resources.programs.forEach(program => gl.deleteProgram(program));
    resources.framebuffers.forEach(framebuffer => gl.deleteFramebuffer(framebuffer));
  }
  try {
    function program(vertex, fragment) {
      const result = gl.createProgram(); resources.programs.push(result);
      for (const [type, source] of [[gl.VERTEX_SHADER, vertex], [gl.FRAGMENT_SHADER, fragment]]) {
        const item = shader(gl, type, source); resources.shaders.push(item); gl.attachShader(result, item);
      }
      gl.linkProgram(result);
      if (!gl.getProgramParameter(result, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(result));
      return result;
    }
    function buffer(target, data, usage = gl.STATIC_DRAW) {
      const result = gl.createBuffer(); resources.buffers.push(result); gl.bindBuffer(target, result); gl.bufferData(target, data, usage); return result;
    }
    const meshProgram = program(meshVertexSource, meshFragmentSource);
    const compositeProgram = program(vertexSource, fragmentSource);
    const pointAttribute = gl.getAttribLocation(meshProgram, 'point'), fieldAttribute = gl.getAttribLocation(meshProgram, 'field');
    const quadAttribute = gl.getAttribLocation(compositeProgram, 'position');
    const locations = Object.fromEntries(['frames', 'offsets', 'layout', 'legacy', 'amount', 'direction'].map(name => [name, gl.getUniformLocation(meshProgram, name)]));
    const transitionLocation = gl.getUniformLocation(compositeProgram, 'transition');
    const amountLocation = gl.getUniformLocation(compositeProgram, 'amount');
    const quadBuffer = buffer(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]));
    const meshBuffer = buffer(gl.ARRAY_BUFFER, new Float32Array(65 * 65 * 6), gl.DYNAMIC_DRAW);
    const indices = new Uint16Array(64 * 64 * 6);
    for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) {
      const a = y * 65 + x; indices.set([a, a + 65, a + 1, a + 1, a + 65, a + 66], (y * 64 + x) * 6);
    }
    const indexBuffer = buffer(gl.ELEMENT_ARRAY_BUFFER, indices);
    function texture(unit, image, width = 1, height = 1) {
      const result = gl.createTexture(); resources.textures.push(result);
      gl.activeTexture(gl.TEXTURE0 + unit); gl.bindTexture(gl.TEXTURE_2D, result);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, Boolean(image));
      if (image) gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);
      else gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
      return result;
    }
    texture(0, motionImage); texture(1, legacyImage);
    const currentTexture = texture(2, null, canvas.width, canvas.height);
    const previousTexture = texture(3, null, canvas.width, canvas.height);
    const nextTexture = texture(4, null, canvas.width, canvas.height);
    gl.useProgram(meshProgram);
    gl.uniform1i(gl.getUniformLocation(meshProgram, 'motionAtlas'), 0); gl.uniform1i(gl.getUniformLocation(meshProgram, 'legacyAtlas'), 1);
    gl.useProgram(compositeProgram);
    gl.uniform1i(gl.getUniformLocation(compositeProgram, 'currentImage'), 2); gl.uniform1i(gl.getUniformLocation(compositeProgram, 'previousImage'), 3);
    gl.uniform1i(gl.getUniformLocation(compositeProgram, 'nextImage'), 4);
    function framebuffer(texture) {
      const result = gl.createFramebuffer(); resources.framebuffers.push(result);
      gl.bindFramebuffer(gl.FRAMEBUFFER, result);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
      if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) throw new Error('Sprite framebuffer unavailable');
      return result;
    }
    const currentFramebuffer = framebuffer(currentTexture), nextFramebuffer = framebuffer(nextTexture);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    const fields = flowBytes instanceof Uint8Array ? flowBytes : new Uint8Array(flowBytes);
    const pairIndices = new Map(flowMeta.pairs.map((pair, index) => [pair.join(':'), index]));
    function updateMesh(index) {
      const vertices = new Float32Array(65 * 65 * 6), start = index * 64 * 64 * 4;
      for (let y = 0; y <= 64; y++) for (let x = 0; x <= 64; x++) {
        const at = (y * 65 + x) * 6; vertices[at] = x / 64; vertices[at + 1] = y / 64;
        if (index < 0) continue;
        const fx = Math.max(0, Math.min(63, x - .5)), fy = Math.max(0, Math.min(63, y - .5));
        const x0 = Math.floor(fx), y0 = Math.floor(fy), x1 = Math.min(63, x0 + 1), y1 = Math.min(63, y0 + 1), dx = fx - x0, dy = fy - y0;
        for (let channel = 0; channel < 4; channel++) {
          const a = fields[start + (y0 * 64 + x0) * 4 + channel], b = fields[start + (y0 * 64 + x1) * 4 + channel];
          const c = fields[start + (y1 * 64 + x0) * 4 + channel], d = fields[start + (y1 * 64 + x1) * 4 + channel];
          const divisor = flowMeta.encoding === 'signed-one-pixel-rgba' ? 256 : 512;
          vertices[at + 2 + channel] = ((a * (1 - dx) + b * dx) * (1 - dy) + (c * (1 - dx) + d * dx) * dy - 128) / divisor;
        }
      }
      gl.bindBuffer(gl.ARRAY_BUFFER, meshBuffer); gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.DYNAMIC_DRAW);
    }
    updateMesh(-1);
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.disable(gl.BLEND);
    canvas.dataset.renderer = 'webgl';
    return {
      draw(sample, now) {
        if (disposed || gl.isContextLost()) return false;
        now = clock(sample, now);
        const nextKey = clipKey(sample);
        if (key !== nextKey) {
          if (key !== null) {
            gl.activeTexture(gl.TEXTURE3); gl.bindTexture(gl.TEXTURE_2D, previousTexture);
            gl.copyTexImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 0, 0, canvas.width, canvas.height, 0);
            transitionStarted = now - (sample.stopped ? TRANSITION_MS : 0);
          }
          key = nextKey;
        }
        const frame = sample.frame, nextFrame = sample.nextFrame ?? frame;
        const index = sample.atlas === 'motion' ? pairIndices.get(`${frame}:${nextFrame}`) ?? -1 : -1;
        if (index !== flowIndex) { updateMesh(index); flowIndex = index; }
        const isLegacy = sample.atlas === 'legacy';
        gl.useProgram(meshProgram);
        gl.bindBuffer(gl.ARRAY_BUFFER, meshBuffer); gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indexBuffer);
        gl.enableVertexAttribArray(pointAttribute); gl.vertexAttribPointer(pointAttribute, 2, gl.FLOAT, false, 24, 0);
        gl.enableVertexAttribArray(fieldAttribute); gl.vertexAttribPointer(fieldAttribute, 4, gl.FLOAT, false, 24, 8);
        gl.uniform2f(locations.frames, frame, nextFrame);
        gl.uniform2f(locations.offsets, offset(species, sample.atlas, frame) / FRAME_SIZE, offset(species, sample.atlas, nextFrame) / FRAME_SIZE);
        gl.uniform2f(locations.layout, isLegacy ? 3 : 6, isLegacy ? 2 : 4);
        gl.uniform1f(locations.legacy, Number(isLegacy));
        gl.uniform1f(locations.amount, clampMix(sample.mix));
        gl.bindFramebuffer(gl.FRAMEBUFFER, currentFramebuffer);
        gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
        // A deformed mesh can cover a pixel more than once. Keep each pose
        // in its own target so overlaps never add color within one animal.
        gl.disable(gl.BLEND);
        gl.uniform1f(locations.direction, 0); gl.drawElements(gl.TRIANGLES, indices.length, gl.UNSIGNED_SHORT, 0);
        gl.bindFramebuffer(gl.FRAMEBUFFER, nextFramebuffer); gl.clear(gl.COLOR_BUFFER_BIT);
        gl.uniform1f(locations.direction, 1); gl.drawElements(gl.TRIANGLES, indices.length, gl.UNSIGNED_SHORT, 0);
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        gl.useProgram(compositeProgram); gl.bindBuffer(gl.ARRAY_BUFFER, quadBuffer);
        gl.disableVertexAttribArray(fieldAttribute);
        gl.enableVertexAttribArray(quadAttribute); gl.vertexAttribPointer(quadAttribute, 2, gl.FLOAT, false, 0, 0);
        gl.uniform1f(transitionLocation, clampMix((now - transitionStarted) / TRANSITION_MS));
        gl.uniform1f(amountLocation, clampMix(sample.mix));
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
        return true;
      },
      dispose,
    };
  } catch (error) { dispose(); throw error; }
}

function softwareRenderer(canvas, { species, motionImage, legacyImage }) {
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Canvas drawing is unavailable');
  const previous = document.createElement('canvas'); previous.width = canvas.width; previous.height = canvas.height;
  const capture = previous.getContext('2d');
  let key = null, transitionStarted = -TRANSITION_MS, disposed = false;
  const clock = presentationClock();
  const scale = canvas.width / FRAME_SIZE;
  function pose(atlas, frame, weight) {
    if (weight <= 0) return;
    const image = atlas === 'legacy' ? legacyImage : motionImage;
    if (!image) return;
    const columns = atlas === 'legacy' ? 3 : 6, rows = atlas === 'legacy' ? 2 : 4;
    const width = image.width / columns, height = image.height / rows;
    context.globalAlpha = weight;
    context.drawImage(image, frame % columns * width, Math.floor(frame / columns) * height, width, height,
      0, offset(species, atlas, frame) * scale, canvas.width, canvas.height);
  }
  canvas.dataset.renderer = '2d';
  return {
    draw(sample, now) {
      if (disposed) return false;
      now = clock(sample, now);
      const nextKey = clipKey(sample);
      if (key !== nextKey) {
        if (key !== null) {
          capture.clearRect(0, 0, previous.width, previous.height); capture.drawImage(canvas, 0, 0);
          transitionStarted = now - (sample.stopped ? TRANSITION_MS : 0);
        }
        key = nextKey;
      }
      const transition = clampMix((now - transitionStarted) / TRANSITION_MS), mix = clampMix(sample.mix);
      context.clearRect(0, 0, canvas.width, canvas.height);
      // Add weighted premultiplied colors; source-over would make shared
      // opaque regions translucent midway through an interpolation.
      context.globalCompositeOperation = 'lighter';
      context.globalAlpha = 1 - transition; context.drawImage(previous, 0, 0);
      pose(sample.atlas, sample.frame, (1 - mix) * transition);
      pose(sample.atlas, sample.nextFrame ?? sample.frame, mix * transition);
      context.globalAlpha = 1; context.globalCompositeOperation = 'source-over';
      return true;
    },
    dispose() { disposed = true; previous.width = previous.height = 0; },
  };
}

/** Draws registered neighboring poses; React owns the surrounding hit target. */
export function createSpriteRenderer(canvas, options) {
  canvas.width = canvas.height = FRAME_SIZE;
  if (options.motionImage && options.legacyImage && validFlow(options.flowMeta, options.flowBytes)) {
    const gl = canvas.getContext('webgl', { alpha: true, premultipliedAlpha: true, antialias: false, preserveDrawingBuffer: true });
    if (gl) {
      try {
        const renderer = gpuRenderer(canvas, options, gl);
        const lost = event => { event.preventDefault(); options.onContextLost?.(); };
        canvas.addEventListener('webglcontextlost', lost);
        return { draw: renderer.draw, dispose() { canvas.removeEventListener('webglcontextlost', lost); renderer.dispose(); } };
      } catch {
        // A context that failed shader initialization cannot become a 2D
        // context. Keep the caller's already decoded background visible.
        throw new Error('GPU sprite initialization failed');
      }
    }
  }
  return softwareRenderer(canvas, options);
}
