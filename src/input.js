// input.js: teclado, ratón y táctil (palanca a la izquierda, cámara a la derecha)
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
}
export const clearKeys = () => keys.clear();
