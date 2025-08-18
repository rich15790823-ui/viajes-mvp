// server.js — limpio (estáticos + health + Amadeus + suggest + vuelos + caché)
require('dotenv').config({ path: require('path').join(__dirname, '.env') });

const express = require('express');
const cors = require('cors');
const path = require('path');
const Amadeus = require('amadeus');

const app = express();

/* ----------------- Config básica ----------------- */
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

app.get('/', (_req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/health', (_req, res) => res.json({ ok: true }));

/* ----------------- Amadeus (TEST) ----------------- */
const AMADEUS_ID = (process.env.AMADEUS_CLIENT_ID || '').trim();
const AMADEUS_SECRET = (process.env.AMADEUS_CLIENT_SECRET || '').trim();
console.log('DEBUG AMADEUS_CLIENT_ID len:', AMADEUS_ID.length);
console.log('DEBUG AMADEUS_CLIENT_SECRET len:', AMADEUS_SECRET.length);

let amadeus = null;
if (!AMADEUS_ID || !AMADEUS_SECRET) {
  console.error('❌ Faltan AMADEUS_CLIENT_ID o AMADEUS_CLIENT_SECRET en .env (o en Render). /api/* responderá 503.');
} else {
  amadeus = new Amadeus({
    clientId: AMADEUS_ID,
    clientSecret: AMADEUS_SECRET,
    hostname: 'test' // sandbox
  });
}

/* ----------------- Utilidades ----------------- */
function withTimeout(promise, ms = 15000) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), ms))
  ]);
}

// Caché (memoria)
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutos
const cache = new Map(); // key -> { ts, data }

/* ----------------- /api/suggest -----------------
   Autocompletado de ciudades/aeropuertos con Amadeus
   GET /api/suggest?q=cancun
--------------------------------------------------*/
app.get('/api/suggest', async (req, res) => {
  try {
    if (!amadeus) return res.status(503).json({ error: 'Amadeus no configurado' });

    const q = (req.query.q || '').trim();
    if (q.length < 2) return res.json([]);

    // cache
    const cacheKey = `suggest:${q.toLowerCase()}`;
    const cached = cache.get(cacheKey);
    if (cached && (Date.now() - cached.ts) < CACHE_TTL_MS) {
      return res.json(cached.data);
    }

    const response = await withTimeout(
      amadeus.referenceData.locations.get({
        keyword: q,
        subType: 'AIRPORT,CITY',
        'page[limit]': 10,
        view: 'FULL'
      }),
      12000
    );

    const items = (response.data || []).map((it) => ({
      iataCode: (it.iataCode || '').toUpperCase(),
      name: it.name || it.detailedName || '',
      subType: it.subType || '', // CITY o AIRPORT
      detailed: {
        cityName: it.address?.cityName || it.address?.cityNameLocalized || '',
        countryCode: it.address?.countryCode || ''
      }
    }));

    const payload = items;
    cache.set(cacheKey, { ts: Date.now(), data: payload });
    return res.json(payload);
  } catch (err) {
    console.error('🔴 Error /api/suggest:', err?.response?.result || err.message || err);
    const status = err?.response?.statusCode || (err.message === 'timeout' ? 504 : 500);
    return res.status(status).json({ error: 'Fallo en suggest' });
  }
});

