import { app } from 'electron'; console.log('app?', !!app, typeof app?.whenReady); app.quit();
