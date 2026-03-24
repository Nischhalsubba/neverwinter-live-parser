const electron = require('electron');
console.log('electron type', typeof electron);
console.log('keys', Object.keys(electron).slice(0,20));
console.log('app?', !!electron.app, 'BrowserWindow?', !!electron.BrowserWindow);
