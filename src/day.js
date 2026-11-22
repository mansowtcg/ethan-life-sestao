// day.js: la rutina de Ethan. Es el día a día del Tycoon, pero hecho a mano: suena el despertador, se lava (o no) los dientes,
// ficha en el taller, vuelve, busca sitio para aparcar, cena y a dormir. Los sucesos del Tycoon caen en su día y a su hora
// y dejan las mismas mejoras y castigos que allí.
import { G } from './state.js';
import { toast, banner, dialog, closeDialog, setTracker, fade, eur } from './hud.js';
import { SP } from './spots.js';
import { P } from './player.js';
import { sfx } from './audio.js';
import { SKY } from './sky.js';
import { ZONE, fillZone, parkState, freeNear, stealSlot, anyFree, openSlot, findBig, slotAt } from './park.js';
import { money, pass, rank, saveGame, feed } from './life.js';
import { W } from './world.js';
import { GR, routeTo } from './graph.js';

export const RATE = 1 / 3;                                              // minutos de juego por segundo real: una hora son tres minutos
export const T_IN = 480, T_LUNCH = 780, T_BACK = 900, T_OUT = 1080, ALARM = 390, ALARM_WE = 570;      // entra a las 8:00, parón de 13:00 a 15:00, sale a las 18:00; despertador a las 6:30 (9:30 en finde)
export const WDAY = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];
export const wd = S => (S.day - 1) % 7, dom = S => (S.day - 1) % 30 + 1, now = S => S.day * 1440 + S.min, workday = S => wd(S) < 5;
export const hm = m => String(Math.floor(m / 60) % 24).padStart(2, '0') + ':' + String(Math.floor(m % 60)).padStart(2, '0');
const mmss = t => Math.floor(t / 60) + ':' + String(Math.floor(t % 60)).padStart(2, '0');
const home = () => SP.by.home, dHome = (x, z) => { const h = home(); return h ? Math.hypot(h.x - x, h.z - z) : 1e9; };

// ---------- mejoras y castigos temporales (los del Tycoon): all = a todo lo que se gana, work = por hora de taller, regen = lo que se recupera de energía
const KD = { all: 'a todo', work: 'por hora de taller', regen: 'de recuperación' };
export function addBuff(id, n, ic, k, x, hours, quiet) { const S = G.S; S.buffs = (S.buffs || []).filter(b => b.id !== id); S.buffs.push({ id, n, ic, k, x, u: now(S) + hours * 60 }); if (!quiet) toast(n + ': ×' + String(x).replace('.', ',') + ' ' + KD[k] + ' · ' + hours + ' h', ic); }
export const mult = k => { const S = G.S, t = now(S); let m = 1; for (const b of S.buffs || []) if (b.u > t && b.k === k) m *= b.x; return m; };
export const payMult = () => mult('all') * mult('work');
export const buffs = () => { const S = G.S, t = now(S); return (S.buffs || []).filter(b => b.u > t); };
// dinero de premio: el Tycoon lo daba en segundos de ganancias; aquí, en horas de sueldo (300 s = 2 horas y media)
export const cash = (sec, why) => money(Math.round(rank(G.S)[2] * sec / 120 * mult('all')), why);

// ---------- momentos del Tycoon vividos (para el álbum)
export const EVN = { diente: 'Lavarse los dientes', aparcar: 'Encontrar sitio para aparcar', casa: 'Casa sola el finde', fiesta: 'Fiestón con la casa sola', cenita: 'Cenita', tortilla: 'Tortilla de Lourdes sorpresa', patru: 'Patrullazo', jokin: 'Ojito con Jokin', itv: 'Pasar la ITV a la primera', rave: 'Rave en Altos Hornos', alik: 'Kebab caducado gratis de Ali', desamor: 'Desamor de martes', desamor2: 'Desamor de jueves', percance: 'El percance', cable: 'El aita con cable neutro de cinturón', hernandez: 'Directo de Hernández', examen: 'El examen de Hernández', primo: 'Visita del primo', robo: 'Te roban buscando aparcamiento', f2f: 'Face to face' };
export function moment(id) { const S = G.S; S.mom = S.mom || {}; if (S.mom[id] || !EVN[id]) return; S.mom[id] = S.day; toast('Momento del Tycoon: ' + EVN[id] + ' · ' + Object.keys(S.mom).length + ' de ' + Object.keys(EVN).length, '📒'); }
// aviso en el móvil: se ve al momento y queda apuntado en los avisos del día
let silent = false;
export function note(ic, title, text, quiet) { const S = G.S; (S.daily.notes || (S.daily.notes = [])).push([ic, title, text, Math.round(S.min)]); if (!quiet && !silent) { if (G.slow) G.slow(); banner(ic + ' ' + title, text, 4600); sfx('ui'); } }

