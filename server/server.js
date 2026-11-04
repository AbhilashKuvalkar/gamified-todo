'use strict';

/*
 * API-only entry point. Runs as a Windows service behind IIS (ARR reverse proxy).
 *
 * The React UI is built and deployed separately (client/dist) and served by IIS itself.
 * IIS forwards only API calls, unchanged, so they arrive here as /UBMV/api/...
 *
 * Configured with environment variables:
 *   BASE_PATH (default "/UBMV"), PORT (3001), HOST (127.0.0.1), DB_PATH (./data/todo.db)
 */
const express = require('express');

const normalizeBase = (b) => '/' + String(b || '').replace(/^\/+|\/+$/g, '');
const BASE_PATH = normalizeBase(process.env.BASE_PATH || '/UBMV');
const API_PATH = `${BASE_PATH === '/' ? '' : BASE_PATH}/api`;
const PORT = Number(process.env.PORT) || 3001;
// Bind to loopback only: the API is reached through IIS, never directly from the network.
const HOST = process.env.HOST || '127.0.0.1';

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', true);
app.use(express.json({ limit: '100kb' }));

// Express mount paths are case-insensitive, so /UBMV/api and /ubmv/api both work (as on IIS).
app.use(API_PATH, require('./src/api'));

app.use((req, res) => res.status(404).json({ error: `Not found. API routes live under ${API_PATH}/` }));

app.use((err, req, res, next) => {
  console.error(err);
  if (res.headersSent) return next(err);
  const status = err.status || err.statusCode || 500;
  res.status(status).json({ error: status === 500 ? 'Internal server error' : err.message });
});

const server = app.listen(PORT, HOST, () => {
  console.log(`Gamified Todo API listening on http://${HOST}:${PORT}${API_PATH}/`);
});

// Graceful stop when the Windows service is stopped/restarted
for (const sig of ['SIGINT', 'SIGTERM', 'SIGBREAK']) {
  process.on(sig, () => server.close(() => process.exit(0)));
}
