import { initHideImages, initTheme } from './storage/settings.js';
import { initCloudSync } from './storage/cloudSync.js';
import { initApp } from './app.js';

initTheme();
initHideImages();
void initCloudSync().finally(() => {
  initApp();
});
