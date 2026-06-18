import { loadEnv } from './loadEnv.js';
import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import authRouter from './routes/auth.js';
import gamesRouter from './routes/games.js';
import mobyGamesRouter from './routes/mobygames.js';
import { isAuthConfigured } from './services/auth.js';
import { DATA_DIR } from './storage/games.js';

loadEnv();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.resolve(__dirname, '../../public');
const app = express();
const PORT = Number(process.env.PORT) || 3000;

app.use(express.json({ limit: '50mb' }));
app.use('/uploads/games', express.static(path.join(DATA_DIR)));
app.use('/api/auth', authRouter);
app.use('/api/mobygames', mobyGamesRouter);
app.use('/api/games', gamesRouter);
app.use(express.static(PUBLIC_DIR));

app.get('/{*path}', (req, res, next) => {
  if (req.path.startsWith('/api') || req.path.startsWith('/uploads')) {
    next();
    return;
  }
  res.sendFile(path.join(PUBLIC_DIR, 'index.html'));
});

app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  res.status(500).json({ error: err.message });
});

app.listen(PORT, async () => {
  console.log(`Server running at http://localhost:${PORT}`);
  if (!(await isAuthConfigured())) {
    console.warn(
      'Warning: No accounts configured. Create backend/data/accounts.json.',
    );
  }
});
