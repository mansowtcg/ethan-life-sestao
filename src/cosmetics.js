// Los 35 cosmeticos en 3D. Gorros, gafas, bufandas... van modelados a mano con cajas;
// lo que se lleva en la mano sale de extruir el icono pixel art (sprites/ico-*.png), al estilo Minecraft.
import * as THREE from 'three';
import { Vox, mat } from './vox.js';
import { PAL } from './util.js';
import { ICONDATA } from './icons.gen.js';

const P = PAL;
const GEO = new Map();
function geo(key, fn) { let g = GEO.get(key); if (!g) { const b = new Vox(); fn(b); g = b.geometry(); GEO.set(key, g); } return g; }
function M(key, fn, kind) { const m = new THREE.Mesh(geo(key, fn), mat(kind || 'lit')); m.castShadow = true; return m; }

export const HAND = ['jamon', 'cepillo', 'tresds', 'llaveoro', 'kebabali', 'movil', 'destor', 'desatascador', 'calcetin', 'kalimotxo', 'pintxo', 'llavec4', 'bocata'];
// como se agarra cada cosa: punto de agarre (fraccion del sprite) y giro
const GRIP = {
  cepillo: { gx: .08, gy: .3, rz: Math.PI / 2 }, llaveoro: { gx: .1, gy: .1 }, kebabali: { gx: .82, gy: .1 }, destor: { gx: .5, gy: .92, rz: Math.PI },
  calcetin: { gx: .3, gy: .95 }, kalimotxo: { gx: .5, gy: .35 }, llavec4: { gx: .3, gy: .75 }, bocata: { gx: .15, gy: .35 }, tresds: { gx: .5, gy: .2 }, movil: { gx: .5, gy: .2 }
};

// ---------- iconos pixel art -> filas de colores ----------
// Los iconos van incrustados en icons.gen.js (npm run icons); si aparece uno nuevo que no este ahi, se lee el PNG al vuelo.
const ICONS = new Map(), ABC = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';
function embedded(key) {
  const d = ICONDATA[key]; if (!d) return null; const pal = [];
  for (let i = 0; i < d[0].length; i += 6) pal.push(parseInt(d[0].substr(i, 6), 16));
  return d[1].split('/').map(r => Array.from(r, ch => ch === '.' ? null : pal[ABC.indexOf(ch)]));
}
export function loadIcon(id, base) {
  const key = (base || 'ico-') + id;
  if (ICONS.has(key)) return ICONS.get(key);
  const emb = embedded(key);
  const pr = emb ? Promise.resolve(emb) : new Promise(res => {
    const img = new Image();
    img.onload = () => {
      try {
        const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
        const x = c.getContext('2d', { willReadFrequently: true }); x.drawImage(img, 0, 0);
        const d = x.getImageData(0, 0, c.width, c.height).data; let x0 = 1e9, y0 = 1e9, x1 = -1, y1 = -1;
        for (let yy = 0; yy < c.height; yy++) for (let xx = 0; xx < c.width; xx++) if (d[(yy * c.width + xx) * 4 + 3] > 127) { x0 = Math.min(x0, xx); x1 = Math.max(x1, xx); y0 = Math.min(y0, yy); y1 = Math.max(y1, yy); }
        if (x1 < 0) { res(null); return; }
        const rows = [];
        for (let yy = y0; yy <= y1; yy++) { const r = []; for (let xx = x0; xx <= x1; xx++) { const o = (yy * c.width + xx) * 4; r.push(d[o + 3] > 127 ? (d[o] << 16 | d[o + 1] << 8 | d[o + 2]) : null); } rows.push(r); }
        res(rows);
      } catch (e) { res(null); }
    };
    img.onerror = () => res(null);
    img.src = 'sprites/' + key + '.png';
  });
  ICONS.set(key, pr); return pr;
}
// malla de un icono extruido, centrada; px = tamaño del pixel
export function iconMesh(rows, px, depth, kind) {
  const b = new Vox(), w = rows[0].length, h = rows.length;
  b.sprite(rows, -w * px / 2, -h * px / 2, 0, px, depth);
  const m = b.mesh(kind || 'lit', 1); m.userData.w = w * px; m.userData.h = h * px; return m;
}
function heldMesh(id, rows) {
  const g = GRIP[id] || { gx: .5, gy: .12 }, w = rows[0].length, h = rows.length, b = new Vox();
  b.sprite(rows, -g.gx * w, -g.gy * h, 0, 1, 2);
  const m = b.mesh('lit', 1), grp = new THREE.Group(); m.rotation.z = g.rz || 0; grp.add(m); grp.position.set(0, 0, 1.7); return grp;
}

