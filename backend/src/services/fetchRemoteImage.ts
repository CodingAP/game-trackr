import dns from 'node:dns/promises';
import net from 'node:net';
import {
  detectImageBuffer,
  isAllowedRemoteContentType,
} from '../storage/imageMagic.js';

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const MAX_REDIRECTS = 5;
const FETCH_TIMEOUT_MS = 15_000;

function isPrivateIp(address: string): boolean {
  if (net.isIPv4(address)) {
    const [a, b] = address.split('.').map(Number);
    if (a === 127 || a === 0 || a === 10) return true;
    if (a === 169 && b === 254) return true;
    if (a === 192 && b === 168) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    return false;
  }

  if (net.isIPv6(address)) {
    const normalized = address.toLowerCase();
    if (normalized === '::1') return true;
    if (normalized.startsWith('fe80:')) return true;
    if (normalized.startsWith('fc') || normalized.startsWith('fd')) return true;
    if (normalized.startsWith('::ffff:')) {
      const mapped = normalized.slice(7);
      if (net.isIPv4(mapped)) return isPrivateIp(mapped);
    }
  }

  return false;
}

function isBlockedHostname(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/\.$/, '');
  if (!host) return true;
  if (host === 'localhost' || host.endsWith('.localhost')) return true;
  if (host === 'metadata.google.internal') return true;
  if (host.endsWith('.local')) return true;
  if (net.isIP(host)) return isPrivateIp(host);
  return false;
}

async function assertSafeRemoteUrl(url: URL): Promise<void> {
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error('Only http and https URLs are allowed');
  }

  if (url.username || url.password) {
    throw new Error('URLs with credentials are not allowed');
  }

  if (isBlockedHostname(url.hostname)) {
    throw new Error('URL hostname is not allowed');
  }

  const records = await dns.lookup(url.hostname, { all: true, verbatim: true });
  if (records.length === 0) {
    throw new Error('Could not resolve URL hostname');
  }

  for (const record of records) {
    if (isPrivateIp(record.address)) {
      throw new Error('URL resolves to a blocked address');
    }
  }
}

async function readResponseBody(response: Response): Promise<Buffer> {
  const contentLength = response.headers.get('content-length');
  if (contentLength && Number(contentLength) > MAX_IMAGE_BYTES) {
    throw new Error('Image file is too large (max 5 MB)');
  }

  const reader = response.body?.getReader();
  if (!reader) {
    throw new Error('Empty response body');
  }

  const chunks: Buffer[] = [];
  let total = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value) continue;

    total += value.byteLength;
    if (total > MAX_IMAGE_BYTES) {
      throw new Error('Image file is too large (max 5 MB)');
    }

    chunks.push(Buffer.from(value));
  }

  return Buffer.concat(chunks);
}

async function fetchRemoteResponse(startUrl: URL): Promise<{ buffer: Buffer; contentType: string | null }> {
  let current = startUrl;

  for (let redirectCount = 0; redirectCount <= MAX_REDIRECTS; redirectCount += 1) {
    await assertSafeRemoteUrl(current);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

    try {
      const response = await fetch(current.toString(), {
        method: 'GET',
        redirect: 'manual',
        signal: controller.signal,
        headers: {
          Accept: 'image/*,video/webm',
          'User-Agent': 'GameTrackr/1.0',
        },
      });

      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get('location');
        if (!location) {
          throw new Error('Redirect response missing location header');
        }
        current = new URL(location, current);
        continue;
      }

      if (!response.ok) {
        throw new Error(`Failed to download image (${response.status})`);
      }

      const contentType = response.headers.get('content-type');
      if (!isAllowedRemoteContentType(contentType)) {
        throw new Error('URL did not return an image file');
      }

      const buffer = await readResponseBody(response);
      return { buffer, contentType };
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        throw new Error('Timed out downloading image');
      }
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }

  throw new Error('Too many redirects while downloading image');
}

export async function downloadRemoteImage(
  urlString: string,
): Promise<{ buffer: Buffer; ext: string }> {
  let parsed: URL;
  try {
    parsed = new URL(urlString.trim());
  } catch {
    throw new Error('Invalid URL');
  }

  const { buffer } = await fetchRemoteResponse(parsed);
  const detected = detectImageBuffer(buffer);
  if (!detected) {
    throw new Error('Downloaded file is not a supported image format');
  }

  return { buffer, ext: detected.ext };
}
