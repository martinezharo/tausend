#!/usr/bin/env node
/**
 * Generate the PWA icons.
 *
 * The mark is the gender system itself: three bars in Signalblau, Magenta and
 * Verkehrsgelb. No wordmark — at 48px a word is mud, and three coloured bars
 * are the one thing in this product that is instantly recognisable.
 *
 * Written by hand rather than pulled from an image library: it is a few solid
 * rectangles, and a build dependency for that would be silly.
 */

import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const OUT = resolve(dirname(fileURLToPath(import.meta.url)), '../../apps/web/static');

const INK = [0x14, 0x17, 0x1a];
const BARS = [
  [0x1b, 0x4f, 0xd8], // der
  [0xd6, 0x15, 0x5a], // die
  [0xf5, 0xb3, 0x01] // das
];

const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(buf) {
  let c = 0xffffffff;
  for (const byte of buf) c = crcTable[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}

function icon(size) {
  const pixels = Buffer.alloc(size * size * 3);
  const pad = Math.round(size * 0.18);
  const gap = Math.max(1, Math.round(size * 0.05));
  const barWidth = Math.floor((size - pad * 2 - gap * 2) / 3);

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let colour = INK;
      if (y >= pad && y < size - pad) {
        for (let b = 0; b < 3; b++) {
          const left = pad + b * (barWidth + gap);
          if (x >= left && x < left + barWidth) colour = BARS[b];
        }
      }
      const i = (y * size + x) * 3;
      pixels[i] = colour[0];
      pixels[i + 1] = colour[1];
      pixels[i + 2] = colour[2];
    }
  }

  // PNG scanlines each need a filter byte; 0 = none.
  const raw = Buffer.alloc(size * (size * 3 + 1));
  for (let y = 0; y < size; y++) {
    raw[y * (size * 3 + 1)] = 0;
    pixels.copy(raw, y * (size * 3 + 1) + 1, y * size * 3, (y + 1) * size * 3);
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // truecolour

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0))
  ]);
}

mkdirSync(OUT, { recursive: true });
for (const size of [192, 512]) {
  writeFileSync(resolve(OUT, `icon-${size}.png`), icon(size));
}

const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
  <rect width="100" height="100" fill="#14171A"/>
  <rect x="18" y="18" width="18.7" height="64" fill="#1B4FD8"/>
  <rect x="41.7" y="18" width="18.7" height="64" fill="#D6155A"/>
  <rect x="65.3" y="18" width="18.7" height="64" fill="#F5B301"/>
</svg>
`;
writeFileSync(resolve(OUT, 'favicon.svg'), svg);

console.log('  icons written to apps/web/static: icon-192.png, icon-512.png, favicon.svg');
