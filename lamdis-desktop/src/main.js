const { app, BrowserWindow, shell, dialog } = require('electron');
const { spawn, execSync } = require('child_process');
const path = require('path');
const Store = require('electron-store');

const store = new Store();

// Ports for the bundled services
const API_PORT = 3001;
const WEB_PORT = 3000;

let mainWindow;
let serverProcess;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 800,
    minHeight: 600,
    title: 'Lamdis',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  // Load the web UI
  mainWindow.loadURL(`http://localhost:${WEB_PORT}`);

  // Open external links in browser
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

function isDockerAvailable() {
  try {
    execSync('docker info', { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

async function startServices() {
  if (!isDockerAvailable()) {
    dialog.showErrorBox(
      'Docker Required',
      'Lamdis Desktop requires Docker to run.\n\n' +
      'Please install Docker Desktop from:\nhttps://www.docker.com/products/docker-desktop/\n\n' +
      'After installing, start Docker Desktop and relaunch Lamdis.'
    );
    app.quit();
    return false;
  }

  const composePath = path.join(__dirname, '..', 'docker-compose.yml');

  // Start services via docker compose
  serverProcess = spawn('docker', [
    'compose', '-f', composePath, 'up', '-d',
  ], {
    stdio: 'pipe',
    shell: true,
  });

  serverProcess.stderr.on('data', (data) => {
    console.log(`[docker] ${data}`);
  });

  // Wait for web to be ready
  const maxWait = 60000; // 60 seconds
  const start = Date.now();

  while (Date.now() - start < maxWait) {
    try {
      const response = await fetch(`http://localhost:${WEB_PORT}`);
      if (response.ok || response.status === 307) {
        return true;
      }
    } catch {
      // Not ready yet
    }
    await new Promise(r => setTimeout(r, 2000));
  }

  dialog.showErrorBox(
    'Startup Failed',
    'Lamdis services did not start in time.\n\n' +
    'Check Docker Desktop for errors.'
  );
  return false;
}

async function stopServices() {
  const composePath = path.join(__dirname, '..', 'docker-compose.yml');
  try {
    execSync(`docker compose -f "${composePath}" down`, { stdio: 'ignore' });
  } catch {
    // Best effort
  }
}

app.whenReady().then(async () => {
  const started = await startServices();
  if (started) {
    createWindow();
  }
});

app.on('window-all-closed', async () => {
  // On macOS, keep running in background
  if (process.platform !== 'darwin') {
    await stopServices();
    app.quit();
  }
});

app.on('activate', () => {
  if (mainWindow === null) {
    createWindow();
  }
});

app.on('before-quit', async () => {
  await stopServices();
});
