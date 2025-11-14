
const { app, BrowserWindow, ipcMain, globalShortcut } = require('electron');
const path = require('path');
const { exec, fork } = require('child_process');
const net = require('net'); // Necesario para checkPort
const fs = require('fs');

// Función para loguear en archivo seguro para entorno empaquetado
function logToFile(msg) {
    try {
        const userData = app.getPath('userData');
        const logPath = path.join(userData, 'iniciar_log.txt');
        const timestamp = new Date().toISOString();
        fs.mkdirSync(userData, { recursive: true });
        fs.appendFileSync(logPath, `[${timestamp}] ${msg}\n`);
    } catch (e) {
        // Si hay error, mostrar en consola
        console.error('Error escribiendo log:', e);
    }
}


let mainWindow;
let serverProcess;
let server_port = 8989; // Puerto inicial
let isLocked = false; // Estado inicial del candado: desbloqueado
let isClearOnServerChangeDisabled = false; // Nuevo estado para el botón ExitLag
logToFile('==== INICIO DE ELECTRON ====');

// Fuerza la ventana a comportarse como overlay incluso sobre apps en pantalla completa
function promoteOverlayWindow(win, { focus = false } = {}) {
    if (!win) return;
    win.setAlwaysOnTop(true, 'screen-saver', 1);
    if (typeof win.setVisibleOnAllWorkspaces === 'function') {
        win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
    }
    if (typeof win.setFullScreenable === 'function') {
        win.setFullScreenable(false);
    }
    win.setSkipTaskbar(false);
    if (typeof win.moveTop === 'function') {
        win.moveTop();
    }
    if (focus) {
        win.focus();
    }
}

    // Función para verificar si un puerto está en uso
    const checkPort = (port) => {
        return new Promise((resolve) => {
            const server = net.createServer();
            server.once('error', () => resolve(false));
            server.once('listening', () => {
                server.close(() => resolve(true));
            });
            server.listen(port);
        });
    };

    async function findAvailablePort() {
        let port = server_port;
        while (true) {
            if (await checkPort(port)) {
                return port;
            }
            console.warn(`Port ${port} is already in use, trying next...`);
            port++;
        }
    }

    // Función para matar el proceso que está usando un puerto específico
    async function killProcessUsingPort(port) {
        return new Promise((resolve) => {
            exec(`netstat -ano | findstr :${port}`, (error, stdout, stderr) => {
                if (stdout) {
                    const lines = stdout.split('\n').filter(line => line.includes('LISTENING'));
                    if (lines.length > 0) {
                        const pid = lines[0].trim().split(/\s+/).pop();
                        if (pid) {
                            console.log(`Killing process ${pid} using port ${port}...`);
                            exec(`taskkill /PID ${pid} /F`, (killError, killStdout, killStderr) => {
                                if (killError) {
                                    console.error(`Error killing process ${pid}: ${killError.message}`);
                                } else {
                                    console.log(`Process ${pid} killed successfully.`);
                                }
                                resolve();
                            });
                        } else {
                            resolve();
                        }
                    } else {
                        resolve();
                    }
                } else {
                    resolve();
                }
            });
        });
    }

    async function createWindow() {
        logToFile('Intentando matar procesos en el puerto 8989...');
        await killProcessUsingPort(8989);

        server_port = await findAvailablePort();
        logToFile('Puerto disponible encontrado: ' + server_port);

        mainWindow = new BrowserWindow({
            width: 667,
            height: 300,
            transparent: true,
            frame: false,
            alwaysOnTop: true,
            resizable: false,
            webPreferences: {
                preload: path.join(__dirname, 'preload.js'),
                nodeIntegration: false,
                contextIsolation: true,
            },
            icon: path.join(__dirname, 'icon.ico'),
        });

        promoteOverlayWindow(mainWindow);

        mainWindow.once('ready-to-show', () => {
            promoteOverlayWindow(mainWindow, { focus: true });
        });

        mainWindow.on('show', () => promoteOverlayWindow(mainWindow));
        mainWindow.on('focus', () => promoteOverlayWindow(mainWindow));
        mainWindow.on('restore', () => promoteOverlayWindow(mainWindow, { focus: true }));

        // Iniciar el servidor Node.js, pasando el puerto como argumento

        // Determinar ruta absoluta a server.js según entorno
        let serverPath;
        if (process.defaultApp || process.env.NODE_ENV === 'development') {
            // Modo desarrollo
            serverPath = path.join(__dirname, 'server.js');
        } else {
            // Modo empaquetado: usar app.getAppPath() para acceder dentro del asar
            serverPath = path.join(app.getAppPath(), 'server.js');
        }
        logToFile('Lanzando server.js en puerto ' + server_port + ' con ruta: ' + serverPath);

        // Usar fork para lanzar el servidor como proceso hijo
        const { fork } = require('child_process');
        serverProcess = fork(serverPath, [server_port], {
            stdio: ['pipe', 'pipe', 'pipe', 'ipc'],
            execArgv: []
        });

        // Escuchar mensajes del proceso hijo (server.js)
        serverProcess.on('message', (message) => {
            if (message.type === 'local-player-uid' && mainWindow) {
                mainWindow.webContents.send('set-local-player-uid', message.uid);
                console.log(`UID del jugador local recibido de server.js y enviado al renderizador: ${message.uid}`);
            }
        });

        // Variables para controlar el arranque del servidor
        if (typeof createWindow.serverLoaded === 'undefined') createWindow.serverLoaded = false;
        if (typeof createWindow.serverTimeout === 'undefined') createWindow.serverTimeout = null;
        createWindow.serverLoaded = false;
        createWindow.serverTimeout = setTimeout(() => {
            if (!createWindow.serverLoaded) {
               const errorHtml = `
                    <h1 style="color:red; font-size:2em;">
                        Error: El servidor no respondió a tiempo
                    </h1>
                    <h2 style="color:red; font-size:1.5em;">
                        <p>Esto puede deberse a que otro programa ya está usando el puerto ${server_port} o hubo un fallo al iniciar Node.js.</p>
                        <p>Revisa ..\\AppData\\Roaming\\bpsr-meter\\iniciar_log.txt para más detalles.</p>
                    </h2>
                `;
                logToFile('ERROR: El servidor no respondió a tiempo.');
                mainWindow.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(errorHtml)
                );
            }
        }, 10000); // 10 segundos de espera

        serverProcess.stdout.on('data', (data) => {
            logToFile('server stdout: ' + data);
            const match = data.toString().match(/Servidor web iniciado en (http:\/\/localhost:\d+)/);
            if (match && match[1]) {
                const serverUrl = match[1];
                logToFile('Cargando URL en ventana: ' + serverUrl + '/index.html');
                mainWindow.loadURL(`${serverUrl}/index.html`);
                createWindow.serverLoaded = true;
                clearTimeout(createWindow.serverTimeout);
            }
        });
        serverProcess.stderr.on('data', (data) => {
            logToFile('server stderr: ' + data);
        });
        serverProcess.on('close', (code) => {
            logToFile('server process exited with code ' + code);
            if (code !== 0 && !createWindow.serverLoaded) {
                logToFile('ERROR: El servidor terminó inesperadamente antes de iniciar.');
            }
        });

        serverProcess.stdout.on('data', (data) => {
            logToFile('server stdout: ' + data);
            // Buscar la URL del servidor en la salida del servidor
            const match = data.toString().match(/Servidor web iniciado en (http:\/\/localhost:\d+)/);
            if (match && match[1]) {
                const serverUrl = match[1];
                logToFile('Cargando URL en ventana: ' + serverUrl + '/index.html');
                mainWindow.loadURL(`${serverUrl}/index.html`);
                createWindow.serverLoaded = true;
                clearTimeout(createWindow.serverTimeout);
            }
        });

        serverProcess.stderr.on('data', (data) => {
            logToFile('server stderr: ' + data);
        });

        serverProcess.on('close', (code) => {
            logToFile('server process exited with code ' + code);
        });

        mainWindow.on('closed', () => {
            mainWindow = null;
            if (serverProcess) {
                // Enviar SIGTERM para un cierre limpio
                serverProcess.kill('SIGTERM');
                // Forzar la terminación si no se cierra después de un tiempo
                setTimeout(() => {
                    if (!serverProcess.killed) {
                        serverProcess.kill('SIGKILL');
                    }
                }, 5000);
            }
        });

    // Manejar el evento para hacer la ventana movible/no movible
    ipcMain.on('set-window-movable', (event, movable) => {
        if (mainWindow) {
            mainWindow.setMovable(movable);
        }
    });

    // Manejar el evento para minimizar la ventana
    ipcMain.on('minimize-window', () => {
        if (mainWindow) {
            mainWindow.minimize();
        }
    });

    // Manejar el evento para cerrar la ventana
    ipcMain.on('close-window', () => {
        if (mainWindow) {
            mainWindow.close();
        }
    });

    // Manejar el evento para redimensionar la ventana
    ipcMain.on('resize-window', (event, width, height) => {
        if (mainWindow) {
            mainWindow.setSize(width, height);
        }
    });

    // Manejar el evento para alternar el estado del candado
    ipcMain.on('toggle-lock-state', () => {
        if (mainWindow) {
            isLocked = !isLocked;
            mainWindow.setMovable(!isLocked); // Hacer la ventana movible o no
            if (isLocked) {
                // Cuando se bloquea, ignorar eventos del ratón y reenviarlos al juego
                mainWindow.setIgnoreMouseEvents(true, { forward: true });
            } else {
                // Cuando se desbloquea, procesar eventos del ratón normalmente
                mainWindow.setIgnoreMouseEvents(false);
                mainWindow.focus(); // Asegurar que la ventana recupere el foco
                mainWindow.setAlwaysOnTop(true); // Asegurar que se mantenga al frente
            }
            promoteOverlayWindow(mainWindow);
            mainWindow.webContents.send('lock-state-changed', isLocked); // Notificar al renderizador
            console.log(`Candado: ${isLocked ? 'Cerrado' : 'Abierto'}`);
        }
    });

    // Enviar el estado inicial del candado al renderizador una vez que la ventana esté lista
    mainWindow.webContents.on('did-finish-load', () => {
        mainWindow.webContents.send('lock-state-changed', isLocked);
    });

    // Manejar el evento para enfocar la ventana y ponerla siempre al frente
    ipcMain.on('focus-window', () => {
        if (mainWindow) {
            mainWindow.focus();
            mainWindow.setAlwaysOnTop(true);
        }
    });

    // Manejar eventos de entrada/salida del ratón para controlar setIgnoreMouseEvents
    ipcMain.on('mouse-enter', () => {
        if (mainWindow && isLocked) {
            mainWindow.setIgnoreMouseEvents(false); // Permitir interacción con el medidor
        }
    });

    ipcMain.on('mouse-leave', () => {
        if (mainWindow && isLocked) {
            mainWindow.setIgnoreMouseEvents(true, { forward: true }); // Volver a reenviar eventos al juego
        }
    });

    // Manejar el estado del botón ExitLag
    ipcMain.on('toggleClearOnServerChange', (event, isDisabled) => {
        isClearOnServerChangeDisabled = isDisabled;
        console.log(`Limpiar datos al cambiar de servidor: ${!isClearOnServerChangeDisabled}`);
    });

    // Manejar el evento para establecer el UID del jugador local desde el proceso principal
    ipcMain.on('set-local-player-uid', (event, uid) => {
        if (mainWindow) {
            mainWindow.webContents.send('set-local-player-uid', uid);
            console.log(`UID del jugador local enviado al renderizador: ${uid}`);
        }
    });
}

app.whenReady().then(() => {
    createWindow();

    // Registrar atajo de teclado global para F10 (limpiar datos de DPS)
    globalShortcut.register('F10', () => {
        console.log('F10 is pressed - Clearing DPS data');
        if (mainWindow) {
            mainWindow.webContents.send('clear-dps-data');
        }
    });

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) {
            createWindow();
        }
    });
});

app.on('will-quit', () => {
    // Anular el registro de todos los atajos de teclado cuando la aplicación se cierra
    globalShortcut.unregisterAll();
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});
