import crypto from 'node:crypto';

export const MAGIC = Buffer.from('CBCI', 'ascii');
export const VERSION_PBKDF2 = 0x01;
export const VERSION_ARGON2ID = 0x02;
export const VERSION = VERSION_ARGON2ID;
export const DEFAULT_ITERATIONS = 310_000;
export const DEFAULT_ARGON2_MEMORY = 65_536; // KiB = 64 MiB
export const DEFAULT_ARGON2_PASSES = 3;
export const DEFAULT_ARGON2_PARALLELISM = 1;
export const SALT_LEN = 16;
export const IV_LEN = 12;
export const TAG_LEN = 16;
export const KEY_LEN = 32;

const UNLOCK_ERROR = 'Could not unlock vault';
const MAX_PBKDF2_ITERATIONS = 5_000_000;
const MIN_PBKDF2_ITERATIONS = 100_000;
const MAX_ARGON2_MEMORY = 262_144; // 256 MiB
const MIN_ARGON2_MEMORY = 8_192;
const MAX_ARGON2_PASSES = 10;
const MIN_ARGON2_PASSES = 1;
const MAX_ARGON2_PARALLELISM = 4;
const MIN_ARGON2_PARALLELISM = 1;

/**
 * @param {object} vault
 * @param {string} masterPassword
 * @param {{ kdf?: 'argon2id' | 'pbkdf2', iterations?: number, memory?: number, passes?: number, parallelism?: number }} [opts]
 * @returns {Buffer} binary payload (before stego)
 */
export function encryptVault(vault, masterPassword, opts = {}) {
  const kdf = opts.kdf ?? 'argon2id';
  const salt = crypto.randomBytes(SALT_LEN);
  const iv = crypto.randomBytes(IV_LEN);
  const plaintext = Buffer.from(JSON.stringify(vault), 'utf8');

  if (kdf === 'pbkdf2') {
    const iterations = opts.iterations ?? DEFAULT_ITERATIONS;
    const key = derivePbkdf2(masterPassword, salt, iterations);
    const aad = buildPbkdf2Aad(salt, iterations);
    const { encrypted, tag } = seal(key, iv, aad, plaintext);
    return packPbkdf2(salt, iterations, iv, encrypted, tag);
  }

  const memory = opts.memory ?? DEFAULT_ARGON2_MEMORY;
  const passes = opts.passes ?? DEFAULT_ARGON2_PASSES;
  const parallelism = opts.parallelism ?? DEFAULT_ARGON2_PARALLELISM;
  const key = deriveArgon2id(masterPassword, salt, memory, passes, parallelism);
  const aad = buildArgon2Aad(salt, memory, passes, parallelism);
  const { encrypted, tag } = seal(key, iv, aad, plaintext);
  return packArgon2id(salt, memory, passes, parallelism, iv, encrypted, tag);
}

/**
 * @param {Buffer} payload
 * @param {string} masterPassword
 * @returns {object} vault JSON
 */
