export function notifyLocalDataChanged(): void {
  void import('./cloudSync.js').then(({ scheduleCloudSync }) => scheduleCloudSync());
}
