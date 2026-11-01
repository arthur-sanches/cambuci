import test from 'node:test';
import assert from 'node:assert/strict';
import {
  encryptVault,
  decryptVault,
  UNLOCK_ERROR,
  payloadSizeForVault,
} from '../src/crypto.js';

const sample = {
  Gmail: { 'a@b.com': 'secret' },
};

test('crypto round trip', () => {
  const payload = encryptVault(sample, 'master-password-12');
  assert.ok(payload.length > 50);
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

test('payload size estimate matches encrypt', () => {
  const payload = encryptVault(sample, 'master-password-12');
  assert.equal(payload.length, payloadSizeForVault(sample));
});
