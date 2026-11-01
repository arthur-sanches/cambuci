/**
 * Session helpers for in-memory vault state.
 * @typedef {{ vault: object, coverPng: Buffer, unlocked: boolean }} VaultSession
 */

export function requireUnlocked(req) {
  if (!req.session.unlocked || !req.session.vault || !req.session.coverPng) {
    const err = new Error('Vault is locked');
    err.status = 401;
    throw err;
  }
}

export function setSessionVault(req, vault, coverPng, coverFileName) {
  req.session.vault = vault;
  req.session.coverPng = Buffer.from(coverPng);
  req.session.coverFileName = coverFileName || 'vault.png';
  req.session.unlocked = true;
}

export function clearSessionVault(req) {
  req.session.vault = null;
  req.session.coverPng = null;
  req.session.coverFileName = null;
  req.session.unlocked = false;
}

export function getCoverFileName(req) {
  requireUnlocked(req);
  return req.session.coverFileName || 'vault.png';
}

export function getVault(req) {
  requireUnlocked(req);
  return req.session.vault;
}

export function setVault(req, vault) {
  requireUnlocked(req);
  req.session.vault = vault;
}

export function getCoverPng(req) {
  requireUnlocked(req);
  return asBuffer(req.session.coverPng);
}

function asBuffer(value) {
  if (Buffer.isBuffer(value)) return value;
  if (value && value.type === 'Buffer' && Array.isArray(value.data)) {
    return Buffer.from(value.data);
  }
  throw new Error('Vault is locked');
}

export function updateCoverPng(req, buffer) {
  requireUnlocked(req);
  req.session.coverPng = buffer;
}
