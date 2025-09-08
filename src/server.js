// src/server.js (ESM)
import express from 'express';
import path from 'path';
import cors from 'cors';
import fs from 'fs';
import morgan from 'morgan';
import compression from 'compression';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { fileURLToPath } from 'url';

// Rutas de la API (vuelos + autocompletar)
import vuelosRouter from './routes/amadeusFlightsEndpoint.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

const app = express();
app.set('trust proxy', 1); // evita warning del rate-limit detrás de proxy
app.disable('x-powered-by');

// Middlewares base
app.use(morgan('tiny'));
app.use(compression());
app.use(helmet());
app.use(cors());
app.options('*', cors());
app.use(express.json());

// Rate limit para /api
const apiLimiter = rateLimit({
  windowMs: 60_000,
  max: 120,
  standardHeaders: true,
  legacyHeaders: false
});
app.use('/api/', apiLimiter);

// Archivos estáticos (si usas /public)
const publicDir = path.join(__dirname, '..', 'public');
app.use(express.static(publicDir));
app.get('/', (req, res) => res.sendFile(path.join(publicDir, 'index.html')));

// Health/version
app.get('/api/health', (req, res) => res.json({ ok: true, at: new Date().toISOString() }));
app.get('/api/version', (req, res) => {
  let v = 'unknown';
  try { v = fs.readFileSync(path.join(__dirname, '..', '.version'), 'utf8').trim(); } catch {}
  res.json({ ok: true, version: v });
});

// Montar API de vuelos/autocompletar
app.use(vuelosRouter);

// SPA fallback
app.get('*', (req, res) => {
  if (req.path.startsWith('/api/')) return res.status(404).json({ ok:false, error:'Not found' });
  res.sendFile(path.join(publicDir, 'index.html'));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log('Navuara escuchando en', PORT));
