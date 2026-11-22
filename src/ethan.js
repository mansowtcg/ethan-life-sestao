// Ethan en voxel: construido a partir de las medidas del pixel art (make-sprites.js).
// La cabeza va a resolucion de busto (22 px de ancho) y el cuerpo a la del sprite entero.
import * as THREE from 'three';
import { Vox, mat } from './vox.js';
import { PAL, clamp, damp, lerp } from './util.js';
import { faceRuns, N_FACES, HAIR_ALTO, HAIR_NEAT } from './sprites.js';

export const BP = 1.8 / 49;   // unidades de mundo por pixel de cuerpo (Ethan mide 1,80)
const HS = 14 / 22;           // escala de la cabeza (px de busto -> px de cuerpo)

const GEO = new Map();
function geo(key, fn) { let g = GEO.get(key); if (!g) { const b = new Vox(); fn(b); g = b.geometry(); GEO.set(key, g); } return g; }
function mesh(key, fn, kind) { const m = new THREE.Mesh(geo(key, fn), mat(kind || 'lit')); m.castShadow = true; m.receiveShadow = false; return m; }
// caja en coordenadas del busto (px inclusivos) -> cabeza 3D
function B(b, x0, x1, y0, y1, z0, z1, col, o) { return b.bx(x0 - 24, 32 - y1, z0, x1 + 1 - 24, 33 - y0, z1, col, o); }

export const LOOK = { // colores base y variantes de personaje
  ethan: { skin: PAL.S, skin2: PAL.C, hair: PAL.H, hair2: PAL.h, tee: PAL.Z, tee2: PAL.z, collar: PAL.E, trim: PAL.E, sleeve: PAL.Z, shorts: PAL.N, shorts2: PAL.n, stripe: PAL.E, shoe: PAL.E, sole: PAL.K }
};
export function look(over) { return Object.assign({}, LOOK.ethan, over || {}); }

