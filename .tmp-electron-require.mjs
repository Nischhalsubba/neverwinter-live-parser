import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const electron = require('electron');
console.log('electron type', typeof electron);
console.log('keys', Object.keys(electron).slice(0,20));
console.log('app?', !!electron.app, 'BrowserWindow?', !!electron.BrowserWindow);
