import express from 'express';
import cors from 'cors';
import morgan from 'morgan';
import helmet from 'helmet';
import router from './routes/index.js';
import errorHandler from './middleware/error.js';
import path from 'path';
import { fileURLToPath } from 'url';
import config from './config/config.js';

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
if (config.nodeEnv !== 'production') {
  app.use(express.static(publicDir));
}

app.use(errorHandler);

const PORT = config.port;
app.listen(PORT, () => {
  console.log(`Server listening on http://localhost:${PORT}`);
  // In development, auto-open the testing UI in the browser
  if (config.nodeEnv !== 'production') {
    const url = config.appBaseUrl;
    try {
      import('node:child_process').then(({ exec }) => {
        const cmd = `start "" ${url}`; // Windows
        exec(cmd);
      }).catch(() => {});
    } catch (_) {}
  }
});