// ---------- piezas modeladas ----------
function cap(b, c, c2, visor, under) {
  b.bx(-12.6, 24.6, -10.6, 12.6, 30.6, 10.6, c); b.bx(-11.2, 30.6, -9.4, 11.2, 32.6, 9.4, c); b.bx(-8, 32.6, -6.6, 8, 33.8, 6.6, c);
  b.bx(-.9, 33.8, -.9, .9, 34.5, .9, c2);
  b.bx(-9.5, 24.6, 10.6, 9.5, 25.8, 17.5, visor, { bot: under }); b.bx(-7.5, 24.6, 17.5, 7.5, 25.8, 19.2, visor, { bot: under });
}
const BUILD = {
  gorrathletic: e => { e.aHat.add(M('gorrathletic', b => { cap(b, P.R, P.E, P.R, P.r); b.bx(-12.72, 27.4, -10.72, 12.72, 28.6, 10.72, P.E); b.bx(-1.6, 29.2, 10.6, 1.6, 31.6, 10.9, P.E); b.bx(-.6, 29.9, 10.9, .6, 30.9, 11, P.R); })); e.setHat(true); },
  gorrapropa: e => { e.aHat.add(M('gorrapropa', b => { cap(b, P.E, P.e, P.E, P.K); b.bx(-4.4, 28, 10.6, -2.4, 29.8, 10.86, P.Z); b.bx(-1, 28, 10.6, 1, 29.8, 10.86, P.R); b.bx(2.4, 28, 10.6, 4.4, 29.8, 10.86, P.Z); b.bx(-12.66, 24.6, -10.66, 12.66, 25.3, 10.66, P.e); })); e.setHat(true); },
  gorrolana: e => { e.aHat.add(M('gorrolana', b => {
    b.bx(-12.6, 27, -10.6, 12.6, 31, 10.6, P.L); b.bx(-11, 31, -9.2, 11, 33.4, 9.2, P.L); b.bx(-8, 33.4, -6.4, 8, 35, 6.4, P.L);
    for (let x = -10; x <= 10; x += 4) { b.bx(x - .5, 27, 10.6, x + .5, 31, 10.78, P.e); b.bx(x - .5, 27, -10.78, x + .5, 31, -10.6, P.e); }
    b.bx(-13.2, 23.4, -11.2, 13.2, 27, 11.2, P.e); b.bx(-13.26, 23.4, -11.26, 13.26, 24, 11.26, P.L); b.bx(-2, 35, -2, 2, 38.4, 2, P.E);
  })); e.setHat(true); },
  cowboy: e => { e.aHat.add(M('cowboy', b => {
    b.bx(-20, 25, -17, 20, 26.2, 17, P.O, { bot: P.o }); b.bx(-21.6, 26.2, -9, -18.6, 27.8, 9, P.O); b.bx(18.6, 26.2, -9, 21.6, 27.8, 9, P.O);
    b.bx(-10, 26.2, -9, 10, 32.6, 9, P.O); b.bx(-10.12, 26.2, -9.12, 10.12, 27.9, 9.12, P.o); b.bx(-9, 32.6, -8, -2.2, 34, 8, P.O); b.bx(2.2, 32.6, -8, 9, 34, 8, P.O);
  })); e.setHat(true); },
  casco: e => { e.aHat.add(M('casco', b => {
    b.bx(-13.2, 24.4, -11.2, 13.2, 31, 11.2, P.Y); b.bx(-11.8, 31, -9.8, 11.8, 33.4, 9.8, P.Y); b.bx(-8.4, 33.4, -7, 8.4, 34.8, 7, P.Y);
    b.bx(-13.3, 24.4, -11.3, 13.3, 25.4, 11.3, P.y); b.bx(-2, 34.8, -6.5, 2, 35.4, 6.5, P.E);
    [-6, 0, 6].forEach(x => b.bx(x - .9, 28.6, 11.2, x + .9, 30.2, 11.4, P.B));
    b.bx(-11.7, 4, 2, -11.1, 24.4, 3.8, P.B); b.bx(11.1, 4, 2, 11.7, 24.4, 3.8, P.B); b.bx(-9.2, .4, 1.4, 9.2, 1.5, 4.4, P.B);
  })); e.setHat(true); },
  txapela: e => { const m = M('txapela', b => { b.bx(-15, 27, -13, 15, 29.4, 14.6, P.B); b.bx(-13, 29.4, -11.5, 13, 31, 12.6, P.B); b.bx(-.7, 31, -.2, .7, 33, 1.2, P.B); b.bx(-10, 31, 2, -3, 31.2, 8, P.D); }); m.rotation.z = .1; m.position.set(2.6, -1.4, 0); e.aHat.add(m); e.setHat(true); },
  auriculares: e => { e.aHat.add(M('auriculares', b => {
    b.bx(-13.6, 30.2, -1.6, 13.6, 31.8, 1.6, P.D); b.bx(-12, 31.8, -1.6, 12, 32.6, 1.6, P.L);
    b.bx(-14.4, 17, -1.2, -13, 30.2, 1.2, P.D); b.bx(13, 24, -1.2, 14.4, 30.2, 1.2, P.D);
    b.bx(-16, 10.5, -4, -13, 19.5, 4, P.B); b.bx(-16.4, 12, -2.6, -16, 18, 2.6, P.R);
  })); },
  corona: e => { e.aHat.add(M('corona', b => {
    const y0 = 28.6, y1 = 32.4;
    b.bx(-12.4, y0, 10.2, 12.4, y1, 11.4, P.Q); b.bx(-12.4, y0, -11.4, 12.4, y1, -10.2, P.Q); b.bx(-12.4, y0, -10.2, -11.2, y1, 10.2, P.Q); b.bx(11.2, y0, -10.2, 12.4, y1, 10.2, P.Q);
    b.bx(-12.5, y0, -11.5, 12.5, y0 + .8, 11.5, P.q);
    [-11.5, -5.8, 0, 5.8, 11.5].forEach((x, i) => { const h = i === 2 ? 3.6 : 2.6; b.bx(x - .9, y1, 10.2, x + .9, y1 + h, 11.4, P.Q); b.bx(x - .9, y1, -11.4, x + .9, y1 + h - .6, -10.2, P.Q); });
    [-5.4, 0, 5.4].forEach(z => { b.bx(-12.4, y1, z - .9, -11.2, y1 + 2.4, z + .9, P.Q); b.bx(11.2, y1, z - .9, 12.4, y1 + 2.4, z + .9, P.Q); });
    b.bx(-6.6, 30, 11.4, -5, 31.6, 11.7, P.R); b.bx(-.8, 30, 11.4, .8, 31.6, 11.7, P.Z); b.bx(5, 30, 11.4, 6.6, 31.6, 11.7, P.R);
  })); },
  gafas: e => { e.aFace.add(M('gafas', b => {
    b.bx(-9.4, 13.6, 9.5, -2, 18.4, 10.6, P.B); b.bx(2, 13.6, 9.5, 9.4, 18.4, 10.6, P.B); b.bx(-2, 16, 9.6, 2, 17, 10.4, P.K);
    b.bx(-11.6, 16, -3, -11, 17, 10.4, P.K); b.bx(11, 16, -3, 11.6, 17, 10.4, P.K);
    b.bx(-8.4, 16.6, 10.6, -6.4, 17.6, 10.72, P.L); b.bx(-7.4, 17.6, 10.6, -6.4, 18, 10.72, P.L); b.bx(3, 16.6, 10.6, 5, 17.6, 10.72, P.L);
  })); },
  bigote: e => { e.aMouth.add(M('bigote', b => { b.bx(-7, 8, 9.4, 7, 9.2, 11, P.H); b.bx(-6, 7, 9.4, 6, 8, 10.8, P.H); b.bx(-8, 6, 9.4, -7, 8.2, 10.6, P.H); b.bx(7, 6, 9.4, 8, 8.2, 10.6, P.H); b.bx(-4, 8.4, 11, -1, 9.2, 11.12, P.h); })); },
  dientes: e => { e.setTeeth(true); e.aMouth.add(M('dientes', b => { b.bx(9.4, 5.4, 9.5, 10.4, 9.4, 9.9, 0xffffff); b.bx(7.9, 6.9, 9.5, 11.9, 7.9, 9.9, 0xffffff); b.bx(9.4, 6.9, 9.9, 10.4, 7.9, 10.2, P.a); }, 'glow')); },
  bufanda: e => { e.aNeck.add(M('bufanda', b => {
    b.bx(-5.2, 9.4, -4.4, 5.2, 12.4, 4.4, P.R); b.bx(1.6, 2.5, 3.5, 5, 9.6, 4.7, P.R);
    b.bx(1.6, 5.4, 3.5, 5, 6.2, 4.76, P.E); b.bx(1.6, 3.4, 3.5, 5, 4.1, 4.76, P.E); b.bx(1.6, 2.5, 3.5, 5, 2.9, 4.76, P.r);
    b.bx(-3, 10.4, 4.4, -2, 11.4, 4.5, P.E); b.bx(2, 11, 4.4, 3, 12, 4.5, P.E); b.bx(-.5, 9.8, 4.4, .5, 10.8, 4.5, P.E);
  })); },
  cadena: e => { e.aNeck.add(M('cadena', b => {
    for (let i = 0; i < 4; i++) { const c = i % 2 ? P.q : P.Q; b.bx(-4.5 + i, 9.5 - i * 1.1, 3.55, -3.5 + i, 10.5 - i * 1.1, 4.1, c); b.bx(3.5 - i, 9.5 - i * 1.1, 3.55, 4.5 - i, 10.5 - i * 1.1, 4.1, c); }
    b.bx(-.6, 5.1, 3.55, .6, 6.1, 4.1, P.Q); b.bx(-1.2, 2.8, 3.55, 1.2, 5.2, 4.35, P.Q); b.bx(-.5, 3.5, 4.35, .5, 4.5, 4.5, P.q);
  })); },
  carnet: e => { e.aNeck.add(M('carnet', b => {
    for (let i = 0; i < 4; i++) { b.bx(-3.9 + i * .9, 9.5 - i, 3.55, -3.1 + i * .9, 10.5 - i, 3.95, P.R); b.bx(3.1 - i * .9, 9.5 - i, 3.55, 3.9 - i * .9, 10.5 - i, 3.95, P.R); }
    b.bx(-3.2, 1, 3.55, 3.2, 6.4, 4.15, P.E); b.bx(-3.3, .9, 3.5, 3.3, 6.5, 3.9, P.K); b.bx(-3.2, 5.4, 4.15, 3.2, 6.4, 4.26, P.R);
    b.bx(-2.6, 2, 4.15, -.6, 4.8, 4.26, P.S); b.bx(-2.6, 4.1, 4.26, -.6, 4.8, 4.32, P.H);
    b.bx(.1, 4, 4.15, 2.7, 4.5, 4.26, P.K); b.bx(.1, 3, 4.15, 2.1, 3.5, 4.26, P.K); b.bx(.1, 1.6, 4.15, 2.7, 2.4, 4.26, P.R);
  })); },
  cable: e => { e.aWaist.add(M('cable', b => { b.bx(-7.5, 18.6, -4, 7.5, 20.2, 4, P.L); b.bx(-.9, 18.5, 4, .9, 20.3, 4.16, P.E); b.bx(4.6, 13.6, 3.9, 5.5, 18.6, 4.6, P.L); b.bx(4.7, 12.5, 4, 5.4, 13.6, 4.5, P.Q); })); },
  rinonera: e => { e.aWaist.add(M('rinonera', b => { b.bx(-7.4, 18, -3.95, 7.4, 19.6, 3.95, P.B); b.bx(-4.2, 15.6, 3.6, 4.2, 20, 6.6, P.B); b.bx(-3.6, 18.4, 6.6, 3.6, 18.9, 6.74, P.L); b.bx(2.6, 18.1, 6.74, 3.4, 19.2, 6.9, P.R); })); },
  chandaloro: e => e.setBody({ tee: P.Q, tee2: P.q, sleeve: P.Q, shorts: P.q, shorts2: P.Q }, ''),
  mono: e => e.setBody({ tee: P.W, tee2: P.w, sleeve: P.W, collar: P.W, trim: P.W, shorts: P.W, shorts2: P.w, stripe: P.W }, 'mono'),
  chaleco: e => e.setBody({ tee: P.Y, tee2: P.y, collar: P.Y, trim: P.Y }, 'chaleco'),
  elastica: e => e.setBody({ tee: P.R, tee2: P.r, sleeve: P.R }, 'elastica'),
  bmw: e => { e.setShoes(true); const m = M('bmwspark', b => { b.bx(-6.4, 4.2, 3, -5.6, 6.6, 3.4, P.Q); b.bx(-7.2, 5, 3, -4.8, 5.8, 3.4, P.Q); b.bx(5.4, 5.4, 4, 6.2, 7.8, 4.4, P.Q); b.bx(4.6, 6.2, 4, 7, 7, 4.4, P.Q); }, 'glow'); m.castShadow = false; e.aAura.add(m); },
  aura: e => auraOn(e)
};

