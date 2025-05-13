const { spawn, execSync } = require('child_process');
const path = require('path');
const electron = require('electron');
const fs = require('fs');

// First run webpack with the openssl-legacy-provider flag
console.log('Building with webpack...');
try {
  execSync('yarn webpack', { stdio: 'inherit' });
} catch (error) {
  console.error('Webpack build failed');
  process.exit(1);
}

// Ensure static files are properly copied
console.log('Ensuring static files are copied...');
const staticDir = path.join(__dirname, '../static');
const distStaticDir = path.join(__dirname, '../dist/static');

// Create dist/static directory if it doesn't exist
if (!fs.existsSync(distStaticDir)) {
  fs.mkdirSync(distStaticDir, { recursive: true });
}

// Copy static files
fs.readdirSync(staticDir).forEach(file => {
  const source = path.join(staticDir, file);
  const dest = path.join(distStaticDir, file);
  fs.copyFileSync(source, dest);
  console.log(`Copied ${file} to dist/static`);
});

console.log('Starting Electron...');
// Make sure NODE_OPTIONS is not passed to Electron
const electronEnv = Object.assign({}, process.env);
delete electronEnv.NODE_OPTIONS;
electronEnv.NODE_ENV = 'production'; // Set to production mode

// Spawn Electron process
const electronProcess = spawn(electron, [path.join(__dirname, '../dist/main/main.js')], {
  stdio: 'inherit',
  env: electronEnv
});

// Handle process exit
electronProcess.on('close', (code) => {
  process.exit(code);
}); 