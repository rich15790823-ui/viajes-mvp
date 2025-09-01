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
app.use(cors({ origin: '*' }));

const apiLimiter = rateLimit({ windowMs: 60_000, max: 120, standardHeaders: true, legacyHeaders: false });
app.use('/api/', apiLimiter);

const publicDir = path.join(__dirname, '..', 'public');
app.use(express.static(publicDir));
app.get('/', (req, res) => res.sendFile(path.join(publicDir, 'index.html')));

app.get('/api/health', (req, res) => res.json({ ok: true, at: new Date().toISOString() }));

// /api/version (lee .version si existe)
app.get('/api/version', (req, res) => {
  let v = 'unknown';
  try { v = fs.readFileSync(path.join(__dirname, '..', '.version'), 'utf8').trim(); } catch {}
  res.json({ ok: true, version: v });
});

// /api/suggest (dataset local)
let airports = [];
try {
  const ap = path.join(__dirname, 'data', 'airports.json');
  airports = JSON.parse(fs.readFileSync(ap,'utf8'));
} catch { airports = []; }

function suggestHandler(req, res){
  const q = (req.query.q || req.body?.q || '').toString().trim().toLowerCase();
  const limit = Math.max(1, Math.min(20, parseInt((req.query.limit || req.body?.limit || '8'),10)));
  if (!q) return res.json({ ok:true, results:[] });
  const results = airports.filter(a =>
    a.iata.toLowerCase().startsWith(q) ||
    a.city.toLowerCase().includes(q) ||
    a.name.toLowerCase().includes(q)
  ).slice(0, limit);
  res.json({ ok:true, results });
}

// /api/search MOCK con alias y GET/POST
function norm(s){ return (s||'').toString().trim().toUpperCase(); }
function searchHandler(req, res){
  const q = { ...req.query, ...(req.body||{}) };
  const from = norm(q.from || q.origin);
  const to   = norm(q.to   || q.destination);
  if (!from || !to) return res.status(400).json({ ok:false, error:'Faltan parámetros from/to u origin/destination' });

  if (from==='MEX' && to==='CUN'){
    return res.json({ ok:true, results:[{
      id:'TP-0', airlineName:'Y4', origin:'MEX', destination:'CUN',
      price:{ amount:1877, currency:'MXN' },
      depart_at:new Date(Date.now()+72*3600*1000).toISOString(),
      transfers:0, deeplink:'/search'
    }]});
  }
  if (from==='MID' && to==='MTY'){
    return res.json({ ok:true, results:[{
      id:'TP-1', airlineName:'AM', origin:'MID', destination:'MTY',
      price:{ amount:2499, currency:'MXN' },
      depart_at:new Date(Date.now()+96*3600*1000).toISOString(),
      transfers:1, deeplink:'/search'
    }]});
  }
  return res.json({ ok:true, results:[] });
}

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
app.listen(PORT, () => console.log('Navuara escuchando en', PORT));
