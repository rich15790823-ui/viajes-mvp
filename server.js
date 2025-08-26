const path = require('path');

// si no tienes esto ya:
const express = require('express');
const app = express();

// útil para JSON en tus endpoints:
app.use(express.json());

// === SERVIR TU UI DE NERD ===
app.use(express.static(path.join(__dirname, 'public')));

// raíz -> tu index.html de Nerd
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});
res.json({ ok: true, at: new Date().toISOString() });
});
app.get('/api/search', (req, res) => {
  const { from = '', to = '' } = req.query;
  // MOCK simple para probar la UI
  if (from.toUpperCase() === 'MEX' && to.toUpperCase() === 'CUN') {
    return res.json({
      ok: true,
      results: [
        {
          id: 'TP-0',
          airlineName: 'Y4',
          airline: 'Y4',
          origin: 'MEX',
          destination: 'CUN',
          price: { amount: 1877, currency: 'MXN' },
          price_mxn: 1877,
          depart_at: new Date(Date.now() + 72*3600*1000).toISOString(),
          transfers: 0,
          deeplink: '/search'
        }
      ]
    });
  }
  // Si no coincide, responde vacío
  return res.json({ ok: true, results: [] });
});
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log('Navuara escuchando en', PORT);
});

