// sky.js: cielo, luz del día, tiempo (nubes y sirimiri) y lluvia
import * as THREE from 'three';
import { G } from './state.js';
import { W, setNight } from './world.js';
import { clamp } from './util.js';

// hora, cénit, horizonte, color del sol, fuerza del sol, luz ambiente, noche (0..1)
const KEY = [[0, 0x040813, 0x0f1a2e, 0x8fa6d8, .5, .78, 1], [5.6, 0x040813, 0x0f1a2e, 0x8fa6d8, .5, .78, 1], [7, 0x4a6aa8, 0xf0b890, 0xffc890, 1.7, 1.45, .3], [8.6, 0x4387cf, 0xb7d6ee, 0xfff0d8, 2.7, 1.95, 0], [18.2, 0x4387cf, 0xb7d6ee, 0xfff0d8, 2.7, 1.95, 0], [20, 0x3f4f92, 0xf0a070, 0xffb070, 1.7, 1.4, .35], [21.4, 0x040813, 0x0f1a2e, 0x8fa6d8, .5, .78, 1], [24, 0x040813, 0x0f1a2e, 0x8fa6d8, .5, .78, 1]];
export const SKY = { cover: .3, rain: 0, mist: 0, wind: [1.5, .6], dome: null, drops: null, label: '' };
let sun, hemi, scene, camera, U, rainGeo, rainPos, rainRel, nDrops = 0, fogBase = [200, 800], wxT = 0, tgtCover = .3, tgtRain = 0, time = 0;
const ca = new THREE.Color(), cb = new THREE.Color(), top = new THREE.Color(), hor = new THREE.Color(), sc = new THREE.Color();