const AURA_MAT = new THREE.MeshBasicMaterial({ color: 0xa8e85a, side: THREE.BackSide, transparent: true, opacity: .8, depthWrite: false });
const GOLD_MAT = new THREE.MeshLambertMaterial({ vertexColors: true, color: 0xffd34d, emissive: 0x6b4a00 });
function auraOn(e) {
  e.auraShells = [];
  [e.hips, e.torsoM, e.skull, e.hair, e.legLm, e.legRm, e.shoeL, e.shoeR, e.aL.u, e.aL.fm, e.aR.u, e.aR.fm].forEach(m => {
    const g = m.geometry; if (!g.boundingBox) g.computeBoundingBox();
    const bb = g.boundingBox, c = bb.getCenter(new THREE.Vector3()), s = bb.getSize(new THREE.Vector3());
    const inHead = m === e.skull || m === e.hair, t = inHead ? 1.5 : 1;
    const sh = new THREE.Mesh(g, AURA_MAT); sh.scale.set(1 + 2 * t / s.x, 1 + 2 * t / s.y, 1 + 2 * t / s.z);
    sh.position.set(c.x * (1 - sh.scale.x), c.y * (1 - sh.scale.y), c.z * (1 - sh.scale.z)); sh.renderOrder = -1;
    m.add(sh); e.auraShells.push(sh);
  });
}
function auraOff(e) { if (e.auraShells) { e.auraShells.forEach(s => s.parent && s.parent.remove(s)); e.auraShells = null; } }

