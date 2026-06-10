const VIDEO_EXTENSIONS = new Set(['.webm', '.mp4']);

function isVideoFilename(filename: string): boolean {
  const dot = filename.lastIndexOf('.');
  if (dot < 0) return false;
  return VIDEO_EXTENSIONS.has(filename.slice(dot).toLowerCase());
}

export function isVideoUrl(url: string): boolean {
  const path = url.split('?')[0]?.split('#')[0] ?? url;
  return isVideoFilename(path);
}

export function defaultMediaAlt(filename: string): string {
  return isVideoFilename(filename) ? 'video' : 'image';
}