export function decryptVault(payload, masterPassword) {
  try {
    const unpacked = unpackPayload(payload);
    const key =
      unpacked.version === VERSION_PBKDF2
        ? derivePbkdf2(masterPassword, unpacked.salt, unpacked.iterations)
        : deriveArgon2id(
            masterPassword,
            unpacked.salt,
            unpacked.memory,
            unpacked.passes,
            unpacked.parallelism
          );
    const aad =
      unpacked.version === VERSION_PBKDF2
        ? buildPbkdf2Aad(unpacked.salt, unpacked.iterations)
        : buildArgon2Aad(
            unpacked.salt,
            unpacked.memory,
            unpacked.passes,
            unpacked.parallelism
          );
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, unpacked.iv);
    decipher.setAAD(aad);
    decipher.setAuthTag(unpacked.tag);
    const plain = Buffer.concat([
      decipher.update(unpacked.ciphertext),
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

function seal(key, iv, aad, plaintext) {
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  cipher.setAAD(aad);
  const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();
  return { encrypted, tag };
}

function derivePbkdf2(masterPassword, salt, iterations) {
  if (
    !Number.isInteger(iterations) ||
    iterations < MIN_PBKDF2_ITERATIONS ||
    iterations > MAX_PBKDF2_ITERATIONS
  ) {
    throw new Error(UNLOCK_ERROR);
  }
  return crypto.pbkdf2Sync(
    masterPassword,
    salt,
    iterations,
    KEY_LEN,
    'sha256'
  );
}

function deriveArgon2id(masterPassword, salt, memory, passes, parallelism) {
  if (
    !Number.isInteger(memory) ||
    memory < MIN_ARGON2_MEMORY ||
    memory > MAX_ARGON2_MEMORY ||
    !Number.isInteger(passes) ||
    passes < MIN_ARGON2_PASSES ||
    passes > MAX_ARGON2_PASSES ||
    !Number.isInteger(parallelism) ||
    parallelism < MIN_ARGON2_PARALLELISM ||
    parallelism > MAX_ARGON2_PARALLELISM
  ) {
    throw new Error(UNLOCK_ERROR);
  }
  return crypto.argon2Sync('argon2id', {
    message: Buffer.from(masterPassword, 'utf8'),
    nonce: salt,
    parallelism,
    tagLength: KEY_LEN,
    memory,
    passes,
  });
}

function buildPbkdf2Aad(salt, iterations) {
  const iterBuf = Buffer.alloc(4);
  iterBuf.writeUInt32BE(iterations, 0);
  return Buffer.concat([
    MAGIC,
    Buffer.from([VERSION_PBKDF2]),
    salt,
    iterBuf,
  ]);
}

function buildArgon2Aad(salt, memory, passes, parallelism) {
  return Buffer.concat([
    MAGIC,
    Buffer.from([VERSION_ARGON2ID]),
    salt,
    u32(memory),
    u32(passes),
    u32(parallelism),
  ]);
}

function packPbkdf2(salt, iterations, iv, ciphertext, tag) {
  return Buffer.concat([
    MAGIC,
    Buffer.from([VERSION_PBKDF2]),
    salt,
    u32(iterations),
    iv,
    u32(ciphertext.length),
    ciphertext,
    tag,
  ]);
}

function packArgon2id(salt, memory, passes, parallelism, iv, ciphertext, tag) {
  return Buffer.concat([
    MAGIC,
    Buffer.from([VERSION_ARGON2ID]),
    salt,
    u32(memory),
    u32(passes),
    u32(parallelism),
    iv,
    u32(ciphertext.length),
    ciphertext,
    tag,
  ]);
}

function unpackPayload(buf) {
  if (!Buffer.isBuffer(buf) || buf.length < 4 + 1 + SALT_LEN) {
    throw new Error(UNLOCK_ERROR);
  }
  let offset = 0;
  const magic = buf.subarray(offset, offset + 4);
  offset += 4;
  if (!magic.equals(MAGIC)) {
    throw new Error(UNLOCK_ERROR);
  }
  const version = buf[offset];
  offset += 1;
  const salt = buf.subarray(offset, offset + SALT_LEN);
  offset += SALT_LEN;

  if (version === VERSION_PBKDF2) {
    const iterations = buf.readUInt32BE(offset);
    offset += 4;
    return { version, salt, iterations, ...readCipherFields(buf, offset) };
  }
  if (version === VERSION_ARGON2ID) {
    const memory = buf.readUInt32BE(offset);
    offset += 4;
    const passes = buf.readUInt32BE(offset);
    offset += 4;
    const parallelism = buf.readUInt32BE(offset);
    offset += 4;
    return {
      version,
      salt,
      memory,
      passes,
      parallelism,
      ...readCipherFields(buf, offset),
    };
  }
  throw new Error(UNLOCK_ERROR);
}

function readCipherFields(buf, offset) {
  const iv = buf.subarray(offset, offset + IV_LEN);
  offset += IV_LEN;
  const ctLen = buf.readUInt32BE(offset);
  offset += 4;
  const ciphertext = buf.subarray(offset, offset + ctLen);
  offset += ctLen;
  const tag = buf.subarray(offset, offset + TAG_LEN);
  if (iv.length !== IV_LEN || ciphertext.length !== ctLen || tag.length !== TAG_LEN) {
    throw new Error(UNLOCK_ERROR);
  }
  return { iv, ciphertext, tag };
}

function u32(n) {
  const buf = Buffer.alloc(4);
  buf.writeUInt32BE(n, 0);
  return buf;
}

/** Estimated binary payload size for a vault (new salt/IV each save; length is stable). */
export function payloadSizeForVault(vault) {
  const plaintextLen = Buffer.byteLength(JSON.stringify(vault), 'utf8');
  const header = 4 + 1 + SALT_LEN + 4 + 4 + 4 + IV_LEN + 4;
  return header + plaintextLen + TAG_LEN;
}

export { UNLOCK_ERROR };
