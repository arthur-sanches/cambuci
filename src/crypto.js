import crypto from 'node:crypto';

export const MAGIC = Buffer.from('CBCI', 'ascii');
export const VERSION = 0x01;
export const DEFAULT_ITERATIONS = 310_000;
export const SALT_LEN = 16;
export const IV_LEN = 12;
export const TAG_LEN = 16;

const UNLOCK_ERROR = 'Could not unlock vault';

/**
 * @param {object} vault
 * @param {string} masterPassword
 * @param {{ iterations?: number }} [opts]
 * @returns {Buffer} binary payload (before stego)
 */
export function encryptVault(vault, masterPassword, opts = {}) {
  const iterations = opts.iterations ?? DEFAULT_ITERATIONS;
  const salt = crypto.randomBytes(SALT_LEN);
  const iv = crypto.randomBytes(IV_LEN);
  const key = crypto.pbkdf2Sync(
    masterPassword,
    salt,
    iterations,
    32,
    'sha256'
  );

  const plaintext = Buffer.from(JSON.stringify(vault), 'utf8');
  const aad = buildAad(salt, iterations);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  cipher.setAAD(aad);
  const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();

  return packPayload(salt, iterations, iv, encrypted, tag);
}

/**
 * @param {Buffer} payload
 * @param {string} masterPassword
 * @returns {object} vault JSON
 */
export function decryptVault(payload, masterPassword) {
  try {
    const { salt, iterations, iv, ciphertext, tag } = unpackPayload(payload);
    const key = crypto.pbkdf2Sync(
      masterPassword,
      salt,
      iterations,
      32,
      'sha256'
    );
    const aad = buildAad(salt, iterations);
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAAD(aad);
    decipher.setAuthTag(tag);
    const plain = Buffer.concat([
      decipher.update(ciphertext),
      decipher.final(),
    ]);
    const vault = JSON.parse(plain.toString('utf8'));
    if (vault === null || typeof vault !== 'object' || Array.isArray(vault)) {
      throw new Error(UNLOCK_ERROR);
    }
    return vault;
  } catch {
    throw new Error(UNLOCK_ERROR);
  }
}

function buildAad(salt, iterations) {
  const iterBuf = Buffer.alloc(4);
  iterBuf.writeUInt32BE(iterations, 0);
  return Buffer.concat([MAGIC, Buffer.from([VERSION]), salt, iterBuf]);
}

function packPayload(salt, iterations, iv, ciphertext, tag) {
  const iterBuf = Buffer.alloc(4);
  iterBuf.writeUInt32BE(iterations, 0);
  const lenBuf = Buffer.alloc(4);
  lenBuf.writeUInt32BE(ciphertext.length, 0);
  return Buffer.concat([
    MAGIC,
    Buffer.from([VERSION]),
    salt,
    iterBuf,
    iv,
    lenBuf,
    ciphertext,
    tag,
  ]);
}

function unpackPayload(buf) {
  let offset = 0;
  const magic = buf.subarray(offset, offset + 4);
  offset += 4;
  if (!magic.equals(MAGIC)) {
    throw new Error(UNLOCK_ERROR);
  }
  const version = buf[offset];
  offset += 1;
  if (version !== VERSION) {
    throw new Error(UNLOCK_ERROR);
  }
  const salt = buf.subarray(offset, offset + SALT_LEN);
  offset += SALT_LEN;
  const iterations = buf.readUInt32BE(offset);
  offset += 4;
  const iv = buf.subarray(offset, offset + IV_LEN);
  offset += IV_LEN;
  const ctLen = buf.readUInt32BE(offset);
  offset += 4;
  const ciphertext = buf.subarray(offset, offset + ctLen);
  offset += ctLen;
  const tag = buf.subarray(offset, offset + TAG_LEN);
  if (tag.length !== TAG_LEN) {
    throw new Error(UNLOCK_ERROR);
  }
  return { salt, iterations, iv, ciphertext, tag };
}

/** Estimated binary payload size for a vault (new salt/IV each save; length is stable). */
export function payloadSizeForVault(vault) {
  const plaintextLen = Buffer.byteLength(JSON.stringify(vault), 'utf8');
  const header = 4 + 1 + SALT_LEN + 4 + IV_LEN + 4;
  return header + plaintextLen + TAG_LEN;
}

export { UNLOCK_ERROR };
