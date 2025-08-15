// server.js — limpio: estáticos, /health, /api/suggest, /api/vuelos (ida/vuelta), caché y Render-ready
require('dotenv').config({ path: require('path').join(__dirname, '.env') });

const express = require('express');
const cors = require('cors');
const path = require('path');
const Amadeus = require('amadeus');

const app = express();

// -------- Básicos --------
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Home & salud
app.get('/', (_req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});
app.get('/health', (_req, res) => res.json({ ok: true }));

// -------- Amadeus (TEST) --------
const AMADEUS_ID = (process.env.AMADEUS_CLIENT_ID || '').trim();
const AMADEUS_SECRET = (process.env.AMADEUS_CLIENT_SECRET || '').trim();
if (!AMADEUS_ID || !AMADEUS_SECRET) {
  console.warn('⚠️ Falta AMADEUS_CLIENT_ID o AMADEUS_CLIENT_SECRET. /api fallará hasta que los configures.');
}
const amadeus = new Amadeus({
  clientId: AMADEUS_ID,
  clientSecret: AMADEUS_SECRET,
  hostname: 'test'
});

// Utilidades
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 min
const cache = new Map(); // key -> { ts, data }
function withTimeout(promise, ms = 15000) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), ms))
  ]);
}

// -------- /api/suggest (autocomplete ciudad/aeropuerto) --------
// GET /api/suggest?q=mad
app.get('/api/suggest', async (req, res) => {
  try {
    const q = (req.query.q || '').trim();
    if (q.length < 2) return res.json([]);

    const cacheKey = `suggest:${q.toLowerCase()}`;
    const cached = cache.get(cacheKey);
    if (cached && (Date.now() - cached.ts) < CACHE_TTL_MS) {
      return res.json(cached.data);
    }

    const r = await withTimeout(
      amadeus.referenceData.locations.get({
        keyword: q,
        subType: 'CITY,AIRPORT',
        'page[limit]': 8
      }),
      10000
    );

    const items = (r?.data || []).map((x) => ({
      id: x.id,
      subType: x.subType,                // CITY o AIRPORT
      name: x.name || x.address?.cityName || x.iataCode || '',
      iataCode: x.iataCode || '',
      detailed: {
        cityName: x.address?.cityName || '',
        countryCode: x.address?.countryCode || ''
      }
    }));

    const payload = items;
    cache.set(cacheKey, { ts: Date.now(), data: payload });
    res.json(payload);
  } catch (err) {
    console.error('Error /api/suggest:', err?.response?.result || err.message || err);
    res.json([]); // silencioso para no romper UI
  }
});

// -------- /api/vuelos (buscador) --------
// GET /api/vuelos?origin=CUN&destination=MAD&date=2025-09-01&adults=1&currency=USD&returnDate=2025-09-10
app.get('/api/vuelos', async (req, res) => {
  console.log('➡️  /api/vuelos', req.query);
  try {
    const origin = (req.query.origin || '').toUpperCase().trim();
    const destination = (req.query.destination || '').toUpperCase().trim();
    const date = (req.query.date || '').trim();
    const adults = Number(req.query.adults || 1);
    const currency = (req.query.currency || 'USD').toUpperCase().trim();
    const returnDate = (req.query.returnDate || '').trim();

    if (!/^[A-Z]{3}$/.test(origin)) return res.status(400).json({ error: 'Origin inválido (IATA 3 letras).' });
    if (!/^[A-Z]{3}$/.test(destination)) return res.status(400).json({ error: 'Destination inválido (IATA 3 letras).' });
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return res.status(400).json({ error: 'date inválida (YYYY-MM-DD).' });
    if (!Number.isInteger(adults) || adults < 1) return res.status(400).json({ error: 'adults inválido (>=1).' });
    if (returnDate) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(returnDate)) return res.status(400).json({ error: 'returnDate inválida (YYYY-MM-DD).' });
      if (new Date(returnDate) < new Date(date)) return res.status(400).json({ error: 'returnDate no puede ser antes que date.' });
    }

    const cacheKey = JSON.stringify({ origin, destination, date, returnDate, adults, currency });
    const cached = cache.get(cacheKey);
    if (cached && (Date.now() - cached.ts) < CACHE_TTL_MS) {
      console.log('🟢 Cache HIT');
      return res.json(cached.data);
    }
    console.log('🟠 Cache MISS');

    const params = {
      originLocationCode: origin,
      destinationLocationCode: destination,
      departureDate: date,
      adults,
      currencyCode: currency,
      max: 10
    };
    if (returnDate) params.returnDate = returnDate;

    console.log('🟡 Amadeus…');
    const response = await withTimeout(
      amadeus.shopping.flightOffersSearch.get(params),
      15000
    );
    console.log('🟢 Amadeus OK');

    const dict = response.result?.dictionaries || {};
    const carriers = dict.carriers || {};

    const data = (response.data || []).map((offer) => {
      const out = offer.itineraries?.[0];
      const ret = offer.itineraries?.[1];

      const outSeg = out?.segments || [];
      const retSeg = ret?.segments || [];

      const first = outSeg[0];
      const last  = outSeg[outSeg.length - 1];

      const airlineCode = first?.carrierCode || '';
      const airlineName = carriers[airlineCode] || airlineCode;

      const legs = outSeg.map((s) => ({
        airlineCode: s.carrierCode || '',
        flightNumber: s.number || '',
        from: s.departure?.iataCode || null,
        departAt: s.departure?.at || null,
        to: s.arrival?.iataCode || null,
        arriveAt: s.arrival?.at || null,
        duration: s.duration || null
      }));

      const returnLegs = retSeg.map((s) => ({
        airlineCode: s.carrierCode || '',
        flightNumber: s.number || '',
        from: s.departure?.iataCode || null,
        departAt: s.departure?.at || null,
        to: s.arrival?.iataCode || null,
        arriveAt: s.arrival?.at || null,
        duration: s.duration || null
      }));

      const hasReturn = retSeg.length > 0;
      const retLast = hasReturn ? retSeg[retSeg.length - 1] : null;

      return {
        priceTotal: offer.price?.total || null,
        currency: offer.price?.currency || currency,
        airline: airlineName,
        airlineCode,

        // Ida
        departureAt: first?.departure?.at || null,
        departureIata: first?.departure?.iataCode || null,
        arrivalAt: last?.arrival?.at || null,
        arrivalIata: last?.arrival?.iataCode || null,
        duration: out?.duration || null,
        stops: Math.max(0, outSeg.length - 1),
        legs,

        // Vuelta
        hasReturn,
        returnArrivalAt: retLast?.arrival?.at || null,
        returnArrivalIata: retLast?.arrival?.iataCode || null,
        returnDuration: ret?.duration || null,
        returnStops: hasReturn ? Math.max(0, retSeg.length - 1) : null,
        returnLegs
      };
    });

    const payload = { results: data };
    cache.set(cacheKey, { ts: Date.now(), data: payload });
    res.json(payload);
  } catch (err) {
    console.error('🔴 /api/vuelos error:', err?.response?.result || err.message || err);
    const status = err?.response?.statusCode || (err.message === 'timeout' ? 504 : 500);
    const body = err?.response?.result || { error: err.message || 'Error inesperado' };
    res.status(status).json(body);
  }
});

// -------- Arranque (Render) --------
const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`✅ Server on http://0.0.0.0:${PORT}`);
});
