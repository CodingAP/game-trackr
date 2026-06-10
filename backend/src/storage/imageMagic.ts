export interface DetectedImage {
  ext: string;
  mime: string;
}

export function detectImageBuffer(buffer: Buffer): DetectedImage | null {
  if (buffer.length < 12) return null;

  if (
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47
  ) {
    return { ext: '.png', mime: 'image/png' };
  }

  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return { ext: '.jpg', mime: 'image/jpeg' };
  }

  if (buffer.subarray(0, 4).toString('ascii') === 'GIF8') {
    return { ext: '.gif', mime: 'image/gif' };
  }

  if (
    buffer.subarray(0, 4).toString('ascii') === 'RIFF' &&
    buffer.subarray(8, 12).toString('ascii') === 'WEBP'
  ) {
    return { ext: '.webp', mime: 'image/webp' };
  }

  if (buffer[0] === 0x42 && buffer[1] === 0x4d) {
    return { ext: '.bmp', mime: 'image/bmp' };
  }

  if (buffer[0] === 0 && buffer[1] === 0 && buffer[2] === 1 && buffer[3] === 0) {
    return { ext: '.ico', mime: 'image/x-icon' };
  }

  if (buffer.subarray(4, 8).toString('ascii') === 'ftyp') {
    const brand = buffer.subarray(8, 12).toString('ascii');
    if (brand === 'avif' || brand === 'avis') {
      return { ext: '.avif', mime: 'image/avif' };
    }
    if (['isom', 'iso2', 'mp41', 'mp42', 'avc1', 'M4V ', 'mmp4'].includes(brand)) {
      return { ext: '.mp4', mime: 'video/mp4' };
    }
  }

  if (buffer[0] === 0x1a && buffer[1] === 0x45 && buffer[2] === 0xdf && buffer[3] === 0xa3) {
    return { ext: '.webm', mime: 'video/webm' };
  }

  return null;
}

export function isAllowedRemoteContentType(contentType: string | null): boolean {
  if (!contentType) return true;
  const mime = contentType.split(';')[0]?.trim().toLowerCase() ?? '';
  return mime.startsWith('image/') || mime === 'video/webm' || mime === 'video/mp4';
}
