import crypto from 'node:crypto';
import express from 'express';
import session from 'express-session';
import multer from 'multer';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { MemorySessionStore } from './memorySessionStore.js';
import {
  encryptVault,
  decryptVault,
  payloadSizeForVault,
  UNLOCK_ERROR,
} from './crypto.js';
import { embedInPng, extractFromPng, decodePng, capacityBytes } from './stego.js';
import {
  emptyVault,
  listServiceNames,
  addService,
  addOrUpdateLogin,
  renameLogin,
  deleteLogin,
  deleteService,
  validateVault,
} from './vault.js';
import { generatePassword } from './generatePassword.js';
import {
  setSessionVault,
  clearSessionVault,
  getVault,
  setVault,
  getCoverPng,
  getCoverFileName,
} from './sessionVault.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT ? Number(process.env.PORT) : 8000;

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
});

const app = express();
app.disable('x-powered-by');

app.use(express.json({ limit: '1mb' }));

app.use(
  session({
    store: new MemorySessionStore(),
    secret: crypto.randomBytes(32).toString('hex'),
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: 'strict',
      secure: false,
    },
  })
);

app.use('/api', (req, res, next) => {
  res.set('Cache-Control', 'no-store');
  next();
});

app.use(express.static(path.join(__dirname, '../public')));

function isPng(buffer) {
  return (
    buffer.length >= 8 &&
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47
  );
}

function handleError(res, err, status = 400) {
  const message =
    err.message === UNLOCK_ERROR ? UNLOCK_ERROR : err.message || 'Request failed';
  res.status(err.status || status).json({ ok: false, error: message });
}

function validateMasterPassword(password) {
  if (typeof password !== 'string' || password.length < 12) {
    throw new Error('Master password must be at least 12 characters');
  }
}

function vaultImageFilename(originalName) {
  const base = path.basename(String(originalName || 'vault.png'));
  const safe = base.replace(/[^\w.\- ()[\]]+/g, '').trim();
  if (!safe) return 'vault.png';
  return safe.toLowerCase().endsWith('.png') ? safe : `${safe}.png`;
}

function contentDispositionFilename(name) {
  const escaped = name.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  return `attachment; filename="${escaped}"`;
}

app.post('/api/vault/new', upload.single('image'), (req, res) => {
  try {
    if (!req.file?.buffer) {
      return handleError(res, new Error('PNG cover image is required'));
    }
    if (!isPng(req.file.buffer)) {
      return handleError(res, new Error('Only PNG images are supported'));
    }
    const { masterPassword, masterPasswordConfirm } = req.body;
    validateMasterPassword(masterPassword);
    if (masterPassword !== masterPasswordConfirm) {
      return handleError(res, new Error('Passwords do not match'));
    }
    const vault = emptyVault();
    const coverFileName = vaultImageFilename(req.file.originalname);
    setSessionVault(req, vault, Buffer.from(req.file.buffer), coverFileName);
    res.json({ ok: true, services: listServiceNames(vault), coverFileName });
  } catch (err) {
    handleError(res, err);
  }
});

app.post('/api/vault/unlock', upload.single('image'), (req, res) => {
  try {
    if (!req.file?.buffer) {
      return handleError(res, new Error('Vault PNG is required'));
    }
    if (!isPng(req.file.buffer)) {
      return handleError(res, new Error('Only PNG images are supported'));
    }
    const { masterPassword } = req.body;
    if (typeof masterPassword !== 'string' || masterPassword.length === 0) {
      return handleError(res, new Error(UNLOCK_ERROR), 401);
    }
    const pngBuf = Buffer.from(req.file.buffer);
    let payload;
    try {
      payload = extractFromPng(pngBuf);
    } catch {
      return handleError(res, new Error(UNLOCK_ERROR), 401);
    }
    let vault;
    try {
      vault = decryptVault(payload, masterPassword);
      validateVault(vault);
    } catch {
      return handleError(res, new Error(UNLOCK_ERROR), 401);
    }
    const coverFileName = vaultImageFilename(req.file.originalname);
    setSessionVault(req, vault, pngBuf, coverFileName);
    res.json({ ok: true, services: listServiceNames(vault), coverFileName });
  } catch (err) {
    handleError(res, new Error(UNLOCK_ERROR), 401);
  }
});

