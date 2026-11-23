// input.js: teclado, ratón, táctil (palanca a la izquierda, cámara a la derecha) y mando (gamepad estándar)
export const I = { mx: 0, my: 0, run: false, hb: false, act: false, camX: 0, camY: 0, zoom: 0, touch: false, press: null, btn: {} };
const keys = new Set(); let joy = null, look = null, joyEl = null, knob = null;

export function initInput(el) {
  joyEl = document.getElementById('joy'); knob = joyEl && joyEl.firstElementChild;
  addEventListener('keydown', e => { if (e.target && /INPUT|TEXTAREA/.test(e.target.tagName)) return; const k = e.code; if (/^Arrow|Space/.test(k)) e.preventDefault(); if (e.repeat) return; keys.add(k); if (I.press) I.press(k, e); });
  addEventListener('keyup', e => keys.delete(e.code)); addEventListener('blur', () => { keys.clear(); joy = look = null; });
  el.addEventListener('contextmenu', e => e.preventDefault());
  el.addEventListener('wheel', e => { I.zoom += Math.sign(e.deltaY); e.preventDefault(); }, { passive: false });
  el.addEventListener('pointerdown', e => {
    if (e.pointerType === 'touch') { I.touch = true; document.documentElement.classList.add('touch');
      if (!joy && e.clientX < innerWidth * .45 && e.clientY > innerHeight * .3) { joy = { id: e.pointerId, x: e.clientX, y: e.clientY, dx: 0, dy: 0 }; if (joyEl) { joyEl.style.left = e.clientX + 'px'; joyEl.style.top = e.clientY + 'px'; joyEl.classList.add('on'); } }
      else if (!look) look = { id: e.pointerId, x: e.clientX, y: e.clientY }; }
    else look = { id: e.pointerId, x: e.clientX, y: e.clientY };
    try { el.setPointerCapture(e.pointerId); } catch (x) { }
  });
  el.addEventListener('pointermove', e => {
    if (joy && e.pointerId === joy.id) { let dx = (e.clientX - joy.x) / 52, dy = (e.clientY - joy.y) / 52; const l = Math.hypot(dx, dy); if (l > 1) { dx /= l; dy /= l; } joy.dx = dx; joy.dy = dy; if (knob) knob.style.transform = 'translate(' + dx * 34 + 'px,' + dy * 34 + 'px)'; }
    else if (look && e.pointerId === look.id) { I.camX += e.clientX - look.x; I.camY += e.clientY - look.y; look.x = e.clientX; look.y = e.clientY; }
  });
  const up = e => { if (joy && e.pointerId === joy.id) { joy = null; if (joyEl) joyEl.classList.remove('on'); if (knob) knob.style.transform = ''; } if (look && e.pointerId === look.id) look = null; };
  el.addEventListener('pointerup', up); el.addEventListener('pointercancel', up);
  // botones táctiles: data-btn="run" se mantiene, data-key="KeyE" es una pulsación
  document.querySelectorAll('[data-btn]').forEach(b => { const set = v => e => { e.preventDefault(); if (v) I.btn[b.dataset.btn] = true; else I.btn.run = I.btn.hb = false; b.classList.toggle('on', v); }; b.addEventListener('pointerdown', set(true)); b.addEventListener('pointerup', set(false)); b.addEventListener('pointercancel', set(false)); b.addEventListener('pointerleave', set(false)); });   // el botón cambia de función (correr o freno de mano): se mira en el momento
  document.querySelectorAll('[data-key]').forEach(b => b.addEventListener('click', e => { e.preventDefault(); if (I.press) I.press(b.dataset.key, e); }));
}
export function poll() {
  if (I.auto) { I.mx = I.auto[0]; I.my = I.auto[1]; I.hb = !!I.auto[2]; I.run = !!I.auto[3]; return; }      // mandos puestos a mano (pruebas automáticas)
  const k = c => keys.has(c);
  if (joy) { I.mx = joy.dx; I.my = -joy.dy; }
  else { I.mx = (k('KeyD') || k('ArrowRight') ? 1 : 0) - (k('KeyA') || k('ArrowLeft') ? 1 : 0); I.my = (k('KeyW') || k('ArrowUp') ? 1 : 0) - (k('KeyS') || k('ArrowDown') ? 1 : 0); }
  I.run = k('ShiftLeft') || k('ShiftRight') || !!I.btn.run || (joy && Math.hypot(joy.dx, joy.dy) > .96);
  I.hb = k('Space') || !!I.btn.hb;
  pad();
}
// ---------- mando: palanca izquierda para moverse, derecha para la cámara, gatillos acelerar y frenar.
// A: acción (en un menú, elegir) · B: atrás · X: subir o bajar del coche · Y: cámara · LB: freno de mano · RB: correr
// Start: móvil · Select: mapa · cruceta: moverse por los menús (y derecha: cámara rápida)
let gpPrev = [], gpF = null, gpNav = 0;
const gpBox = () => { for (const id of ['dlg', 'mg', 'bigmap', 'title']) { const e = document.getElementById(id); if (e && !e.hidden) return e; } return null; };
const gpList = box => [...box.querySelectorAll('button:not([disabled])')].filter(b => b.offsetParent !== null && !b.hidden);
function gpFocus(box, dir) { const L = gpList(box); if (!L.length) return; let i = L.indexOf(gpF); i = i < 0 ? (dir > 0 ? 0 : L.length - 1) : (i + dir + L.length) % L.length; if (gpF) gpF.classList.remove('gpf'); gpF = L[i]; gpF.classList.add('gpf'); try { gpF.focus({ preventScroll: false }); gpF.scrollIntoView({ block: 'nearest' }); } catch (e) { } }
function pad() {
  const ps = navigator.getGamepads ? navigator.getGamepads() : null; let gp = null; if (ps) for (const p of ps) if (p && p.connected !== false && p.buttons && p.buttons.length) { gp = p; break; } if (!gp) { gpPrev = []; return; }
  if (!I.pad) { I.pad = true; document.documentElement.classList.add('pad'); if (I.onPad) I.onPad(); }
  const dz = v => Math.abs(v || 0) < .18 ? 0 : v, A = gp.axes || [], lx = dz(A[0]), ly = dz(A[1]), rx = dz(A[2]), ry = dz(A[3]);
  const val = i => gp.buttons[i] ? (typeof gp.buttons[i] === 'object' ? gp.buttons[i].value || (gp.buttons[i].pressed ? 1 : 0) : gp.buttons[i]) : 0, on = i => val(i) > .5, hit = i => on(i) && !gpPrev[i];
  const box = gpBox();
  if (!box) { if (lx || ly) { I.mx = lx; I.my = -ly; } const rt = val(7), lt = val(6); if (rt > .05 || lt > .05) I.my = rt - lt;
    if (on(5) || Math.hypot(lx, ly) > .97) I.run = true; if (on(4)) I.hb = true; I.camX += rx * 13; I.camY += ry * 9; if (gpF) { gpF.classList.remove('gpf'); gpF = null; } }
  const send = c => { if (I.press) I.press(c, { gp: true }); };
  if (box) { const dy = (on(13) || ly > .6 ? 1 : 0) - (on(12) || ly < -.6 ? 1 : 0); if (dy && (gpNav -= 1) <= 0) { gpFocus(box, dy); gpNav = gpNav < -50 ? 8 : 14; } else if (!dy) gpNav = 0;
    if (gpF && !box.contains(gpF)) { gpF.classList.remove('gpf'); gpF = null; }
    if (hit(0)) { if (gpF) gpF.click(); else if (box.id === 'mg' || box.id === 'title') send(box.id === 'title' ? 'Enter' : 'KeyE'); else gpFocus(box, 1); }
    if (hit(1)) send('Escape'); }
  else { if (hit(0)) send('KeyE'); if (hit(2)) send('KeyF'); if (hit(3)) send('KeyV'); if (hit(15)) send('KeyR'); if (hit(11)) send('KeyG'); }
  if (hit(9)) send('KeyT'); if (hit(8)) send('KeyM');
  gpPrev = gp.buttons.map((b, i) => on(i));
}
export const clearKeys = () => keys.clear();
