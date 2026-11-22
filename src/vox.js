// Constructor de mallas voxel: se van apilando cajas de color y sale una sola geometria.
import * as THREE from 'three';

const C = new THREE.Color();
const V = new THREE.Vector3();
// sombreado "de fabrica" por cara para que las cajas se lean aunque esten en sombra
const TINT = [.9, .82, 1, .58, .95, .78]; // +x -x +y -y +z -z
const FACES = [
  { n: [1, 0, 0], v: [[1, 0, 1], [1, 0, 0], [1, 1, 0], [1, 1, 1]] },
  { n: [-1, 0, 0], v: [[0, 0, 0], [0, 0, 1], [0, 1, 1], [0, 1, 0]] },
  { n: [0, 1, 0], v: [[0, 1, 1], [1, 1, 1], [1, 1, 0], [0, 1, 0]] },
  { n: [0, -1, 0], v: [[0, 0, 0], [1, 0, 0], [1, 0, 1], [0, 0, 1]] },
  { n: [0, 0, 1], v: [[0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1]] },
  { n: [0, 0, -1], v: [[1, 0, 0], [0, 0, 0], [0, 1, 0], [1, 1, 0]] }
];

export const MATS = {};
export function mat(kind) {
  if (MATS[kind]) return MATS[kind];
  let m;
  if (kind === 'lit') m = new THREE.MeshLambertMaterial({ vertexColors: true });
  else if (kind === 'glow') m = new THREE.MeshBasicMaterial({ vertexColors: true, fog: false });
  else if (kind === 'glowfog') m = new THREE.MeshBasicMaterial({ vertexColors: true });
  else if (kind === 'glass') m = new THREE.MeshLambertMaterial({ vertexColors: true, transparent: true, opacity: .42, depthWrite: false });
  else if (kind === 'ghost') m = new THREE.MeshLambertMaterial({ vertexColors: true, transparent: true, opacity: .32, depthWrite: false });
  else if (kind === 'add') m = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: .6, blending: THREE.AdditiveBlending, depthWrite: false, fog: false });
  else m = new THREE.MeshLambertMaterial({ vertexColors: true });
  MATS[kind] = m; return m;
}

