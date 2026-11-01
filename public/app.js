const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => [...document.querySelectorAll(sel)];

let vault = {};
let selectedService = null;
let lastGenerated = '';
let vaultSourceFile = null;
let vaultFileHandle = null;
let vaultFileName = 'vault.png';
let pendingEditLogin = null;
let pendingRenameLogin = null;
let toastTimer = null;

function setVaultSource(file, handle = null) {
  vaultSourceFile = file;
  vaultFileHandle = handle;
  vaultFileName = file.name || 'vault.png';
  const label = vaultFileName;
  for (const id of ['unlock-file-label', 'new-file-label']) {
    const el = document.getElementById(id);
    if (!el) continue;
    el.textContent = label;
    el.classList.remove('hidden');
  }
  updateHeaderFileChip();
}

function clearVaultSource() {
  vaultSourceFile = null;
  vaultFileHandle = null;
  vaultFileName = 'vault.png';
  for (const id of ['unlock-file-label', 'new-file-label']) {
    const el = document.getElementById(id);
    if (!el) continue;
    el.textContent = '';
    el.classList.add('hidden');
  }
  $$('input[name=image]').forEach((input) => {
    input.value = '';
  });
  updateHeaderFileChip();
}

function updateHeaderFileChip() {
  const chip = $('#vault-file-chip');
  const unlocked = document.body.dataset.view === 'vault-ui';
  if (!unlocked || !vaultFileName) {
    chip.classList.add('hidden');
    chip.textContent = '';
    return;
  }
  chip.textContent = vaultFileName;
  chip.classList.remove('hidden');
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

function assignFileToInput(input, file) {
  const dt = new DataTransfer();
  dt.items.add(file);
  input.files = dt.files;
}

function isPngFile(file) {
  return file && (file.type === 'image/png' || /\.png$/i.test(file.name));
}

async function openVaultPngOnDisk() {
  showError('');
  if (!window.showOpenFilePicker) {
    showError(
      'Use the file chooser above. In-place save on disk needs a Chromium file picker.'
    );
    return;
  }
  try {
    const [handle] = await window.showOpenFilePicker({
      types: [{ description: 'PNG images', accept: { 'image/png': ['.png'] } }],
      mode: 'readwrite',
    });
    const file = await handle.getFile();
    if (!isPngFile(file)) {
      throw new Error('Only PNG images are supported');
    }
    const input =
      document.querySelector('#unlock-form:not(.hidden) input[name=image]') ||
      document.querySelector('#new-form:not(.hidden) input[name=image]');
    if (input) assignFileToInput(input, file);
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

$$('.dropzone').forEach((zone) => {
  const input = zone.querySelector('input[name=image]');
  zone.addEventListener('dragover', (e) => {
    e.preventDefault();
    zone.classList.add('dragover');
  });
  zone.addEventListener('dragleave', () => zone.classList.remove('dragover'));
  zone.addEventListener('drop', (e) => {
    e.preventDefault();
    zone.classList.remove('dragover');
    const file = e.dataTransfer.files?.[0];
    if (!file) return;
    if (!isPngFile(file)) {
      showError('Only PNG images are supported');
      return;
    }
    showError('');
    assignFileToInput(input, file);
    setVaultSource(file, null);
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

function showToast(msg) {
  const el = $('#toast');
  el.textContent = msg;
  el.classList.remove('hidden');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.add('hidden'), 2200);
}

function showView(id) {
  ['landing', 'unlock-form', 'new-form', 'vault-ui'].forEach((view) => {
    const el = document.getElementById(view);
    if (view === id) el.classList.remove('hidden');
    else el.classList.add('hidden');
  });
  document.body.dataset.view = id;
  const unlocked = id === 'vault-ui';
  $('#btn-save').classList.toggle('hidden', !unlocked);
  $('#btn-lock').classList.toggle('hidden', !unlocked);
  updateHeaderFileChip();
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

async function generatePassword(overrides = {}) {
  const form = $('#form-generate');
  const fd = new FormData(form);
  const body = {
    length: Number(fd.get('length') || 20),
    uppercase: fd.get('uppercase') === 'on',
    lowercase: fd.get('lowercase') === 'on',
    digits: fd.get('digits') === 'on',
    symbols: fd.get('symbols') === 'on',
    ...overrides,
  };
  const data = await apiJson('/api/generate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return data.password;
}

$$('.generate-into').forEach((btn) => {
  btn.addEventListener('click', async () => {
    const form = btn.closest('form');
    const input = form?.elements?.[btn.dataset.for];
    if (!input) return;
    try {
      const password = await generatePassword();
      input.value = password;
      input.type = 'text';
      input.focus();
      input.select();
    } catch (err) {
      showError(err.message);
    }
  });
});

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
    await loadVault({ keepSelection: false });
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
    await loadVault({ keepSelection: false });
    showView('vault-ui');
  } catch (err) {
    showError(err.message);
  }
});

async function loadVault({ keepSelection = true } = {}) {
  const data = await apiJson('/api/vault');
  vault = data.vault || {};
  if (!keepSelection || !selectedService || !Object.hasOwn(vault, selectedService)) {
    selectedService = null;
  }
  renderServices();
  renderLogins();
  await refreshCapacity();
}

function serviceNames() {
  return Object.keys(vault).sort((a, b) => a.localeCompare(b));
}

function renderServices() {
  const filterInput = $('#service-filter');
  const names = serviceNames();
  filterInput.classList.toggle('hidden', names.length === 0);
  const filter = (filterInput.value || '').trim().toLowerCase();
  const ul = $('#service-list');
  ul.innerHTML = '';
  let shown = 0;
  for (const name of names) {
    if (filter && !name.toLowerCase().includes(filter)) continue;
    shown += 1;
    const count = Object.keys(vault[name] || {}).length;
    const li = document.createElement('li');
    const btn = document.createElement('button');
    btn.type = 'button';
    const label = document.createElement('span');
    label.textContent = name;
    const badge = document.createElement('span');
    badge.className = 'service-count';
    badge.textContent = String(count);
    if (name === selectedService) btn.classList.add('active');
    btn.addEventListener('click', () => {
      selectedService = name;
      renderServices();
      renderLogins();
    });
    btn.append(label, badge);
    li.appendChild(btn);
    ul.appendChild(li);
  }
  const empty = $('#service-empty');
  if (names.length === 0) {
    empty.textContent = 'No services yet. Add one to get started.';
    empty.classList.remove('hidden');
  } else if (shown === 0) {
    empty.textContent = 'No services match that filter.';
    empty.classList.remove('hidden');
  } else {
    empty.classList.add('hidden');
  }
}

$('#service-filter').addEventListener('input', renderServices);

function flashCopied(btn) {
  const prev = btn.textContent;
  btn.textContent = 'Copied';
  setTimeout(() => {
    btn.textContent = prev;
  }, 1200);
}

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
    const card = document.createElement('article');
    card.className = 'login-card';

    const id = document.createElement('div');
    id.className = 'login-id';
    id.textContent = login;

    const tdAct = document.createElement('div');
    tdAct.className = 'login-actions';
    const editBtn = document.createElement('button');
    editBtn.type = 'button';
    editBtn.textContent = 'Edit';
    editBtn.addEventListener('click', () => openEditLogin(login, password));
    const renBtn = document.createElement('button');
    renBtn.type = 'button';
    renBtn.textContent = 'Rename';
    renBtn.addEventListener('click', () => openRenameLogin(login));
    const delBtn = document.createElement('button');
    delBtn.type = 'button';
    delBtn.textContent = 'Delete';
    delBtn.addEventListener('click', () => deleteLogin(login));
    tdAct.append(editBtn, renBtn, delBtn);

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
    copyBtn.addEventListener('click', async () => {
      await navigator.clipboard.writeText(password);
      flashCopied(copyBtn);
      showToast('Password copied');
    });
    wrap.append(input, showBtn, copyBtn);

    card.append(id, tdAct, wrap);
    tbody.appendChild(card);
  }
}

function openEditLogin(login, current) {
  pendingEditLogin = login;
  $('#edit-login-name').textContent = login;
  const form = $('#form-edit-login');
  form.password.value = current;
  form.password.type = 'password';
  $('#edit-login-dialog').showModal();
  form.password.focus();
}

function openRenameLogin(login) {
  pendingRenameLogin = login;
  const form = $('#form-rename-login');
  form.newLogin.value = login;
  $('#rename-login-dialog').showModal();
  form.newLogin.focus();
  form.newLogin.select();
}

function confirmAction(title, message) {
  return new Promise((resolve) => {
    const dlg = $('#confirm-dialog');
    $('#confirm-title').textContent = title;
    $('#confirm-message').textContent = message;
    const onClose = () => {
      dlg.removeEventListener('close', onClose);
      resolve(dlg.returnValue === 'yes');
    };
    dlg.addEventListener('close', onClose);
    dlg.showModal();
  });
}

$('#form-edit-login').addEventListener('submit', async (e) => {
  e.preventDefault();
  if (!pendingEditLogin || !selectedService) return;
  const password = e.target.password.value;
  try {
    await apiJson(
      `/api/services/${encodeURIComponent(selectedService)}/logins`,
      {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ login: pendingEditLogin, password }),
      }
    );
    $('#edit-login-dialog').close();
    pendingEditLogin = null;
    await loadVault();
  } catch (err) {
    showError(err.message);
  }
});

$('#edit-login-cancel').addEventListener('click', () => {
  $('#edit-login-dialog').close();
});

$('#form-rename-login').addEventListener('submit', async (e) => {
  e.preventDefault();
  if (!pendingRenameLogin || !selectedService) return;
  const newLogin = e.target.newLogin.value.trim();
  if (!newLogin || newLogin === pendingRenameLogin) {
    $('#rename-login-dialog').close();
    return;
  }
  try {
    await apiJson(
      `/api/services/${encodeURIComponent(selectedService)}/logins`,
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ oldLogin: pendingRenameLogin, newLogin }),
      }
    );
    $('#rename-login-dialog').close();
    pendingRenameLogin = null;
    await loadVault();
  } catch (err) {
    showError(err.message);
  }
});

