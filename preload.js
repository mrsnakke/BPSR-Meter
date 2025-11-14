const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
    setWindowMovable: (movable) => ipcRenderer.send('set-window-movable', movable),
    minimizeWindow: () => ipcRenderer.send('minimize-window'),
    closeWindow: () => ipcRenderer.send('close-window'),
    resizeWindow: (width, height) => ipcRenderer.send('resize-window', width, height),
    toggleLockState: () => ipcRenderer.send('toggle-lock-state'),
    onLockStateChanged: (callback) => ipcRenderer.on('lock-state-changed', (event, isLocked) => callback(isLocked)),
    allowMouseEvents: () => ipcRenderer.send('allow-mouse-events'),
    ignoreMouseEvents: () => ipcRenderer.send('ignore-mouse-events'),
    focusWindow: () => ipcRenderer.send('focus-window'),
    mouseEnter: () => ipcRenderer.send('mouse-enter'),
    mouseLeave: () => ipcRenderer.send('mouse-leave'),
    onClearDpsData: (callback) => ipcRenderer.on('clear-dps-data', () => callback()),
    onSetLocalPlayerUid: (callback) => ipcRenderer.on('set-local-player-uid', (event, uid) => callback(uid)),
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