// ---------- sucesos del Tycoon: día de la semana (0 = lunes) o del mes, hora y probabilidad. m: hay que ir (encargo); si a su hora
// andas liado, se pierde. Los demás llegan solos al móvil. Las probabilidades son más altas que en el Tycoon: aquí se juegan días, no meses.
const EV = [
  { id: 'casa', days: [4], h: 8, p: .8, f: S => { S.casa = S.day + 2; note('🏠', 'Casa sola el finde', 'Los aitas se van al pueblo hasta el domingo.'); addBuff('casa', 'Casa sola', '🏠', 'all', 1.25, 48); }, ko: () => { note('👪', 'Los padres en casa', 'Este finde no se van. Se descansa peor.'); addBuff('padres', 'Los padres en casa', '👪', 'regen', .8, 24); } },
  { id: 'cable', dom: 1, h: 12, p: .6, f: () => { note('🔌', 'El aita con cable neutro de cinturón', 'Aparece con un cable neutro de cinturón. Dice que aguanta más que el cuero.'); addBuff('cable', 'Cinturón de cable neutro', '🔌', 'work', 1.3, 24); } },
  { id: 'examen', dom: 10, h: 10, p: .15, f: () => { note('🎓', 'Milagro en Sestao', 'Hernández aprueba el examen. Lo celebra con un directo y lo ven 3 personas. Récord absoluto.'); addBuff('milagro', 'Milagro en Sestao', '🎓', 'all', 2, 24); }, ko: () => note('🎓', 'El examen de Hernández', 'No ha podido ser. Dice que la próxima va en serio.', true) },
  { id: 'itvd', dom: 15, h: 10, p: 1, nm: 1, f: S => { if (S.itv <= S.day) note('📋', 'Hoy toca la ITV', 'Día 15. Está en el polígono, junto al taller. A ver si pasa a la primera.'); } },
  { id: 'alik', days: [6], h: 14, p: .35, nm: 1, f: S => { S.daily.alik = 1; note('🥙', 'Ali invita', '«Te guardo uno de ayer, jefe. Gratis.» Pásate por el kebab.'); } },
  { id: 'hernandez', days: [0, 2], h: 20, p: .5, f: S => { if ((S.cq || []).indexOf('movil') >= 0) { note('📺', 'Directo de Hernández', 'Con la pantalla hecha añicos no se ve nada. Ni te enteras.', true); return; } const car = G.mode === 'car'; note('📺', 'Directo de Hernández', car ? 'Lo llevas de fondo mientras conduces. Espectadores: 1.' : 'Desde el sofá, con el mando en una mano y los Doritos en la otra. Ethan entra por pena y se queda un rato.'); if (!car) pass(20); addBuff('directo', 'Viendo el directo de Hernández', '📺', 'work', .8, 6); } },
  { id: 'desamor', days: [1], h: 23, p: .2, f: () => { note('💔', 'Desamor', 'Te ha bloqueado. Ethan piensa meter tres horas extra para olvidar.'); addBuff('olvidar', 'Currar para olvidar', '💔', 'work', 1.5, 12); addBuff('roto', 'Corazón roto', '🥀', 'regen', .7, 12, true); } },
  { id: 'desamor2', days: [3], h: 23, p: .2, f: () => { note('💔', 'Otro desamor', 'Ha vuelto con el de antes. Ethan finge que no le importa.'); addBuff('fingir', 'Fingir que no importa', '💔', 'work', 1.5, 12); addBuff('llorando', 'Llorando en el C4', '🥀', 'regen', .7, 12, true); } },
  { id: 'percance', days: [2], h: 22, p: .06, f: () => { note('🙈', 'El percance', 'Le gastan una broma delante de todos. Ethan dice que ya se lo olía. Evento histórico de Sestao.'); addBuff('verguenza', 'Vergüenza histórica', '🙈', 'all', .6, 24); } },
  // los que hay que ir: son propuestas. Se sortean al empezar el día (salen en el despertador y en la agenda) y Ethan decide: apuntarse o pasar
  { id: 'primo', days: [6], h: 12, p: .5, m: 'primo', win: 90, n: 'Visita del primo', ic: '🪪', q: '«Estoy por Sestao. ¿Me llevas al Ekintza?»', y: 'Llevarle al Ekintza', no: 'Hoy no puedo' },
  { id: 'patru', days: [0, 1, 2, 3, 4], h: 18, p: .3, m: 'patru', win: 75, when: S => !!S.daily.out, n: 'Patrullazo', ic: '🛴', q: '«Hoy sale la patrulla patinete. A las 20:00 cerca de tu casa.» Hay que aparcar antes.', y: 'Apuntarse', no: 'Hoy paso' },
  { id: 'tortilla', days: [1, 3], h: 21, p: .45, m: 'tortillaS', win: 30, n: 'Tortilla de Lourdes', ic: '🍳', q: '«He hecho tortilla. Ven a por tu trozo antes de que se enfríe.»', y: 'Ir a por la tortilla', no: 'Otro día' },
  { id: 'cenita', days: [4, 5, 6], h: 21.5, pd: { 4: .95, 5: .99, 6: .5 }, m: 'cenita', win: 30, n: 'Cenita', ic: '🍝', q: 'Los colegas han quedado a cenar.', y: 'Ir a la cenita', no: 'Cenar en casa', ko: () => note('🍝', 'Hoy no hay cenita', 'No ha quedado nadie. Se cena de lo que haya.', true) },
  { id: 'fiesta', days: [5], h: 22, p: .3, m: 'fiesta', win: 30, grp: 'noche', when: S => (S.casa || 0) >= S.day && !S.daily.night, n: 'Fiestón con la casa sola', ic: '🎉', q: 'La casa está sola.', y: 'Montar el fiestón en casa' },
  { id: 'f2f', days: [4, 5], h: 22, p: .5, m: 'f2f', win: 30, grp: 'noche', when: S => !S.daily.night, n: 'Face to face en el GTA', ic: '🎮', q: 'Jokin quiere un face to face.', y: 'Noche de GTA con Jokin' },
  { id: 'rave', days: [5], h: 22, p: .7, m: 'rave', win: 45, grp: 'noche', when: S => !S.daily.night, n: 'Rave en Altos Hornos', ic: '🪩', q: 'Hay rave en el Horno Alto.', y: 'Ir a la rave' }];
