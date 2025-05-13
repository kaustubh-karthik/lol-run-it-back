const { spawn } = require('child_process');
const path = require('path');
const electron = require('electron');

// Save the original NODE_OPTIONS
const originalNodeOptions = process.env.NODE_OPTIONS;

// Clear NODE_OPTIONS for Electron
delete process.env.NODE_OPTIONS;

// Spawn Electron process
const electronProcess = spawn(electron, [path.join(__dirname, '../dist/main/main.js')], {
  stdio: 'inherit'
});

// Handle process exit
electronProcess.on('close', (code) => {
  // Restore original NODE_OPTIONS if needed
  if (originalNodeOptions) {
    process.env.NODE_OPTIONS = originalNodeOptions;
  }
  
  process.exit(code);
}); 