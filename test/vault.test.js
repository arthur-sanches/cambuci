import test from 'node:test';
import assert from 'node:assert/strict';
import {
  emptyVault,
  addService,
  addOrUpdateLogin,
  renameLogin,
  deleteLogin,
  deleteService,
} from '../src/vault.js';

test('empty vault validates', () => {
  assert.deepEqual(emptyVault(), {});
});

test('add service and duplicate login rejected', () => {
  let v = addService(emptyVault(), 'Gmail', 'a@b.com', 'pw1');
  assert.throws(() => addService(v, 'Gmail', 'a@b.com', 'pw2'));
  v = addOrUpdateLogin(v, 'Gmail', 'b@b.com', 'pw2');
  assert.equal(Object.keys(v.Gmail).length, 2);
});

test('rename login uniqueness', () => {
  let v = addService(emptyVault(), 'GitHub', 'alice', 'x');
  v = addOrUpdateLogin(v, 'GitHub', 'bob', 'y');
  assert.throws(() => renameLogin(v, 'GitHub', 'alice', 'bob'));
  v = renameLogin(v, 'GitHub', 'alice', 'alice2');
  assert.ok('alice2' in v.GitHub);
});

test('delete login removes empty service', () => {
  let v = addService(emptyVault(), 'Tmp', 'u', 'p');
  v = deleteLogin(v, 'Tmp', 'u');
  assert.deepEqual(v, {});
});

test('delete service', () => {
  let v = addService(emptyVault(), 'S', 'u', 'p');
  v = deleteService(v, 'S');
  assert.deepEqual(v, {});
});