app.get('/api/vault', (req, res) => {
  try {
    const vault = getVault(req);
    res.json({ ok: true, vault });
  } catch (err) {
    handleError(res, err, 401);
  }
});

app.post('/api/vault/lock', (req, res) => {
  clearSessionVault(req);
  req.session.destroy(() => {
    res.json({ ok: true });
  });
});

app.get('/api/vault/capacity', (req, res) => {
  try {
    const cover = getCoverPng(req);
    const vault = getVault(req);
    const png = decodePng(cover);
    const cap = capacityBytes(png.width, png.height);
    const estimated = payloadSizeForVault(vault);
    res.json({
      ok: true,
      capacityBytes: cap,
      estimatedPayloadBytes: estimated,
      fits: estimated <= cap,
    });
  } catch (err) {
    handleError(res, err, 401);
  }
});

app.post('/api/vault/save', (req, res) => {
  try {
    const vault = getVault(req);
    const cover = getCoverPng(req);
    const coverFileName = getCoverFileName(req);
    const { masterPassword } = req.body;
    validateMasterPassword(masterPassword);
    const payload = encryptVault(vault, masterPassword);
    const pngMeta = decodePng(cover);
    const cap = capacityBytes(pngMeta.width, pngMeta.height);
    if (payload.length > cap) {
      return handleError(
        res,
        new Error(
          `Image is too small. Need ${payload.length} bytes but capacity is ${cap}. Use a larger PNG.`
        )
      );
    }
    const outPng = embedInPng(cover, payload);
    const pngBytes = Buffer.from(outPng);
    setSessionVault(req, vault, pngBytes, coverFileName);
    res.set('Content-Type', 'image/png');
    res.set('Content-Disposition', contentDispositionFilename(coverFileName));
    res.send(pngBytes);
  } catch (err) {
    handleError(res, err, err.status || 400);
  }
});

app.post('/api/services', (req, res) => {
  try {
    const { name, login, password } = req.body;
    let vault = getVault(req);
    vault = addService(vault, name, login, password);
    setVault(req, vault);
    res.json({ ok: true, services: listServiceNames(vault) });
  } catch (err) {
    handleError(res, err);
  }
});

app.put('/api/services/:name/logins', (req, res) => {
  try {
    const serviceName = decodeURIComponent(req.params.name);
    const { login, password } = req.body;
    let vault = getVault(req);
    vault = addOrUpdateLogin(vault, serviceName, login, password);
    setVault(req, vault);
    res.json({ ok: true });
  } catch (err) {
    handleError(res, err);
  }
});

app.patch('/api/services/:name/logins', (req, res) => {
  try {
    const serviceName = decodeURIComponent(req.params.name);
    const { oldLogin, newLogin } = req.body;
    let vault = getVault(req);
    vault = renameLogin(vault, serviceName, oldLogin, newLogin);
    setVault(req, vault);
    res.json({ ok: true });
  } catch (err) {
    handleError(res, err);
  }
});

app.delete('/api/services/:name/logins', (req, res) => {
  try {
    const serviceName = decodeURIComponent(req.params.name);
    const { login } = req.body;
    let vault = getVault(req);
    vault = deleteLogin(vault, serviceName, login);
    setVault(req, vault);
    res.json({ ok: true, services: listServiceNames(vault) });
  } catch (err) {
    handleError(res, err);
  }
});

app.delete('/api/services/:name', (req, res) => {
  try {
    const serviceName = decodeURIComponent(req.params.name);
    let vault = getVault(req);
    vault = deleteService(vault, serviceName);
    setVault(req, vault);
    res.json({ ok: true, services: listServiceNames(vault) });
  } catch (err) {
    handleError(res, err);
  }
});

app.post('/api/generate', (req, res) => {
  try {
    const password = generatePassword(req.body);
    res.json({ ok: true, password });
  } catch (err) {
    handleError(res, err);
  }
});

const server = app.listen(PORT, '127.0.0.1', () => {
  // Intentionally minimal logging (no secrets)
  console.log(`Cambuci listening on http://127.0.0.1:${PORT}`);
});

function shutdown() {
  server.close(() => {
    process.exit(0);
  });
  setTimeout(() => process.exit(0), 2000).unref();
}

process.once('SIGINT', shutdown);
process.once('SIGTERM', shutdown);