const today = (e, S) => !(e.days && e.days.indexOf(wd(S)) < 0) && !(e.dom && dom(S) !== e.dom);
// lo que hoy le van a proponer (se sortea una vez al día)
export function offers(S) { if (!S.daily.offer) { const o = S.daily.offer = {}; for (const e of EV) if (e.m && today(e, S)) o[e.id] = Math.random() < (e.pd ? e.pd[wd(S)] : e.p) ? 1 : 0; } return EV.filter(e => e.m && S.daily.offer[e.id] && !S.daily['e_' + e.id] && (!e.when || e.id === 'patru' || e.when(S))); }
const pl = S => S.daily.plan || (S.daily.plan = {});
// propuesta en el móvil: apuntarse a uno de los planes (los del mismo grupo compiten entre sí) o pasar
function invite(L, S) {
  const one = L.length === 1, e0 = L[0], done = () => L.forEach(e => { S.daily['e_' + e.id] = 1; });
  dialog({ icon: one ? e0.ic : '🌙', title: one ? e0.n : 'Plan de esta noche', text: one ? e0.q + ' Tú decides.' : L.map(e => e.q).join(' ') + ' Tú decides.', noClose: true, options: L.map(e => ({ t: e.y, d: e.n, f: () => { done(); closeDialog(); G.startMission(e.m); } })).concat([{ t: one ? e0.no || 'Pasar' : 'Quedarse en casa', d: 'No pasa nada: otro día', f: () => { done(); closeDialog(); toast(one ? 'Hoy pasas de: ' + e0.n.toLowerCase() + '.' : 'Esta noche, en casa.', '🙅'); } }]) }); sfx('ui');
}
function roll(e, S, asleep) {
  S.daily['e_' + e.id] = 1; const p = e.pd ? e.pd[wd(S)] : e.p;
  if (Math.random() < p) { e.f(S); if (!e.nm) moment(e.id); return true; }
  if (e.ko && !asleep) e.ko(S); return false;
}
function tickEvents(S) {
  const t = S.min; offers(S);
  for (const e of EV) { if (S.daily['e_' + e.id] || !today(e, S)) continue; const t0 = e.h * 60; if (t < t0) continue;
    if (e.m) {
      if (!S.daily.offer[e.id]) { S.daily['e_' + e.id] = 1; if (e.ko) e.ko(S); continue; }           // hoy no ha salido
      if (t > t0 + (e.win || 30) || pl(S)[e.id] === -1) { S.daily['e_' + e.id] = 1; continue; }       // se pasó la hora, o ya dijo que no
      if (e.when && !e.when(S)) continue;
      if (G.mission || G.busy) continue;                                   // liado con otra cosa: espera (y si se pasa la hora, se pierde)
      if (pl(S)[e.id] === 1) { S.daily['e_' + e.id] = 1; G.startMission(e.m); return; }             // ya se había apuntado esta mañana
      const L = e.grp ? EV.filter(q => q.grp === e.grp && today(q, S) && S.daily.offer[q.id] && !S.daily['e_' + q.id] && pl(S)[q.id] !== -1 && (!q.when || q.when(S))) : [e];
      const yes = L.filter(q => pl(S)[q.id] === 1)[0]; if (yes) { L.forEach(q => { S.daily['e_' + q.id] = 1; }); G.startMission(yes.m); return; }
      invite(L, S); return; }
    if (e.when && !e.when(S)) { if (t > t0 + (e.win || 240)) S.daily['e_' + e.id] = 1; continue; }
    roll(e, S); return; }
  // Jokin: como mucho una vez cada dos semanas, a cualquier hora. Este no se elige: te pilla
  if (!S.daily.e_jokin && t >= S.daily.jh && !G.mission && !G.busy && (!workday(S) || S.daily.out || S.daily.falta)) { S.daily.e_jokin = 1; S.ev = S.ev || {}; if (S.day - (S.ev.jokin || -99) >= 14 && Math.random() < .14) { S.ev.jokin = S.day; G.startMission('jokin'); } }
}
// el plan de hoy: lo que le proponen, para decidirlo con tiempo (se abre desde el despertador y desde la agenda del móvil)
export function openPlan(back) {
  const S = G.S, L = offers(S), P = pl(S), lab = { '1': 'Apuntado', '-1': 'Paso', 'undefined': 'Ya veré' };
  dialog({ icon: '🗓️', title: 'Plan de hoy', text: L.length ? 'Esto es lo que te han propuesto para hoy. Toca para cambiar: apuntado, paso o ya veré (te lo preguntan a su hora).' : 'Hoy nadie ha propuesto nada. Día tranquilo: curro, aparcar y a casa.', close: 'Volver', onClose: back,
    options: L.map(e => ({ t: e.ic + ' ' + e.n, d: hm(e.h * 60 + (e.id === 'patru' ? 120 : 0)) + ' · ' + e.q, tag: lab[String(P[e.id])], f: () => { P[e.id] = P[e.id] === 1 ? -1 : P[e.id] === -1 ? undefined : 1; openPlan(back); } })) });
}
// lo que tocaba esta noche y pilla a Ethan dormido: se entera al despertar
function nightEvents(S) { silent = true; for (const e of EV) { if (e.m || S.daily['e_' + e.id] || !today(e, S)) continue; if (e.h * 60 <= S.min) continue; const n0 = (S.daily.notes || []).length; roll(e, S, true); const N = S.daily.notes || []; for (let i = n0; i < N.length; i++) (S.notes || (S.notes = [])).push(N[i]); } silent = false; }

