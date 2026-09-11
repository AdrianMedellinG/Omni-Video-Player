const { app, BrowserWindow, ipcMain, screen, shell } = require('electron');
const path = require('node:path');

const DEFAULT_MIN_SIZE = [1024, 640];
const PIP_MIN_SIZE = [320, 180];
const PIP_ASPECT_RATIO = 16 / 9;
const PIP_MARGIN = 18;
const PIP_WIDTH = 520;

let mainWindow;
let pipState = {
  active: false,
  restore: null,
};

function getPipContentBounds(win) {
  const display = screen.getDisplayMatching(win.getBounds()) || screen.getPrimaryDisplay();
  const { workArea } = display;
  const width = Math.min(PIP_WIDTH, Math.max(PIP_MIN_SIZE[0], Math.floor(workArea.width * 0.34)));
  const height = Math.round(width / PIP_ASPECT_RATIO);
  return {
    x: workArea.x + workArea.width - width - PIP_MARGIN,
    y: workArea.y + workArea.height - height - PIP_MARGIN,
    width,
    height,
  };
}

function emitPipState() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  mainWindow.webContents.send('electron:pip-state-change', {
    active: pipState.active,
    supported: true,
  });
}

function waitForWindowEvent(win, eventName, timeoutMs = 900) {
  return new Promise((resolve) => {
    if (!win || win.isDestroyed()) {
      resolve();
      return;
    }

    const timeout = setTimeout(done, timeoutMs);
    function done() {
      clearTimeout(timeout);
      win.off(eventName, done);
      resolve();
    }

    win.once(eventName, done);
  });
}

async function enterPipMode() {
  const win = mainWindow;
  if (!win || win.isDestroyed()) return { active: false, supported: false };
  if (pipState.active) return { active: true, supported: true };

  pipState.restore = {
    bounds: win.getBounds(),
    isFullScreen: win.isFullScreen(),
    isMaximized: win.isMaximized(),
    minimumSize: win.getMinimumSize(),
  };

  if (pipState.restore.isFullScreen) {
    const leaveFullScreen = waitForWindowEvent(win, 'leave-full-screen');
    win.setFullScreen(false);
    await leaveFullScreen;
  }
  if (pipState.restore.isMaximized) {
    const unmaximize = waitForWindowEvent(win, 'unmaximize', 500);
    win.unmaximize();
    await unmaximize;
  }

  win.setMinimumSize(...PIP_MIN_SIZE);
  win.setAspectRatio(PIP_ASPECT_RATIO);
  win.setAlwaysOnTop(true, 'floating');
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  win.setContentBounds(getPipContentBounds(win), true);

  pipState.active = true;
  emitPipState();
  return { active: true, supported: true };
}

async function exitPipMode() {
  const win = mainWindow;
  if (!win || win.isDestroyed()) return { active: false, supported: false };
  if (!pipState.active) return { active: false, supported: true };

  const restore = pipState.restore;
  pipState.active = false;
  pipState.restore = null;

  win.setAlwaysOnTop(false);
  win.setVisibleOnAllWorkspaces(false);
  win.setAspectRatio(0);
  win.setMinimumSize(...(restore?.minimumSize || DEFAULT_MIN_SIZE));

  if (restore?.bounds) win.setBounds(restore.bounds, true);
  if (restore?.isMaximized) win.maximize();
  if (restore?.isFullScreen) win.setFullScreen(true);

  emitPipState();
  return { active: false, supported: true };
}

function setPipMode(active) {
  return active ? enterPipMode() : exitPipMode();
}

ipcMain.handle('electron:pip-get-state', () => ({
  active: pipState.active,
  supported: true,
}));
ipcMain.handle('electron:pip-set', (_event, active) => setPipMode(Boolean(active)));
ipcMain.handle('electron:pip-toggle', () => setPipMode(!pipState.active));

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1024,
    minHeight: 640,
    backgroundColor: '#090b10',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });

  mainWindow.loadFile(path.join(__dirname, '..', 'dist-web', 'index.html'));

  if (process.env.ELECTRON_DEVTOOLS === '1') {
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
    pipState = { active: false, restore: null };
  });
}

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
