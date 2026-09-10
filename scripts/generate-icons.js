/**
 * Prism — icon generator.
 *
 * Single source of truth: buildSvg(size) renders the Prism brand mark —
 * a glass prism on a dark navy tile, a white light beam entering the left
 * edge and refracting out of the right edge into a cyan → purple → pink →
 * amber spectrum — as an SVG tuned per output size. If `sharp` is
 * installed it rasterizes that SVG; otherwise a built-in, dependency-free
 * per-pixel renderer produces the same design (supersampled for clean
 * anti-aliased edges).
 *
 * Outputs: icons/icon.svg (128 master), icons/icon16.png, icon48.png, icon128.png
 */
'use strict';
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const SIZES = [16, 48, 128];
const OUT_DIR = path.join(__dirname, '..', 'icons');

// ------------------------------------------------------ design (128 space)

const TRI = [[64, 26], [98, 98], [30, 98]];            // prism triangle
const FAN = [[81, 62], [121, 44], [121, 86]];          // refracted spectrum fan
const BEAM = { x1: 12, y1: 46, x2: 47, y2: 62 };       // incoming light beam
const BG = { x: 0, y: 0, w: 128, h: 128, r: 28 };      // dark tile, rounded

const CYAN = [0, 229, 255];        // #00e5ff
const PURPLE = [139, 92, 246];     // #8b5cf6
const PINK = [236, 72, 153];       // #ec4899
const AMBER = [245, 158, 11];      // #f59e0b
const GLASS_TOP = [42, 31, 82];    // #2a1f52
const GLASS_BOT = [19, 16, 36];    // #131024
const BG_TOP = [20, 20, 40];       // #141428
const BG_BOT = [10, 10, 15];       // #0a0a0f
const BEAM_C = [217, 251, 255];    // #d9fbff

// Per-size tuning: thicker strokes + stronger glow at tiny sizes so the
// mark stays legible in the 16px toolbar.
function paramsFor(size) {
  if (size <= 16) {
    return { sw: 7.0, gw1: 4.5, a1: 0.9, gw2: 9.0, a2: 0.5, fg: 5.0, bw: 5.0, bg: 3.5, glass: 0.95 };
  }
  if (size <= 48) {
    return { sw: 3.4, gw1: 2.6, a1: 0.85, gw2: 6.0, a2: 0.35, fg: 3.5, bw: 3.0, bg: 2.2, glass: 0.9 };
  }
  return { sw: 2.4, gw1: 2.2, a1: 0.85, gw2: 5.0, a2: 0.35, fg: 3.0, bw: 2.4, bg: 1.8, glass: 0.9 };
}

function triPath() { return 'M64 26 L98 98 L30 98 Z'; }
function fanPath() { return 'M81 62 L121 44 L121 86 Z'; }

// --------------------------------------------------------------- SVG output

