import test from 'node:test';
import assert from 'node:assert/strict';
import { PNG } from 'pngjs';
import {
  embedInPng,
  extractFromPng,
  capacityBytes,
  embedPayload,
  decodePng,
} from '../src/stego.js';
import { encryptVault } from '../src/crypto.js';

function makePng(w, h) {
  const png = new PNG({ width: w, height: h });
  for (let i = 0; i < png.data.length; i++) {
    png.data[i] = (i * 17 + 42) & 0xff;
  }
  return PNG.sync.write(png);
}

test('stego round trip', () => {
  const cover = makePng(64, 64);
  const payload = Buffer.from('hello stego payload', 'utf8');
  const out = embedInPng(cover, payload);
  const back = extractFromPng(out);
  assert.equal(back.toString('utf8'), payload.toString('utf8'));
});

test('crypto payload fits in reasonable png', () => {
  const vault = { S: { u: 'p' } };
  const payload = encryptVault(vault, 'long-password-123');
  const cover = makePng(128, 128);
  const out = embedInPng(cover, payload);
  const extracted = extractFromPng(out);
  assert.equal(extracted.length, payload.length);
});

test('image too small throws', () => {
  const cover = makePng(8, 8);
  const png = decodePng(cover);
  const cap = capacityBytes(png.width, png.height);
  const tooBig = Buffer.alloc(cap + 1);
  assert.throws(() => embedPayload(png, tooBig), /too small/i);
});
