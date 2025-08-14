// server.js — versión limpia (estáticos + health + Amadeus + caché + legs)
require('dotenv').config({ path: require('path').join(__dirname, '.env') });

const express = require('express');
const cors = require('cors');
const path = require('path');
const Amadeus = require('amadeus');

const app = express();

// ----------------- Config básica -----------------
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

app.get('/', (_req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/health', (_req, res) => res.json({ ok: true }));

// ----------------- Amadeus (TEST) -----------------
const AMADEUS_ID = (process.env.AMADEUS_CLIENT_ID || '').trim();
const AMADEUS_SECRET = (process.env.AMADEUS_CLIENT_SECRET || '').trim();
console.log('DEBUG ID len:', AMADEUS_ID.length);
console.log('DEBUG SECRET len:', AMADEUS_SECRET.length);

if (!AMADEUS_ID || !AMADEUS_SECRET) {
  console.error('❌ Falta AMADEUS_CLIENT_ID o AMADEUS_CLIENT_SECRET en .env');
  process.exit(1);
}

const amadeus = new Amadeus({
  clientId: AMADEUS_ID,
  clientSecret: AMADEUS_SECRET,
  hostname: 'test' // entorno de pruebas
});

// ----------------- Utilidades -----------------
function withTimeout(promise, ms = 15000) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), ms))
  ]);
}

// Caché en memoria (5 min)
const CACHE_TTL_MS = 5 * 60 * 1000;
const cache = new Map(); // key -> { ts, data }

// ----------------- Ruta REAL /api/vuelos -----------------
app.get('/api/vuelos', async (req, res) => {
  console.log('➡️  /api/vuelos llamada con:', req.query);
  try {
    const origin = (req.query.origin || '').toUpperCase().trim();
    const destination = (req.query.destination || '').toUpperCase().trim();
    const date = (req.query.date || '').trim();
    const adults = Number(req.query.adults || 1);
    const currency = (req.query.currency || 'USD').toUpperCase().trim();

    // Validaciones
    if (!/^[A-Z]{3}$/.test(origin)) {
      return res.status(400).json({ error: 'Parámetro "origin" inválido. Usa IATA (ej. CUN).' });
    }
    if (!/^[A-Z]{3}$/.test(destination)) {
      return res.status(400).json({ error: 'Parámetro "destination" inválido. Usa IATA (ej. MAD).' });
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return res.status(400).json({ error: 'Parámetro "date" inválido. Formato YYYY-MM-DD (ej. 2025-09-01).' });
    }
    if (!Number.isInteger(adults) || adults < 1) {
      return res.status(400).json({ error: 'Parámetro "adults" inválido. Debe ser entero >= 1.' });
    }

    // Caché
    const cacheKey = JSON.stringify({ origin, destination, date, adults, currency });
    const cached = cache.get(cacheKey);
    if (cached && (Date.now() - cached.ts) < CACHE_TTL_MS) {
      console.log('🟢 Cache HIT');
      return res.json(cached.data);
    }
    console.log('🟠 Cache MISS');

    // Amadeus
    console.log('🟡 Llamando a Amadeus...');
    const response = await withTimeout(
      amadeus.shopping.flightOffersSearch.get({
        originLocationCode: origin,
        destinationLocationCode: destination,
        departureDate: date,
        adults,
        currencyCode: currency,
        max: 10
      }),
      15000
    );
    console.log('🟢 Amadeus respondió');

    const dict = response.result?.dictionaries || {};
    const carriers = dict.carriers || {};

    const data = (response.data || []).map((offer) => {
      const itin = offer.itineraries?.[0];
      const segments = itin?.segments || [];
      const first = segments[0];
      const last = segments[segments.length - 1];
      const airlineCode = first?.carrierCode || '';
      const airlineName = carriers[airlineCode] || airlineCode;

      // Detalle de tramos (legs)
      const legs = segments.map((s) => ({
        airlineCode: s.carrierCode || '',
        flightNumber: s.number || '',
        from: s.departure?.iataCode || null,
        departAt: s.departure?.at || null,
        to: s.arrival?.iataCode || null,
        arriveAt: s.arrival?.at || null,
        duration: s.duration || null
      }));

      return {
        priceTotal: offer.price?.total || null,
        currency: offer.price?.currency || currency,
        airline: airlineName,
        airlineCode,
        departureAt: first?.departure?.at || null,
        departureIata: first?.departure?.iataCode || null,
        arrivalAt: last?.arrival?.at || null,
        arrivalIata: last?.arrival?.iataCode || null,
        duration: itin?.duration || null,
        stops: Math.max(0, segments.length - 1),
        legs
      };
    });

    const payload = { results: data };
    cache.set(cacheKey, { ts: Date.now(), data: payload });
    return res.json(payload);
  } catch (err) {
    console.error('🔴 Error en /api/vuelos:', err?.response?.result || err.message || err);
    const status = err?.response?.statusCode || (err.message === 'timeout' ? 504 : 500);
    const body = err?.response?.result || { error: err.message || 'Error inesperado' };
    return res.status(status).json(body);
  }
});

// ----------------- Arranque -----------------
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`✅ Servidor corriendo en http://localhost:${PORT}`);
});