// Viste a un Ethan con una lista de ids de cosmeticos (uno por hueco).
export function dress(e, ids) {
  ids = (ids || []).filter(Boolean); const sig = ids.slice().sort().join(',');
  if (e.outfitSig === sig) return; e.outfitSig = sig;
  [e.aHat, e.aFace, e.aMouth, e.aNeck, e.aWaist, e.aAura].forEach(g => g.clear());
  auraOff(e); e.setHat(false); e.setBody(null, ''); e.setShoes(false); e.setTeeth(!!e.opts.whiteTeeth); e.setHeld(null);
  let hand = null;
  ids.forEach(id => { if (HAND.indexOf(id) >= 0) hand = id; else if (BUILD[id]) BUILD[id](e); });
  if (hand) loadIcon(hand).then(rows => { if (e.outfitSig !== sig || !rows) return; e.setHeld(heldMesh(hand, rows)); });
}
export function setGold(e, on) {
  on = !!on; if (!!e.gold === on) return; e.gold = on;
  e.root.traverse(o => { if (o.isMesh && o.material !== AURA_MAT) { if (on) { if (o.material !== GOLD_MAT) { o.userData.m0 = o.material; o.material = GOLD_MAT; } } else if (o.userData.m0) { o.material = o.userData.m0; o.userData.m0 = null; } } });
}