function skullGeo(L) {
  return geo('skull' + L.skin, b => {
    const S = L.skin;
    B(b, 13, 34, 10, 25, -9, 9, S); B(b, 15, 32, 9, 9, -8, 8.6, S); B(b, 16, 31, 8, 8, -7, 8, S);
    B(b, 15, 32, 26, 28, -8, 9, S); B(b, 16, 31, 29, 30, -7, 9, S); B(b, 18, 29, 31, 31, -5, 8.6, S); B(b, 20, 27, 32, 32, -3, 8, S);
    B(b, 11, 12, 17, 20, -2, 2, S); B(b, 35, 36, 17, 20, -2, 2, S);       // orejas
    b.bx(-1, 10, 9, 1, 15.4, 11, L.skin2); b.bx(-1.5, 10, 9, 1.5, 11.4, 10.3, L.skin2); // nariz
  });
}
function hairGeo(L, style) {
  const H = L.hair, h = L.hair2;
  return geo('hair' + H + style, b => {
    if (style === 'bald') { b.bx(-12, 22, -10, 12, 25.4, -6, H); b.bx(-12.6, 16, -10, -10.9, 23, 3, H); b.bx(10.9, 16, -10, 12.6, 23, 3, H); return; }
    b.bx(-12, 24.2, -10, 12, 30, 10, H);                                   // casquete
    B(b, 13, 34, 9, 10, 8.8, 10.3, H);                                      // flequillo
    [16, 22, 28, 33].forEach(x => B(b, x, x, 11, 11, 8.8, 10.3, H));
    b.bx(-13, 19, -10, -10.9, 24.2, 5.5, H); b.bx(10.9, 19, -10, 13, 24.2, 5.5, H);
    b.bx(-13, 18, -4, -11.9, 19, 2, H); b.bx(11.9, 18, -4, 13, 19, 2, H);
    b.bx(-12, 11, -10.7, 12, 24.2, -8.6, H);                                // nuca
    b.bx(-12.6, 15, -10.2, -10.9, 24.2, -2, H); b.bx(10.9, 15, -10.2, 12.6, 24.2, -2, H);
    b.bx(-9, 29, 10, -4, 30, 10.2, h); b.bx(1, 28, 10, 5, 29, 10.2, h); b.bx(-12.2, 26, 2, -12, 27, 4, h); b.bx(12, 27, -3, 12.2, 28, -1, h);
    if (style === 'long') { b.bx(-12.4, -6, -11.2, 12.4, 24, -8.4, H); b.bx(-13.2, 2, -10.5, -10.9, 20, -1, H); b.bx(10.9, 2, -10.5, 13.2, 20, -1, H); b.bx(-11, 30, -9, 11, 31.2, 9, H); }
    if (style === 'short') { b.bx(-11, 30, -9, 11, 30.8, 9, H); }
  });
}
function curlsGeo(L) {
  const H = L.hair, h = L.hair2;
  return geo('curls' + H, b => { // rizos sobre el casquete (base en y=0)
    b.bx(-10, 0, -6, -4, 1, 7, H); b.bx(-1, 0, -8, 6, 1, 5, H); b.bx(-11, 0, -2, -10, 1, 4, H); b.bx(10, 0, -5, 11, 1, 3, H);
    b.bx(-3, 0, -1, -2, 2, 3, H); b.bx(3, 0, -4, 4, 2, 1, H); b.bx(-7, 0, -9, -2, 1.5, -5, H); b.bx(4, 0, 2, 9, 1, 8, H);
    b.bx(-9, 1, 2, -5, 1.25, 6, h); b.bx(0, 1, -3, 3, 1.25, 1, h);
  });
}
function faceGeo(mood, L, white, noStache) {
  return geo('face' + mood + (white ? 'w' : '') + (noStache ? 'n' : ''), b => {
    faceRuns(mood, { whiteTeeth: white, noStache: noStache }).forEach(r => { const zz = (r.k === 'E' || r.k === 'P' || r.k === 'e') ? 9.3 : 9.45; b.bx(r.x0 - 24, 32 - r.y, 8.9, r.x1 - 24, 33 - r.y, zz, r.col); });
  });
}
function torsoGeo(L, extra) {
  return geo('torso' + [L.tee, L.tee2, L.collar, L.trim, extra || ''].join(), b => {
    b.bx(-8, 0, -3.5, 8, 10, 3.5, L.tee);
    b.bx(-4, 9.3, -3.7, 4, 10.15, 3.7, L.collar);
    b.bx(-2.2, 10, -2, 2.2, 11.6, 2, L.skin);                               // cuello
    b.bx(-6.9, 0, 3.5, -6.1, 6.4, 3.62, L.trim); b.bx(6.1, 0, 3.5, 6.9, 6.4, 3.62, L.trim);
    b.bx(-8.04, 0, -3.54, 8.04, .8, 3.54, L.tee2);
    if (extra === 'mono') { b.bx(-5.5, 5, 3.5, -2, 7.4, 3.75, PAL.w); b.bx(-4.4, 7.4, 3.5, -3.8, 8.6, 3.72, PAL.L); b.bx(-.5, 6.4, 3.5, .5, 7.2, 3.75, PAL.Q); b.bx(-.5, 2.6, 3.5, .5, 3.4, 3.75, PAL.Q); }
    if (extra === 'chaleco') { b.bx(-8.1, 5.6, -3.6, 8.1, 6.8, 3.6, PAL.L); b.bx(-8.1, 2.2, -3.6, 8.1, 3.4, 3.6, PAL.L); b.bx(-.35, 0, 3.5, .35, 9.3, 3.7, PAL.y); }
    if (extra === 'elastica') { for (let x = -6.5; x <= 6.5; x += 3.25) { b.bx(x - .8, .8, -3.58, x + .8, 9.3, 3.58, PAL.E); } }
  });
}
function hipsGeo(L) {
  return geo('hips' + [L.shorts, L.shorts2, L.stripe].join(), b => {
    b.bx(-7, 13, -3.6, 7, 20, 3.6, L.shorts); b.bx(-7.05, 19.2, -3.65, 7.05, 20, 3.65, L.shorts2);
    b.bx(-7.1, 13, -1, -7, 19.2, 1, L.stripe); b.bx(7, 13, -1, 7.1, 19.2, 1, L.stripe);
    b.bx(-.3, 13, 3.6, .3, 17, 3.7, PAL.K);
  });
}
function legGeo(L) { return geo('leg' + L.skin, b => { b.bx(-1, -11, -1, 1, .5, 1, L.skin); b.bx(-1.03, -6.2, -1.03, 1.03, -5.2, 1.03, L.skin2); }); }
function shoeGeo(L, side, pristine) {
  return geo('shoe' + [L.shoe, L.sole, side, pristine ? 1 : 0].join(), b => {
    const o = side;
    b.bx(-2, -14, -2.6, 2, -11, 5.4, L.shoe); b.bx(-2.06, -14, -2.66, 2.06, -13.3, 5.46, pristine ? PAL.D : L.sole);
    b.bx(o * 2, -12.7, 1.4, o * 2.12, -11.8, 2.4, PAL.Z); b.bx(o * 2, -12.7, .2, o * 2.12, -11.8, 1.2, PAL.R);
    b.bx(-o * 2, -12.7, 1.4, -o * 2.12, -11.8, 2.4, PAL.Z); b.bx(-o * 2, -12.7, .2, -o * 2.12, -11.8, 1.2, PAL.R);
    if (pristine) { b.bx(o * 2, -12.7, 2.6, o * 2.12, -11.8, 3.6, PAL.Z); b.bx(-1.2, -11, .5, 1.2, -10.7, 3.5, PAL.e); }
    else { b.bx(-.95, -12.4, 5.4, .95, -11, 5.52, PAL.K); b.bx(-.6, -12.25, 5.3, .6, -11.3, 6.3, L.skin); b.bx(-1.4, -11.02, -1, 1.4, -10.9, 1, PAL.e); }
  });
}
function upperArmGeo(L) { return geo('uarm' + [L.sleeve, L.trim, L.skin].join(), b => { b.bx(-1.6, -4, -1.6, 1.6, 1.2, 1.6, L.sleeve); b.bx(-1.7, -4.6, -1.7, 1.7, -4, 1.7, L.trim); b.bx(-1, -7, -1, 1, -4.6, 1, L.skin); }); }
function foreArmGeo(L) { return geo('farm' + L.skin, b => { b.bx(-1, -6, -1, 1, 0, 1, L.skin); b.bx(-1.25, -7.8, -1.25, 1.25, -6, 1.25, L.skin2); }); }
function hoodGeo() { return geo('hood', b => { b.bx(-6.2, 9.2, -4.6, 6.2, 11.9, 4.6, PAL.E, { bot: PAL.e }); b.bx(-4.8, 11.9, -4.8, 4.8, 12.6, -1.5, PAL.e); }); }
function wrenchGeo() {
  return geo('wrench', b => { // llave inglesa: mango + boca
    b.bx(-.6, -2, -.5, .6, 8, .5, PAL.L); b.bx(-1.6, 8, -.6, 1.6, 11, .6, PAL.L); b.bx(-.7, 9.4, -.7, .7, 11.1, .7, PAL.D);
    b.bx(-1.6, 11, -.6, -.7, 12, .6, PAL.L); b.bx(.7, 11, -.6, 1.6, 12, .6, PAL.L); b.bx(-.8, -2.6, -.6, .8, -2, .6, PAL.D);
  });
}

