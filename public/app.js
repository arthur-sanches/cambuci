const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => [...document.querySelectorAll(sel)];

let vault = {};
let selectedService = null;
let lastGenerated = '';
let vaultSourceFile = null;
let vaultFileHandle = null;
let vaultFileName = 'vault.png';

function setVaultSource(file, handle = null) {
  vaultSourceFile = file;
  vaultFileHandle = handle;
  vaultFileName = file.name || 'vault.png';
  const label = `Selected: ${vaultFileName}`;
  const unlockLbl = $('#unlock-file-label');
  const newLbl = $('#new-file-label');
  if (unlockLbl) unlockLbl.textContent = label;
  if (newLbl) newLbl.textContent = label;
}

function clearVaultSource() {
  vaultSourceFile = null;
  vaultFileHandle = null;
  vaultFileName = 'vault.png';
  const unlockLbl = $('#unlock-file-label');
  const newLbl = $('#new-file-label');
  if (unlockLbl) unlockLbl.textContent = '';
  if (newLbl) newLbl.textContent = '';
}

function vaultImageFromForm(form) {
  const file =
    vaultSourceFile || form.querySelector('input[name=image]')?.files?.[0];
  if (!file) throw new Error('PNG image is required');
  return file;
}

function buildVaultFormData(form, fields) {
  const fd = new FormData();
  fd.append('image', vaultImageFromForm(form));
  for (const [key, value] of Object.entries(fields)) {
    fd.append(key, value);
  }
  return fd;
}

async function openVaultPngOnDisk() {
  showError('');
  if (!window.showOpenFilePicker) {
    showError(
      'Use the file chooser above. In-place save on disk needs Chrome or Edge.'
    );
    return;
  }
  try {
    const [handle] = await window.showOpenFilePicker({
      types: [{ description: 'PNG images', accept: { 'image/png': ['.png'] } }],
      mode: 'readwrite',
    });
    const file = await handle.getFile();
    if (file.type && file.type !== 'image/png') {
      throw new Error('Only PNG images are supported');
    }
    setVaultSource(file, handle);
  } catch (err) {
    if (err.name !== 'AbortError') {
      showError(err.message || 'Could not open file');
    }
  }
}

$$('.open-vault-file').forEach((btn) =>
  btn.addEventListener('click', openVaultPngOnDisk)
);

$$('input[name=image]').forEach((input) => {
  input.addEventListener('change', () => {
    const file = input.files?.[0];
    if (file) setVaultSource(file, null);
  });
});

async function persistVaultImage(blob, filename) {
  const bytes = await blob.arrayBuffer();
  if (vaultFileHandle) {
    try {
      const writable = await vaultFileHandle.createWritable();
      await writable.write(bytes);
      await writable.close();
      return;
    } catch (err) {
      vaultFileHandle = null;
      throw new Error(
        err?.message ||
          'Could not write to the file on disk. Try saving again or use the file chooser.'
      );
    }
  }
  const outBlob = new Blob([bytes], { type: 'image/png' });
  const url = URL.createObjectURL(outBlob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

async function apiSaveVault(masterPassword) {
  const res = await fetch('/api/vault/save', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'image/png',
    },
    body: JSON.stringify({ masterPassword }),
  });
  const ct = res.headers.get('Content-Type') || '';
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || 'Save failed');
  }
  if (!ct.includes('image/png')) {
    throw new Error('Save failed');
  }
  const blob = await res.blob();
  const dispo = res.headers.get('Content-Disposition') || '';
  const match = /filename="([^"]+)"/.exec(dispo);
  const filename = match?.[1] || vaultFileName;
  vaultFileName = filename;
  return { blob, filename };
}

function showError(msg) {
  const el = $('#global-error');
  if (!msg) {
    el.classList.add('hidden');
    el.textContent = '';
    return;
  }
  el.textContent = msg;
  el.classList.remove('hidden');
}

function showView(id) {
  ['landing', 'unlock-form', 'new-form', 'vault-ui'].forEach((view) => {
    const el = document.getElementById(view);
    if (view === id) el.classList.remove('hidden');
    else el.classList.add('hidden');
  });
  showError('');
}

async function apiJson(url, opts = {}) {
  const res = await fetch(url, {
    ...opts,
    headers: { Accept: 'application/json', ...(opts.headers || {}) },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || 'Request failed');
  }
  return data;
}