// ---------- dormir y despertar
let sleeping = false;
// late: { bed (minuto del día en que se acuesta, pasada la medianoche), wake, n, ic, x } para las noches largas (rave, GTA, fiestón)
export function goSleep(late, stay) {
  if (sleeping) return; sleeping = true; const S = G.S; closeDialog(); G.busy = true; fade(true); sfx('ui'); S.notes = S.notes || [];
  const night = () => {
    if (late) { let d = late.bed - S.min; if (S.min > 300) d += 1440; if (d > 0) pass(d); } else nightEvents(S);
    const ended = S.min >= 300 ? { w: workday(S), out: !!S.daily.out } : S.yest, a0 = now(S); let day = S.day, m; S.yest = null;
    if (S.min >= 300) day++;                                               // antes de las 5 de la mañana ya es «hoy»
    m = late ? late.wake : (day - 1) % 7 < 5 ? ALARM : ALARM_WE; let slept = day * 1440 + m - a0; if (slept < 60) { day++; slept += 1440; }
    // ayer no fichaste
    if (ended && ended.w && !ended.out) { const fine = Math.min(S.money, 20); S.money -= fine; S.faltas = (S.faltas || 0) + 1; S.notes.push(['🔧', 'Falta en el taller', 'Ayer no fichaste. Manolo te descuenta ' + eur(fine) + ' y lo apunta (van ' + S.faltas + ').']); }
    // el coche, de noche
    const pk = S.park; if (pk && pk.k === 'bad' && G.car) { const r = Math.random();
      if (r < .3 && SP.by.itv) { const fee = Math.min(S.money, 120), it = SP.by.itv, sy = Math.sin(it.yaw), cy = Math.cos(it.yaw); S.money -= fee; G.car.place(it.x + cy * 9 + sy * 4, it.z - sy * 9 + cy * 4, it.yaw); S.park = { k: 'ok' }; S.notes.push(['🚛', 'Se lo ha llevado la grúa', 'Estaba ' + pk.why + '. El coche está en el depósito del polígono, junto a la ITV. La broma: ' + eur(fee) + '.']); }
      else if (r < .82) { const fine = Math.min(S.money, 60); S.money -= fine; S.notes.push(['🧾', 'Multa en el parabrisas', 'Por dejarlo ' + pk.why + ': ' + eur(fine) + '.']); } }
    pass(slept); S.min = m; S.daily.up = 1; feed(-18, Math.min(8.5, slept / 60) * 13); S.sarro = (S.sarro || 0) + 1; if (late) addBuff(late.id, late.n, late.ic, 'regen', late.x, 8, true);
    const h = stay ? null : home(); if (h) { if (G.mode === 'car') G.leaveCar(true); P.x = h.x; P.z = h.z; P.yaw = h.yaw + Math.PI / 2; G.px = P.x; G.pz = P.z; G.cam.yaw = P.yaw + Math.PI; }
    fade(false); G.busy = false; sleeping = false; lastK = ''; saveGame(); morning(late);
  };
  if (G.sync) night(); else setTimeout(night, 900);                       /* G.sync: las pruebas no esperan al fundido */
}
export function morning(late, kept) {
  const S = G.S, N = kept || S.notes || [], W = workday(S), lines = []; S.notes = [];
  lines.push(late ? late.n + '.' : W ? 'Suena el despertador. Hoy se curra: entras a las 8:00.' : wd(S) === 5 ? 'Sábado. Hoy no se ficha.' : 'Domingo. Ni se ficha ni se madruga.');
  lines.push('Tiempo: ' + SKY.label.toLowerCase() + '.'); if (S.itv <= S.day) lines.push('Tienes la ITV pendiente.'); if (S.fuel < 20) lines.push('El coche va en reserva.');
  N.forEach(n => lines.push(n[0] + ' ' + n[1] + ': ' + n[2]));
  const OF = offers(S), car = G.car, far = car && S.park && S.park.k === 'ok' ? Math.round(dHome(car.x, car.z)) : 0;
  if (OF.length) lines.push('Hoy te proponen: ' + OF.map(e => e.n.toLowerCase() + ' (' + hm(e.h * 60 + (e.id === 'patru' ? 120 : 0)) + ')').join(', ') + '.');
  if (far > 150) lines.push('El coche está ' + (S.park.big ? 'en el parking grande' : 'aparcado') + ' a ' + far + ' m.');
  const re = () => morning(late, N), done = S.daily.teeth;
  dialog({ icon: '⏰', title: WDAY[wd(S)] + ' ' + dom(S) + ' · ' + hm(S.min), text: lines.join(' '), close: 'Salir a la calle', onClose: () => { if (!S.daily.teeth) { S.daily.teeth = -1; addBuff('sarro', 'Aliento de sarro', '🦷', 'work', .8, 12); } },
    options: [
      { t: 'Lavarse los dientes', d: S.tooth ? 'Aliento fresco: ×1,5 a todo durante 24 h' : 'No tienes cepillo. En el súper los venden', tag: '10 min', dis: !S.tooth || !!done, f: () => { S.daily.teeth = 1; pass(10); S.sarro = 0; addBuff('fresco', 'Aliento fresco', '🪥', 'all', 1.5, 24); S.buffs = S.buffs.filter(b => b.id !== 'sarro'); moment('diente'); sfx('ok'); re(); } },
      { t: 'Desayunar', d: 'Colacao y lo que haya por casa', tag: '10 min', dis: !!S.daily.bf, f: () => { S.daily.bf = 1; pass(10); feed(28, 4); toast('Desayuno de campeones.', '🥛'); re(); } },
      { t: 'Plan de hoy', d: OF.length ? 'Decide ya a qué te apuntas y de qué pasas' : 'Hoy no hay nada propuesto', tag: OF.length ? String(OF.length) : '', dis: !OF.length, f: () => openPlan(re) }]
      .concat(far > 150 ? [{ t: 'Bajar hasta el coche', d: 'Te ahorras jugar el paseo', tag: '+' + Math.max(3, Math.round(far / 70)) + ' min', f: () => { closeDialog(); pass(Math.max(3, Math.round(far / 70))); P.x = car.x + Math.cos(car.yaw) * 2; P.z = car.z - Math.sin(car.yaw) * 2; G.px = P.x; G.pz = P.z; } }] : []) });
}