const Q1 = new THREE.Quaternion(), Q2 = new THREE.Quaternion(), EU = new THREE.Euler();
const ZERO = { by: 0, brx: 0, brz: 0, bry: 0, trx: 0, trz: 0, try: 0, hrx: 0, hry: 0, hrz: 0, alx: 0, alz: .06, ale: .05, arx: 0, arz: .06, are: .05, llx: 0, llz: 0, lrx: 0, lrz: 0, itx: 0 };
const KEYS = Object.keys(ZERO);

// poses por animacion: devuelven angulos objetivo en funcion del tiempo
const ANIMS = {
  idle(p, t) { const s = Math.sin(t * 1.9); p.by = s * .12; p.hrx = s * .02; p.alz = .08 + s * .015; p.arz = .08 - s * .015; p.alx = s * .03; p.arx = -s * .03; },
  show(p, t) { const s = Math.sin(t * 1.9); p.by = s * .12; p.arx = .35; p.are = 1.3; p.arz = .12; p.alz = .1; p.hrx = s * .02; },
  work(p, t, e) { const s = Math.sin(t * 3); p.by = s * .1; p.trx = .12; p.arx = 1.0; p.are = .95; p.arz = .05; p.alx = .55; p.ale = .7; p.alz = .15; p.llx = .18; p.lrx = -.14; p.hrx = .08; p.itx = -.2; },
  tired(p, t) { const s = Math.sin(t * 2.6); p.by = -.6 + s * .25; p.trx = .42 + s * .04; p.hrx = .35; p.alx = .1; p.arx = .1; p.alz = .16; p.arz = .16; p.llx = .08; p.lrx = .08; },
  sleep(p, t) { const s = Math.sin(t * 1.3); p.by = s * .15; p.alz = .25; p.arz = .25; p.hry = .25; p.llz = .08; p.lrz = .08; },
  walk(p, t, e) { const w = t * (e.walkRate || 7.5), s = Math.sin(w); p.by = Math.abs(Math.cos(w)) * .5; p.llx = s * .62; p.lrx = -s * .62; p.alx = -s * .5; p.arx = s * .5; p.ale = .25; p.are = .25; p.trx = .06; p.try = s * .06; },
  cheer(p, t) { const s = Math.sin(t * 9); p.by = Math.abs(Math.sin(t * 7)) * 3; p.alx = 2.75; p.arx = 2.75; p.alz = .35 + s * .12; p.arz = .35 - s * .12; p.hrx = -.15; p.itx = -.6; },
  flail(p, t) { const s = Math.sin(t * 17), c = Math.cos(t * 17); p.alx = 2.7 + s * .25; p.arx = 2.7 - s * .25; p.alz = .45 + c * .25; p.arz = .45 - c * .25; p.llx = s * .7; p.lrx = -s * .7; p.ale = .3; p.are = .3; p.hry = s * .12; p.by = c * .3; },
  hurt(p, t) { p.alx = .3; p.arx = .3; p.alz = 1.35; p.arz = 1.35; p.trx = -.28; p.hrx = -.2; p.llz = .1; p.lrz = .1; },
  ko(p, t) { p.alz = .75; p.arz = .75; p.llz = .42; p.lrz = .42; p.trx = -.08; p.hrz = .2; },
  dance(p, t, e) { const w = t * (e.beat || 10.47), s = Math.sin(w), c = Math.cos(w / 2); p.by = Math.abs(s) * 1.6; p.brz = c * .1; p.try = c * .25; p.alx = 1.6 + s * 1.1; p.arx = 1.6 - s * 1.1; p.ale = .9; p.are = .9; p.alz = .3; p.arz = .3; p.hrx = s * .12; p.llx = s * .2; p.lrx = -s * .2; },
  sit(p, t) { const s = Math.sin(t * 1.9); p.llx = 1.5; p.lrx = 1.5; p.alx = .5; p.arx = .5; p.ale = .6; p.are = .6; p.hrx = s * .02; },
  type(p, t) { const s = Math.sin(t * 14); p.alx = .9 + s * .08; p.arx = .9 - s * .08; p.ale = .9; p.are = .9; p.trx = .1; p.hrx = .15; },
  wave(p, t) { const s = Math.sin(t * 9); p.by = Math.sin(t * 1.9) * .12; p.arx = 2.9; p.arz = .5 + s * .3; p.are = .2; p.alz = .08; },
  lean(p, t) { p.trx = .1; p.alx = .9; p.ale = 1.2; p.arx = .2; p.arz = .1; p.llz = .05; }
};

