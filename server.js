// server.js — limpio (estáticos + health + /api/vuelos + /api/suggest + caché)
require('dotenv').config({ path: require('path').join(__dirname, '.env') });

const express = require('express');
const cors = require('cors');
const path = require('path');
const Amadeus = require('amadeus');

const app = express();

// --------- Middlewares y estáticos ----------
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Página principal
app.get('/', (_req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Healthcheck
app.get('/health', (_req, res) => res.json({ ok: true }));

// --------- Amadeus (sandbox) ----------
const AMADEUS_ID = (process.env.AMADEUS_CLIENT_ID || '').trim();
const AMADEUS_SECRET = (process.env.AMADEUS_CLIENT_SECRET || '').trim();
console.log('DEBUG AMADEUS_ID len:', AMADEUS_ID.length);
console.log('DEBUG AMADEUS_SECRET len:', AMADEUS_SECRET.length);

const amadeus = new Amadeus({
  clientId: AMADEUS_ID,
  clientSecret: AMADEUS_SECRET,
  hostname: 'test'
});

// --------- Utilidades ----------
function withTimeout(promise, ms = 15000) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), ms))
  ]);
}

const CACHE_TTL_MS = 5 * 60 * 1000; // 5 min
const cache = new Map(); // key -> { ts, data }

// --------- /api/vuelos (ida y vuelta opcional) ----------
app.get('/api/vuelos', async (req, res) => {
  console.log('➡️  /api/vuelos', req.query);
  try {
    const origin = (req.query.origin || '').toUpperCase().trim();
    const destination = (req.query.destination || '').toUpperCase().trim();
    const date = (req.query.date || '').trim();
    const adults = Number(req.query.adults || 1);
    const currency = (req.query.currency || 'USD').toUpperCase().trim();
    const returnDate = (req.query.returnDate || '').trim();

    // Validaciones simples
    if (!/^[A-Z]{3}$/.test(origin))        return res.status(400).json({ error: 'Origen inválido (IATA).' });
    if (!/^[A-Z]{3}$/.test(destination))   return res.status(400).json({ error: 'Destino inválido (IATA).' });
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return res.status(400).json({ error: 'Salida inválida (YYYY-MM-DD).' });
    if (!Number.isInteger(adults) || adults < 1) return res.status(400).json({ error: 'Adults debe ser >= 1.' });
    if (returnDate) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(returnDate)) return res.status(400).json({ error: 'Regreso inválido (YYYY-MM-DD).' });
      if (new Date(returnDate) < new Date(date))   return res.status(400).json({ error: 'Regreso no puede ser antes de salida.' });
    }

    const cacheKey = JSON.stringify({ origin, destination, date, returnDate, adults, currency });
    const cached = cache.get(cacheKey);
    if (cached && (Date.now() - cached.ts) < CACHE_TTL_MS) {
      console.log('🟢 Cache HIT');
      return res.json(cached.data);
    }
    console.log('🟠 Cache MISS');

    // Llamada a Amadeus
    console.log('🟡 Llamando a Amadeus...');
    const resp = await withTimeout(
      amadeus.shopping.flightOffersSearch.get({
        originLocationCode: origin,
        destinationLocationCode: destination,
        departureDate: date,
        returnDate: returnDate || undefined,
        adults,
        currencyCode: currency,
        max: 10
      }),
      15000
    );
    console.log('🟢 Amadeus respondió');

    const dict = resp.result?.dictionaries || {};
    const carriers = dict.carriers || {};

    // Mapeo de ida y (si existe) vuelta
    const data = (resp.data || []).map((offer) => {
      const itinOut = offer.itineraries?.[0];
      const segOut = itinOut?.segments || [];
      const first = segOut[0];
      const lastOut = segOut[segOut.length - 1];
      const airlineCode = first?.carrierCode || '';
      const airlineName = carriers[airlineCode] || airlineCode;

      const legsOut = segOut.map(s => ({
        airlineCode: s.carrierCode || '',
        flightNumber: s.number || '',
        from: s.departure?.iataCode || null,
        departAt: s.departure?.at || null,
        to: s.arrival?.iataCode || null,
        arriveAt: s.arrival?.at || null,
        duration: s.duration || null
      }));

      // Si hay retorno, segunda itinerario
      const itinRet = offer.itineraries?.[1];
      const segRet = itinRet?.segments || [];
      const lastRet = segRet[segRet.length - 1] || null;

      const legsRet = segRet.map(s => ({
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
        // ida
        departureAt: first?.departure?.at || null,
        departureIata: first?.departure?.iataCode || null,
        arrivalAt: lastOut?.arrival?.at || null,
        arrivalIata: lastOut?.arrival?.iataCode || null,
        duration: itinOut?.duration || null,
        stops: Math.max(0, segOut.length - 1),
        legs: legsOut,
        // vuelta (si existe)
        hasReturn: !!itinRet,
        returnArrivalAt: lastRet?.arrival?.at || null,
        returnArrivalIata: lastRet?.arrival?.iataCode || null,
        returnDuration: itinRet?.duration || null,
        returnStops: Math.max(0, segRet.length - 1),
        returnLegs: legsRet
      };
    });

    const payload = { results: data };
    cache.set(cacheKey, { ts: Date.now(), data: payload });
    return res.json(payload);
  } catch (err) {
    console.error('🔴 Error /api/vuelos:', err?.response?.result || err.message || err);
    const status = err?.response?.statusCode || (err.message === 'timeout' ? 504 : 500);
    const body = err?.response?.result || { error: err.message || 'Error inesperado' };
    return res.status(status).json(body);
  }
});

// --------- /api/suggest (ciudades/aeropuertos) ----------
app.get('/api/suggest', async (req, res) => {
  try {
    const q = (req.query.q || '').trim();
    if (q.length < 2) return res.json([]);

    const key = `suggest:${q.toLowerCase()}`;
    const cached = cache.get(key);
    if (cached && (Date.now() - cached.ts) < CACHE_TTL_MS) {
      return res.json(cached.data);
    }

    const resp = await withTimeout(
      amadeus.referenceData.locations.get({
        keyword: q,
        subType: 'CITY,AIRPORT'
      }),
      10000
    );

    const out = (resp.data || []).map(x => {
      const code = x.iataCode || '';
      const city = x.address?.cityName || x.detailedName || x.name || '';
      const name = x.name || x.detailedName || city || '';
      const country = x.address?.countryCode || '';
      const sub = x.subType; // 'CITY' | 'AIRPORT'
      const label = sub === 'CITY'
        ? `${city} (${code}) — Ciudad${country ? ' · ' + country : ''}`
        : `${name} (${code}) — Aeropuerto${country ? ' · ' + country : ''}`;
      return { label, iataCode: code, subType: sub, name, detailed: { cityName: city, countryCode: country } };
    });

    const payload = out.slice(0, 12);
    cache.set(key, { ts: Date.now(), data: payload });
    res.json(payload);
  } catch (err) {
    console.error('Error /api/suggest:', err?.response?.result || err.message || err);
    res.status(500).json({ error: 'suggest_failed' });
  }
});

// --------- Arranque ----------
const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`✅ Servidor corriendo en 0.0.0.0:${PORT}`);
});
