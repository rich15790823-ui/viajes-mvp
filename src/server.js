import express from 'express';
import path from 'path';
import cors from 'cors';
import axios from 'axios';
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

const SEARCH_URL = process.env.SEARCH_URL || '';

app.get('/api/search', async (req, res) => {
  try {
    const { from, to, date } = req.query;
    if (!from || !to) return res.status(400).json({ ok:false, error:'Faltan parámetros from/to' });
    if (!SEARCH_URL) return res.status(500).json({ ok:false, error:'SEARCH_URL no configurada' });

    const { data } = await axios.get(SEARCH_URL, { params: { from, to, date } });
    const results = Array.isArray(data?.results) ? data.results : (Array.isArray(data) ? data : []);
    return res.json({ ok:true, results });
  } catch (err) {
    console.error('search error:', err?.response?.data || err.message);
    return res.status(502).json({ ok:false, error:'Upstream failed' });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log('Navuara escuchando en', PORT));
