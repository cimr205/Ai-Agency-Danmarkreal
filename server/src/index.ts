import 'express-async-errors';
import express from 'express';
import { env } from './config/env';
import { registerRoutes } from './http/routes';
import { pool } from './core/database';

const app = express();
app.use(
  express.json({
    limit: '5mb',
    // Preserve the raw bytes so the Stripe webhook route can verify the signed payload exactly as sent.
    verify: (req, _res, buf) => {
      (req as express.Request & { rawBody?: Buffer }).rawBody = buf;
    },
  })
);

const publicBaseUrl = process.env.PUBLIC_BASE_URL || 'https://aiagencydanmark.dk';
const allowedOrigins = new Set(
  [
    publicBaseUrl,
    publicBaseUrl.replace('https://', 'https://www.'),
    'http://localhost:5173',
    'http://localhost:3000',
    'http://localhost:8080',
  ].filter(Boolean)
);
const originPatterns = [/^https?:\/\/.*\.lovable\.app$/i, /^https?:\/\/.*\.lovableproject\.com$/i];

app.use((req, res, next) => {
  const origin = req.headers.origin as string | undefined;
  if (origin) {
    const allowed = allowedOrigins.has(origin) || originPatterns.some((pattern) => pattern.test(origin));
    if (allowed) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Vary', 'Origin');
      res.setHeader('Access-Control-Allow-Credentials', 'true');
      res.setHeader(
        'Access-Control-Allow-Headers',
        'Content-Type, Authorization, X-Requested-With, X-Client-Version'
      );
      res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PATCH,PUT,DELETE,OPTIONS');
    }
  }

  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }

  next();
});

registerRoutes(app);

const server = app.listen(env.port, () => {
  console.log(`Railway backend running on port ${env.port}`);
});

process.on('unhandledRejection', (reason) => {
  console.error('Unhandled promise rejection:', reason);
});

process.on('uncaughtException', (error) => {
  console.error('Uncaught exception:', error);
});

const shutdown = async () => {
  server.close(async () => {
    if (pool) {
      await pool.end();
    }
    process.exit(0);
  });
};

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
