import express from 'express';
import path from 'path';
import cors from 'cors';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

const app = express();
app.use(express.json());
app.use(cors({ origin: '*' }));

const publicDir = path.join(__dirname, '..', 'public');
app.use(express.static(publicDir));
app.get('/', (req, res) => res.sendFile(path.join(publicDir, 'index.html')));

app.get('/api/health', (req, res) => {
  res.json({ ok: true, at: new Date().toISOString() });
});

app.get('/api/search', (req, res) => {
  const { from = '', to = '' } = req.query;
  const F = from.toUpperCase(), T = to.toUpperCase();

  if (F === 'MEX' && T === 'CUN') {
    return res.json({
      ok: true,
      results: [{
        id: 'TP-0', airlineName: 'Y4', origin: 'MEX', destination: 'CUN',
        price: { amount: 1877, currency: 'MXN' },
        depart_at: new Date(Date.now() + 72*3600*1000).toISOString(),
        transfers: 0, deeplink: '/search'
      }]
    });
  }

  if (F === 'MID' && T === 'MTY') {
    return res.json({
      ok: true,
      results: [{
        id: 'TP-1', airlineName: 'AM', origin: 'MID', destination: 'MTY',
        price: { amount: 2499, currency: 'MXN' },
        depart_at: new Date(Date.now() + 96*3600*1000).toISOString(),
        transfers: 1, deeplink: '/search'
      }]
    });
  }

  return res.json({ ok: true, results: [] });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log('Navuara escuchando en', PORT));
