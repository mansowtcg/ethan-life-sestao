// audio.js: sonidos sintetizados (sin archivos). Se activa con el primer toque.
let ctx = null, master = null, eng = null, engGain = null, muted = false;
try { muted = localStorage.getItem('els_mute') === '1'; } catch (e) { }
export function initAudio() {
  if (ctx) return; try { const AC = window.AudioContext || window.webkitAudioContext; ctx = new AC(); master = ctx.createGain(); master.gain.value = muted ? 0 : .5; master.connect(ctx.destination);
    eng = ctx.createOscillator(); eng.type = 'sawtooth'; eng.frequency.value = 50; const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 420; engGain = ctx.createGain(); engGain.gain.value = 0; eng.connect(f); f.connect(engGain); engGain.connect(master); eng.start(); } catch (e) { ctx = null; }
}
export const isMuted = () => muted;
export function toggleMute() { muted = !muted; try { localStorage.setItem('els_mute', muted ? '1' : '0'); } catch (e) { } if (master) master.gain.value = muted ? 0 : .5; return muted; }
function tone(f, d, type, vol, slide, when) { if (!ctx) return; const t = ctx.currentTime + (when || 0), o = ctx.createOscillator(), g = ctx.createGain(); o.type = type || 'square'; o.frequency.setValueAtTime(f, t); if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, slide), t + d); g.gain.setValueAtTime(vol || .12, t); g.gain.exponentialRampToValueAtTime(.001, t + d); o.connect(g); g.connect(master); o.start(t); o.stop(t + d + .02); }
function noise(d, vol, freq) { if (!ctx) return; const n = Math.floor(ctx.sampleRate * d), b = ctx.createBuffer(1, n, ctx.sampleRate), a = b.getChannelData(0); for (let i = 0; i < n; i++) a[i] = (Math.random() * 2 - 1) * (1 - i / n); const s = ctx.createBufferSource(), g = ctx.createGain(), f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = freq || 900; s.buffer = b; g.gain.value = vol || .3; s.connect(f); f.connect(g); g.connect(master); s.start(); }
export function sfx(n) {
  if (!ctx || muted) return;
  if (n === 'coin') { tone(880, .08, 'square', .1); tone(1320, .14, 'square', .1, 0, .07); }
  else if (n === 'pay') tone(330, .16, 'triangle', .14, 180);
  else if (n === 'ok') { tone(520, .1, 'triangle', .14); tone(780, .16, 'triangle', .14, 0, .09); }
  else if (n === 'bad') tone(180, .3, 'sawtooth', .12, 90);
  else if (n === 'ui') tone(660, .05, 'square', .06);
  else if (n === 'crash') noise(.35, .5, 700);
  else if (n === 'hit') { noise(.08, .3, 2400); tone(900, .06, 'square', .07, 500); }
  else if (n === 'horn') { tone(392, .32, 'square', .09); tone(494, .32, 'square', .09); }
  else if (n === 'door') noise(.12, .35, 300);
  else if (n === 'splash') noise(.7, .5, 500);
  else if (n === 'win') [523, 659, 784, 1047].forEach((f, i) => tone(f, .18, 'triangle', .14, 0, i * .11));
  else if (n === 'tick') tone(1000, .04, 'square', .07);
}
// ---------- ambiente: rumor de ciudad, lluvia y tren como ruido filtrado en bucle
let amb = null;
function loop(type, freq, q) { const n = ctx.sampleRate * 2, b = ctx.createBuffer(1, n, ctx.sampleRate), a = b.getChannelData(0); let last = 0; for (let i = 0; i < n; i++) { const w = Math.random() * 2 - 1; last = (last + .04 * w) / 1.04; a[i] = type === 'brown' ? last * 5 : w; } const s = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain(); s.buffer = b; s.loop = true; f.type = type === 'brown' ? 'lowpass' : 'bandpass'; f.frequency.value = freq; f.Q.value = q || .7; g.gain.value = 0; s.connect(f); f.connect(g); g.connect(master); s.start(); return { g, f }; }
// o: { day 0..1, rain 0..1, train (m al tren más cercano), trainV, inCar, on }
export function ambience(o) {
  if (!ctx) return; if (!amb) { try { amb = { city: loop('brown', 380), rain: loop('white', 5200, .5), train: loop('brown', 160) }; } catch (e) { return; } }
  const t = ctx.currentTime, k = o.on ? (o.inCar ? .55 : 1) : 0; amb.city.g.gain.setTargetAtTime(k * (.05 + o.day * .09), t, .6); amb.rain.g.gain.setTargetAtTime(k * o.rain * .11, t, .8);
  amb.train.g.gain.setTargetAtTime(k * Math.max(0, 1 - o.train / 150) * Math.min(1, .25 + o.trainV / 10) * .5, t, .25);
}
export function amb1(n, o) { // sonidos sueltos del ambiente
  if (!ctx || muted) return;
  if (n === 'step') noise(.05, .1, 1500);
  else if (n === 'bird') { const f = 2400 + Math.random() * 1400; for (let i = 0; i < 3 + Math.floor(Math.random() * 3); i++) tone(f + Math.random() * 500, .07, 'sine', .035, f * 1.25, i * .11); }
  else if (n === 'gull') { for (let i = 0; i < 3; i++) tone(1250 - i * 60, .22, 'sawtooth', .022, 760, i * .3); }
  else if (n === 'trainhorn') { tone(311, .7, 'sawtooth', .06); tone(370, .7, 'sawtooth', .06); }
  else if (n === 'bell') { // campanadas: tantas como la hora, más flojas cuanto más lejos está el campanario
    const k = o && o.n || 3, v = o && o.v !== undefined ? o.v : 1, f = 392; for (let i = 0; i < k; i++) { const w = i * 1.7; tone(f, 2.8, 'sine', .055 * v, 0, w); tone(f * 2, 1.7, 'sine', .026 * v, 0, w); tone(f * 2.4, 1.2, 'sine', .016 * v, 0, w); tone(f * .5, 3.4, 'sine', .03 * v, 0, w); } }
}
export function engine(on, speed, thr) { if (!ctx || !engGain) return; const t = ctx.currentTime; engGain.gain.setTargetAtTime(on ? .05 + Math.abs(thr || 0) * .05 : 0, t, .08); eng.frequency.setTargetAtTime(46 + Math.abs(speed) * 4.2, t, .08); }
