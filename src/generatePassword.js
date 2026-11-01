import crypto from 'node:crypto';

const UPPER = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const LOWER = 'abcdefghijklmnopqrstuvwxyz';
const DIGITS = '0123456789';
const SYMBOLS = '!@#$%^&*()-_=+[]{}|;:,.<>?';

/**
 * @param {{ length?: number, uppercase?: boolean, lowercase?: boolean, digits?: boolean, symbols?: boolean }} opts
 */
export function generatePassword(opts = {}) {
  const length = opts.length ?? 20;
  if (length < 12 || length > 64) {
    throw new Error('Length must be between 12 and 64');
  }
  const useUpper = opts.uppercase !== false;
  const useLower = opts.lowercase !== false;
  const useDigits = opts.digits !== false;
  const useSymbols = opts.symbols !== false;

  let pool = '';
  const required = [];
  if (useUpper) {
    pool += UPPER;
    required.push(pick(UPPER));
  }
  if (useLower) {
    pool += LOWER;
    required.push(pick(LOWER));
  }
  if (useDigits) {
    pool += DIGITS;
    required.push(pick(DIGITS));
  }
  if (useSymbols) {
    pool += SYMBOLS;
    required.push(pick(SYMBOLS));
  }
  if (pool.length === 0) {
    throw new Error('At least one character set must be enabled');
  }

  const chars = [...required];
  while (chars.length < length) {
    chars.push(pick(pool));
  }
  shuffle(chars);
  return chars.join('');
}

function pick(pool) {
  const i = crypto.randomInt(0, pool.length);
  return pool[i];
}

function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = crypto.randomInt(0, i + 1);
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
}