/* ----------------- /api/vuelos -----------------
   Búsqueda de vuelos (ida opcional / ida y vuelta)
   GET /api/vuelos?origin=CUN&destination=MAD&date=2025-09-01&adults=1&currency=USD[&returnDate=YYYY-MM-DD]
--------------------------------------------------*/
app.get('/api/vuelos', async (req, res) => {
  console.log('➡️  /api/vuelos llamada con:', req.query);
  try {
    if (!amadeus) return res.status(503).json({ error: 'Amadeus no configurado' });

    const origin = (req.query.origin || '').toUpperCase().trim();
    const destination = (req.query.destination || '').toUpperCase().trim();
    const date = (req.query.date || '').trim();
    const adults = Number(req.query.adults || 1);
    const currency = (req.query.currency || 'USD').toUpperCase().trim();
    const returnDate = (req.query.returnDate || '').trim(); // opcional

    // Validaciones
    if (!/^[A-Z]{3}$/.test(origin)) {
      return res.status(400).json({ error: 'Parámetro "origin" inválido. Usa IATA (ej. CUN).' });
    }
    if (!/^[A-Z]{3}$/.test(destination)) {
      return res.status(400).json({ error: 'Parámetro "destination" inválido. Usa IATA (ej. MAD).' });
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return res.status(400).json({ error: 'Parámetro "date" inválido. YYYY-MM-DD' });
    }
    if (!Number.isInteger(adults) || adults < 1) {
      return res.status(400).json({ error: 'Parámetro "adults" inválido. >= 1' });
    }
    if (returnDate) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(returnDate)) {
        return res.status(400).json({ error: 'Parámetro "returnDate" inválido. YYYY-MM-DD' });
      }
      if (new Date(returnDate) < new Date(date)) {
        return res.status(400).json({ error: '"returnDate" no puede ser antes de "date".' });
      }
    }

    // caché
    const cacheKey = JSON.stringify({ origin, destination, date, returnDate, adults, currency });
    const cached = cache.get(cacheKey);
    if (cached && (Date.now() - cached.ts) < CACHE_TTL_MS) {
      console.log('🟢 Cache HIT');
      return res.json(cached.data);
    }
    console.log('🟠 Cache MISS');

    // llamada Amadeus
    console.log('🟡 Llamando a Amadeus...');
    const params = {
      originLocationCode: origin,
      destinationLocationCode: destination,
      departureDate: date,
      adults,
      currencyCode: currency,
      max: 10
    };
    if (returnDate) params.returnDate = returnDate;

    const response = await withTimeout(
      amadeus.shopping.flightOffersSearch.get(params),
      15000
    );
    console.log('🟢 Amadeus respondió');

    const dict = response.result?.dictionaries || {};
    const carriers = dict.carriers || {};

    const data = (response.data || []).map((offer) => {
      const priceTotal = offer.price?.total || null;

      // Itinerarios: 0 = ida, 1 = vuelta (si hay)
      const out = offer.itineraries?.[0];
      const ret = offer.itineraries?.[1];

      const outSeg = out?.segments || [];
      const retSeg = ret?.segments || [];

      const first = outSeg[0];
      const last = outSeg[outSeg.length - 1];

      const airlineCode = first?.carrierCode || '';
      const airlineName = carriers[airlineCode] || airlineCode;

      // legs ida
      const legs = outSeg.map((s) => ({
        airlineCode: s.carrierCode || '',
        flightNumber: s.number || '',
        from: s.departure?.iataCode || null,
        departAt: s.departure?.at || null,
        to: s.arrival?.iataCode || null,
        arriveAt: s.arrival?.at || null,
        duration: s.duration || null
      }));

      // legs vuelta (si existe)
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
        priceTotal,
        currency: offer.price?.currency || currency,

        airline: airlineName,
        airlineCode,

        // ida
        departureAt: first?.departure?.at || null,
        departureIata: first?.departure?.iataCode || null,
        arrivalAt: last?.arrival?.at || null,
        arrivalIata: last?.arrival?.iataCode || null,
        duration: out?.duration || null,
        stops: Math.max(0, outSeg.length - 1),
        legs,

        // vuelta
        hasReturn,
        returnDuration: ret?.duration || null,
        returnStops: hasReturn ? Math.max(0, retSeg.length - 1) : null,
        returnArrivalAt: retLast?.arrival?.at || null,
        returnArrivalIata: retLast?.arrival?.iataCode || null,
        returnLegs
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

// --- AUTOCOMPLETE: /api/airports (ciudades y aeropuertos) ---
app.get('/api/airports', async (req, res) => {
  try {
    const q = (req.query.q || '').trim();
    if (!q || q.length < 2) {
      return res.json({ results: [] });
    }

    // Llama a Amadeus Locations (CITY + AIRPORT)
    const r = await amadeus.referenceData.locations.get({
      keyword: q,
      subType: 'AIRPORT,CITY',
      'page[limit]': 10
    });

    const rows = (r.data || []).map(item => {
      const iata = item.iataCode || '';
      const name = item.name || '';
      // Construimos un label legible, ej: "CUN — Cancún (MX)"
      const cityName = item.address?.cityName || '';
      const country = item.address?.countryCode || '';
      let label = iata ? `${iata} — ${name}` : name;
      if (cityName && cityName !== name) label += `, ${cityName}`;
      if (country) label += ` (${country})`;
      return { iata, label, subType: item.subType || 'AIRPORT' };
    });

    res.json({ results: rows });
  } catch (err) {
    console.error('Error /api/airports:', err?.response?.result || err.message || err);
    const status = err?.response?.statusCode || 500;
    const body = err?.response?.result || { error: 'Error buscando aeropuertos/ciudades' };
    res.status(status).json(body);
  }
});


/* ----------------- Arranque ----------------- */
const PORT = process.env.PORT || 3000;
// Importante para Render: 0.0.0.0
app.listen(PORT, '0.0.0.0', () => {
  console.log(`✅ Servidor en http://0.0.0.0:${PORT}`);
});
