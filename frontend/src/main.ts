import { initHideImages, initTheme } from './storage/settings.js';
import { initCloudSync } from './storage/cloudSync.js';
import { initApp } from './app.js';

initTheme();
initHideImages();

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/sw.js').catch(() => {
    // Installability is optional when service workers are unavailable.
  });
}

void initCloudSync().finally(() => {
  initApp();
});
