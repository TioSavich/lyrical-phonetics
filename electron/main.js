const { app, BrowserWindow } = require('electron');
const path = require('path');
const { spawn } = require('child_process');
const http = require('http');

let mainWindow;
let pythonProcess;

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1200,
        height: 900,
        backgroundColor: '#0f172a',
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            nodeIntegration: false,
            contextIsolation: true,
        },
        show: false,
    });

    const isDev = process.env.NODE_ENV === 'development';
    if (isDev) {
        mainWindow.loadURL('http://localhost:3000');
        mainWindow.webContents.openDevTools();
    } else {
        // app.getAppPath() resolves correctly inside .asar
        mainWindow.loadFile(path.join(app.getAppPath(), 'dist', 'index.html'));
    }

    mainWindow.once('ready-to-show', () => {
        mainWindow.show();
    });

    mainWindow.on('closed', () => {
        mainWindow = null;
    });
}

function startPythonBackend() {
    const isDev = process.env.NODE_ENV === 'development';
    let backendPath;

    if (isDev) {
        backendPath = path.join(__dirname, '..', 'python', 'server.py');
        pythonProcess = spawn('python3', [backendPath, '7744']);
    } else {
        const binName = process.platform === 'win32' ? 'ph-backend.exe' : 'ph-backend';
        backendPath = path.join(process.resourcesPath, 'bin', binName);
        pythonProcess = spawn(backendPath, ['7744']);
    }

    pythonProcess.stdout.on('data', (data) => {
        console.log(`Python: ${data}`);
    });

    pythonProcess.stderr.on('data', (data) => {
        console.error(`Python stderr: ${data}`);
    });

    pythonProcess.on('close', (code) => {
        console.log(`Python process exited with code ${code}`);
    });
}

function waitForBackend(url, timeout = 15000) {
    return new Promise((resolve) => {
        const start = Date.now();
        const check = () => {
            if (Date.now() - start > timeout) return resolve(false);
            http.get(url, (res) => {
                if (res.statusCode === 200) resolve(true);
                else setTimeout(check, 300);
            }).on('error', () => setTimeout(check, 300));
        };
        check();
    });
}

app.on('ready', async () => {
    startPythonBackend();
    await waitForBackend('http://127.0.0.1:7744/health');
    createWindow();
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

app.on('activate', () => {
    if (mainWindow === null) {
        createWindow();
    }
});

app.on('will-quit', () => {
    if (pythonProcess) {
        pythonProcess.kill();
    }
});
