
const { app, BrowserWindow, ipcMain } = require('electron');
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
logToFile('==== INICIO DE ELECTRON ====');

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
        let port = 8989;
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
            width: 650,
            height: 600,
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

        // Variables para controlar el arranque del servidor
        if (typeof createWindow.serverLoaded === 'undefined') createWindow.serverLoaded = false;
        if (typeof createWindow.serverTimeout === 'undefined') createWindow.serverTimeout = null;
        createWindow.serverLoaded = false;
        createWindow.serverTimeout = setTimeout(() => {
            if (!createWindow.serverLoaded) {
                logToFile('ERROR: El servidor no respondió a tiempo.');
                mainWindow.loadURL('data:text/html,<h2 style="color:red">Error: El servidor no respondió a tiempo.<br>Revisa iniciar_log.txt para más detalles.</h2>');
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
        });

        let serverLoaded = false;
        let serverTimeout = setTimeout(() => {
            if (!serverLoaded) {
                logToFile('ERROR: El servidor no respondió a tiempo.');
                mainWindow.loadURL('data:text/html,<h2 style="color:red">Error: El servidor no respondió a tiempo.<br>Revisa iniciar_log.txt para más detalles.</h2>');
            }
        }, 10000); // 10 segundos de espera

        serverProcess.stdout.on('data', (data) => {
            logToFile('server stdout: ' + data);
            // Buscar la URL del servidor en la salida del servidor
            const match = data.toString().match(/Servidor web iniciado en (http:\/\/localhost:\d+)/);
            if (match && match[1]) {
                const serverUrl = match[1];
                logToFile('Cargando URL en ventana: ' + serverUrl + '/index.html');
                mainWindow.loadURL(`${serverUrl}/index.html`);
                serverLoaded = true;
                clearTimeout(serverTimeout);
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
            }
            mainWindow.webContents.send('lock-state-changed', isLocked); // Notificar al renderizador
            console.log(`Candado: ${isLocked ? 'Cerrado' : 'Abierto'}`);
        }
    });

    // Enviar el estado inicial del candado al renderizador una vez que la ventana esté lista
    mainWindow.webContents.on('did-finish-load', () => {
        mainWindow.webContents.send('lock-state-changed', isLocked);
    });
}

app.whenReady().then(() => {
    createWindow();

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) {
            createWindow();
        }
    });
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});
