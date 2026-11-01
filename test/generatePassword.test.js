import test from 'node:test';
import assert from 'node:assert/strict';
import { generatePassword } from '../src/generatePassword.js';

test('default length and charset', () => {
  const p = generatePassword({});
  assert.equal(p.length, 20);
  assert.match(p, /[A-Z]/);
  assert.match(p, /[a-z]/);
  assert.match(p, /[0-9]/);
});

test('length bounds', () => {
  assert.throws(() => generatePassword({ length: 8 }));
  assert.throws(() => generatePassword({ length: 100 }));
});

test('requires at least one charset', () => {
  assert.throws(() =>
    generatePassword({
      uppercase: false,
      lowercase: false,
      digits: false,
      symbols: false,
    })
  );
});
