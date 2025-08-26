import express from 'express';
import path from 'path';
import cors from 'cors';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

const app = express();
app.use(express.json());
app.use(cors({ origin: '*' }));

// Servir la UI desde /public (un nivel arriba de /src)
const publicDir = path.join(__dirname, '..', 'public');
app.use(express.static(publicDir));

// Raíz -> index.html
app.get('/', (req, res) => {
  res.sendFile(path.join(publicDir, 'index.html'));
});

// Health
app.get('/api/health', (req, res) => {
  res.json({ ok: true, at: new Date().toISOString() });
});

// MOCK /api/search (para probar en Render)
app.get('/api/search', (req, res) => {
  const { from = '', to = '' } = req.query;
  if (from.toUpperCase() === 'MEX' && to.toUpperCase() === 'CUN') {
    return res.json({
      ok: true,
      results: [
        {
          id: 'TP-0',
          airlineName: 'Y4',
          origin: 'MEX',
          destination: 'CUN',
          price: { amount: 1877, currency: 'MXN' },
          depart_at: new Date(Date.now() + 72 * 3600 * 1000).toISOString(),
          transfers: 0,
          deeplink: '/search'
        }
      ]
    });
  }
  return res.json({ ok: true, results: [] });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log('Navuara escuchando en', PORT);
});