const VERT = 'varying vec3 vDir; void main(){ vDir = position; vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0); gl_Position = p.xyww; }';
const FRAG = `
uniform vec3 uTop, uHor, uSun, uSunCol, uHill, uPos; uniform float uNight, uCover, uTime, uRain;
varying vec3 vDir;
float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float vn(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f); return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y); }
float fbm(vec2 p){ float a = 0.5, s = 0.0; for (int i = 0; i < OCT; i++) { s += a * vn(p); p = p * 2.03 + 7.1; a *= 0.5; } return s; }
void main(){
  vec3 d = normalize(vDir); float y = d.y;
  vec3 c = mix(uHor, uTop, pow(clamp(y, 0.0, 1.0), 0.5));
  float sd = max(dot(d, uSun), 0.0);
  c += uSunCol * (smoothstep(0.9990, 0.9995, sd) * 1.4 + pow(sd, 48.0) * 0.2) * (1.0 - uCover * 0.85);
  if (uNight > 0.05 && y > 0.0) { vec2 g = d.xz / (y + 0.35) * 170.0; float h = hash(floor(g)); float st = step(0.986, h) * smoothstep(0.22, 0.02, length(fract(g) - 0.5)); c += vec3(st) * uNight * (1.0 - uCover) * (0.6 + 0.4 * sin(uTime * 1.7 + h * 60.0)) * (0.5 + fract(h * 37.0)); }
  if (y > -0.02) { vec2 q = d.xz / (y + 0.14) * 1.5 + vec2(uTime * 0.007, uTime * 0.003); float n = fbm(q); float th = 1.0 - uCover * 0.92; float dens = smoothstep(th - 0.3, th + 0.1, n + 0.22); vec3 cc = mix(vec3(1.0), uHor, 0.3) * (1.0 - uRain * 0.42) * (1.0 - uNight * 0.86) * (1.0 - dens * uCover * 0.25); c = mix(c, cc, dens * smoothstep(-0.02, 0.1, y) * 0.94); }
  float a = atan(d.x, d.z); float hl = 0.034 + 0.02 * sin(a * 3.0 + 1.3) + 0.013 * sin(a * 7.0 + 0.4) + 0.006 * sin(a * 17.0 + 2.0);
  // el Serantes (451 m), la pirámide de Santurtzi al noroeste: su silueta depende de desde dónde se mire
  vec2 sp = vec2(-4750.0, -2800.0) - uPos.xz; float sdist = length(sp), da = mod(a - atan(sp.x, sp.y) + 3.14159, 6.28318) - 3.14159, sw = 1350.0 / sdist, hs = (451.0 - uPos.y) / sdist;
  float hp = hs * pow(max(0.0, 1.0 - abs(da) / sw), 1.15) + 0.004 * smoothstep(sw * 0.06, 0.0, abs(da)); hl = max(hl * (0.75 + 0.25 * smoothstep(0.2, 1.2, abs(da))), hp);
  c = mix(c, mix(uHill, uHor, 0.5 + uRain * 0.3), smoothstep(hl + 0.003, hl - 0.003, y));
  // «si el Serantes tiene txapela, llueve»: nube agarrada a la cima cuando el tiempo se pone feo
  float tx = smoothstep(0.55, 0.85, uCover + uRain * 0.4) * smoothstep(sw * 0.55, sw * 0.1, abs(da)) * smoothstep(hs * 0.62, hs * 0.85, y) * smoothstep(hs * 1.22, hs * 1.02, y);
  c = mix(c, mix(vec3(0.93), uHor, 0.35) * (1.0 - uNight * 0.85), tx * 0.92);
  c = mix(c, uHor, smoothstep(0.004, -0.012, y));
  gl_FragColor = vec4(c, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

export function initSky(sc0, cam, sunL, hemiL, q) {
  scene = sc0; camera = cam; sun = sunL; hemi = hemiL;
  U = { uTop: { value: new THREE.Color() }, uHor: { value: new THREE.Color() }, uSun: { value: new THREE.Vector3(0, 1, 0) }, uSunCol: { value: new THREE.Color() }, uHill: { value: new THREE.Color() }, uNight: { value: 0 }, uCover: { value: .3 }, uTime: { value: 0 }, uRain: { value: 0 }, uPos: { value: new THREE.Vector3() } };
  const m = new THREE.ShaderMaterial({ uniforms: U, vertexShader: VERT, fragmentShader: FRAG, defines: { OCT: q === 1 ? 3 : 4 }, side: THREE.BackSide, depthWrite: false, fog: false });
  const dome = SKY.dome = new THREE.Mesh(new THREE.SphereGeometry(1, 28, 14), m); dome.frustumCulled = false; dome.renderOrder = -10; dome.scale.setScalar(300); scene.add(dome);
  // lluvia: rayitas que caen alrededor de la cámara
  nDrops = q === 1 ? 320 : q === 2 ? 620 : 950; rainPos = new Float32Array(nDrops * 6); rainRel = new Float32Array(nDrops * 3); for (let i = 0; i < nDrops; i++) { rainRel[i * 3] = (Math.random() - .5) * 46; rainRel[i * 3 + 1] = Math.random() * 20; rainRel[i * 3 + 2] = (Math.random() - .5) * 46; }
  rainGeo = new THREE.BufferGeometry(); rainGeo.setAttribute('position', new THREE.BufferAttribute(rainPos, 3).setUsage(THREE.DynamicDrawUsage)); const drops = SKY.drops = new THREE.LineSegments(rainGeo, new THREE.LineBasicMaterial({ color: 0xcfd9e2, transparent: true, opacity: .34, depthWrite: false })); drops.frustumCulled = false; drops.visible = false; scene.add(drops);
}
export function setFogBase(near, far) { fogBase = [near, far]; }
// tiempo de cada tramo del día: sale del día y la hora, así al volver a entrar hace lo mismo
function weatherAt(day, hour) { const k = day * 8 + Math.floor(hour / 3), h = n => { const x = Math.sin(k * 12.9898 + n * 78.233) * 43758.5453; return x - Math.floor(x); }, cover = clamp(.12 + h(1) * 1.0, 0, 1), rain = cover > .55 && h(2) < .4 ? .45 + h(3) * .55 : 0; return [cover, rain]; }
export function updateSky(dt, force) {
  const S = G.S, hF = ((S ? S.min / 60 : 8) % 24 + 24) % 24; time += dt; U.uTime.value = time;
  // el tiempo cambia despacio hacia el del tramo actual
  if ((wxT -= dt) < 0 || force) { wxT = 2; const w = weatherAt(S ? S.day : 1, hF); tgtCover = w[0]; tgtRain = w[1]; if (force) { SKY.cover = tgtCover; SKY.rain = tgtRain; } }
  const kk = 1 - Math.exp(-dt * .12); SKY.cover += (tgtCover - SKY.cover) * kk; SKY.rain += (tgtRain - SKY.rain) * kk; if (SKY.rain < .02 && tgtRain === 0) SKY.rain = 0;
  let k = 0; while (k < KEY.length - 2 && hF >= KEY[k + 1][0]) k++; const a = KEY[k], b = KEY[k + 1], f = clamp((hF - a[0]) / (b[0] - a[0] || 1), 0, 1), L = i => a[i] + (b[i] - a[i]) * f, cov = SKY.cover, rn = SKY.rain, night = L(6);
  top.setHex(a[1]).lerp(cb.setHex(b[1]), f); hor.setHex(a[2]).lerp(cb.setHex(b[2]), f); sc.setHex(a[3]).lerp(cb.setHex(b[3]), f);
  // nublado: el cielo se agrisa y el sol aprieta menos
  const grey = ca.setHex(0x9aa3ab).multiplyScalar(1 - night * .88); top.lerp(grey, cov * .55 + rn * .25); hor.lerp(grey, cov * .35 + rn * .35);
  // bruma de la ría: algunas mañanas (de 6 a 11, con poco viento) el valle amanece tapado y se levanta poco a poco
  { const d = S ? S.day : 1, hm = Math.sin(d * 91.7) * 43758.5453, on = (hm - Math.floor(hm)) < .28 && rn < .3, k = on ? clamp((11 - hF) / 2.5, 0, 1) * clamp((hF - 5.5) / .5, 0, 1) : 0; SKY.mist += (k - SKY.mist) * Math.min(1, (dt || 1) * .3); }
  if (SKY.mist > .02) hor.lerp(ca.setHex(0xd3d8db).multiplyScalar(1 - night * .8), SKY.mist * .75);
  U.uPos.value.copy(camera.position); U.uTop.value.copy(top); U.uHor.value.copy(hor); U.uSunCol.value.copy(sc).multiplyScalar(night > .9 ? .8 : 1.2); U.uNight.value = night; U.uCover.value = cov; U.uRain.value = rn; U.uHill.value.setHex(0x3f5f52).multiplyScalar(1 - night * .9);
  scene.fog.color.copy(hor); if (scene.background && scene.background.isColor) scene.background.copy(hor); scene.fog.near = fogBase[0] * (1 - rn * .45) * (1 - SKY.mist * .85); scene.fog.far = fogBase[1] * (1 - rn * .38 - cov * .08) * (1 - SKY.mist * .72);
  sun.color.copy(sc); sun.intensity = L(4) * (1 - cov * .5 - rn * .2); hemi.intensity = L(5) * (1 + cov * .12 - rn * .08); hemi.color.copy(hor).lerp(cb.setHex(0xffffff), .35); G.night = night; setNight(night);
  const day = clamp((hF - 6) / 15.5, 0, 1), az = night > .9 ? 2.2 : .5 + day * 2.1, el = night > .9 ? .95 : .3 + .8 * Math.sin(Math.PI * day), ce = Math.cos(el), tx = G.px || 0, tz = G.pz || 0;
  const ty = G.py || 0; sun.position.set(tx + Math.cos(az) * ce * 150, ty + Math.sin(el) * 150, tz + Math.sin(az) * ce * 150); sun.target.position.set(tx, ty, tz); U.uSun.value.set(Math.cos(az) * ce, Math.sin(el), Math.sin(az) * ce);
  // suelo mojado
  const wet = 1 - rn * .22; ['g_road', 'g_walk', 'g_path', 'g_lot', 'g_plaza', 'g_base', 'g_land'].forEach(n => { const m = W.mats[n]; if (m) m.color.setScalar(wet); });
  SKY.label = rn > .3 ? 'Sirimiri' : SKY.mist > .45 ? 'Bruma en la ría' : cov > .7 ? 'Nublado' : cov > .35 ? 'Nubes y claros' : 'Despejado';
}
// cada fotograma: la cúpula sigue a la cámara y la lluvia cae
export function tickSky(dt) {
  const d = SKY.dome; if (!d) return; d.position.copy(camera.position); d.scale.setScalar(camera.far * .95);
  const on = SKY.rain > .05, dr = SKY.drops; dr.visible = on; if (!on) return; dr.material.opacity = .12 + SKY.rain * .3;
  const cx = camera.position.x, cy = camera.position.y, cz = camera.position.z, n = Math.floor(nDrops * Math.min(1, SKY.rain * 1.3)), wx = SKY.wind[0], wz = SKY.wind[1], fall = 15 * dt; rainGeo.setDrawRange(0, n * 2);
  for (let i = 0; i < n; i++) { let y = rainRel[i * 3 + 1] - fall; if (y < -2) { y += 20; rainRel[i * 3] = (Math.random() - .5) * 46; rainRel[i * 3 + 2] = (Math.random() - .5) * 46; } rainRel[i * 3 + 1] = y; const x = cx + rainRel[i * 3] + wx * (y * .05), z = cz + rainRel[i * 3 + 2] + wz * (y * .05), yy = Math.max(G.py || 0, cy - 4) + y, o = i * 6;
    rainPos[o] = x; rainPos[o + 1] = yy; rainPos[o + 2] = z; rainPos[o + 3] = x + wx * .05; rainPos[o + 4] = yy + .75; rainPos[o + 5] = z + wz * .05; }
  rainGeo.attributes.position.needsUpdate = true;
}
