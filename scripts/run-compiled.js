const { spawn, execSync } = require('child_process');
const path = require('path');
const electron = require('electron');
const fs = require('fs');

// First compile the app with webpack
console.log('Compiling application...');
try {
  execSync('yarn compile', { stdio: 'inherit' });
} catch (error) {
  console.error('Compilation failed');
  process.exit(1);
}

// Ensure static files are properly copied to multiple possible locations
console.log('Copying static files...');
const staticDir = path.join(__dirname, '../static');
const targetDirs = [
  path.join(__dirname, '../dist/static'),
  path.join(__dirname, '../dist/main/static'),
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
fs.readdirSync(staticDir).forEach(file => {
  const source = path.join(staticDir, file);
  
  targetDirs.forEach(dir => {
    const dest = path.join(dir, file);
    fs.copyFileSync(source, dest);
    console.log(`Copied ${file} to ${dir}`);
  });
});

console.log('Starting Electron in production mode...');
// Run electron with clean environment
const env = { ...process.env };
delete env.NODE_OPTIONS;
// Ensure we're in production mode
env.NODE_ENV = 'production';

// Run the compiled app
const electronProcess = spawn(electron, [path.join(__dirname, '../dist/main/main.js')], {
  stdio: 'inherit',
  env: env
});

electronProcess.on('close', (code) => {
  process.exit(code);
}); 