async function apiForm(url, formData) {
  const res = await fetch(url, { method: 'POST', body: formData });
  const ct = res.headers.get('Content-Type') || '';
  if (ct.includes('image/png')) {
    if (!res.ok) throw new Error('Save failed');
    return { blob: await res.blob(), ok: true };
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Request failed');
  return data;
}

$('#btn-show-unlock').addEventListener('click', () => showView('unlock-form'));
$('#btn-show-new').addEventListener('click', () => showView('new-form'));
$$('[data-back]').forEach((btn) =>
  btn.addEventListener('click', () => showView('landing'))
);

$('#form-unlock').addEventListener('submit', async (e) => {
  e.preventDefault();
  showError('');
  const form = e.target;
  try {
    const fd = buildVaultFormData(form, {
      masterPassword: form.masterPassword.value,
    });
    const data = await apiForm('/api/vault/unlock', fd);
    if (data.coverFileName) vaultFileName = data.coverFileName;
    await loadVault();
    showView('vault-ui');
  } catch (err) {
    showError(err.message);
  }
});

$('#form-new').addEventListener('submit', async (e) => {
  e.preventDefault();
  showError('');
  const form = e.target;
  try {
    const fd = buildVaultFormData(form, {
      masterPassword: form.masterPassword.value,
      masterPasswordConfirm: form.masterPasswordConfirm.value,
    });
    const data = await apiForm('/api/vault/new', fd);
    if (data.coverFileName) vaultFileName = data.coverFileName;
    await loadVault();
    showView('vault-ui');
  } catch (err) {
    showError(err.message);
  }
});

async function loadVault() {
  const data = await apiJson('/api/vault');
  vault = data.vault || {};
  selectedService = null;
  renderServices();
  renderLogins();
  await refreshCapacity();
}

function serviceNames() {
  return Object.keys(vault).sort((a, b) => a.localeCompare(b));
}

function renderServices() {
  const filter = ($('#service-filter').value || '').trim().toLowerCase();
  const ul = $('#service-list');
  ul.innerHTML = '';
  for (const name of serviceNames()) {
    if (filter && !name.toLowerCase().includes(filter)) continue;
    const li = document.createElement('li');
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.textContent = name;
    if (name === selectedService) btn.classList.add('active');
    btn.addEventListener('click', () => {
      selectedService = name;
      renderServices();
      renderLogins();
    });
    li.appendChild(btn);
    ul.appendChild(li);
  }
}

$('#service-filter').addEventListener('input', renderServices);

function renderLogins() {
  const title = $('#selected-service-title');
  const table = $('#login-table');
  const empty = $('#login-empty');
  const addForm = $('#form-add-login');
  const delSvc = $('#btn-delete-service');
  const tbody = $('#login-rows');
  tbody.innerHTML = '';

  if (!selectedService || !(selectedService in vault)) {
    title.textContent = 'Select a service';
    table.classList.add('hidden');
    addForm.classList.add('hidden');
    delSvc.classList.add('hidden');
    empty.classList.remove('hidden');
    return;
  }

  empty.classList.add('hidden');
  title.textContent = selectedService;
  table.classList.remove('hidden');
  addForm.classList.remove('hidden');
  delSvc.classList.remove('hidden');

  const logins = vault[selectedService];
  for (const [login, password] of Object.entries(logins)) {
    const tr = document.createElement('tr');
    const tdLogin = document.createElement('td');
    tdLogin.className = 'col-login';
    tdLogin.textContent = login;
    const tdPw = document.createElement('td');
    tdPw.className = 'col-password';
    const wrap = document.createElement('div');
    wrap.className = 'pw-field';
    const input = document.createElement('input');
    input.type = 'password';
    input.className = 'pw-value';
    input.value = password;
    input.readOnly = true;
    const showBtn = document.createElement('button');
    showBtn.type = 'button';
    showBtn.textContent = 'Show';
    showBtn.addEventListener('click', () => {
      const hidden = input.type === 'password';
      input.type = hidden ? 'text' : 'password';
      showBtn.textContent = hidden ? 'Hide' : 'Show';
      if (hidden) {
        input.focus();
        input.select();
      }
    });
    const copyBtn = document.createElement('button');
    copyBtn.type = 'button';
    copyBtn.textContent = 'Copy';
    copyBtn.addEventListener('click', () =>
      navigator.clipboard.writeText(password)
    );
    const pwActions = document.createElement('div');
    pwActions.className = 'pw-field-actions';
    pwActions.append(showBtn, copyBtn);
    wrap.append(input, pwActions);
    tdPw.appendChild(wrap);

    const tdAct = document.createElement('td');
    tdAct.className = 'actions col-actions';
    const editBtn = document.createElement('button');
    editBtn.type = 'button';
    editBtn.textContent = 'Edit';
    editBtn.addEventListener('click', () => editLogin(login, password));
    const renBtn = document.createElement('button');
    renBtn.type = 'button';
    renBtn.textContent = 'Rename';
    renBtn.addEventListener('click', () => renameLoginPrompt(login));
    const delBtn = document.createElement('button');
    delBtn.type = 'button';
    delBtn.textContent = 'Delete';
    delBtn.addEventListener('click', () => deleteLogin(login));
    tdAct.append(editBtn, renBtn, delBtn);

    tr.append(tdLogin, tdPw, tdAct);
    tbody.appendChild(tr);
  }
}

async function editLogin(login, current) {
  const password = prompt('New password (leave blank to keep current)', current);
  if (password === null) return;
  const next = password === '' ? current : password;
  try {
    await apiJson(
      `/api/services/${encodeURIComponent(selectedService)}/logins`,
      {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ login, password: next }),
      }
    );
    await loadVault();
    selectedService = selectedService;
    renderLogins();
  } catch (err) {
    showError(err.message);
  }
}

