import { PNG } from 'pngjs';

/**
 * @param {number} width
 * @param {number} height
 * @returns {number} max payload bytes (excluding 4-byte length prefix)
 */
export function capacityBytes(width, height) {
  const bits = width * height * 3;
  const bytes = Math.floor(bits / 8);
  return bytes - 4;
}

/**
 * @param {Buffer} pngBuffer
 * @returns {PNG}
 */
export function decodePng(pngBuffer) {
  return PNG.sync.read(pngBuffer);
}

/**
 * @param {PNG} png
 * @returns {Buffer}
 */
export function encodePng(png) {
  return PNG.sync.write(png);
}

/**
 * @param {PNG} png
 * @param {Buffer} payload
 * @returns {PNG} new PNG instance with embedded data
 */
export function embedPayload(png, payload) {
  const cap = capacityBytes(png.width, png.height);
  if (payload.length > cap) {
    throw new Error(
      `Image is too small. Need ${payload.length} bytes but capacity is ${cap}. Use a larger PNG.`
    );
  }

  const out = new PNG({ width: png.width, height: png.height });
  png.data.copy(out.data);

  const lengthPrefix = Buffer.alloc(4);
  lengthPrefix.writeUInt32BE(payload.length, 0);
  const bits = bufferToBits(lengthPrefix, lengthPrefix.length * 8);
  appendBits(bits, bufferToBits(payload, payload.length * 8));

  let bitIndex = 0;
  const data = out.data;
  for (let y = 0; y < out.height; y++) {
    for (let x = 0; x < out.width; x++) {
      const idx = (out.width * y + x) << 2;
      for (const c of [0, 1, 2]) {
        if (bitIndex >= bits.length) {
          return out;
        }
        const bit = bits[bitIndex++];
        data[idx + c] = (data[idx + c] & 0xfe) | bit;
      }
    }
  }
  return out;
}

/**
 * @param {PNG} png
 * @returns {Buffer} extracted payload (without length prefix handling — full inner payload)
 */
export function extractPayload(png) {
  const maxBits = png.width * png.height * 3;
  const bits = [];
  const data = png.data;
  for (let y = 0; y < png.height; y++) {
    for (let x = 0; x < png.width; x++) {
      const idx = (png.width * y + x) << 2;
      for (const c of [0, 1, 2]) {
        if (bits.length >= maxBits) break;
        bits.push(data[idx + c] & 1);
      }
    }
  }

  const lengthBits = bits.slice(0, 32);
  const payloadLen = bitsToUint32BE(lengthBits);
  const payloadBitCount = payloadLen * 8;
  if (32 + payloadBitCount > bits.length) {
    throw new Error('Could not unlock vault');
  }
  const payloadBits = bits.slice(32, 32 + payloadBitCount);
  return bitsToBuffer(payloadBits, payloadLen);
}

function bufferToBits(buf, bitCount) {
  const bits = [];
  for (let i = 0; i < bitCount; i++) {
    const byteIndex = Math.floor(i / 8);
    const bitPos = 7 - (i % 8);
    bits.push((buf[byteIndex] >> bitPos) & 1);
  }
  return bits;
}

function appendBits(target, source) {
  for (const b of source) target.push(b);
}

function bitsToUint32BE(bits) {
  let n = 0;
  for (let i = 0; i < 32; i++) {
    n = (n << 1) | (bits[i] ?? 0);
  }
  return n >>> 0;
}

function bitsToBuffer(bits, byteLen) {
  const buf = Buffer.alloc(byteLen);
  for (let i = 0; i < byteLen * 8; i++) {
    const byteIndex = Math.floor(i / 8);
    const bitPos = 7 - (i % 8);
    if (bits[i]) {
      buf[byteIndex] |= 1 << bitPos;
    }
  }
  return buf;
}

/**
 * @param {Buffer} pngBuffer
 * @param {Buffer} payload
 * @returns {Buffer} PNG file bytes
 */
export function embedInPng(pngBuffer, payload) {
  const png = decodePng(pngBuffer);
  const out = embedPayload(png, payload);
  return encodePng(out);
}

/**
 * @param {Buffer} pngBuffer
 * @returns {Buffer} crypto payload
 */
export function extractFromPng(pngBuffer) {
  const png = decodePng(pngBuffer);
  return extractPayload(png);
}
