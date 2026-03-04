const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
    // We can add IPC methods here if the React frontend needs to 
    // communicate with the native shell in the future.
    getVersion: () => process.versions.electron,
});
