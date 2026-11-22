// Atrezzo voxel: coches, objetos de «La vida de Ethan» y mobiliario.
import * as THREE from 'three';
import { Vox, mat, voxText } from './vox.js';
import { PAL as P, shade } from './util.js';

// ---------- coches (morro en x=0, culo en x=L, centrados en z, ruedas en y=0) ----------
export function car(b, col, type, o) {
  o = o || {}; const T = type || 'hatch', glass = 0x1e2b3a, tire = 0x1b1b20, rim = 0xb9bec6, dk = shade(col, .62);
  const L = T === 'van' ? 4.3 : T === 'sport' ? 4.2 : T === 'bus' ? 8 : 3.95, W = T === 'sport' ? 1.85 : T === 'bus' ? 2.3 : 1.72, gc = T === 'sport' ? .18 : .26;
  const wheel = (x, z) => { b.box(x, 0, z, .62, .62, .26, tire); b.box(x, .13, z, .36, .36, .28, rim); b.box(x, .05, z, .5, .52, .27, tire); };
  const wx = T === 'bus' ? [1.3, L - 1.6] : [.78, L - .8];
  wx.forEach(x => { wheel(x, W / 2 - .1); wheel(x, -W / 2 + .1); });
  if (T === 'bus') {
    b.bx(0, gc, -W / 2, L, 2.75, W / 2, col); b.bx(.05, 1.25, -W / 2 - .02, L - .2, 2.2, W / 2 + .02, glass); b.bx(-.03, 1.1, -W / 2 + .15, .05, 2.3, W / 2 - .15, glass);
    b.bx(0, gc, -W / 2 - .01, L, .7, W / 2 + .01, dk); b.bx(-.04, .5, -W / 2 + .2, .02, .72, -W / 2 + .6, 0xfff2b0); b.bx(-.04, .5, W / 2 - .6, .02, .72, W / 2 - .2, 0xfff2b0);
    b.bx(.2, 2.75, -W / 2 + .2, L - .2, 2.85, W / 2 - .2, shade(col, 1.15)); return { L, W, H: 2.85 };
  }
  const hoodH = T === 'van' ? .98 : T === 'sport' ? .72 : .86, roofH = T === 'van' ? 1.62 : T === 'sport' ? 1.14 : 1.44;
  const c0 = T === 'van' ? .95 : T === 'sport' ? 1.45 : 1.12, c1 = T === 'van' ? L - .12 : T === 'sport' ? L - 1.0 : L - .35;
  b.bx(0, gc, -W / 2, L, hoodH - .08, W / 2, col);                                   // carroceria
  b.bx(-.07, gc, -W / 2 + .05, .12, gc + .26, W / 2 - .05, dk); b.bx(L - .12, gc, -W / 2 + .05, L + .07, gc + .26, W / 2 - .05, dk); // parachoques
  if (!o.hoodOpen) b.bx(.02, hoodH - .08, -W / 2 + .04, c0 + .02, hoodH, W / 2 - .04, col); // capo cerrado
  else { b.bx(.1, gc + .2, -W / 2 + .12, c0 - .06, hoodH - .09, W / 2 - .12, 0x1a1c20); b.bx(.3, hoodH - .34, -.5, .95, hoodH - .08, .5, 0x777c84); b.bx(.42, hoodH - .08, -.3, .8, hoodH - .02, .3, 0x9aa0a8); b.bx(.32, hoodH - .3, .56, .6, hoodH - .08, .72, 0xd8a020); b.bx(.7, hoodH - .26, -.74, .92, hoodH - .1, -.56, 0x2a5bb8); }
  b.bx(c0 + .02, hoodH - .08, -W / 2, L, hoodH, W / 2, col);                        // cintura
  b.bx(c0, hoodH, -W / 2 + .07, c1, roofH, W / 2 - .07, col);                          // cabina
  b.bx(c0 - .03, hoodH + .04, -W / 2 + .16, c0 + .02, roofH - .08, W / 2 - .16, glass); // parabrisas
  b.bx(c1 - .02, hoodH + .06, -W / 2 + .16, c1 + .03, roofH - .1, W / 2 - .16, glass);  // luneta
  const mid = (c0 + c1) / 2;
  [[c0 + .14, mid - .05], [mid + .05, c1 - .14]].forEach(s => { b.bx(s[0], hoodH + .06, -W / 2 + .04, s[1], roofH - .1, -W / 2 + .08, glass); b.bx(s[0], hoodH + .06, W / 2 - .08, s[1], roofH - .1, W / 2 - .04, glass); });
  b.bx(c0 + .06, roofH, -W / 2 + .12, c1 - .06, roofH + .05, W / 2 - .12, shade(col, 1.12));
  b.bx(-.03, hoodH - .34, -W / 2 + .12, .03, hoodH - .16, -W / 2 + .5, 0xfff2b0); b.bx(-.03, hoodH - .34, W / 2 - .5, .03, hoodH - .16, W / 2 - .12, 0xfff2b0); // faros
  b.bx(L - .03, hoodH - .3, -W / 2 + .1, L + .03, hoodH - .14, -W / 2 + .46, 0xc42e28); b.bx(L - .03, hoodH - .3, W / 2 - .46, L + .03, hoodH - .14, W / 2 - .1, 0xc42e28);
  b.bx(-.08, gc + .04, -.28, -.06, gc + .2, .28, 0xf2efe6);                             // matricula
  if (T === 'sport') { b.bx(L - .5, hoodH + .16, -W / 2 + .05, L - .12, hoodH + .22, W / 2 - .05, dk); b.bx(L - .36, hoodH, -W / 2 + .2, L - .26, hoodH + .16, -W / 2 + .3, dk); b.bx(L - .36, hoodH, W / 2 - .3, L - .26, hoodH + .16, W / 2 - .2, dk); b.bx(.6, hoodH, -.12, c0 - .2, hoodH + .02, .12, 0x1a1c20); }
  if (T === 'van') { b.bx(1.6, roofH + .05, -W / 2 + .2, 1.7, roofH + .12, W / 2 - .2, 0x55585e); b.bx(3.2, roofH + .05, -W / 2 + .2, 3.3, roofH + .12, W / 2 - .2, 0x55585e); }
  return { L, W, H: roofH + .05, hoodH, c0 };
}
export function carMesh(col, type, o) { const b = new Vox(); const info = car(b, col, type, o); const m = b.mesh('lit', 3); m.userData.car = info; return m; }
export function hoodMesh(col, info) { // capo abierto, con bisagra en el parabrisas
  const b = new Vox(), W = info.W; b.bx(-info.c0 + .04, 0, -W / 2 + .04, 0, .07, W / 2 - .04, col, { bot: shade(col, .6) });
  const m = b.mesh('lit', 1), g = new THREE.Group(); g.add(m); g.position.set(info.c0, info.hoodH - .06, 0); g.rotation.z = -.95; return g;
}

