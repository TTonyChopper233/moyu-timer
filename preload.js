const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  expand: () => ipcRenderer.send('widget:expand'),
  collapse: () => ipcRenderer.send('full:collapse'),
  close: () => ipcRenderer.send('widget:close'),
  // 主进程记住当前主题，供完整版/小窗互斥切换时传给新窗口
  setTheme: (theme) => ipcRenderer.send('theme:set', theme),
  // 数据变更后通知主进程，由主进程转发给另一个窗口
  broadcastState: (payload) => ipcRenderer.send('state:changed', payload),
  onStateChange: (callback) => {
    ipcRenderer.on('state:changed', (_event, payload) => callback(payload));
  }
});