// ---------- aparcar al volver a casa: el minijuego de todos los días. La zona de casa está llena; cada cierto tiempo se va un coche
// y hay que llegar al hueco antes que otro. Algún día hay suerte y queda uno libre. Si no hay manera, al parking grande
const PS = { t: 0, day: -1, luck: false, opens: 0, fails: 0, cur: null, curT: 0, next: 0, rob: false, on: false }; let evT = 0, lastK = '', auto = false;
export const searching = () => PS.on, parkDbg = () => PS;
export const bigPark = () => { const h = home(); if (!h) return null; if (!ZONE.big || ZONE.bigFor !== h) { ZONE.big = findBig(h.x, h.z); ZONE.bigFor = h; } return ZONE.big; };
const inBig = (x, z) => { const b = bigPark(); return !!b && Math.hypot(b.x - x, b.z - z) < b.r; };
const inZone = (x, z) => dHome(x, z) < ZONE.R + 8;
// ¿está el coche donde tiene que estar? (en una plaza de la zona de casa o del parking grande, y sin haberlo movido después)
export const carOK = () => { const S = G.S, c = G.car, p = S && S.park; if (!c || !S) return true; const B = W.map.bbox; if (c.x < B[0] || c.x > B[2] || c.z < B[1] || c.z > B[3]) return true; return !!p && p.k === 'ok' && (p.x === undefined || Math.hypot(p.x - c.x, p.z - c.z) < 1.6); };
function zoneFill(S) {
  const h = home(), car = G.car; if (!h || !car || ZONE.day === S.day || S.min < 900) return; if (dHome(car.x, car.z) < 420 || dHome(G.px, G.pz) < 400) return;
  PS.luck = Math.random() < .18; fillZone(h.x, h.z, 200, PS.luck ? 1 : 0, S.day * 7919 + 13, PS.luck); ZONE.day = S.day; PS.day = S.day; PS.t = 0; PS.opens = PS.fails = 0; PS.cur = null; PS.next = 55 + Math.random() * 40; PS.rob = false;
}
const stName = s => { const r = W.map.roads[s.ri]; return (r && r.n) || 'tu zona'; };
function parkTick(S, dt) {
  const car = G.car, was = PS.on; PS.on = !!car && ZONE.day === S.day && S.daily.pk !== 'ok' && G.mode === 'car' && dHome(car.x, car.z) <= ZONE.R + (PS.cur ? Math.max(170, (PS.reach || 0) - ZONE.R + 40) : 25);      /* con un hueco a la vista, la cuenta sigue aunque el camino (el que marca el GPS) salga un rato de la zona */
  // sacó el coche de su plaza: vuelve a estar sin aparcar (y si se va del barrio, alguien se queda el hueco)
  if (car && G.mode === 'car' && S.park && S.park.k === 'ok' && S.park.x !== undefined && Math.hypot(S.park.x - car.x, S.park.z - car.z) > 7) { const o = S.park; S.park = { k: 'moved' }; if (S.daily.pk === 'ok') S.daily.pk = undefined; PS.old = o.big ? null : o; PS.next = Math.max(PS.next, PS.t + 45); }
  if (PS.old && car && dHome(car.x, car.z) > ZONE.R + 60) { const sl = slotAt(PS.old.x, PS.old.z); if (sl && ZONE.day === S.day) stealSlot(sl); PS.old = null; }
  if (!PS.on) { if (was) { G.pdots = null; if (PS.cur && S.daily.pk !== 'ok' && G.mode === 'car') { stealSlot(PS.cur); PS.cur = null; PS.fails++; } } return false; }
  if (!was && PS.told !== S.day) { PS.told = S.day; toast('Tu zona es lo de dentro de la cortina verde. Valla roja: plaza ocupada. Valla verde con haz de luz: hueco libre.', '🅿️'); }
  PS.t += dt; const near = freeNear(car.x, car.z, 85); G.pdots = PS.cur && near.indexOf(PS.cur) < 0 ? near.concat([PS.cur]) : near;
  if (PS.cur) { const d = Math.hypot(PS.cur.x - car.x, PS.cur.z - car.z); PS.curT -= dt;
    if (PS.curT <= 0 && d > 16) { stealSlot(PS.cur); PS.cur = null; PS.fails++; PS.next = PS.t + 30 + Math.random() * 30; lastK = ''; toast(say3(['Llegó otro antes. Hueco perdido.', 'Te lo han quitado delante de las narices.', 'Uno con un Ibiza se te ha adelantado.']), '😤'); sfx('horn'); } }
  else if (PS.t >= PS.next && PS.opens < 6) { const sl = openSlot(car.x, car.z, 50, 190); PS.next = PS.t + 25;
    if (sl) { const d = Math.hypot(sl.x - car.x, sl.z - car.z); PS.cur = sl; PS.opens++; const rt = routeTo(car.x, car.z, sl.x, sl.z, false); let L = d * 1.4; PS.reach = 0; if (rt && rt.nodes && rt.nodes.length > 1) { L = 0; for (let k = 1; k < rt.nodes.length; k++) { L += Math.hypot(GR.x[rt.nodes[k]] - GR.x[rt.nodes[k - 1]], GR.z[rt.nodes[k]] - GR.z[rt.nodes[k - 1]]); PS.reach = Math.max(PS.reach, dHome(GR.x[rt.nodes[k]], GR.z[rt.nodes[k]])); } L = Math.max(L, d); }
      PS.curT = Math.min(100, 20 + Math.random() * 10 + L / 5.5);      /* tiempo para llegar por donde manda el GPS: justo, pero se llega si no te equivocas de calle */ lastK = ''; toast('¡Se va uno! Hueco en ' + stName(sl) + ', a ' + Math.round(d) + ' m. Corre, que vuela.', '🅿️'); sfx('ok'); } }
  if (!PS.rob && PS.t > 150) { PS.rob = true; S.ev = S.ev || {}; if (S.day - (S.ev.robo || -99) >= 14 && S.money >= 20 && !G.mission && Math.random() < .2) { S.ev.robo = S.day; G.startMission('robo'); } }
  return true;
}
const say3 = L => L[Math.floor(Math.random() * L.length)];
// al bajarse del coche: ¿cómo ha quedado?
export function onLeaveCar() {
  const S = G.S, car = G.car; if (!S || !car) return; const B = W.map.bbox; if (car.x < B[0] || car.x > B[2] || car.z < B[1] || car.z > B[3]) { S.park = { k: 'out' }; return; }
  const st = parkState(car), zone = inZone(car.x, car.z), big = inBig(car.x, car.z), full = ZONE.day === S.day;
  if (st.k !== 'ok') { S.park = { k: 'bad', why: st.why || 'fuera de sitio' }; if (S.daily.pk === 'ok') S.daily.pk = undefined; if (full || S.min > 1080) { S.daily.pk = 'bad'; toast('Mal aparcado: ' + S.park.why + '. Así no se sube a casa.', '🚧'); sfx('bad'); } else if (st.k === 'bad') toast('Has dejado el coche ' + st.why + '.', '🚧'); return; }
  if (!zone && !big) { S.park = { k: 'far', x: car.x, z: car.z }; if (full || S.min > 1080) { S.daily.pk = 'far'; toast('Plaza buena, pero esto no es tu zona. Ethan aparca cerca de casa o en el parking grande.', '🅿️'); } return; }
  const wasOk = S.daily.pk === 'ok'; S.park = { k: 'ok', x: car.x, z: car.z, big: big ? 1 : 0 }; S.daily.pk = 'ok'; G.pdots = null; if (PS.cur) { if (st.slot !== PS.cur) stealSlot(PS.cur); PS.cur = null; } PS.on = false; lastK = '';
  if (wasOk || !full) { saveGame(); return; }
  const t = PS.t, h = home(), d = Math.round(dHome(car.x, car.z));
  if (S.park.big) { addBuff('parking', 'Coche en el parking grande', '🅿️', 'regen', .9, 14, true); sfx('ok'); const mins = Math.max(4, Math.round(d / 70)), en = Math.min(18, Math.round(d / 45));
    dialog({ icon: '🅿️', title: 'Parking grande', text: 'Ethan no quería, pero le ha tocado. ' + (t > 20 ? 'Vueltas por la zona: ' + mmss(t) + '. ' : '') + 'Casa queda a ' + d + ' m.', close: 'Ir andando', options: [{ t: 'Atajar hasta el portal', d: 'Lo andas sin jugarlo', tag: '+' + mins + ' min · −' + en + ' %', f: () => { closeDialog(); pass(mins); S.energy = Math.max(3, S.energy - en); if (h) { P.x = h.x; P.z = h.z; P.yaw = h.yaw + Math.PI / 2; G.px = P.x; G.pz = P.z; } } }] }); }
  else if (PS.luck && t < 70) { S.energy = Math.min(100, S.energy + 25); banner('¡Sitio a la primera!', 'Hueco libre cerca del portal. Esto no pasa casi nunca.', 3800); cash(300, 'sitio a la primera'); moment('aparcar'); sfx('win'); }
  else { const loss = Math.min(30, Math.round(t / 9)); S.energy = Math.max(3, S.energy - loss); banner('Aparcado en tu zona', 'Vueltas a la manzana: ' + mmss(t) + (PS.fails ? ' · huecos perdidos: ' + PS.fails : '') + '. Energía −' + loss + ' %.', 4200); if (PS.opens) moment('aparcar'); sfx('ok'); }
  saveGame();
}
const W_in = car => { const B = W.map.bbox; return car.x > B[0] && car.x < B[2] && car.z > B[1] && car.z < B[3]; };
// deja el coche en una plaza libre cerca de casa (cuando lo trae un colega)
export function carHome() { const h = home(), car = G.car; if (!h || !car) return; const s = anyFree(h.x, h.z, 320); if (s) { car.place(s.x, s.z, s.yaw); G.S.park = { k: 'ok', x: s.x, z: s.z }; G.S.daily.pk = 'ok'; } }

