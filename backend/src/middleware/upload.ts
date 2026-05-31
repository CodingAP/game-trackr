import multer from 'multer';
import path from 'node:path';
import { isImageFilename } from '../storage/imageFiles.js';
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
    limits: { fileSize: 5 * 1024 * 1024 },
    fileFilter: (_req, file, cb) => {
      if (!isImageFilename(file.originalname)) {
        cb(new Error('Only image uploads are allowed'));
        return;
      }

      if (file.mimetype.startsWith('image/') || file.mimetype === 'video/webm') {
        cb(null, true);
      } else {
        cb(new Error('Only image uploads are allowed'));
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