export class Vox {
  constructor() { this.p = []; this.n = []; this.c = []; this.i = []; this.nv = 0; this.m = null; this.flat = false; }
  // transformacion para las siguientes cajas (mover, girar en Y, escalar)
  at(x = 0, y = 0, z = 0, ry = 0, s = 1) {
    if (!x && !y && !z && !ry && s === 1) { this.m = null; return this; }
    this.m = new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), ry), new THREE.Vector3(s, s, s));
    this.rm = new THREE.Matrix3().setFromMatrix4(this.m); return this;
  }
  mtx(m4) { this.m = m4; this.rm = m4 ? new THREE.Matrix3().getNormalMatrix(m4) : null; return this; }
  // caja por esquinas
  bx(x0, y0, z0, x1, y1, z1, col, o) {
    if (x1 < x0) { const t = x0; x0 = x1; x1 = t; } if (y1 < y0) { const t = y0; y0 = y1; y1 = t; } if (z1 < z0) { const t = z0; z0 = z1; z1 = t; }
    const sx = x1 - x0, sy = y1 - y0, sz = z1 - z0, skip = o && o.skip, tint = !(this.flat || (o && o.flat));
    for (let f = 0; f < 6; f++) {
      if (skip && skip.indexOf('XxYyZz'[f]) >= 0) continue; // caras que no se ven: X x Y y Z z
      const F = FACES[f]; let hex = col;
      if (o) { if (f === 2 && o.top !== undefined) hex = o.top; else if (f === 3 && o.bot !== undefined) hex = o.bot; else if (f === 4 && o.front !== undefined) hex = o.front; else if (f === 5 && o.back !== undefined) hex = o.back; else if (f < 2 && o.side !== undefined) hex = o.side; }
      if (this.cmap) hex = this.cmap(hex);
      C.setHex(hex); const k = tint ? TINT[f] : 1, r = C.r * k, g = C.g * k, b = C.b * k;
      let nx = F.n[0], ny = F.n[1], nz = F.n[2];
      if (this.m) { V.set(nx, ny, nz).applyMatrix3(this.rm).normalize(); nx = V.x; ny = V.y; nz = V.z; }
      for (let q = 0; q < 4; q++) {
        const v = F.v[q]; let px = x0 + v[0] * sx, py = y0 + v[1] * sy, pz = z0 + v[2] * sz;
        if (this.m) { V.set(px, py, pz).applyMatrix4(this.m); px = V.x; py = V.y; pz = V.z; }
        this.p.push(px, py, pz); this.n.push(nx, ny, nz); this.c.push(r, g, b);
      }
      const a = this.nv; this.i.push(a, a + 1, a + 2, a, a + 2, a + 3); this.nv += 4;
    }
    return this;
  }
  // caja centrada en x/z, con la base en y0
  box(cx, y0, cz, w, h, d, col, o) { return this.bx(cx - w / 2, y0, cz - d / 2, cx + w / 2, y0 + h, cz + d / 2, col, o); }
  // caja centrada en los tres ejes
  cube(cx, cy, cz, w, h, d, col, o) { return this.bx(cx - w / 2, cy - h / 2, cz - d / 2, cx + w / 2, cy + h / 2, cz + d / 2, col, o); }
  // cilindro aproximado con cajas (para ruedas, columnas, chimeneas): eje Y
  cyl(cx, y0, cz, r, h, col, o) {
    const n = (o && o.seg) || 3;
    for (let k = 0; k < n; k++) { const a = (k + .5) / n * Math.PI / 2, w = Math.cos(a) * r * 2, d = Math.sin(a) * r * 2; this.box(cx, y0, cz, w, h, d, col, o); }
    return this;
  }
  // tejado a dos aguas hecho de escalones
  gable(cx, y0, cz, w, d, h, col, steps = 4, axis = 'x') {
    for (let k = 0; k < steps; k++) { const t = k / steps, hh = h / steps; if (axis === 'x') this.box(cx, y0 + k * hh, cz, w, hh, d * (1 - t), col); else this.box(cx, y0 + k * hh, cz, w * (1 - t), hh, d, col); }
    return this;
  }
  // extruye un sprite: filas de colores (numero o null), 1 pixel = px unidades; (x,y) = esquina inferior izquierda
  sprite(rows, x, y, z, px, depth, o) {
    const H = rows.length, mir = o && o.mirror;
    for (let r = 0; r < H; r++) {
      const row = rows[r]; let c0 = 0;
      while (c0 < row.length) {
        const col = row[c0]; if (col === null || col === undefined) { c0++; continue; }
        let c1 = c0 + 1; while (c1 < row.length && row[c1] === col) c1++;
        const xa = mir ? x + (row.length - c1) * px : x + c0 * px, xb = xa + (c1 - c0) * px, ya = y + (H - 1 - r) * px;
        this.bx(xa, ya, z - depth / 2, xb, ya + px, z + depth / 2, col, o);
        c0 = c1;
      }
    }
    return this;
  }
  get empty() { return this.nv === 0; }
  geometry() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.n, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.c, 3));
    g.setIndex(this.nv > 65535 ? new THREE.Uint32BufferAttribute(this.i, 1) : new THREE.Uint16BufferAttribute(this.i, 1));
    g.computeBoundingSphere(); g.computeBoundingBox();
    return g;
  }
  mesh(kind = 'lit', shadow = 3) { // shadow: 1 proyecta, 2 recibe, 3 ambas
    const m = new THREE.Mesh(this.geometry(), typeof kind === 'string' ? mat(kind) : kind);
    m.castShadow = !!(shadow & 1); m.receiveShadow = !!(shadow & 2);
    return m;
  }
}

// atajo: construir una malla con una funcion
export function vox(fn, kind, shadow) { const b = new Vox(); fn(b); return b.mesh(kind, shadow); }

