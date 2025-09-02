import vuelosRouter from './routes/amadeusFlightsEndpoint.js';
import express from 'express';
import path from 'path';
import cors from 'cors';
import fs from 'fs';
import morgan from 'morgan';
import compression from 'compression';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

const app = express();
app.disable('x-powered-by');
app.use(morgan('tiny'));
app.use(compression());
app.use(helmet());
app.use(express.json());

// 🔒 CORS: permite Nerd + Render + localhost
const ALLOWED = [
  'https://flysky-j972de1tbhw7k-pmrml0hw.nerdlat.com',
  'https://navuara.onrender.com',
  'http://localhost:3000'
];
app.use(cors({
  origin: (o, cb)=>{ if(!o || ALLOWED.includes(o)) return cb(null,true); cb(new Error('CORS')); }
}));

// ⏱ rate limit
const apiLimiter = rateLimit({ windowMs: 60_000, max: 120, standardHeaders: true, legacyHeaders: false });
app.use('/api/', apiLimiter);

// 🗂️ estáticos
const publicDir = path.join(__dirname, '..', 'public');
app.use(express.static(publicDir));
app.get('/', (req, res) => res.sendFile(path.join(publicDir, 'index.html')));

// 🧪 health + version
app.get('/api/health', (req, res) => res.json({ ok: true, at: new Date().toISOString() }));
app.get('/api/version', (req, res) => {
  let v = 'unknown';
  try { v = fs.readFileSync(path.join(__dirname, '..', '.version'),'utf8').trim(); } catch {}
  res.json({ ok: true, version: v });
});

// 🧠 cache simple (memoria)
const cache = new Map();
const getC = k => {
  const e = cache.get(k);
  if(!e) return null;
  if(Date.now() > e.exp){ cache.delete(k); return null; }
  return e.val;
};
const setC = (k,val,ttlMs) => cache.set(k,{ val, exp: Date.now()+ttlMs });

// 📚 dataset local para suggest
let airports = [];
try {
  const ap = path.join(__dirname, 'data', 'airports.json');
  airports = JSON.parse(fs.readFileSync(ap,'utf8'));
} catch { airports = []; }

// ✈️ handlers
function suggestHandler(req, res){
  const q = (req.query.q || req.body?.q || '').toString().trim().toLowerCase();
  const limit = Math.max(1, Math.min(20, parseInt((req.query.limit || req.body?.limit || '8'),10)));
  if (!q) return res.json({ ok:true, results:[] });

  const key = `s:${q}:${limit}`;
  const hit = getC(key);
  if(hit){ res.set('X-Cache','HIT'); return res.json(hit); }

  const results = airports.filter(a =>
    a.iata.toLowerCase().startsWith(q) ||
    a.city.toLowerCase().includes(q) ||
    a.name.toLowerCase().includes(q)
  ).slice(0, limit);

  const payload = { ok:true, results };
  setC(key, payload, 10*60*1000); // 10 min
  res.set('X-Cache','MISS');
  res.json(payload);
}

function norm(s){ return (s||'').toString().trim().toUpperCase(); }
function searchHandler(req, res){
  const q = { ...req.query, ...(req.body||{}) };
  const from = norm(q.from || q.origin);
  const to   = norm(q.to   || q.destination);
  const date = (q.date||'').toString();

  if (!from || !to) return res.status(400).json({ ok:false, error:'Faltan parámetros from/to u origin/destination' });

  const key = `f:${from}:${to}:${date||'-'}`;
  const hit = getC(key);
  if(hit){ res.set('X-Cache','HIT'); return res.json(hit); }

  // MOCK
  let results = [];
  if (from==='MEX' && to==='CUN'){
    results = [{
      id:'TP-0', airlineName:'Y4', origin:'MEX', destination:'CUN',
      price:{ amount:1877, currency:'MXN' },
      depart_at:new Date(Date.now()+72*3600*1000).toISOString(),
      transfers:0, deeplink:'/search'
    }];
  } else if (from==='MID' && to==='MTY'){
    results = [{
      id:'TP-1', airlineName:'AM', origin:'MID', destination:'MTY',
      price:{ amount:2499, currency:'MXN' },
      depart_at:new Date(Date.now()+96*3600*1000).toISOString(),
      transfers:1, deeplink:'/search'
    }];
  }

  const payload = { ok:true, results };
  setC(key, payload, 5*60*1000); // 5 min
  res.set('X-Cache', 'MISS');
  res.json(payload);
}

// rutas GET/POST + alias sin /api
app.get('/api/suggest', suggestHandler);
app.post('/api/suggest', suggestHandler);
app.get('/suggest', suggestHandler);
app.post('/suggest', suggestHandler);

app.get('/api/search', searchHandler);
app.post('/api/search', searchHandler);
app.get('/search', searchHandler);
app.post('/search', searchHandler);

// SPA fallback
app.get('*', (req,res)=>{
  if (req.path.startsWith('/api/')) return res.status(404).json({ ok:false, error:'Not found' });
  res.sendFile(path.join(publicDir, 'index.html'));
});

const PORT = process.env.PORT || 3000;
app.use(vuelosRouter);
app.listen(PORT, () => console.log('Navuara escuchando en', PORT));
