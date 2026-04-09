const { app, BrowserWindow, shell, dialog } = require('electron');
const { spawn, execSync } = require('child_process');
const path = require('path');

const WEB_PORT = 3000;

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 800,
    minHeight: 600,
    title: 'Lamdis',
    backgroundColor: '#0f172a',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  // Show loading screen first
  mainWindow.loadFile(path.join(__dirname, 'loading.html'));

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  return mainWindow;
}

function isDockerAvailable() {
  try {
    execSync('docker info', { stdio: 'ignore', timeout: 10000 });
    return true;
  } catch {
    return false;
  }
}

function updateStep(step, state) {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  mainWindow.webContents.executeJavaScript(`
    document.getElementById('step-${step}').className = '${state}';
  `).catch(() => {});
}

function updateStatus(text) {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  mainWindow.webContents.executeJavaScript(`
    document.getElementById('status').textContent = '${text}';
  `).catch(() => {});
}

async function startServices() {
  // Check Docker
  updateStep('docker', 'active');
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
  updateStep('docker', 'done');

  // Start docker compose
  updateStep('pull', 'active');
  updateStatus('Pulling images (first run may take a few minutes)...');

  const composePath = path.join(__dirname, '..', 'docker-compose.yml');

  return new Promise((resolve) => {
    const proc = spawn('docker', [
      'compose', '-f', composePath, 'up', '-d', '--pull', 'missing',
    ], {
      stdio: 'pipe',
      shell: true,
    });

    proc.stdout.on('data', (data) => {
      const line = data.toString().toLowerCase();
      if (line.includes('pull')) {
        updateStep('pull', 'active');
      }
      if (line.includes('postgres') || line.includes('nats')) {
        updateStep('pull', 'done');
        updateStep('db', 'active');
        updateStatus('Starting database...');
      }
      if (line.includes('api')) {
        updateStep('db', 'done');
        updateStep('api', 'active');
        updateStatus('Starting API...');
      }
      if (line.includes('web')) {
        updateStep('api', 'done');
        updateStep('web', 'active');
        updateStatus('Starting dashboard...');
      }
    });

    proc.stderr.on('data', (data) => {
      console.log(`[docker] ${data}`);
    });

    proc.on('close', async () => {
      updateStep('pull', 'done');
      updateStep('db', 'done');
      updateStep('api', 'active');
      updateStatus('Waiting for services to be ready...');

      // Wait for web to respond
      const maxWait = 120000; // 2 minutes
      const start = Date.now();

      while (Date.now() - start < maxWait) {
        try {
          const response = await fetch(`http://localhost:${WEB_PORT}`);
          if (response.ok || response.status === 307) {
            updateStep('api', 'done');
            updateStep('web', 'done');
            updateStatus('Ready!');

            // Small delay so user sees "Ready!"
            await new Promise(r => setTimeout(r, 500));

            // Switch to the actual web UI
            if (mainWindow && !mainWindow.isDestroyed()) {
              mainWindow.loadURL(`http://localhost:${WEB_PORT}`);
            }
            resolve(true);
            return;
          }
        } catch {
          // Not ready yet
        }
        await new Promise(r => setTimeout(r, 2000));
      }

      dialog.showErrorBox(
        'Startup Timeout',
        'Lamdis services did not start in 2 minutes.\n\n' +
        'Check Docker Desktop for container status and logs.'
      );
      resolve(false);
    });
  });
}

async function stopServices() {
  const composePath = path.join(__dirname, '..', 'docker-compose.yml');
  try {
    execSync(`docker compose -f "${composePath}" down`, {
      stdio: 'ignore',
      timeout: 30000,
    });
  } catch {
    // Best effort
  }
}

app.whenReady().then(async () => {
  createWindow();
  await startServices();
});

app.on('window-all-closed', async () => {
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
