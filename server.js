const express = require('express');
const path = require('path');

const app = express();
app.use(express.json());

// Servir UI de /public
app.use(express.static(path.join(__dirname, 'public')));

// Raíz -> index.html
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Health
app.get('/api/health', (req, res) => {
  res.json({ ok: true, at: new Date().toISOString() });
});

// MOCK de /api/search para probar
app.get('/api/search', (req, res) => {
  const { from = '', to = '' } = req.query;
  if (from.toUpperCase() === 'MEX' && to.toUpperCase() === 'CUN') {
    return res.json({
      ok: true,
      results: [{
        id: 'TP-0',
        airlineName: 'Y4',
        origin: 'MEX',
        destination: 'CUN',
        price: { amount: 1877, currency: 'MXN' },
        depart_at: new Date(Date.now() + 72*3600*1000).toISOString(),
        transfers: 0,
        deeplink: '/search'
      }]
    });
  }
  return res.json({ ok: true, results: [] });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log('Navuara escuchando en', PORT));