// ---------- la agenda: qué toca ahora
function objective(S) {
  const h = home(), tl = SP.by.taller, m = S.min, W = workday(S), car = G.car;
  if (W && !S.daily.out && !S.daily.falta) {
    if (S.daily.in) return { k: 'shift', ic: '🔧', t: 'Te queda turno: vuelve al taller', d: tl };
    if (m < T_LUNCH + 150) return { k: 'work', ic: '🔧', t: m <= T_IN ? 'Al taller: entras a las 8:00 · quedan ' + Math.ceil(T_IN - m) + ' min' : 'Llegas ' + Math.floor(m - T_IN) + ' min tarde al taller', d: tl };
    S.daily.falta = 1; toast('Hoy ya no llegas al taller. Falta.', '🔧');
  }
  if (car && h && ZONE.day === S.day && S.daily.pk !== 'ok') { const cd = dHome(car.x, car.z), bp = bigPark(), carD = { x: car.x, z: car.z, n: 'Mi coche', icon: '🚗' }, bigD = bp && { x: bp.x, z: bp.z, n: 'Parking grande', icon: '🅿️', in: 1 };
    if (G.mode === 'car' && (cd < ZONE.R + 25 || PS.cur)) {
      if (PS.cur) return { k: 'parkS' + PS.opens, ic: '🅿️', t: 'Hueco en ' + stName(PS.cur) + ' · ' + Math.round(Math.hypot(PS.cur.x - car.x, PS.cur.z - car.z)) + ' m · te lo quitan en ' + mmss(Math.max(0, PS.curT)), d: { x: PS.cur.x, z: PS.cur.z, n: 'Hueco libre', icon: '🅿️' } };
      if (PS.fails >= 3 || PS.t > 260 || PS.opens >= 6) return { k: 'parkB', ic: '🅿️', t: 'No hay manera (' + mmss(PS.t) + ' dando vueltas). Al parking grande, o sigue probando', d: bigD };
      return { k: 'park', ic: '🅿️', t: 'Tu zona (cortina verde) está llena: da vueltas hasta que se vaya alguien · ' + mmss(PS.t) + (PS.luck ? ' · hoy huele a hueco libre' : '') }; }
    if (G.mode === 'car' && bp && Math.hypot(bp.x - car.x, bp.z - car.z) < bp.r + 120) return { k: 'parkG', ic: '🅿️', t: 'Parking grande (cortina azul): deja el coche en una plaza verde' };
    if (G.mode === 'car') return PS.fails >= 3 || PS.t > 260 || PS.opens >= 6 ? { k: 'toBig', ic: '🅿️', t: 'Al parking grande: allí siempre hay sitio', d: bigD } : { k: 'home', ic: '🏠', t: 'Vuelve a tu zona (la cortina verde) y busca sitio para aparcar', d: h };
    return { k: 'car', ic: '🚗', t: S.daily.pk === 'bad' ? 'El coche está mal aparcado: llévalo a tu zona o al parking grande' : S.daily.pk === 'far' ? 'El coche está fuera de tu zona: llévalo cerca de casa o al parking grande' : 'Falta aparcar: el coche, a tu zona o al parking grande', d: carD }; }
  if (car && h && !carOK() && (m > 1140 || m < 300) && G.mode !== 'car') return { k: 'car2', ic: '🚗', t: 'Antes de subir a casa hay que aparcar bien el coche', d: { x: car.x, z: car.z, n: 'Mi coche', icon: '🚗' } };
  if (m > 1350 || m < 300 || S.energy < 18) return { k: 'bed', ic: '😴', t: W || wd(S) === 6 ? 'A dormir, que mañana se curra' : 'A dormir', d: h };
  if (S.hunger < 25) return { k: 'eat', ic: '🥙', t: 'Come algo. El kebab de Ali no se come solo', d: SP.by.kebab };
  if (W && S.daily.out) return { k: 'free', ic: '🕒', t: m < 1260 ? 'Tarde libre. A las 21:00 es hora de cenar' : 'Hora de cenar y recogerse' };
  return { k: 'free', ic: '🕒', t: W ? 'Tarde libre' : 'Día libre: haz recados, pasa por el Ekintza o echa horas extra' };
}
export function tickDay(dt) {
  const S = G.S; if (!S) return; S.ev = S.ev || {};
  const wn = Math.floor((S.day - 1) / 7); if (!S.week || S.week.n !== wn) S.week = { n: wn, patru: Math.floor(Math.random() * 5) };
  if (S.daily.jh === undefined) S.daily.jh = 660 + Math.floor(Math.random() * 600);
  if ((evT -= dt) < 0) { evT = 1; const t = now(S), B = S.buffs || []; for (let i = B.length - 1; i >= 0; i--) if (B[i].u <= t) { toast('Se acabó: ' + B[i].n, B[i].ic); B.splice(i, 1); } if (!S.noEv) tickEvents(S); if (S.noEv !== 1) zoneFill(S); }      /* noEv: solo en las pruebas automáticas (1 = ni sucesos ni barrio lleno, 2 = sin sucesos) */
  parkTick(S, dt); { const need = ZONE.day === S.day && S.daily.pk !== 'ok' && !!G.car; G.pzone = need ? ZONE : null; G.pbig = need ? bigPark() : null; }
  if (!G.mission) { const o = objective(S); setTracker(WDAY[wd(S)] + ' ' + dom(S), o.ic + ' ' + o.t);
    if (o.k !== lastK) { lastK = o.k; if (o.d) { G.setDest({ x: o.d.x, z: o.d.z, n: o.d.n, icon: o.d.icon }); auto = true; } else if (auto) { G.setDest(null); auto = false; } } }
}
export const resetDay = () => { lastK = ''; auto = false; PS.t = 0; ZONE.day = -1; };

