import { app, BrowserWindow, shell } from 'electron';
import { startServer, stopServer } from './server.js';

// npm-installed Electron cannot use the setuid chrome-sandbox helper.
if (process.platform === 'linux') {
  app.commandLine.appendSwitch('no-sandbox');
}

let mainWindow = null;
let httpServer = null;
let appUrl = null;

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (!mainWindow) return;
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  });
}

function isAppUrl(url) {
  return Boolean(appUrl) && url.startsWith(appUrl);
}

async function createWindow() {
  const listenPort = process.env.PORT ? Number(process.env.PORT) : 0;
  const started = await startServer({ port: listenPort });
  httpServer = started.server;
  appUrl = started.url;

  mainWindow = new BrowserWindow({
    width: 1100,
    height: 760,
    minWidth: 720,
    minHeight: 520,
    title: 'Cambuci',
    autoHideMenuBar: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
    },
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (isAppUrl(url)) {
      return { action: 'allow' };
    }
    shell.openExternal(url);
    return { action: 'deny' };
  });

  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (!isAppUrl(url)) {
      event.preventDefault();
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  await mainWindow.loadURL(appUrl);
}

function closeHttpServer() {
  const server = httpServer;
  httpServer = null;
  void stopServer(server);
}

app.on('window-all-closed', () => {
  closeHttpServer();
  app.quit();
});

app.on('before-quit', () => {
  closeHttpServer();
});

if (gotLock) {
  app.whenReady().then(createWindow).catch((err) => {
    console.error(err);
    app.quit();
  });
}
