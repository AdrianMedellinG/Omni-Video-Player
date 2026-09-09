const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', Object.freeze({
  isElectron: true,
  platform: process.platform,
  getPipMode: () => ipcRenderer.invoke('electron:pip-get-state'),
  setPipMode: (active) => ipcRenderer.invoke('electron:pip-set', Boolean(active)),
  togglePipMode: () => ipcRenderer.invoke('electron:pip-toggle'),
  onPipModeChange: (callback) => {
    if (typeof callback !== 'function') return () => {};
    const listener = (_event, state) => callback(state);
    ipcRenderer.on('electron:pip-state-change', listener);
    return () => ipcRenderer.removeListener('electron:pip-state-change', listener);
  },
  versions: Object.freeze({
    chrome: process.versions.chrome,
    electron: process.versions.electron,
    node: process.versions.node,
  }),
}));
