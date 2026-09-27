'use client';

import { useEffect, useRef } from 'react';

// Port of React Bits' <Galaxy /> background (https://reactbits.dev/backgrounds/galaxy).
// Plain WebGL, no dependencies (the original uses ogl). Differences from the original:
// - stars are tinted with theme colours and alpha-blended, so they read on a light page
//   (the original adds white light, which vanishes on the beige background);
// - the render loop pauses off-screen, honours prefers-reduced-motion, and caps the
//   pixel ratio so phones don't pay for a retina-sized star field;
// - pointer repulsion only runs for mouse/trackpad — on touch, a scroll would drag the stars.

const VERTEX_SHADER = `
  attribute vec2 aPosition;
  varying vec2 vUv;
  void main() {
    vUv = aPosition * 0.5 + 0.5;
    gl_Position = vec4(aPosition, 0.0, 1.0);
  }
`;

const FRAGMENT_SHADER = `
  precision highp float;

  uniform float uTime;
  uniform vec2 uResolution;
  uniform float uStarSpeed;
  uniform float uDensity;
  uniform float uSpeed;
  uniform vec2 uMouse;
  uniform float uGlowIntensity;
  uniform float uTwinkleIntensity;
  uniform float uRotationSpeed;
  uniform float uRepulsionStrength;
  uniform float uMouseActiveFactor;
  uniform float uOpacity;
  uniform vec3 uColorA;
  uniform vec3 uColorB;
  uniform vec3 uColorC;

  varying vec2 vUv;

  #define NUM_LAYER 4.0
  #define MAT45 mat2(0.7071, -0.7071, 0.7071, 0.7071)
  #define PERIOD 3.0

  float Hash21(vec2 p) {
    p = fract(p * vec2(123.34, 456.21));
    p += dot(p, p + 45.32);
    return fract(p.x * p.y);
  }

  float tri(float x) {
    return abs(fract(x) * 2.0 - 1.0);
  }

  float tris(float x) {
    float t = fract(x);
    return 1.0 - smoothstep(0.0, 1.0, abs(2.0 * t - 1.0));
  }

  float trisn(float x) {
    float t = fract(x);
    return 2.0 * (1.0 - smoothstep(0.0, 1.0, abs(2.0 * t - 1.0))) - 1.0;
  }

  float Star(vec2 uv, float flare) {
    float d = length(uv);
    float m = (0.05 * uGlowIntensity) / d;
    float rays = smoothstep(0.0, 1.0, 1.0 - abs(uv.x * uv.y * 1000.0));
    m += rays * flare * uGlowIntensity;
    uv *= MAT45;
    rays = smoothstep(0.0, 1.0, 1.0 - abs(uv.x * uv.y * 1000.0));
    m += rays * 0.3 * flare * uGlowIntensity;
    m *= smoothstep(1.0, 0.2, d);
    return m;
  }

  // rgb = colour weighted by brightness, a = brightness.
  vec4 StarLayer(vec2 uv) {
    vec4 acc = vec4(0.0);
    vec2 gv = fract(uv) - 0.5;
    vec2 id = floor(uv);

    for (int y = -1; y <= 1; y++) {
      for (int x = -1; x <= 1; x++) {
        vec2 offset = vec2(float(x), float(y));
        vec2 si = id + offset;
        float seed = Hash21(si);
        float size = fract(seed * 345.32);
        float glossLocal = tri(uStarSpeed / (PERIOD * seed + 1.0));
        float flareSize = smoothstep(0.9, 1.0, size) * glossLocal;

        // Mostly Titan blue, some light blue, the odd deep-navy star.
        float pick = Hash21(si + 1.0);
        vec3 color = pick < 0.55 ? uColorA : (pick < 0.85 ? uColorB : uColorC);

        vec2 pad = vec2(
          tris(seed * 34.0 + uTime * uSpeed / 10.0),
          tris(seed * 38.0 + uTime * uSpeed / 30.0)
        ) - 0.5;

        float star = Star(gv - offset - pad, flareSize);
        float twinkle = trisn(uTime * uSpeed + seed * 6.2831) * 0.5 + 1.0;
        star *= mix(1.0, twinkle, uTwinkleIntensity);

        float b = star * size;
        acc += vec4(color * b, b);
      }
    }
    return acc;
  }

  void main() {
    vec2 uv = (vUv * uResolution - 0.5 * uResolution) / uResolution.y;

    vec2 mousePosUV = (uMouse * uResolution - 0.5 * uResolution) / uResolution.y;
    float mouseDist = length(uv - mousePosUV);
    vec2 repulsion = normalize(uv - mousePosUV + 1e-5) * (uRepulsionStrength / (mouseDist + 0.1));
    uv += repulsion * 0.05 * uMouseActiveFactor;

    float a = uTime * uRotationSpeed;
    uv = mat2(cos(a), -sin(a), sin(a), cos(a)) * uv;

    vec4 acc = vec4(0.0);
    for (float i = 0.0; i < 1.0; i += 1.0 / NUM_LAYER) {
      float depth = fract(i + uStarSpeed * uSpeed);
      float scale = mix(20.0 * uDensity, 0.5 * uDensity, depth);
      float fade = depth * smoothstep(1.0, 0.9, depth);
      acc += StarLayer(uv * scale + i * 453.32) * fade;
    }

    vec3 col = acc.rgb / max(acc.a, 1e-4);
    float alpha = smoothstep(0.0, 0.35, acc.a) * uOpacity;
    // Premultiplied output (the context default), so dots blend cleanly over the page.
    gl_FragColor = vec4(col * alpha, alpha);
  }
`;