// ---------- objetos de «La vida de Ethan» (para las baldas del taller) ----------
export const ITEM3D = {
  cepillo(b) { b.box(0, 0, 0, .3, .32, .3, 0x9ec4e8); b.box(0, .28, 0, .26, .04, .26, 0x6fa0cc); b.bx(-.04, .2, -.04, .04, .72, .04, P.E); b.bx(-.06, .62, -.05, .06, .8, .02, P.E); b.bx(-.07, .64, .02, .07, .8, .12, P.T); b.bx(-.03, .7, .1, .05, .76, .14, P.t); },
  ruffles(b) { b.box(0, 0, 0, .46, .62, .16, 0xd8402c); b.box(0, .62, 0, .46, .06, .06, 0xf2efe6); b.box(0, .22, .085, .34, .22, .01, 0xf2c230); b.box(0, .3, .095, .2, .06, .01, 0xd8402c); b.box(-.1, .08, .085, .12, .1, .01, 0xf5d9a0); b.box(.1, .1, .085, .1, .08, .01, 0xf0b0b8); },
  aquarius(b) { b.cyl(0, 0, 0, .13, .44, 0x1c57b5); b.cyl(0, .16, 0, .135, .12, 0xf2efe6); b.cyl(0, .19, 0, .137, .05, 0xf2d640); b.cyl(0, .44, 0, .11, .02, 0xb9bec6); },
  kebab(b) { b.at(0, 0, 0, 0, 1); b.box(0, 0, 0, .5, .04, .34, 0xf2efe6); b.bx(-.2, .04, -.1, .2, .26, .1, 0xe6c79a); b.bx(-.22, .04, -.11, -.02, .27, .11, 0xcfd3d8); b.bx(.16, .08, -.08, .24, .24, .08, 0x8b5e3c); b.bx(.18, .2, -.07, .25, .26, 0, 0x5c963c); b.bx(.18, .1, .01, .25, .16, .07, 0xc42e28); b.bx(.2, .16, -.02, .26, .2, .04, 0xf2efe6); },
  mcdo(b) { b.box(0, 0, 0, .3, .34, .16, 0xd02b2b); b.box(0, .12, .085, .16, .1, .01, 0xffc72c); for (let i = 0; i < 6; i++) b.box(-.11 + i * .044, .3, (i % 2) * .05 - .03, .035, .2 + (i % 3) * .05, .035, 0xf5cf58); b.box(.28, 0, -.02, .2, .22, .2, 0xf2efe6); b.box(.28, .22, -.02, .06, .14, .06, 0xd02b2b); },
  burger(b) { b.box(0, 0, 0, .5, .1, .5, P.F); b.box(0, .1, 0, .54, .08, .54, 0x5a3320); b.box(0, .18, 0, .56, .03, .56, P.J); b.box(0, .21, 0, .58, .04, .58, 0x5c963c); b.box(0, .24, 0, .5, .04, .5, 0xc42e28); b.box(0, .28, 0, .5, .14, .5, P.F); b.box(0, .42, 0, .4, .05, .4, P.F); [[-.12, -.1], [.1, .08], [.02, -.14], [-.06, .14]].forEach(p => b.box(p[0], .47, p[1], .04, .015, .04, P.E)); },
  fosters(b) { b.box(0, 0, 0, .7, .04, .5, 0xf2efe6); b.box(-.08, .04, 0, .4, .1, .4, P.F); b.box(-.08, .14, 0, .44, .08, .44, 0x5a3320); b.box(-.08, .22, 0, .46, .03, .46, P.J); b.box(-.08, .25, 0, .44, .08, .44, 0x5a3320); b.box(-.08, .33, 0, .46, .04, .46, 0x8a4a2a); b.box(-.08, .37, 0, .4, .14, .4, P.F); b.box(-.08, .51, 0, .02, .26, .02, P.O); b.box(-.01, .68, 0, .14, .09, .01, 0xc42e28); for (let i = 0; i < 4; i++) b.box(.24, .04, -.16 + i * .1, .05, .07, .26 - i * .03, 0xf5cf58, {}); },
  xabi(b) { b.box(0, 0, 0, .56, .66, .06, P.Q); b.box(0, .05, .02, .46, .56, .04, 0xfbe4ee); const h = [[0, 1, 1, 0, 1, 1, 0], [1, 1, 1, 1, 1, 1, 1], [1, 1, 1, 1, 1, 1, 1], [0, 1, 1, 1, 1, 1, 0], [0, 0, 1, 1, 1, 0, 0], [0, 0, 0, 1, 0, 0, 0]]; h.forEach((r, y) => r.forEach((v, x) => { if (v) b.box(-.18 + x * .06, .46 - y * .06, .045, .06, .06, .012, 0xff3b6e); })); b.box(0, 0, -.12, .1, .3, .04, P.q); },
  '3ds'(b) { b.box(0, 0, 0, .44, .07, .3, P.Q); b.box(0, .07, .02, .26, .01, .16, P.Z); b.box(-.16, .07, .02, .05, .015, .05, P.K); b.box(.15, .07, 0, .04, .015, .04, P.R); b.box(.17, .07, .06, .04, .015, .04, P.K); b.bx(-.22, .06, -.19, .22, .4, -.13, P.Q); b.bx(-.17, .1, -.13, .17, .36, -.12, 0x7cc0ff); b.bx(-.03, .2, -.125, .03, .26, -.115, 0xf2c230); },
  refri(b, o) { const on = !(o && o.broken); b.box(0, 0, 0, .5, 1, .9, 0x1c1e24); b.bx(.25, .08, -.38, .262, .92, .38, 0x2c3440); b.bx(.262, .5, -.3, .27, .56, .3, on ? 0x3ce6d2 : 0x4a4f58); b.bx(.262, .26, -.3, .27, .32, .3, on ? 0xff5ca0 : 0x4a4f58); b.bx(.262, .26, -.3, .27, .56, -.24, on ? 0x3ce6d2 : 0x4a4f58); b.bx(.262, .26, .24, .27, .56, .3, on ? 0xff5ca0 : 0x4a4f58); b.bx(.262, .66, -.12, .27, .84, .12, on ? 0x7c4dff : 0x3a3f48); b.bx(-.2, 1, .2, .2, 1.03, .4, 0x2c3440); b.bx(-.1, .1, .45, .1, .16, .46, on ? 0x3ce6d2 : 0x3a3f48); },
  ps5(b) { b.box(0, 0, 0, 1.5, .5, .5, 0x3a2e24); b.box(0, .5, 0, 1.6, .05, .56, 0x4a3b30); b.bx(-.7, .62, -.06, .56, 1.44, 0, 0x16181c); b.bx(-.66, .66, 0, .52, 1.4, .012, 0x2a5bb8); b.bx(-.5, .8, .012, .1, 1.1, .02, 0x7cc0ff); b.bx(-.12, .55, -.1, 0, .62, .04, 0x16181c); b.bx(.66, .55, -.14, .7, 1.08, .14, P.E); b.bx(.7, .57, -.11, .78, 1.05, .11, 0x16181c); b.bx(.78, .55, -.14, .82, 1.08, .14, P.E); b.bx(.71, .98, .11, .77, 1.02, .12, 0x3d8bfd); b.box(.1, .55, .2, .24, .05, .12, P.E); }
};
// malla de un objeto; devuelve null si no hay modelo
export function itemMesh(id, o) { const f = ITEM3D[id]; if (!f) return null; const b = new Vox(); f(b, o); return b.mesh('lit', 1); }

// ---------- mobiliario suelto ----------
export function tires(b, x, z, n) { for (let i = 0; i < n; i++) { b.box(x + (i % 2) * .03, i * .24, z, .7, .22, .7, 0x1b1b20); b.box(x + (i % 2) * .03, i * .24 + .22, z, .36, .02, .36, 0x0e0e12); } }
export function drum(b, x, z, col) { b.cyl(x, 0, z, .3, .9, col); b.cyl(x, .28, z, .31, .05, shade(col, .7)); b.cyl(x, .6, z, .31, .05, shade(col, .7)); b.cyl(x, .9, z, .26, .02, shade(col, .5)); }
export function toolbox(b, x, y, z, col) { b.box(x, y, z, .7, .34, .34, col); b.box(x, y + .34, z, .72, .05, .36, shade(col, .7)); b.box(x, y + .39, z, .3, .08, .05, 0x464850); }
export { voxText };
