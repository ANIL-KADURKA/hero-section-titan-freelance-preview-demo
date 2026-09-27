'use client';

import { useEffect, useRef } from 'react';

// Port of React Bits' <Lightning /> background (https://reactbits.dev/backgrounds/lightning).
// Plain WebGL, no dependencies. Differences from the original: the render loop is cleaned up
// on unmount, pauses while the canvas is off-screen, and honours prefers-reduced-motion.

const VERTEX_SHADER = `
  attribute vec2 aPosition;
  void main() {
    gl_Position = vec4(aPosition, 0.0, 1.0);
  }
`;

const FRAGMENT_SHADER = `
  precision mediump float;
  uniform vec2 iResolution;
  uniform float iTime;
  uniform float uHue;
  uniform float uXOffset;
  uniform float uSpeed;
  uniform float uIntensity;
  uniform float uSize;

  #define OCTAVE_COUNT 10

  vec3 hsv2rgb(vec3 c) {
    vec3 rgb = clamp(abs(mod(c.x * 6.0 + vec3(0.0, 4.0, 2.0), 6.0) - 3.0) - 1.0, 0.0, 1.0);
    return c.z * mix(vec3(1.0), rgb, c.y);
  }

  float hash11(float p) {
    p = fract(p * .1031);
    p *= p + 33.33;
    p *= p + p;
    return fract(p);
  }

  float hash12(vec2 p) {
    vec3 p3 = fract(vec3(p.xyx) * .1031);
    p3 += dot(p3, p3.yzx + 33.33);
    return fract((p3.x + p3.y) * p3.z);
  }

  mat2 rotate2d(float theta) {
    float c = cos(theta);
    float s = sin(theta);
    return mat2(c, -s, s, c);
  }

  float noise(vec2 p) {
    vec2 ip = floor(p);
    vec2 fp = fract(p);
    float a = hash12(ip);
    float b = hash12(ip + vec2(1.0, 0.0));
    float c = hash12(ip + vec2(0.0, 1.0));
    float d = hash12(ip + vec2(1.0, 1.0));
    vec2 t = smoothstep(0.0, 1.0, fp);
    return mix(mix(a, b, t.x), mix(c, d, t.x), t.y);
  }

  float fbm(vec2 p) {
    float value = 0.0;
    float amplitude = 0.5;
    for (int i = 0; i < OCTAVE_COUNT; ++i) {
      value += amplitude * noise(p);
      p *= rotate2d(0.45);
      p *= 2.0;
      amplitude *= 0.5;
    }
    return value;
  }

  void main() {
    vec2 uv = gl_FragCoord.xy / iResolution.xy;
    uv = 2.0 * uv - 1.0;
    uv.x *= iResolution.x / iResolution.y;
    uv.x += uXOffset;

    uv += 2.0 * fbm(uv * uSize + 0.8 * iTime * uSpeed) - 1.0;

    float dist = abs(uv.x);
    vec3 baseColor = hsv2rgb(vec3(uHue / 360.0, 0.7, 0.8));
    vec3 col = baseColor * mix(0.0, 0.07, hash11(iTime * uSpeed)) / dist * uIntensity;
    gl_FragColor = vec4(col, 1.0);
  }
`;

function compile(gl, type, source) {
  const shader = gl.createShader(type);
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    console.error('Lightning shader error:', gl.getShaderInfoLog(shader));
    gl.deleteShader(shader);
    return null;
  }
  return shader;
}

export default function Lightning({ hue = 230, xOffset = 0, speed = 1, intensity = 1, size = 1, className = '' }) {
  const canvasRef = useRef(null);
  // Props live in a ref so changing them doesn't tear down the GL context.
  const props = useRef({ hue, xOffset, speed, intensity, size });
  props.current = { hue, xOffset, speed, intensity, size };

  useEffect(() => {
    const canvas = canvasRef.current;
    const gl = canvas && canvas.getContext('webgl', { antialias: false, alpha: false });
    if (!gl) return;

    const vs = compile(gl, gl.VERTEX_SHADER, VERTEX_SHADER);
    const fs = compile(gl, gl.FRAGMENT_SHADER, FRAGMENT_SHADER);
    if (!vs || !fs) return;

    const program = gl.createProgram();
    gl.attachShader(program, vs);
    gl.attachShader(program, fs);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      console.error('Lightning program error:', gl.getProgramInfoLog(program));
      return;
    }
    gl.useProgram(program);

    // One full-screen quad.
    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]), gl.STATIC_DRAW);
    const aPosition = gl.getAttribLocation(program, 'aPosition');
    gl.enableVertexAttribArray(aPosition);
    gl.vertexAttribPointer(aPosition, 2, gl.FLOAT, false, 0, 0);

    const u = {};
    ['iResolution', 'iTime', 'uHue', 'uXOffset', 'uSpeed', 'uIntensity', 'uSize'].forEach((name) => {
      u[name] = gl.getUniformLocation(program, name);
    });

    // The shader is fill-rate heavy (10 octaves of noise per pixel) and the glow is soft anyway,
    // so render at CSS-pixel resolution rather than device pixels.
    const resize = () => {
      canvas.width = Math.max(1, canvas.clientWidth);
      canvas.height = Math.max(1, canvas.clientHeight);
      gl.viewport(0, 0, canvas.width, canvas.height);
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);

    const start = performance.now();
    const draw = (now) => {
      const p = props.current;
      gl.uniform2f(u.iResolution, canvas.width, canvas.height);
      gl.uniform1f(u.iTime, (now - start) / 1000);
      gl.uniform1f(u.uHue, p.hue);
      gl.uniform1f(u.uXOffset, p.xOffset);
      gl.uniform1f(u.uSpeed, p.speed);
      gl.uniform1f(u.uIntensity, p.intensity);
      gl.uniform1f(u.uSize, p.size);
      gl.drawArrays(gl.TRIANGLES, 0, 6);
    };

    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let raf = 0;
    let visible = true;
    const loop = (now) => {
      draw(now);
      raf = visible ? requestAnimationFrame(loop) : 0;
    };

    // Stop drawing once the hero has scrolled away; the 3D logo needs the GPU more.
    const io = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
      if (reducedMotion) {
        if (visible) draw(start + 1800);
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
      gl.deleteBuffer(buffer);
      gl.deleteProgram(program);
      gl.deleteShader(vs);
      gl.deleteShader(fs);
    };
  }, []);

  return <canvas ref={canvasRef} className={`lightning ${className}`} aria-hidden="true" />;
}
