@echo off
echo Building with webpack...
set NODE_OPTIONS=--openssl-legacy-provider
call yarn electron-webpack
set NODE_OPTIONS=
echo Starting Electron...
call electron dist/main/main.js 