// lo que se ve en el móvil: plan del día, mejoras activas y avisos
export function openAgenda(back) {
  const S = G.S, W = workday(S), t = now(S), L = [];
  L.push(W ? (S.daily.out ? 'Turno hecho.' : S.daily.in ? 'Fichado a las ' + hm(S.daily.in) + '.' : 'Taller de 8:00 a 18:00, con parón de 13:00 a 15:00.') : 'Hoy no se ficha.');
  const OF = offers(S); L.push(OF.length ? 'Te han propuesto ' + OF.length + (OF.length === 1 ? ' plan' : ' planes') + ' para hoy.' : 'Hoy nadie ha propuesto nada.'); const bp = bigPark(), ck = S.park && S.park.k;
  L.push('Coche: ' + (ck === 'ok' ? (S.park.big ? 'en el parking grande.' : 'aparcado en tu zona.') : ck === 'bad' ? 'mal aparcado (' + S.park.why + ').' : ck === 'far' ? 'aparcado fuera de tu zona.' : 'sin aparcar.') + (bp ? ' El parking grande queda a ' + Math.round(dHome(bp.x, bp.z)) + ' m de casa.' : ''));
  L.push('ITV: ' + (S.itv <= S.day ? 'te toca ya.' : 'el día 15 (faltan ' + (S.itv - S.day) + ' días).'));
  const B = buffs().map(b => ({ t: b.ic + ' ' + b.n, d: '×' + String(b.x).replace('.', ',') + ' ' + KD[b.k], tag: Math.max(1, Math.ceil((b.u - t) / 60)) + ' h', dis: true, f: () => { } }));
  const N = (S.daily.notes || []).slice(-4).reverse().map(n => ({ t: n[0] + ' ' + n[1], d: n[2], tag: hm(n[3] || 0), dis: true, f: () => { } }));
  dialog({ icon: '🗓️', title: WDAY[wd(S)] + ' ' + dom(S) + ' · ' + hm(S.min), text: L.join(' ') + ' Momentos del Tycoon vividos: ' + Object.keys(S.mom || {}).length + ' de ' + Object.keys(EVN).length + '.', close: back ? 'Volver' : 'Cerrar', onClose: back || null, options: [{ t: '🗓️ Plan de hoy', d: OF.length ? 'A qué te apuntas y de qué pasas' : 'Nada propuesto', tag: OF.length ? String(OF.length) : '', dis: !OF.length, f: () => openPlan(() => openAgenda(back)) }].concat(bp ? [{ t: '🅿️ GPS al parking grande', d: 'Donde acaba el coche cuando no hay sitio en tu zona', f: () => { closeDialog(); G.setDest({ x: bp.x, z: bp.z, n: 'Parking grande', icon: '🅿️', in: 1 }); } }] : [], B, N) });
}
