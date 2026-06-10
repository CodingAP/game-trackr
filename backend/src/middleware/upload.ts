import multer from 'multer';
import path from 'node:path';
import { isImageFilename, MAX_MEDIA_BYTES } from '../storage/imageFiles.js';
import { imagesDir } from '../storage/games.js';

export function createUploadMiddleware(slug: string) {
  const storage = multer.diskStorage({
    destination: (_req, _file, cb) => {
      cb(null, imagesDir(slug));
    },
    filename: (_req, file, cb) => {
      const safeName = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_');
      cb(null, `${Date.now()}-${safeName}`);
    },
  });

  return multer({
    storage,
    limits: { fileSize: MAX_MEDIA_BYTES },
    fileFilter: (_req, file, cb) => {
      if (!isImageFilename(file.originalname)) {
        cb(new Error('Only media uploads are allowed'));
        return;
      }

      if (
        file.mimetype.startsWith('image/') ||
        file.mimetype === 'video/webm' ||
        file.mimetype === 'video/mp4'
      ) {
        cb(null, true);
      } else {
        cb(new Error('Only media uploads are allowed'));
      }
    },
  });
}

export function imagePublicPath(slug: string, filename: string): string {
  return `/uploads/games/${slug}/images/${filename}`;
}

export function imageAbsolutePath(slug: string, filename: string): string {
  return path.join(imagesDir(slug), filename);
}
