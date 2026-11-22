// Pixel art de Ethan portado de tools/make-sprites.js (busto 48x48).
// De aqui salen las caras voxel: cada pixel de cejas, ojos y boca es una plaquita en la cabeza 3D.
import { PAL } from './util.js';

function newFB() { const fb = []; for (let y = 0; y < 48; y++) { fb.push(new Array(48).fill('_')); } return fb; }
function px(fb, x, y, c) { if (y >= 0 && y < 48 && x >= 0 && x < 48) fb[y][x] = c; }
function rect(fb, x0, y0, w, h, c) { for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) px(fb, x, y, c); }
function hline(fb, x0, x1, y, c) { for (let x = x0; x <= x1; x++) px(fb, x, y, c); }

function bBrows(fb, raiseL, raiseR) {
  hline(fb, 15, 20, 14 - (raiseL ? 1 : 0), 'K'); px(fb, 21, 15 - (raiseL ? 1 : 0), 'K');
  px(fb, 26, 15 - (raiseR ? 1 : 0), 'K'); hline(fb, 27, 32, 14 - (raiseR ? 1 : 0), 'K');
}
function bEyesOpen(fb, dx) {
  dx = dx || 0;
  rect(fb, 16, 16, 5, 3, 'E'); rect(fb, 27, 16, 5, 3, 'E');
  rect(fb, 17 + dx, 16, 2, 2, 'P'); rect(fb, 28 + dx, 16, 2, 2, 'P');
  hline(fb, 16, 20, 15, 'K'); hline(fb, 27, 31, 15, 'K');
}
function bEyesClosed(fb) {
  px(fb, 16, 18, 'K'); px(fb, 17, 17, 'K'); px(fb, 18, 16, 'K'); px(fb, 19, 17, 'K'); px(fb, 20, 18, 'K');
  px(fb, 27, 18, 'K'); px(fb, 28, 17, 'K'); px(fb, 29, 16, 'K'); px(fb, 30, 17, 'K'); px(fb, 31, 18, 'K');
}
function bEyesRolled(fb) {
  rect(fb, 16, 16, 5, 3, 'E'); rect(fb, 27, 16, 5, 3, 'E');
  hline(fb, 16, 21, 15, 'K'); hline(fb, 26, 31, 15, 'K');
  hline(fb, 16, 20, 16, 'e'); hline(fb, 27, 31, 16, 'e');
}
function bNostril(fb) { px(fb, 22, 22, 's'); hline(fb, 23, 25, 23, 's'); }
function bStache(fb) { hline(fb, 19, 22, 25, 'G'); hline(fb, 26, 29, 25, 'G'); }
function bScruff(fb) { px(fb, 21, 30, 'G'); px(fb, 24, 31, 'G'); px(fb, 27, 30, 'G'); }
function bMouthGrin(fb) {
  hline(fb, 17, 30, 26, 'K');
  hline(fb, 18, 29, 27, 'T'); px(fb, 20, 27, 't'); px(fb, 24, 27, 't'); px(fb, 27, 27, 't');
  hline(fb, 18, 29, 28, 'T'); px(fb, 22, 28, 't'); px(fb, 26, 28, 't'); px(fb, 29, 28, 't');
  hline(fb, 19, 28, 29, 'M');
  px(fb, 17, 27, 'M'); px(fb, 30, 27, 'M');
}
function bMouthScrunch(fb) { hline(fb, 19, 28, 27, 'M'); hline(fb, 20, 27, 28, 'M'); px(fb, 18, 26, 'M'); px(fb, 29, 26, 'M'); }
function bMouthPout(fb) { hline(fb, 21, 26, 26, 'M'); hline(fb, 21, 26, 27, 's'); px(fb, 20, 27, 's'); }
function bMouthSoft(fb) { hline(fb, 19, 28, 27, 'M'); px(fb, 18, 26, 'M'); px(fb, 29, 26, 'M'); hline(fb, 21, 26, 27, 'T'); px(fb, 23, 27, 't'); }
function bMouthSmirk(fb) { hline(fb, 21, 29, 27, 'M'); px(fb, 30, 26, 'M'); px(fb, 20, 28, 's'); hline(fb, 23, 28, 27, 'T'); px(fb, 25, 27, 't'); }

