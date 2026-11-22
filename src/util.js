// Utilidades comunes de la capa 3D.
import * as THREE from 'three';

export const G = window; // el juego vive en globales (index.html usa var en todo)

export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const lerp = (a, b, t) => a + (b - a) * t;
export const smooth = t => t * t * (3 - 2 * t);
export const easeOut = t => 1 - Math.pow(1 - t, 3);
export const easeInOut = t => (t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
export const backOut = t => { const c = 1.70158; return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2); };
// acercarse a un valor sin depender de los fps
export const damp = (a, b, k, dt) => lerp(a, b, 1 - Math.exp(-k * dt));
export const TAU = Math.PI * 2;
export const rad = d => d * Math.PI / 180;

// generador con semilla (para que Sestao salga igual en todos los moviles)
export function rng(seed) {
  let a = seed >>> 0;
  const f = () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
  f.r = (a2, b2) => a2 + (b2 - a2) * f();
  f.i = (a2, b2) => Math.floor(f.r(a2, b2 + 1));
  f.pick = arr => arr[Math.floor(f() * arr.length)];
  return f;
}

// Paleta oficial del pixel art (tools/make-sprites.js), misma letra por color.
export const PAL = {
  K: 0x1f241e, H: 0x28211e, h: 0x4a3b30, S: 0xe8b990, s: 0xc9966b, C: 0xd8a379, E: 0xf8f6f0, e: 0xd2d0c6,
  P: 0x3a2a1e, M: 0xa05848, T: 0xb5bd68, t: 0x898e42, Z: 0x3a6ed8, z: 0x2952a8, N: 0x28324e, n: 0x3a486c,
  G: 0xa8805e, R: 0xc42e28, B: 0x26262c, Q: 0xe9b73d, q: 0xb58620, O: 0x8b5e3c, o: 0x68442a, L: 0x80828a,
  V: 0xab47bc, Y: 0xd6e83c, y: 0xaaba28, W: 0x3e546e, w: 0x2c3e54, X: 0x781830, F: 0xd6a05a, f: 0xaa763c,
  J: 0xf0cc50, A: 0x78c83c, a: 0xbaec6e, D: 0x464850, g: 0x4e7d5b, k: 0x345840, r: 0x821e1a, c: 0x966840,
  b: 0x84c6f0, m: 0xff5ca0, u: 0x3ce6d2, i: 0x5c963c, j: 0xc81e26
};

const _c = new THREE.Color();
export function hex2lin(hex, out) { _c.setHex(hex); out[0] = _c.r; out[1] = _c.g; out[2] = _c.b; return out; }
export function mixHex(a, b, t) {
  const ar = a >> 16 & 255, ag = a >> 8 & 255, ab = a & 255, br = b >> 16 & 255, bg = b >> 8 & 255, bb = b & 255;
  return (Math.round(ar + (br - ar) * t) << 16) | (Math.round(ag + (bg - ag) * t) << 8) | Math.round(ab + (bb - ab) * t);
}
export const shade = (hex, f) => f < 1 ? mixHex(hex, 0x000000, 1 - f) : mixHex(hex, 0xffffff, f - 1);
export function cssHex(v) { // '#rrggbb' o 'rgb(...)' -> numero
  v = String(v || '').trim();
  if (v[0] === '#') { if (v.length === 4) v = '#' + v[1] + v[1] + v[2] + v[2] + v[3] + v[3]; return parseInt(v.slice(1, 7), 16) || 0; }
  const m = v.match(/(\d+)[ ,]+(\d+)[ ,]+(\d+)/); return m ? (+m[1] << 16 | +m[2] << 8 | +m[3]) : 0;
}

export function el(tag, cls, html) { const e = document.createElement(tag); if (cls) e.className = cls; if (html !== undefined) e.innerHTML = html; return e; }
export const $ = id => document.getElementById(id);

// llamar a una funcion del juego sin que un fallo tumbe el 3D
export function gcall(name, ...args) { try { const f = G[name]; if (typeof f === 'function') return f(...args); } catch (e) { /* el juego manda */ } return undefined; }
export function safe(fn, dflt) { try { return fn(); } catch (e) { return dflt; } }