export class Ethan {
  constructor(opts) {
    const o = opts || {}; this.L = look(o.look); this.opts = o;
    this.root = new THREE.Group(); this.root.scale.setScalar(BP * (o.scale || 1));
    this.body = new THREE.Group(); this.root.add(this.body);
    this.build();
    this.mood = -1; this.setMood(o.mood === undefined ? 3 : o.mood);
    this.anim = 'idle'; this.t = Math.random() * 10; this.cur = Object.assign({}, ZERO); this.tgt = Object.assign({}, ZERO);
    this.env = {}; this.hitT = -1; this.hitDur = .2; this.jumpT = -1; this.rate = 16;
    this.itemTilt = 0; this.slots = {}; this.gold = false;
    this.apply(0);
  }
  build() {
    const L = this.L, o = this.opts;
    // caderas y piernas
    this.hips = new THREE.Mesh(hipsGeo(L), mat('lit')); this.hips.castShadow = true; this.body.add(this.hips);
    this.legL = new THREE.Group(); this.legL.position.set(-3, 14, 0); this.legR = new THREE.Group(); this.legR.position.set(3, 14, 0);
    this.legLm = new THREE.Mesh(legGeo(L), mat('lit')); this.legRm = new THREE.Mesh(legGeo(L), mat('lit'));
    this.shoeL = new THREE.Mesh(shoeGeo(L, -1, false), mat('lit')); this.shoeR = new THREE.Mesh(shoeGeo(L, 1, false), mat('lit'));
    this.shoeL.rotation.y = -.2; this.shoeR.rotation.y = .2;
    [this.legLm, this.legRm, this.shoeL, this.shoeR].forEach(m => { m.castShadow = true; });
    this.legL.add(this.legLm, this.shoeL); this.legR.add(this.legRm, this.shoeR); this.body.add(this.legL, this.legR);
    // torso
    this.torso = new THREE.Group(); this.torso.position.set(0, 20, 0); this.body.add(this.torso);
    this.torsoM = new THREE.Mesh(torsoGeo(L, ''), mat('lit')); this.torsoM.castShadow = true; this.torso.add(this.torsoM);
    // brazos
    const arm = side => {
      const g = new THREE.Group(); g.position.set(side * 9.5, 9, 0);
      const u = new THREE.Mesh(upperArmGeo(L), mat('lit')); u.castShadow = true; g.add(u);
      const f = new THREE.Group(); f.position.set(0, -7, 0); const fm = new THREE.Mesh(foreArmGeo(L), mat('lit')); fm.castShadow = true; f.add(fm); g.add(f);
      const h = new THREE.Group(); h.position.set(0, -6.8, 0); f.add(h);
      this.torso.add(g); return { g, u, f, fm, h };
    };
    this.aL = arm(-1); this.aR = arm(1);
    this.item = new THREE.Group(); this.aR.h.add(this.item);       // lo que lleva en la mano derecha
    // cabeza
    this.head = new THREE.Group(); this.head.position.set(0, 11.2, 0); this.head.scale.setScalar(HS * (o.headScale || 1)); this.torso.add(this.head);
    this.skull = new THREE.Mesh(skullGeo(L), mat('lit')); this.skull.castShadow = true; this.head.add(this.skull);
    this.hair = new THREE.Mesh(hairGeo(L, o.hair || 'curly'), mat('lit')); this.hair.castShadow = true; this.head.add(this.hair);
    this.curls = new THREE.Mesh(curlsGeo(L), mat('lit')); this.curls.position.y = 30; this.curls.castShadow = true; this.head.add(this.curls);
    if (o.hair && o.hair !== 'curly') this.curls.visible = false;
    this.faces = []; this.white = !!o.whiteTeeth;
    this.faceG = new THREE.Group(); this.head.add(this.faceG);
    // anclas de cosmeticos
    this.aHat = new THREE.Group(); this.aFace = new THREE.Group(); this.aMouth = new THREE.Group(); this.head.add(this.aHat, this.aFace, this.aMouth);
    this.aNeck = new THREE.Group(); this.torso.add(this.aNeck);
    this.aWaist = new THREE.Group(); this.body.add(this.aWaist);
    this.aAura = new THREE.Group(); this.root.add(this.aAura);
    this.hood = new THREE.Mesh(hoodGeo(), mat('lit')); this.hood.visible = false; this.torso.add(this.hood);
  }
  faceMesh(i) {
    if (!this.faces[i]) { const m = new THREE.Mesh(faceGeo(i, this.L, this.white, !!this.opts.noStache), mat('lit')); m.visible = false; this.faceG.add(m); this.faces[i] = m; }
    return this.faces[i];
  }
  setMood(i) {
    i = clamp(i | 0, 0, N_FACES - 1); if (i === this.mood) return; this.mood = i;
    for (let k = 0; k < this.faces.length; k++) if (this.faces[k]) this.faces[k].visible = false;
    this.faceMesh(i).visible = true;
    this.hood.visible = i === 5 && !this.opts.npc;
    this.updHair();
  }
  setTeeth(white) { white = !!white; if (white === this.white) return; this.white = white; this.faces.forEach(m => { if (m) this.faceG.remove(m); }); this.faces = []; const m = this.mood; this.mood = -1; this.setMood(m); }
  updHair() {
    const style = this.opts.hair || 'curly', hat = !!this.hatOn;
    this.curls.visible = style === 'curly' && !hat && this.mood !== HAIR_NEAT;
    this.curls.scale.y = 1 + .55 * (HAIR_ALTO[this.mood] || 0);
  }
  setHat(on) { this.hatOn = !!on; this.updHair(); }
  // colores de la ropa (cosmeticos de cuerpo)
  setBody(over, extra) {
    const L = look(Object.assign({}, this.opts.look || {}, over || {})); this.L2 = L;
    this.torsoM.geometry = torsoGeo(L, extra || ''); this.hips.geometry = hipsGeo(L);
    this.aL.u.geometry = upperArmGeo(L); this.aR.u.geometry = upperArmGeo(L);
  }
  setShoes(pristine) { const L = this.L; this.shoeL.geometry = shoeGeo(L, -1, !!pristine); this.shoeR.geometry = shoeGeo(L, 1, !!pristine); }
  // herramienta por defecto (llave inglesa) cuando no lleva nada en la mano
  setTool(on) {
    if (on && !this.tool) { this.tool = new THREE.Mesh(wrenchGeo(), mat('lit')); this.tool.castShadow = true; this.tool.position.set(0, -1, 1.4); }
    if (this.tool) { if (on && !this.held) this.item.add(this.tool); else this.item.remove(this.tool); }
    this.toolOn = !!on;
  }
  setHeld(obj) { // objeto 3D en la mano (cosmetico de mano) o null
    if (this.held) this.item.remove(this.held); this.held = obj || null;
    if (obj) { this.item.add(obj); if (this.tool) this.item.remove(this.tool); } else if (this.toolOn) this.setTool(true);
  }
  play(name, env) { if (this.anim !== name) { this.anim = name; } if (env) this.env = env; }
  hit(strong) { // golpe de llave
    this.hitT = (this.hitT >= 0 && this.hitT < this.hitDur * .8) ? this.hitDur * .28 : 0; this.hitStrong = !!strong;
  }
  jump(h) { this.jumpT = 0; this.jumpH = h || 4; }
  update(dt) {
    this.t += dt; const p = this.tgt; for (let i = 0; i < KEYS.length; i++) p[KEYS[i]] = ZERO[KEYS[i]];
    (ANIMS[this.anim] || ANIMS.idle)(p, this.t, this.env);
    const c = this.cur, k = this.rate; for (let i = 0; i < KEYS.length; i++) { const key = KEYS[i]; c[key] = damp(c[key], p[key], k, dt); }
    this.apply(dt);
  }
  apply(dt) {
    const c = this.cur; let arx = c.arx, are = c.are, trx = c.trx, by = c.by, itx = c.itx, alx = c.alx;
    if (this.hitT >= 0) { // golpe: se superpone sin amortiguar para que sea seco
      this.hitT += dt; const u = this.hitT / this.hitDur;
      if (u >= 1) this.hitT = -1; else {
        const up = u < .3 ? u / .3 : 0, dn = u >= .3 && u < .6 ? (u - .3) / .3 : 0, rc = u >= .6 ? (u - .6) / .4 : 0, st = this.hitStrong ? 1.25 : 1;
        if (u < .3) { arx += 1.25 * st * Math.sin(up * Math.PI / 2); are += .5 * up; itx -= .7 * up; }
        else if (u < .6) { const e = dn * dn; arx += 1.25 * st * (1 - e) - .35 * e; are += .5 * (1 - e) - .75 * e; trx += .26 * e * st; itx += -.7 * (1 - e) + 1.25 * e; }
        else { const e = 1 - rc; arx -= .35 * e; are -= .75 * e; trx += .26 * e * st; itx += 1.25 * e; }
      }
    }
    if (this.jumpT >= 0) { this.jumpT += dt; const u = this.jumpT / .42; if (u >= 1) this.jumpT = -1; else by += Math.sin(u * Math.PI) * this.jumpH; }
    this.body.position.y = by; this.body.rotation.set(c.brx, c.bry, c.brz);
    this.torso.rotation.set(trx, c.try, c.trz);
    this.head.rotation.set(c.hrx, c.hry, c.hrz);
    this.aL.g.rotation.set(-alx, 0, -c.alz); this.aL.f.rotation.x = -c.ale;
    this.aR.g.rotation.set(-arx, 0, c.arz); this.aR.f.rotation.x = -are;
    this.legL.rotation.set(-c.llx, 0, -c.llz); this.legR.rotation.set(-c.lrx, 0, c.lrz);
    // lo de la mano se mantiene de pie respecto al cuerpo (como en el pixel art) y se inclina al golpear
    Q1.copy(this.body.quaternion).multiply(this.torso.quaternion).multiply(this.aR.g.quaternion).multiply(this.aR.f.quaternion).invert();
    Q2.setFromEuler(EU.set(itx, 0, 0)); this.item.quaternion.copy(Q1).multiply(this.body.quaternion).multiply(this.torso.quaternion).multiply(Q2);
  }
  // punto de la mano derecha en mundo (para chispas)
  handWorld(out) { return this.aR.h.getWorldPosition(out); }
  headWorld(out) { out.set(0, 16, 0); return this.head.localToWorld(out); }
  dispose() { if (this.root.parent) this.root.parent.remove(this.root); }
}

