const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  launchAssistant: () => ipcRenderer.send('launch-assistant'),

  onSwitchAI: (callback) => ipcRenderer.on('switch-ai', (event, ai) => callback(ai)),
  onShowSelector: (callback) => ipcRenderer.on('show-selector', callback),

  onScreenshotTaken: (callback) => ipcRenderer.on('screenshot-taken', (event, tmpPath) => callback(tmpPath)),
  onScreenshotError: (callback) => ipcRenderer.on('screenshot-error', (event, error) => callback(error)),
  getScreenshotBase64: (tmpPath) => ipcRenderer.invoke('get-screenshot-base64', tmpPath),

  onCheckAIActive: (callback) => ipcRenderer.on('check-ai-active', callback),
  sendAIActiveResponse: (isActive) => ipcRenderer.send('ai-active-response', isActive),

  onUpdateCaptureArea: (callback) => {
    ipcRenderer.on('update-capture-area', (_, area) => {
      console.log('Área de captura actualizada:', area);
      callback(area);
    });
  },
});