// ---------------------------------------------------------------
// Letras voxel 5x7 (rotulos de neon, matriculas, carteles)
// ---------------------------------------------------------------
const FONT = {
  A: '01110 10001 10001 11111 10001 10001 10001', B: '11110 10001 10001 11110 10001 10001 11110', C: '01111 10000 10000 10000 10000 10000 01111',
  D: '11110 10001 10001 10001 10001 10001 11110', E: '11111 10000 10000 11110 10000 10000 11111', F: '11111 10000 10000 11110 10000 10000 10000',
  G: '01111 10000 10000 10011 10001 10001 01111', H: '10001 10001 10001 11111 10001 10001 10001', I: '111 010 010 010 010 010 111',
  J: '00111 00010 00010 00010 00010 10010 01100', K: '10001 10010 10100 11000 10100 10010 10001', L: '10000 10000 10000 10000 10000 10000 11111',
  M: '10001 11011 10101 10101 10001 10001 10001', N: '10001 11001 10101 10011 10001 10001 10001', O: '01110 10001 10001 10001 10001 10001 01110',
  P: '11110 10001 10001 11110 10000 10000 10000', Q: '01110 10001 10001 10001 10101 10010 01101', R: '11110 10001 10001 11110 10100 10010 10001',
  S: '01111 10000 10000 01110 00001 00001 11110', T: '11111 00100 00100 00100 00100 00100 00100', U: '10001 10001 10001 10001 10001 10001 01110',
  V: '10001 10001 10001 10001 10001 01010 00100', W: '10001 10001 10001 10101 10101 11011 10001', X: '10001 10001 01010 00100 01010 10001 10001',
  Y: '10001 10001 01010 00100 00100 00100 00100', Z: '11111 00001 00010 00100 01000 10000 11111',
  0: '01110 10001 10011 10101 11001 10001 01110', 1: '010 110 010 010 010 010 111', 2: '01110 10001 00001 00110 01000 10000 11111',
  3: '11110 00001 00001 01110 00001 00001 11110', 4: '00010 00110 01010 10010 11111 00010 00010', 5: '11111 10000 11110 00001 00001 10001 01110',
  6: '01110 10000 10000 11110 10001 10001 01110', 7: '11111 00001 00010 00100 01000 01000 01000', 8: '01110 10001 10001 01110 10001 10001 01110',
  9: '01110 10001 10001 01111 00001 00001 01110', '?': '01110 10001 00001 00110 00100 00000 00100', '!': '1 1 1 1 1 0 1', '.': '0 0 0 0 0 0 1',
  '-': '000 000 000 111 000 000 000', '+': '000 000 010 111 010 000 000', '€': '00111 01000 11110 01000 11110 01000 00111', ' ': '00 00 00 00 00 00 00',
  'Ñ': '01110 00000 10001 11001 10101 10011 10001', ':': '0 0 1 0 1 0 0', '/': '001 001 010 010 010 100 100', '%': '11001 11010 00010 00100 01000 01011 10011',
  '♥': '01010 11111 11111 11111 01110 00100 00000', '★': '00100 00100 11111 01110 01110 10001 00000'
};
export function textWidth(str) { let w = 0; for (const ch of String(str).toUpperCase()) { const g = FONT[ch] || FONT['?']; w += g.split(' ')[0].length + 1; } return Math.max(0, w - 1); }
// escribe texto con cajas: (x,y) esquina inferior izquierda, px tamaño del pixel; devuelve el ancho
export function voxText(b, str, x, y, z, px, depth, col, o) {
  let cx = x; const center = o && o.center; if (center) cx = x - textWidth(str) * px / 2;
  for (const ch of String(str).toUpperCase()) {
    const rows = (FONT[ch] || FONT['?']).split(' '), w = rows[0].length;
    for (let r = 0; r < 7; r++) { let c0 = 0; const row = rows[r];
      while (c0 < w) { if (row[c0] !== '1') { c0++; continue; } let c1 = c0 + 1; while (c1 < w && row[c1] === '1') c1++;
        b.bx(cx + c0 * px, y + (6 - r) * px, z - depth / 2, cx + c1 * px, y + (7 - r) * px, z + depth / 2, col, o); c0 = c1; } }
    cx += (w + 1) * px;
  }
  return cx - x;
}