// personajes secundarios con el mismo esqueleto
export function npc(kind) {
  const K = {
    manolo: { look: { tee: 0xe08a2c, tee2: 0xb86a18, sleeve: 0xe08a2c, shorts: 0x4a4f58, shorts2: 0x5c626e, hair: 0x6a5a48, hair2: 0x8a7860, skin: 0xd8a47c, skin2: 0xc08a62 }, hair: 'short', whiteTeeth: true },
    curro: { look: { tee: 0x5c8a4a, tee2: 0x44703a, sleeve: 0x5c8a4a, shorts: 0x3a3a44, shorts2: 0x4a4a58, hair: 0x1c1a18, hair2: 0x3a3632, skin: 0xb9855c, skin2: 0x9c6c46 }, hair: 'short', whiteTeeth: true },
    becaria: { look: { tee: 0xc85a8a, tee2: 0xa04470, sleeve: 0xc85a8a, shorts: 0x34425e, shorts2: 0x46587a, hair: 0x7a4a22, hair2: 0x9a6436, skin: 0xf0c8a4, skin2: 0xdcae88 }, hair: 'long', whiteTeeth: true, noStache: true },
    luisillo: { look: { tee: 0xf2efe6, tee2: 0xd2d0c6, sleeve: 0xf2efe6, collar: 0x26262c, trim: 0x26262c, shorts: 0x26262c, shorts2: 0x3a3a44, stripe: 0x26262c, hair: 0x8a8a8a, hair2: 0xb0b0b0, skin: 0xe0b08c, skin2: 0xc8946e }, hair: 'bald', whiteTeeth: true },
    sadaba: { look: { tee: 0x6b4a8a, tee2: 0x543870, sleeve: 0x6b4a8a, collar: 0xe9b73d, trim: 0xe9b73d, shorts: 0x2c2c34, shorts2: 0x40404c, stripe: 0xe9b73d, hair: 0x1c1a18, hair2: 0x3c3834, skin: 0xe4b48e, skin2: 0xcc9a72 }, hair: 'short', whiteTeeth: true, scale: 1.06 },
    novia: { look: { tee: 0xff5ca0, tee2: 0xd9408a, sleeve: 0xff5ca0, collar: 0xffffff, trim: 0xffffff, shorts: 0x3a6ed8, shorts2: 0x5a8ae8, stripe: 0x3a6ed8, hair: 0xc8922a, hair2: 0xe8b84a, skin: 0xf2caa6, skin2: 0xdfb08a, shoe: 0xff5ca0 }, hair: 'long', whiteTeeth: true, noStache: true, scale: .96 },
    raver: { look: { tee: 0x3ce6d2, tee2: 0x24b8a8, sleeve: 0x3ce6d2, shorts: 0x26262c, shorts2: 0x3a3a44, hair: 0xa855f7, hair2: 0xc88aff, skin: 0xd8a47c, skin2: 0xc08a62 }, hair: 'short', whiteTeeth: true },
    raver2: { look: { tee: 0xff5ca0, tee2: 0xd9408a, sleeve: 0xff5ca0, shorts: 0x4a3a6a, shorts2: 0x5c4a80, hair: 0x26262c, hair2: 0x44444c, skin: 0xb9855c, skin2: 0x9c6c46 }, hair: 'long', whiteTeeth: true, noStache: true }
  }[kind] || {};
  return new Ethan(Object.assign({ npc: true, mood: 3 }, K));
}
