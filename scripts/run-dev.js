const { spawn } = require('child_process');
const electron = require('electron');
const path = require('path');

// Run electron without NODE_OPTIONS but with NODE_ENV=production
const env = { ...process.env };
delete env.NODE_OPTIONS;
env.NODE_ENV = 'production'; // Set to production mode to match dist build

console.log('Starting Electron...');
const proc = spawn(electron, [path.join(__dirname, '../dist/main/main.js')], {
  stdio: 'inherit',
  env: env
});

proc.on('close', (code) => {
  process.exit(code);
}); 