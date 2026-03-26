import { app } from 'electron';
console.log('app exists', !!app, typeof app?.whenReady);