function compile(gl, type, source) {
  const shader = gl.createShader(type);
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    console.error('Galaxy shader error:', gl.getShaderInfoLog(shader));
    gl.deleteShader(shader);
    return null;
  }
  return shader;
}

function hexToRgb(hex) {
  const n = parseInt(hex.replace('#', ''), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

export default function Galaxy({
  density = 1,
  glowIntensity = 0.3,
  twinkleIntensity = 0.3,
  rotationSpeed = 0.1,
  starSpeed = 0.5,
  speed = 1,
  repulsionStrength = 2,
  opacity = 1,
  colors = ['#2D55D6', '#8FA8FF', '#0F1830'],
  className = '',
}) {
  const canvasRef = useRef(null);
  // Props live in a ref so changing them doesn't tear down the GL context.
  const props = useRef(null);
  props.current = {
    density,
    glowIntensity,
    twinkleIntensity,
    rotationSpeed,
    starSpeed,
    speed,
    repulsionStrength,
    opacity,
    colors: colors.map(hexToRgb),
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    const gl = canvas && canvas.getContext('webgl', { antialias: false, alpha: true, premultipliedAlpha: true });
    if (!gl) return;

    const vs = compile(gl, gl.VERTEX_SHADER, VERTEX_SHADER);
    const fs = compile(gl, gl.FRAGMENT_SHADER, FRAGMENT_SHADER);
    if (!vs || !fs) return;

    const program = gl.createProgram();
    gl.attachShader(program, vs);
    gl.attachShader(program, fs);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      console.error('Galaxy program error:', gl.getProgramInfoLog(program));
      return;
    }
    gl.useProgram(program);
    gl.clearColor(0, 0, 0, 0);

    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]), gl.STATIC_DRAW);
    const aPosition = gl.getAttribLocation(program, 'aPosition');
    gl.enableVertexAttribArray(aPosition);
    gl.vertexAttribPointer(aPosition, 2, gl.FLOAT, false, 0, 0);

    const u = {};
    [
      'uTime', 'uResolution', 'uStarSpeed', 'uDensity', 'uSpeed', 'uMouse', 'uGlowIntensity',
      'uTwinkleIntensity', 'uRotationSpeed', 'uRepulsionStrength', 'uMouseActiveFactor',
      'uOpacity', 'uColorA', 'uColorB', 'uColorC',
    ].forEach((name) => {
      u[name] = gl.getUniformLocation(program, name);
    });

    // Stars are small and sharp, so they need more than CSS pixels, but a full 3x retina
    // buffer isn't worth the fill rate — 1.5 is indistinguishable at this size.
    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
      canvas.width = Math.max(1, Math.round(canvas.clientWidth * dpr));
      canvas.height = Math.max(1, Math.round(canvas.clientHeight * dpr));
      gl.viewport(0, 0, canvas.width, canvas.height);
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);

    // Pointer repulsion, eased like the original. The canvas itself has pointer-events: none
    // (the fixed 3D canvas sits above it anyway), so listen on the window.
    const finePointer = window.matchMedia('(pointer: fine)').matches;
    const mouse = { x: 0.5, y: 0.5, tx: 0.5, ty: 0.5, active: 0, target: 0 };
    const onMove = (e) => {
      const r = canvas.getBoundingClientRect();
      const inside = e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom;
      mouse.target = inside ? 1 : 0;
      if (inside) {
        mouse.tx = (e.clientX - r.left) / r.width;
        mouse.ty = 1 - (e.clientY - r.top) / r.height;
      }
    };
    const onLeave = () => {
      mouse.target = 0;
    };
    if (finePointer) {
      window.addEventListener('pointermove', onMove, { passive: true });
      document.addEventListener('pointerleave', onLeave);
    }

    const draw = (now) => {
      const p = props.current;
      const t = now * 0.001;
      mouse.x += (mouse.tx - mouse.x) * 0.05;
      mouse.y += (mouse.ty - mouse.y) * 0.05;
      mouse.active += (mouse.target - mouse.active) * 0.05;

      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.uniform1f(u.uTime, t);
      gl.uniform2f(u.uResolution, canvas.width, canvas.height);
      gl.uniform1f(u.uStarSpeed, (t * p.starSpeed) / 10);
      gl.uniform1f(u.uDensity, p.density);
      gl.uniform1f(u.uSpeed, p.speed);
      gl.uniform2f(u.uMouse, mouse.x, mouse.y);
      gl.uniform1f(u.uGlowIntensity, p.glowIntensity);
      gl.uniform1f(u.uTwinkleIntensity, p.twinkleIntensity);
      gl.uniform1f(u.uRotationSpeed, p.rotationSpeed);
      gl.uniform1f(u.uRepulsionStrength, p.repulsionStrength);
      gl.uniform1f(u.uMouseActiveFactor, mouse.active);
      gl.uniform1f(u.uOpacity, p.opacity);
      gl.uniform3fv(u.uColorA, p.colors[0]);
      gl.uniform3fv(u.uColorB, p.colors[1] || p.colors[0]);
      gl.uniform3fv(u.uColorC, p.colors[2] || p.colors[0]);
      gl.drawArrays(gl.TRIANGLES, 0, 6);
    };

    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let raf = 0;
    let visible = true;
    const loop = (now) => {
      draw(now);
      raf = visible ? requestAnimationFrame(loop) : 0;
    };

    // Only animate while the section is on screen.
    const io = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
      if (reducedMotion) {
        if (visible) draw(4000);
      } else if (visible && !raf) {
        raf = requestAnimationFrame(loop);
      }
    });
    io.observe(canvas);

    return () => {
      visible = false;
      cancelAnimationFrame(raf);
      io.disconnect();
      ro.disconnect();
      if (finePointer) {
        window.removeEventListener('pointermove', onMove);
        document.removeEventListener('pointerleave', onLeave);
      }
      gl.deleteBuffer(buffer);
      gl.deleteProgram(program);
      gl.deleteShader(vs);
      gl.deleteShader(fs);
    };
  }, []);

  return <canvas ref={canvasRef} className={`galaxy ${className}`} aria-hidden="true" />;
}