function buildSvg(size) {
  const p = paramsFor(size);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 128 128">
  <defs>
    <linearGradient id="bgg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#141428"/>
      <stop offset="1" stop-color="#0a0a0f"/>
    </linearGradient>
    <linearGradient id="glass" x1="0" y1="26" x2="0" y2="98" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="#2a1f52"/>
      <stop offset="1" stop-color="#131024"/>
    </linearGradient>
    <linearGradient id="edge" x1="0" y1="26" x2="0" y2="98" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="#00e5ff"/>
      <stop offset="0.55" stop-color="#8b5cf6"/>
      <stop offset="1" stop-color="#ec4899"/>
    </linearGradient>
    <linearGradient id="spectrum" x1="0" y1="44" x2="0" y2="86" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="#00e5ff"/>
      <stop offset="0.42" stop-color="#8b5cf6"/>
      <stop offset="0.75" stop-color="#ec4899"/>
      <stop offset="1" stop-color="#f59e0b"/>
    </linearGradient>
    <linearGradient id="beam" x1="12" y1="46" x2="47" y2="62" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="#d9fbff" stop-opacity="0"/>
      <stop offset="1" stop-color="#d9fbff"/>
    </linearGradient>
    <filter id="gw2" x="-80%" y="-80%" width="260%" height="260%"><feGaussianBlur stdDeviation="${p.gw2}"/></filter>
    <filter id="gw1" x="-60%" y="-60%" width="220%" height="220%"><feGaussianBlur stdDeviation="${p.gw1}"/></filter>
    <filter id="gf" x="-60%" y="-60%" width="220%" height="220%"><feGaussianBlur stdDeviation="${p.fg}"/></filter>
    <filter id="gb" x="-60%" y="-60%" width="220%" height="220%"><feGaussianBlur stdDeviation="${p.bg}"/></filter>
    <filter id="gi" x="-40%" y="-40%" width="180%" height="180%"><feGaussianBlur stdDeviation="5"/></filter>
    <clipPath id="tile"><rect width="128" height="128" rx="${BG.r}"/></clipPath>
    <clipPath id="triClip"><path d="${triPath()}"/></clipPath>
  </defs>
  <rect width="128" height="128" rx="${BG.r}" fill="url(#bgg)"/>
  <g clip-path="url(#tile)">
    <path d="${triPath()}" fill="none" stroke="url(#edge)" stroke-width="${(p.sw * 2.2).toFixed(2)}" filter="url(#gw2)" opacity="${p.a2}"/>
    <path d="${triPath()}" fill="none" stroke="url(#edge)" stroke-width="${(p.sw * 1.6).toFixed(2)}" filter="url(#gw1)" opacity="${p.a1}"/>
    <path d="${fanPath()}" fill="url(#spectrum)" filter="url(#gf)" opacity="0.55"/>
    <path d="${fanPath()}" fill="url(#spectrum)" opacity="0.92"/>
    <path d="${triPath()}" fill="url(#glass)" opacity="${p.glass}"/>
    <g clip-path="url(#triClip)">
      <path d="${triPath()}" fill="url(#edge)" filter="url(#gi)" opacity="0.5"/>
    </g>
    <line x1="12" y1="46" x2="47" y2="62" stroke="url(#beam)" stroke-width="${(p.bw * 2).toFixed(2)}" stroke-linecap="round" filter="url(#gb)" opacity="0.8"/>
    <line x1="12" y1="46" x2="47" y2="62" stroke="url(#beam)" stroke-width="${p.bw}" stroke-linecap="round"/>
    <path d="${triPath()}" fill="none" stroke="url(#edge)" stroke-width="${p.sw}" stroke-linejoin="round"/>
  </g>
</svg>
`;
}

// ---------------------------------------------------- rasterizer primitives

function clamp01(t) { return t < 0 ? 0 : t > 1 ? 1 : t; }
function mixC(a, b, t) {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

function edgeColor(py) {
  const t = clamp01((py - 26) / 72);
  return t < 0.55 ? mixC(CYAN, PURPLE, t / 0.55) : mixC(PURPLE, PINK, (t - 0.55) / 0.45);
}
function spectrumColor(py) {
  const t = clamp01((py - 44) / 42);
  if (t < 0.42) return mixC(CYAN, PURPLE, t / 0.42);
  if (t < 0.75) return mixC(PURPLE, PINK, (t - 0.42) / 0.33);
  return mixC(PINK, AMBER, (t - 0.75) / 0.25);
}
function glassColor(py) { return mixC(GLASS_TOP, GLASS_BOT, clamp01((py - 26) / 72)); }
function bgColor(px, py) { return mixC(BG_TOP, BG_BOT, clamp01((px + py) / 256)); }

function inRoundRect(px, py) {
  const { x, y, w, h, r } = BG;
  if (px < x || px > x + w || py < y || py > y + h) return false;
  const cx = Math.min(Math.max(px, x + r), x + w - r);
  const cy = Math.min(Math.max(py, y + r), y + h - r);
  const dx = px - cx, dy = py - cy;
  return dx * dx + dy * dy <= r * r;
}

function signSide(px, py, ax, ay, bx, by) {
  return (bx - ax) * (py - ay) - (by - ay) * (px - ax);
}
function inTri(px, py) {
  const [a, b, c] = TRI;
  const d1 = signSide(px, py, a[0], a[1], b[0], b[1]);
  const d2 = signSide(px, py, b[0], b[1], c[0], c[1]);
  const d3 = signSide(px, py, c[0], c[1], a[0], a[1]);
  const neg = d1 < 0 || d2 < 0 || d3 < 0;
  const pos = d1 > 0 || d2 > 0 || d3 > 0;
  return !(neg && pos);
}
function inPoly(px, py, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i][0], yi = poly[i][1];
    const xj = poly[j][0], yj = poly[j][1];
    if ((yi > py) !== (yj > py) && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
function distSeg(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay;
  const l2 = dx * dx + dy * dy || 1;
  let t = ((px - ax) * dx + (py - ay) * dy) / l2;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  const cx = ax + t * dx, cy = ay + t * dy;
  return Math.hypot(px - cx, py - cy);
}
function distToPolyBoundary(px, py, poly) {
  let d = Infinity;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    d = Math.min(d, distSeg(px, py, poly[j][0], poly[j][1], poly[i][0], poly[i][1]));
  }
  return d;
}

// ---------------------------------------------------------- built-in render

// Mirrors the SVG layer stack exactly, clipped to the rounded tile.
function renderRgba(size, ss) {
  const S = size * ss;
  const chan = new Float64Array(S * S * 4);
  const unit = 128 / S;
  const p = paramsFor(size);
  const beamLen2 = (BEAM.x2 - BEAM.x1) * (BEAM.x2 - BEAM.x1) + (BEAM.y2 - BEAM.y1) * (BEAM.y2 - BEAM.y1);

  function over(i, r, g, b, a) {
    if (a <= 0) return;
    a = Math.min(1, a);
    const da = chan[i + 3];
    const na = a + da * (1 - a);
    chan[i] = (r * a + chan[i] * da * (1 - a)) / na;
    chan[i + 1] = (g * a + chan[i + 1] * da * (1 - a)) / na;
    chan[i + 2] = (b * a + chan[i + 2] * da * (1 - a)) / na;
    chan[i + 3] = na;
  }

  for (let y = 0; y < S; y++) {
    const py = (y + 0.5) * unit;
    for (let x = 0; x < S; x++) {
      const px = (x + 0.5) * unit;
      if (!inRoundRect(px, py)) continue;
      const i = (y * S + x) * 4;

      // tile background
      const bgc = bgColor(px, py);
      chan[i] = bgc[0]; chan[i + 1] = bgc[1]; chan[i + 2] = bgc[2]; chan[i + 3] = 1;

      const dTri = distToPolyBoundary(px, py, TRI);

      // wide glow (blurred 2.2x stroke)
      {
        const a = p.a2 * Math.exp(-Math.pow(Math.max(0, dTri - p.sw * 1.1) / (p.gw2 * 1.6), 2));
        const c = edgeColor(py);
        over(i, c[0], c[1], c[2], a);
      }
      // tight glow (blurred 1.6x stroke)
      {
        const a = p.a1 * Math.exp(-Math.pow(Math.max(0, dTri - p.sw * 0.8) / p.gw1, 2));
        const c = edgeColor(py);
        over(i, c[0], c[1], c[2], a);
      }
      // spectrum fan: glow pass + solid pass
      {
        const c = spectrumColor(py);
        const dFan = distToPolyBoundary(px, py, FAN);
        const inside = inPoly(px, py, FAN);
        over(i, c[0], c[1], c[2], inside ? 0.55 : 0.55 * Math.exp(-Math.pow(dFan / p.fg, 2)));
        if (inside) over(i, c[0], c[1], c[2], 0.92);
      }
      // glass fill
      if (inTri(px, py)) {
        const c = glassColor(py);
        over(i, c[0], c[1], c[2], p.glass);
      }
      // inner glow (brightest near the edges, fading inward)
      if (inTri(px, py)) {
        const a = 0.5 * Math.exp(-Math.pow(dTri / 6, 2));
        const c = edgeColor(py);
        over(i, c[0], c[1], c[2], a);
      }
      // beam glow + beam (alpha ramps 0 → 1 along the beam)
      {
        const d = distSeg(px, py, BEAM.x1, BEAM.y1, BEAM.x2, BEAM.y2);
        const c = BEAM_C;
        over(i, c[0], c[1], c[2], 0.8 * Math.exp(-Math.pow(Math.max(0, d - p.bw / 2) / (p.bg * 1.6), 2)));
        if (d <= p.bw / 2) {
          const t = clamp01(((px - BEAM.x1) * (BEAM.x2 - BEAM.x1) + (py - BEAM.y1) * (BEAM.y2 - BEAM.y1)) / beamLen2);
          over(i, c[0], c[1], c[2], t);
        }
      }
      // crisp luminous edge stroke
      if (dTri <= p.sw / 2) {
        const c = edgeColor(py);
        over(i, c[0], c[1], c[2], 1);
      }
    }
  }

  // box downsample
  const out = new Uint8Array(size * size * 4);
  const n = ss * ss;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let r = 0, g = 0, b = 0, a = 0;
      for (let dy = 0; dy < ss; dy++) {
        for (let dx = 0; dx < ss; dx++) {
          const i = ((y * ss + dy) * S + (x * ss + dx)) * 4;
          r += chan[i]; g += chan[i + 1]; b += chan[i + 2]; a += chan[i + 3];
        }
      }
      const o = (y * size + x) * 4;
      out[o] = Math.round(r / n);
      out[o + 1] = Math.round(g / n);
      out[o + 2] = Math.round(b / n);
      out[o + 3] = Math.round((a / n) * 255);
    }
  }
  return out;
}

// ------------------------------------------------------------- PNG encoding

let CRC_TABLE = null;
function crc32(buf) {
  if (!CRC_TABLE) {
    CRC_TABLE = new Int32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
      CRC_TABLE[n] = c;
    }
  }
  let c = 0xFFFFFFFF;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xFF] ^ (c >>> 8);
  return (c ^ 0xFFFFFFFF) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, 'ascii');
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crcBuf]);
}

function encodePng(bytes, size) {
  const rgba = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const sig = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;  // bit depth
  ihdr[9] = 6;  // color type RGBA
  const stride = size * 4;
  const raw = Buffer.alloc((stride + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (stride + 1)] = 0; // filter: none
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }
  const idat = zlib.deflateSync(raw, { level: 9 });
  return Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', idat), chunk('IEND', Buffer.alloc(0))]);
}

// --------------------------------------------------------------------- main

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });

  let sharp = null;
  try { sharp = require('sharp'); } catch (_) { sharp = null; }
  if (sharp) console.log('[icons] sharp detected — rasterizing the SVG with sharp.');

  const svgMaster = buildSvg(128);
  fs.writeFileSync(path.join(OUT_DIR, 'icon.svg'), svgMaster);
  console.log('icons/icon.svg — ' + svgMaster.length + ' bytes (vector master)');

  for (const size of SIZES) {
    const file = path.join(OUT_DIR, 'icon' + size + '.png');
    if (sharp) {
      try {
        await sharp(Buffer.from(buildSvg(size))).resize(size, size).png().toFile(file);
        console.log('icons/icon' + size + '.png — sharp (svg raster)');
        continue;
      } catch (e) {
        console.warn('[icons] sharp failed (' + ((e && e.message) || e) + ') — using built-in renderer.');
        sharp = null;
      }
    }
    const ss = size <= 48 ? 8 : 4;
    const png = encodePng(renderRgba(size, ss), size);
    fs.writeFileSync(file, png);
    console.log('icons/icon' + size + '.png — ' + png.length + ' bytes (built-in renderer, ' + ss + 'x supersample)');
  }
  console.log('Icons generated.');
}

main().catch((e) => { console.error(e); process.exit(1); });
