const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
    setWindowMovable: (movable) => ipcRenderer.send('set-window-movable', movable),
    closeWindow: () => ipcRenderer.send('close-window'),
    resizeWindow: (width, height) => ipcRenderer.send('resize-window', width, height),
    toggleLockState: () => ipcRenderer.send('toggle-lock-state'),
    onLockStateChanged: (callback) => ipcRenderer.on('lock-state-changed', (event, isLocked) => callback(isLocked)),
    allowMouseEvents: () => ipcRenderer.send('allow-mouse-events'),
    ignoreMouseEvents: () => ipcRenderer.send('ignore-mouse-events'),
});

window.addEventListener('DOMContentLoaded', () => {
    const replaceText = (selector, text) => {
        const element = document.getElementById(selector);
        if (element) element.innerText = text;
    };

    for (const type of ['chrome', 'node', 'electron']) {
        replaceText(`${type}-version`, process.versions[type]);
    }
});
