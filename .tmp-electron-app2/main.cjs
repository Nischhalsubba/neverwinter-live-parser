const { app } = require('electron'); console.log('app?', !!app, typeof app?.whenReady); app.quit();
