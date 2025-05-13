const { app, BrowserWindow } = require('electron');
const path = require('path');
const fs = require('fs');

// Set environment to production to match the built version
process.env.NODE_ENV = 'production';

// Copy static assets to expected locations
function copyStaticAssets() {
  const staticDir = path.join(__dirname, '../static');
  const targetDirs = [
    path.join(__dirname, '../dist/static'),
    path.join(__dirname, '../dist/renderer/static')
  ];

  // Create all target directories if they don't exist
  targetDirs.forEach(dir => {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
      console.log(`Created directory: ${dir}`);
    }
  });

  // Copy static files to all target directories
  if (fs.existsSync(staticDir)) {
    fs.readdirSync(staticDir).forEach(file => {
      const source = path.join(staticDir, file);
      
      targetDirs.forEach(dir => {
        const dest = path.join(dir, file);
        fs.copyFileSync(source, dest);
        console.log(`Copied ${file} to ${dir}`);
      });
    });
  }
}

// Create main window
function createWindow() {
  // Check if the dist directory exists
  if (!fs.existsSync(path.join(__dirname, '../dist/main/main.js'))) {
    console.error('Error: dist directory not found. Please run yarn compile first.');
    app.quit();
    return;
  }

  // Create browser window
  const mainWindow = new BrowserWindow({
    width: 800,
    height: 600,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    }
  });
  
  // Ensure static files are copied
  copyStaticAssets();

  // Load from the dist directory (same as production)
  const indexPath = 'file://' + path.join(__dirname, '../dist/renderer/index.html');
  console.log(`Loading index from: ${indexPath}`);
  mainWindow.loadURL(indexPath);
  
  // Open DevTools in a detached window to avoid it taking space from the app
  mainWindow.webContents.openDevTools({ mode: 'detach' });
  
  // Or comment out the line above and uncomment this to completely disable DevTools
  // mainWindow.webContents.closeDevTools();
}

// Launch the app
app.on('ready', createWindow);

// Quit when all windows are closed
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
}); 