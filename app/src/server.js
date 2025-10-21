import express from 'express';
import cors from 'cors';
import morgan from 'morgan';
import helmet from 'helmet';
import { config as dotenvConfig } from 'dotenv';
import router from './routes/index.js';
import errorHandler from './middleware/error.js';
import path from 'path';
import { fileURLToPath } from 'url';

dotenvConfig();

const app = express();

app.use(helmet({
  contentSecurityPolicy: {
    useDefaults: true,
    directives: {
      "default-src": ["'self'"],
      "script-src": ["'self'", "'unsafe-inline'"],
      "style-src": ["'self'", "'unsafe-inline'"],
      "img-src": ["'self'", "data:"],
      "connect-src": ["'self'"],
    },
  },
}));
app.use(cors({ origin: true, credentials: true }));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));


app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

app.use('/api', router);

// Static frontend
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const publicDir = path.join(__dirname, '..', 'public');
// Serve testing UI only in development
if (process.env.NODE_ENV !== 'production') {
  app.use(express.static(publicDir));
}

app.use(errorHandler);

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`Server listening on http://localhost:${PORT}`);
  // In development, auto-open the testing UI in the browser
  if (process.env.NODE_ENV !== 'production') {
    const url = process.env.APP_BASE_URL || `http://localhost:${PORT}`;
    try {
      import('node:child_process').then(({ exec }) => {
        const cmd = `start "" ${url}`; // Windows
        exec(cmd);
      }).catch(() => {});
    } catch (_) {}
  }
});