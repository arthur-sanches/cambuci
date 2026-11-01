# Cambuci

**Cambuci** is a fully local password manager. Nothing is stored in the cloud. Your vault is JSON, encrypted with **AES-256-GCM** (key derived via **PBKDF2-HMAC-SHA256** from your master password), then hidden inside a PNG you choose using simple LSB steganography. The downloaded PNG **is** your vault.

## Important

- **Local only:** the server binds to `127.0.0.1`. Do not expose it to the network.
- **PNG only:** lossy formats (JPEG, WebP, etc.) destroy hidden data.
- **You must keep both** the vault PNG and your master password. Losing either means losing the vault. Steganography hides data in the image; it is **not** a substitute for encryption (encryption is applied before embedding).
- **Back up your vault PNG.** After saving, that file is your only copy.

## Requirements

- Node.js 20+ (LTS recommended)

## Run

```bash
npm install
npm start
```

Open [http://127.0.0.1:8000](http://127.0.0.1:8000) (or the port shown in the terminal if you set `PORT`).

## Tests

```bash
npm test
```

## Usage

1. **Create new vault** — upload a cover PNG, set a master password (minimum 12 characters), confirm it.
2. **Unlock** — upload your vault PNG and enter the master password.
3. Add services and logins, generate passwords, edit or delete entries.
4. **Save image** — re-enter your master password and download the updated PNG. Store it safely.
5. **Lock** when you are done; the decrypted vault stays only in memory while unlocked.

## Project layout

- `src/server.js` — Express API and static UI
- `src/crypto.js` — encrypt/decrypt vault payload
- `src/stego.js` — PNG LSB embed/extract
- `src/vault.js` — vault JSON helpers
- `public/` — single-page UI

See `PLAN.md` for the full specification.
