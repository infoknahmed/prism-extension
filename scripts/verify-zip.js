/**
 * Prism — zip validator.
 * Walks the central directory, checks local headers, sizes and CRCs.
 * Exit 0 = valid, exit 1 = invalid. Usage: node scripts/verify-zip.js [file.zip]
 */
'use strict';
const fs = require('fs');
const path = require('path');

const file = process.argv[2] || (() => {
  const dist = path.join(__dirname, '..', 'dist');
  const zips = fs.readdirSync(dist).filter((f) => f.endsWith('.zip'));
  if (!zips.length) { console.error('no zip in dist/ — run npm run pack'); process.exit(1); }
  return path.join(dist, zips[zips.length - 1]);
})();

const z = fs.readFileSync(file);
let eocd = -1;
for (let i = z.length - 22; i >= 0; i--) {
  if (z.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
}
if (eocd < 0) { console.error('ZIP INVALID: no EOCD'); process.exit(1); }

const onDisk = z.readUInt16LE(eocd + 8);
const total = z.readUInt16LE(eocd + 10);
const cdSize = z.readUInt32LE(eocd + 12);
const cdOff = z.readUInt32LE(eocd + 16);

const T = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();
const crc32 = (b) => {
  let c = 0xFFFFFFFF;
  for (let i = 0; i < b.length; i++) c = T[(c ^ b[i]) & 0xFF] ^ (c >>> 8);
  return (c ^ 0xFFFFFFFF) >>> 0;
};

let off = cdOff;
const names = [];
let problems = 0;
for (let e = 0; e < total; e++) {
  if (z.readUInt32LE(off) !== 0x02014b50) { console.error('BAD CENTRAL SIG at entry ' + e); problems++; break; }
  const flags = z.readUInt16LE(off + 8);
  const method = z.readUInt16LE(off + 10);
  const crcC = z.readUInt32LE(off + 16);
  const size = z.readUInt32LE(off + 24);
  const nl = z.readUInt16LE(off + 28);
  const el = z.readUInt16LE(off + 30);
  const cl = z.readUInt16LE(off + 32);
  const lh = z.readUInt32LE(off + 42);
  const name = z.slice(off + 46, off + 46 + nl).toString('utf8');
  names.push(name);

  if (z.readUInt32LE(lh) !== 0x04034b50) { console.error('BAD LOCAL SIG:', name); problems++; }
  if (z.readUInt16LE(lh + 8) !== method) { console.error('METHOD MISMATCH:', name); problems++; }
  const nlL = z.readUInt16LE(lh + 26);
  const elL = z.readUInt16LE(lh + 28);
  const start = lh + 30 + nlL + elL;
  const payload = z.slice(start, start + size);
  if (payload.length !== size) { console.error('TRUNCATED:', name); problems++; }
  if (crc32(payload) !== crcC) { console.error('CRC FAIL:', name); problems++; }
  if (method !== 0) { console.error('UNEXPECTED COMPRESSION:', name); problems++; }

  off += 46 + nl + el + cl;
}
if (off !== eocd) { console.error('CENTRAL DIRECTORY DOES NOT END AT EOCD'); problems++; }
if (onDisk !== total) { console.error('ENTRY COUNT MISMATCH'); problems++; }

console.log('entries: ' + total + ', cdSize: ' + cdSize + ', cdOff: ' + cdOff);
for (const n of names) console.log('  ' + n);
if (problems) { console.error('ZIP INVALID — ' + problems + ' problem(s)'); process.exit(1); }
console.log('ZIP VALID — all signatures, sizes and CRCs OK');