async function renameLoginPrompt(oldLogin) {
  const newLogin = prompt('New login name', oldLogin);
  if (!newLogin || newLogin === oldLogin) return;
  try {
    await apiJson(
      `/api/services/${encodeURIComponent(selectedService)}/logins`,
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ oldLogin, newLogin }),
      }
    );
    await loadVault();
    renderLogins();
  } catch (err) {
    showError(err.message);
  }
}

async function deleteLogin(login) {
  if (!confirm(`Delete login "${login}"?`)) return;
  try {
    const data = await apiJson(
      `/api/services/${encodeURIComponent(selectedService)}/logins`,
      {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ login }),
      }
    );
    await loadVault();
    if (data.services && !data.services.includes(selectedService)) {
      selectedService = null;
    }
    renderServices();
    renderLogins();
  } catch (err) {
    showError(err.message);
  }
}

$('#form-add-service').addEventListener('submit', async (e) => {
  e.preventDefault();
  showError('');
  const fd = new FormData(e.target);
  try {
    await apiJson('/api/services', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: fd.get('name'),
        login: fd.get('login'),
        password: fd.get('password'),
      }),
    });
    e.target.reset();
    selectedService = fd.get('name');
    await loadVault();
    renderLogins();
  } catch (err) {
    showError(err.message);
  }
});

$('#btn-delete-service').addEventListener('click', async () => {
  if (!selectedService) return;
  if (!confirm(`Delete entire service "${selectedService}"?`)) return;
  try {
    await apiJson(`/api/services/${encodeURIComponent(selectedService)}`, {
      method: 'DELETE',
    });
    selectedService = null;
    await loadVault();
    renderServices();
    renderLogins();
  } catch (err) {
    showError(err.message);
  }
});

$('#form-add-login').addEventListener('submit', async (e) => {
  e.preventDefault();
  if (!selectedService) return;
  showError('');
  const fd = new FormData(e.target);
  try {
    await apiJson(
      `/api/services/${encodeURIComponent(selectedService)}/logins`,
      {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          login: fd.get('login'),
          password: fd.get('password'),
        }),
      }
    );
    e.target.reset();
    await loadVault();
    renderLogins();
  } catch (err) {
    showError(err.message);
  }
});

$('#form-generate').addEventListener('submit', async (e) => {
  e.preventDefault();
  const fd = new FormData(e.target);
  const body = {
    length: Number(fd.get('length')),
    uppercase: fd.get('uppercase') === 'on',
    lowercase: fd.get('lowercase') === 'on',
    digits: fd.get('digits') === 'on',
    symbols: fd.get('symbols') === 'on',
  };
  try {
    const data = await apiJson('/api/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    lastGenerated = data.password;
    $('#generated-password').textContent = lastGenerated;
    $('#btn-copy-generated').classList.remove('hidden');
  } catch (err) {
    showError(err.message);
  }
});

$('#btn-copy-generated').addEventListener('click', () => {
  if (lastGenerated) navigator.clipboard.writeText(lastGenerated);
});

async function refreshCapacity() {
  const warn = $('#capacity-warning');
  try {
    const data = await apiJson('/api/vault/capacity');
    if (!data.fits) {
      warn.textContent = `Warning: cover image may be too small (${data.estimatedPayloadBytes} bytes needed, ${data.capacityBytes} bytes available). Use a larger PNG before saving.`;
      warn.classList.remove('hidden');
    } else {
      warn.classList.add('hidden');
    }
  } catch {
    warn.classList.add('hidden');
  }
}

$('#btn-lock').addEventListener('click', async () => {
  try {
    await apiJson('/api/vault/lock', { method: 'POST' });
  } catch {
    /* still leave UI */
  }
  vault = {};
  selectedService = null;
  clearVaultSource();
  showView('landing');
});

const saveDialog = $('#save-dialog');
$('#btn-save').addEventListener('click', () => {
  $('#save-target-name').textContent = vaultFileName
    ? `File: ${vaultFileName}`
    : '';
  saveDialog.showModal();
});
$('#save-cancel').addEventListener('click', () => saveDialog.close());

$('#form-save').addEventListener('submit', async (e) => {
  e.preventDefault();
  showError('');
  const masterPassword = e.target.masterPassword.value;
  try {
    const { blob, filename } = await apiSaveVault(masterPassword);
    await persistVaultImage(blob, filename);
    e.target.reset();
    saveDialog.close();
    await refreshCapacity();
  } catch (err) {
    showError(err.message);
  }
});
