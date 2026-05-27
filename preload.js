const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  searchMusic: (query) => ipcRenderer.invoke('search-music', query),
  getTrackInfo: (videoId) => ipcRenderer.invoke('get-track-info', videoId),
});
