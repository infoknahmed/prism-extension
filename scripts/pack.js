/**
 * Prism — dependency-free .zip packager for the Chrome Web Store.
 * Produces dist/prism-v<version>.zip from dist/.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const ROOT = path.join(__dirname, '..');
const DIST = path.join(ROOT, 'dist');

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

function zipStore(pathInZip, data) {
  const head = Buffer.alloc(30);
  head.writeUInt32LE(0x04034b50, 0);   // local file header signature
  head.writeUInt16LE(20, 4);           // version needed
  head.writeUInt16LE(0x0800, 6);       // UTF-8 flag
  head.writeUInt16LE(0, 8);            // method: store
  head.writeUInt16LE(0, 10);           // time
  head.writeUInt16LE(0x2100, 12);      // date (2016-01-01 placeholder)
  head.writeUInt32LE(crc32(data), 14);
  head.writeUInt32LE(data.length, 18); // compressed size
  head.writeUInt32LE(data.length, 22); // uncompressed size
  head.writeUInt16LE(pathInZip.length, 26);
  head.writeUInt16LE(0, 28);
  return { header: head, data: Buffer.from(pathInZip), payload: data };
}

function zipFinal(entries, centralOffset) {
  const central = [];
  let offset = 0; // local header offsets start at 0
  for (const e of entries) {
    const entryOffset = offset;
    offset += e.header.length + e.data.length + e.payload.length;

    const c = Buffer.alloc(46);
    c.writeUInt32LE(0x02014b50, 0);      // central directory signature
    c.writeUInt16LE(20, 4);              // version made by
    c.writeUInt16LE(20, 6);              // version needed
    c.writeUInt16LE(0x0800, 8);          // UTF-8 flag
    c.writeUInt16LE(0, 10);              // method: store
    c.writeUInt16LE(0, 12);              // time
    c.writeUInt16LE(0x2100, 14);         // date
    c.writeUInt32LE(crc32(e.payload), 16);
    c.writeUInt32LE(e.payload.length, 20);
    c.writeUInt32LE(e.payload.length, 24);
    c.writeUInt16LE(e.data.length, 28);  // name length
    c.writeUInt16LE(0, 30);              // extra length
    c.writeUInt16LE(0, 32);              // comment length
    c.writeUInt16LE(0, 34);              // disk number
    c.writeUInt16LE(0, 36);              // internal attrs
    c.writeUInt32LE(0, 38);              // external attrs
    c.writeUInt32LE(entryOffset, 42);    // local header offset
    central.push(Buffer.concat([c, e.data]));
  }
  const centralBuf = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);      // EOCD signature
  end.writeUInt16LE(0, 4);               // disk number
  end.writeUInt16LE(0, 6);               // central dir start disk
  end.writeUInt16LE(entries.length, 8);  // entries on this disk
  end.writeUInt16LE(entries.length, 10); // total entries
  end.writeUInt32LE(centralBuf.length, 12);
  end.writeUInt32LE(centralOffset, 16);  // central dir offset
  end.writeUInt16LE(0, 20);              // comment length
  return { centralBuf, end };
}

function main() {
  if (!fs.existsSync(DIST)) {
    console.error('[pack] dist/ not found — run "npm run build" first.');
    process.exit(1);
  }
  const manifest = JSON.parse(fs.readFileSync(path.join(DIST, 'manifest.json'), 'utf8'));

  const files = [];
  (function walk(dir, base) {
    base = base || dir;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full, base);
      else if (!entry.name.endsWith('.zip')) files.push({ rel: path.relative(base, full).split(path.sep).join('/'), full });
    }
  })(DIST);

  // Stable order: manifest first, then alphabetical.
  files.sort((a, b) => (a.rel === 'manifest.json' ? -1 : b.rel === 'manifest.json' ? 1 : a.rel.localeCompare(b.rel)));

  const localParts = [];
  const centralEntries = [];
  let offset = 0;
  for (const f of files) {
    const data = fs.readFileSync(f.full);
    const e = zipStore(f.rel, data);
    localParts.push(e.header, e.data, e.payload);
    centralEntries.push(e);
    offset += e.header.length + e.data.length + e.payload.length;
  }

  const { centralBuf, end } = zipFinal(centralEntries, offset);

  const zip = Buffer.concat([...localParts, centralBuf, end]);
  const out = path.join(ROOT, 'dist', 'prism-v' + manifest.version + '.zip');
  fs.writeFileSync(out, zip);
  console.log('[pack] ' + path.relative(ROOT, out) + ' — ' + (zip.length / 1024).toFixed(1) + ' KB, ' + files.length + ' files');
}

main();
