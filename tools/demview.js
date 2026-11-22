// vista de comprobación del relieve: tintas por altura + sombreado, con calles y agua del mapa encima → PNG
const fs = require('fs'), zlib = require('zlib'), path = require('path');
const D = JSON.parse(fs.readFileSync(path.join(__dirname, 'dem.json'), 'utf8')).fine, w = {}; new Function('window', fs.readFileSync(path.join(__dirname, '../map.js'), 'utf8'))(w); const M = w.MAPDATA;
const S = +process.argv[3] || .5, X0 = D.x0, Z0 = D.z0, PW = Math.round((D.nx - 1) * D.d * S), PH = Math.round((D.nz - 1) * D.d * S), px = new Uint8Array(PW * PH * 3);
const hAt = (x, z) => { const fx = (x - X0) / D.d, fz = (z - Z0) / D.d, i = Math.max(0, Math.min(D.nx - 2, Math.floor(fx))), j = Math.max(0, Math.min(D.nz - 2, Math.floor(fz))), tx = fx - i, tz = fz - j, k = j * D.nx + i; return ((D.h[k] * (1 - tx) + D.h[k + 1] * tx) * (1 - tz) + (D.h[k + D.nx] * (1 - tx) + D.h[k + D.nx + 1] * tx) * tz) / 10; };
const ramp = [[0, 70, 110, 160], [.5, 150, 190, 140], [8, 190, 205, 150], [25, 225, 215, 160], [45, 215, 180, 130], [65, 190, 140, 110], [90, 150, 105, 95]];
for (let y = 0; y < PH; y++) for (let x = 0; x < PW; x++) { const wx = X0 + x / S, wz = Z0 + y / S, h = hAt(wx, wz), e = 4, gx = (hAt(wx + e, wz) - hAt(wx - e, wz)) / (2 * e), gz = (hAt(wx, wz + e) - hAt(wx, wz - e)) / (2 * e);
  let k = 0; while (k < ramp.length - 2 && h > ramp[k + 1][0]) k++; const a = ramp[k], b = ramp[k + 1], t = Math.max(0, Math.min(1, (h - a[0]) / (b[0] - a[0]))), sh = Math.max(.45, Math.min(1.25, 1 + (gx - gz) * 1.6)), o = (y * PW + x) * 3;
  for (let c = 0; c < 3; c++) px[o + c] = Math.max(0, Math.min(255, (a[c + 1] + (b[c + 1] - a[c + 1]) * t) * sh));
  if (Math.abs(h / 10 - Math.round(h / 10)) < .012 * (1 + Math.hypot(gx, gz) * 30) && h > 2) { px[o] *= .7; px[o + 1] *= .7; px[o + 2] *= .7; } }      // curvas cada 10 m
const line = (x0, z0, x1, z1, c) => { const ax = (x0 - X0) * S, ay = (z0 - Z0) * S, bx = (x1 - X0) * S, by = (z1 - Z0) * S, n = Math.max(1, Math.ceil(Math.hypot(bx - ax, by - ay))); for (let i = 0; i <= n; i++) { const x = Math.round(ax + (bx - ax) * i / n), y = Math.round(ay + (by - ay) * i / n); if (x < 0 || y < 0 || x >= PW || y >= PH) continue; const o = (y * PW + x) * 3; px[o] = c[0]; px[o + 1] = c[1]; px[o + 2] = c[2]; } };
M.water.forEach(p => { for (let k = 0; k < p.length; k += 2) { const j = (k + 2) % p.length; line(p[k], p[k + 1], p[j], p[j + 1], [20, 60, 200]); } });
M.roads.forEach(r => { const c = r.t === 'steps' ? [200, 0, 160] : r.b ? [255, 255, 255] : /primary|secondary|tertiary/.test(r.t) ? [30, 30, 30] : /residential|living|unclass/.test(r.t) ? [90, 90, 90] : null; if (!c) return; for (let k = 0; k + 3 < r.p.length; k += 2) line(r.p[k], r.p[k + 1], r.p[k + 2], r.p[k + 3], c); });
M.rail.forEach(p => { for (let k = 0; k + 3 < p.length; k += 2) line(p[k], p[k + 1], p[k + 2], p[k + 3], [160, 40, 40]); });
const bb = M.bbox; [[bb[0], bb[1], bb[2], bb[1]], [bb[2], bb[1], bb[2], bb[3]], [bb[2], bb[3], bb[0], bb[3]], [bb[0], bb[3], bb[0], bb[1]]].forEach(q => line(q[0], q[1], q[2], q[3], [255, 220, 0]));
// PNG
const raw = Buffer.alloc((PW * 3 + 1) * PH); for (let y = 0; y < PH; y++) { raw[y * (PW * 3 + 1)] = 0; Buffer.from(px.buffer, y * PW * 3, PW * 3).copy(raw, y * (PW * 3 + 1) + 1); }
const crcT = (() => { const t = []; for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })(), crc = b => { let c = 0xffffffff; for (const x of b) c = crcT[(c ^ x) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
const chunk = (t, d) => { const l = Buffer.alloc(4); l.writeUInt32BE(d.length); const td = Buffer.concat([Buffer.from(t), d]), c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([l, td, c]); };
const ih = Buffer.alloc(13); ih.writeUInt32BE(PW, 0); ih.writeUInt32BE(PH, 4); ih[8] = 8; ih[9] = 2;
fs.writeFileSync(process.argv[2] || '/tmp/dem.png', Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ih), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))])); console.log('png', PW, 'x', PH);
