/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  CRATER CRM — Twilio Voice Microservice
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *  Responsibilities:
 *    GET  /token           → issue Twilio Access Token for the browser SDK
 *    POST /voice/outgoing  → TwiML for outbound browser calls
 *    POST /voice/incoming  → TwiML for inbound calls to your Twilio number
 *
 *  The Vite dev-server proxies  /api/twilio/*  →  http://localhost:3001/*
 *  In production, deploy this to any Node.js host and set TWILIO_SERVER_URL
 *  in the React app's environment variables.
 *
 *  Start:
 *    cd twilio-server
 *    npm install
 *    npm run dev         ← uses nodemon (hot-reload)
 *    npm start           ← plain node
 * ═══════════════════════════════════════════════════════════════════════════
 */

'use strict';

// Load .env from the project root (one level up from twilio-server/)
require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });

const express = require('express');
const cors    = require('cors');

const tokenRoutes = require('./routes/token');
const voiceRoutes = require('./routes/voice');

const app  = express();
const PORT = process.env.TWILIO_SERVER_PORT ?? 3001;

// ── Middleware ───────────────────────────────────────────────────────────────

app.use(express.json());
app.use(express.urlencoded({ extended: false })); // Required: Twilio webhooks POST urlencoded bodies

// CORS — allow the Vite dev-server and your production frontend
const ALLOWED_ORIGINS = [
  'http://localhost:8080',
  'http://localhost:5173',
  process.env.FRONTEND_URL,  // set this in production (e.g. https://your-crm.com)
].filter(Boolean);

app.use(
  cors({
    origin: (origin, cb) => {
      // No origin = Twilio webhook requests, curl, Postman → allow
      if (!origin || ALLOWED_ORIGINS.includes(origin)) return cb(null, true);
      cb(new Error(`CORS blocked: ${origin}`));
    },
    credentials: true,
  }),
);

// ── Routes ───────────────────────────────────────────────────────────────────

app.use('/token', tokenRoutes);
app.use('/voice', voiceRoutes);

// Health check
app.get('/health', (_req, res) => {
  res.json({ ok: true, service: 'crater-crm-twilio', ts: new Date().toISOString() });
});

// ── Global error handler ─────────────────────────────────────────────────────

app.use((err, _req, res, _next) => {
  console.error('[Twilio Server] Unhandled error:', err.message);
  res.status(500).json({ error: err.message ?? 'Internal server error' });
});

// ── Start ────────────────────────────────────────────────────────────────────

app.listen(PORT, () => {
  console.log('\n╔══════════════════════════════════════════════════╗');
  console.log(`║  🟢  Twilio server  →  http://localhost:${PORT}     ║`);
  console.log('╠══════════════════════════════════════════════════╣');
  console.log('║  GET  /token              Twilio Access Token    ║');
  console.log('║  POST /voice/outgoing     Outgoing call TwiML    ║');
  console.log('║  POST /voice/incoming     Incoming call TwiML    ║');
  console.log('║  GET  /health             Health check           ║');
  console.log('╚══════════════════════════════════════════════════╝\n');

  // Warn if critical env vars are missing so the dev knows immediately
  const required = [
    'TWILIO_ACCOUNT_SID',
    'TWILIO_API_KEY',
    'TWILIO_API_SECRET',
    'TWILIO_TWIML_APP_SID',
    'TWILIO_PHONE_NUMBER',
  ];
  const missing = required.filter(k => !process.env[k]);
  if (missing.length) {
    console.warn('⚠️  Missing env vars:', missing.join(', '));
    console.warn('   Add them to the root .env file and restart.\n');
  }
});
