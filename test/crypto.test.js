import test from 'node:test';
import assert from 'node:assert/strict';
import {
  encryptVault,
  decryptVault,
  UNLOCK_ERROR,
  payloadSizeForVault,
  VERSION_ARGON2ID,
  MAGIC,
} from '../src/crypto.js';

const sample = {
  Gmail: { 'a@b.com': 'secret' },
};

test('crypto round trip uses argon2id', () => {
  const payload = encryptVault(sample, 'master-password-12');
  assert.ok(payload.length > 50);
  assert.equal(payload.subarray(0, 4).equals(MAGIC), true);
  assert.equal(payload[4], VERSION_ARGON2ID);
  const out = decryptVault(payload, 'master-password-12');
  assert.deepEqual(out, sample);
});

test('legacy pbkdf2 payloads still decrypt', () => {
  const payload = encryptVault(sample, 'master-password-12', { kdf: 'pbkdf2' });
  assert.equal(payload[4], 0x01);
  const out = decryptVault(payload, 'master-password-12');
  assert.deepEqual(out, sample);
});

test('wrong password fails generically', () => {
  const payload = encryptVault(sample, 'correct-password-12');
  assert.throws(
    () => decryptVault(payload, 'wrong-password-12'),
    (err) => err.message === UNLOCK_ERROR
  );
});

test('truncated payload fails', () => {
  const payload = encryptVault(sample, 'master-password-12');
  const truncated = payload.subarray(0, payload.length - 5);
  assert.throws(
    () => decryptVault(truncated, 'master-password-12'),
    (err) => err.message === UNLOCK_ERROR
  );
});

test('absurd argon2 memory cost is rejected', () => {
  const payload = encryptVault(sample, 'master-password-12');
  const evil = Buffer.from(payload);
  evil.writeUInt32BE(0xffffffff, 5 + 16);
  assert.throws(
    () => decryptVault(evil, 'master-password-12'),
    (err) => err.message === UNLOCK_ERROR
  );
});

test('payload size estimate matches encrypt', () => {
  const payload = encryptVault(sample, 'master-password-12');
  assert.equal(payload.length, payloadSizeForVault(sample));
});