$('#rename-login-cancel').addEventListener('click', () => {
  $('#rename-login-dialog').close();
});

async function deleteLogin(login) {
  const ok = await confirmAction(
    'Delete login',
    `Delete login “${login}”? This cannot be undone until you save a new image.`
  );
  if (!ok) return;
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

$('#btn-open-add-service').addEventListener('click', () => {
  $('#form-add-service').reset();
  $('#add-service-dialog').showModal();
  $('#form-add-service').elements.name.focus();
});

$('#add-service-cancel').addEventListener('click', () => {
  $('#add-service-dialog').close();
});

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
    selectedService = String(fd.get('name'));
    e.target.reset();
    $('#add-service-dialog').close();
    await loadVault();
  } catch (err) {
    showError(err.message);
  }
});

$('#btn-delete-service').addEventListener('click', async () => {
  if (!selectedService) return;
  const ok = await confirmAction(
    'Delete service',
    `Delete entire service “${selectedService}” and all of its logins?`
  );
  if (!ok) return;
  try {
    await apiJson(`/api/services/${encodeURIComponent(selectedService)}`, {
      method: 'DELETE',
    });
    selectedService = null;
    await loadVault();
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
    const pw = e.target.elements.password;
    if (pw) pw.type = 'password';
    await loadVault();
  } catch (err) {
    showError(err.message);
  }
});

$('#form-generate').addEventListener('submit', async (e) => {
  e.preventDefault();
  try {
    lastGenerated = await generatePassword();
    $('#generated-password').textContent = lastGenerated;
    $('#btn-copy-generated').classList.remove('hidden');
  } catch (err) {
    showError(err.message);
  }
});

$('#btn-copy-generated').addEventListener('click', async () => {
  if (!lastGenerated) return;
  await navigator.clipboard.writeText(lastGenerated);
  flashCopied($('#btn-copy-generated'));
  showToast('Password copied');
});

async function refreshCapacity() {
  const warn = $('#capacity-warning');
  try {
    const data = await apiJson('/api/vault/capacity');
    if (!data.fits) {
      warn.textContent = `Cover image may be too small (${data.estimatedPayloadBytes} bytes needed, ${data.capacityBytes} available). Use a larger PNG before saving.`;
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
    ? vaultFileName
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
    updateHeaderFileChip();
    await refreshCapacity();
    showToast('Vault image saved');
  } catch (err) {
    showError(err.message);
  }
});

showView('landing');
