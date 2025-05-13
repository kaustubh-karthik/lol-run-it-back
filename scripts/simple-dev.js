const { spawn } = require('child_process');
const electron = require('electron');
const path = require('path');
const fs = require('fs');
const { app, BrowserWindow } = require('electron');

// Set environment variables
process.env.NODE_ENV = 'development';

// Determine paths
const staticDir = path.join(__dirname, '../static');
const simpleHtmlPath = path.join(__dirname, '../src/renderer/simple-dev.html');

// Create a simple main function
function createMainProcess() {
  // Create the browser window
  const window = new BrowserWindow({
    width: 800,
    height: 600,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    }
  });
  
  // Load the simple HTML file
  window.loadFile(simpleHtmlPath);
  
  // Open DevTools in development mode
  window.webContents.openDevTools();
  
  window.on('closed', () => {
    app.quit();
  });
}

// Launch Electron with our simple app
const electronProcess = spawn(electron, ['-r', path.join(__dirname, 'simple-electron-main.js')], {
  stdio: 'inherit'
});

electronProcess.on('close', (code) => {
  process.exit(code);
}); 