/**
 * Vault JSON validate and CRUD for services and logins.
 */

export function validateVault(vault) {
  if (vault === null || typeof vault !== 'object' || Array.isArray(vault)) {
    throw new Error('Invalid vault');
  }
  for (const [serviceName, logins] of Object.entries(vault)) {
    if (typeof serviceName !== 'string' || serviceName.trim() === '') {
      throw new Error('Empty service name');
    }
    if (logins === null || typeof logins !== 'object' || Array.isArray(logins)) {
      throw new Error('Invalid logins for service');
    }
    for (const [login, password] of Object.entries(logins)) {
      if (typeof login !== 'string' || login.trim() === '') {
        throw new Error('Empty login key');
      }
      if (typeof password !== 'string') {
        throw new Error('Invalid password');
      }
    }
  }
}

export function emptyVault() {
  return {};
}

export function listServiceNames(vault) {
  validateVault(vault);
  return Object.keys(vault).sort((a, b) => a.localeCompare(b));
}

export function getService(vault, name) {
  validateVault(vault);
  if (!(name in vault)) {
    return null;
  }
  return { ...vault[name] };
}

export function addService(vault, name, login, password) {
  validateVault(vault);
  if (typeof name !== 'string' || name.trim() === '') {
    throw new Error('Empty service name');
  }
  if (typeof login !== 'string' || login.trim() === '') {
    throw new Error('Empty login key');
  }
  if (typeof password !== 'string') {
    throw new Error('Invalid password');
  }
  const next = structuredClone(vault);
  if (name in next) {
    if (login in next[name]) {
      throw new Error('Login already exists for service');
    }
    next[name][login] = password;
  } else {
    next[name] = { [login]: password };
  }
  validateVault(next);
  return next;
}

export function addOrUpdateLogin(vault, serviceName, login, password) {
  validateVault(vault);
  if (!(serviceName in vault)) {
    throw new Error('Service not found');
  }
  if (typeof login !== 'string' || login.trim() === '') {
    throw new Error('Empty login key');
  }
  if (typeof password !== 'string') {
    throw new Error('Invalid password');
  }
  const next = structuredClone(vault);
  next[serviceName][login] = password;
  validateVault(next);
  return next;
}

export function renameLogin(vault, serviceName, oldLogin, newLogin) {
  validateVault(vault);
  if (!(serviceName in vault)) {
    throw new Error('Service not found');
  }
  if (!(oldLogin in vault[serviceName])) {
    throw new Error('Login not found');
  }
  if (typeof newLogin !== 'string' || newLogin.trim() === '') {
    throw new Error('Empty login key');
  }
  if (newLogin !== oldLogin && newLogin in vault[serviceName]) {
    throw new Error('Login already exists for service');
  }
  const next = structuredClone(vault);
  const password = next[serviceName][oldLogin];
  delete next[serviceName][oldLogin];
  next[serviceName][newLogin] = password;
  validateVault(next);
  return next;
}

export function deleteLogin(vault, serviceName, login) {
  validateVault(vault);
  if (!(serviceName in vault)) {
    throw new Error('Service not found');
  }
  if (!(login in vault[serviceName])) {
    throw new Error('Login not found');
  }
  const next = structuredClone(vault);
  delete next[serviceName][login];
  if (Object.keys(next[serviceName]).length === 0) {
    delete next[serviceName];
  }
  validateVault(next);
  return next;
}

export function deleteService(vault, serviceName) {
  validateVault(vault);
  if (!(serviceName in vault)) {
    throw new Error('Service not found');
  }
  const next = structuredClone(vault);
  delete next[serviceName];
  validateVault(next);
  return next;
}