// 0 feliz · 1 hastiado · 2 dientes · 3 tranquilo · 4 pillo · 5 noche · 6 dormido · 7 asustado · 8 golpeado · 9 KO
const FACES = [
  function (fb, o) { bBrows(fb); bEyesClosed(fb); bNostril(fb); if (!o.noStache) { bStache(fb); bScruff(fb); } bMouthScrunch(fb); px(fb, 15, 22, 'C'); px(fb, 32, 22, 'C'); },
  function (fb, o) { bEyesRolled(fb); bNostril(fb); if (!o.noStache) bStache(fb); bMouthPout(fb); },
  function (fb, o) { bBrows(fb, false, true); bEyesOpen(fb, 0); bNostril(fb); if (!o.noStache) bStache(fb); bMouthGrin(fb); },
  function (fb, o) { bBrows(fb); bEyesOpen(fb, 0); bNostril(fb); if (!o.noStache) bStache(fb); bMouthSoft(fb); },
  function (fb, o) { bBrows(fb, true, false); bEyesOpen(fb, 1); bNostril(fb); if (!o.noStache) { bStache(fb); bScruff(fb); } bMouthSmirk(fb); },
  function (fb, o) { bBrows(fb); bEyesOpen(fb, 0); bNostril(fb); if (!o.noStache) bStache(fb); bMouthSoft(fb); },
  function (fb, o) {
    hline(fb, 15, 20, 14, 'K'); hline(fb, 27, 32, 14, 'K');
    hline(fb, 16, 20, 17, 'K'); hline(fb, 27, 31, 17, 'K'); px(fb, 16, 16, 'K'); px(fb, 31, 16, 'K');
    bNostril(fb); if (!o.noStache) bStache(fb);
    rect(fb, 22, 26, 4, 3, 'K'); rect(fb, 23, 27, 2, 1, 'M'); px(fb, 25, 29, 'b'); px(fb, 25, 30, 'b'); px(fb, 26, 31, 'b');
  },
  function (fb, o) {
    hline(fb, 15, 20, 12, 'K'); px(fb, 14, 13, 'K'); px(fb, 21, 13, 'K');
    hline(fb, 27, 32, 12, 'K'); px(fb, 26, 13, 'K'); px(fb, 33, 13, 'K');
    rect(fb, 16, 15, 5, 4, 'E'); rect(fb, 27, 15, 5, 4, 'E'); px(fb, 18, 16, 'P'); px(fb, 29, 16, 'P');
    hline(fb, 16, 20, 14, 'K'); hline(fb, 27, 31, 14, 'K');
    bNostril(fb); if (!o.noStache) bStache(fb);
    rect(fb, 21, 25, 6, 5, 'K'); rect(fb, 22, 26, 4, 3, 'r'); hline(fb, 22, 25, 26, 'T');
    px(fb, 34, 11, 'b'); px(fb, 33, 12, 'b'); px(fb, 34, 12, 'b'); px(fb, 33, 13, 'b'); px(fb, 34, 13, 'b');
  },
  function (fb, o) { // golpeado: ojos > <, mofletes rojos y dientes apretados
    hline(fb, 15, 20, 13, 'K'); hline(fb, 27, 32, 13, 'K');
    [[16, 15], [17, 16], [18, 17], [17, 18], [16, 19]].forEach(p => px(fb, p[0], p[1], 'K'));
    [[31, 15], [30, 16], [29, 17], [30, 18], [31, 19]].forEach(p => px(fb, p[0], p[1], 'K'));
    bNostril(fb); if (!o.noStache) bStache(fb);
    rect(fb, 20, 26, 8, 4, 'K'); hline(fb, 21, 26, 26, 'T'); hline(fb, 21, 26, 27, 'T'); px(fb, 23, 27, 't'); rect(fb, 22, 28, 4, 1, 'R');
    rect(fb, 14, 21, 2, 2, 'R'); rect(fb, 32, 21, 2, 2, 'R');
  },
  function (fb, o) { // KO: ojos en X y lengua fuera
    [[16, 15], [20, 15], [17, 16], [19, 16], [18, 17], [17, 18], [19, 18], [16, 19], [20, 19]].forEach(p => px(fb, p[0], p[1], 'K'));
    [[27, 15], [31, 15], [28, 16], [30, 16], [29, 17], [28, 18], [30, 18], [27, 19], [31, 19]].forEach(p => px(fb, p[0], p[1], 'K'));
    bNostril(fb); if (!o.noStache) bStache(fb);
    hline(fb, 20, 28, 26, 'K'); rect(fb, 24, 27, 3, 3, 'R'); px(fb, 25, 29, 'r');
  }
];
export const N_FACES = FACES.length;
// altura extra del pelo segun la cara (como en los bustos) y cara "peinada"
export const HAIR_ALTO = [1, 0, 0, 0, 2, 0, 1, 2, 2, 1];
export const HAIR_NEAT = 3;

// Devuelve las tiras horizontales de color de una cara: [{x0,x1,y,col}] en coordenadas del busto.
export function faceRuns(mood, opts) {
  const o = opts || {}, fb = newFB(); FACES[mood](fb, o);
  const runs = [];
  for (let y = 8; y < 33; y++) {
    let x = 11;
    while (x < 37) {
      let c = fb[y][x]; if (c === '_') { x++; continue; }
      let x1 = x + 1; while (x1 < 37 && fb[y][x1] === c) x1++;
      if (o.whiteTeeth && (c === 'T' || c === 't')) c = 'E';
      runs.push({ x0: x, x1: x1, y: y, col: PAL[c], k: c });
      x = x1;
    }
  }
  return runs;
}
