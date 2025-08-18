// server.js — versión estable: estáticos + /api/vuelos (ida/vuelta) + caché simple
require('dotenv').config({ path: require('path').join(__dirname, '.env') });

const express = require('express');
const cors = require('cors');
const path = require('path');
const Amadeus = require('amadeus');

const app = express();

// ----------------- Config básica -----------------
app.use(cors());
app.use(express.json());
// Sirve /public como sitio web
app.use(express.static(path.join(__dirname, 'public')));

// Health
app.get('/health', (_req, res) => res.json({ ok: true }));

// ----------------- Amadeus (TEST) -----------------
const AMADEUS_ID = (process.env.AMADEUS_CLIENT_ID || '').trim();
const AMADEUS_SECRET = (process.env.AMADEUS_CLIENT_SECRET || '').trim();

if (!AMADEUS_ID || !AMADEUS_SECRET) {
  console.warn('⚠️ Falta AMADEUS_CLIENT_ID o AMADEUS_CLIENT_SECRET en .env — /api fallará.');
}

const amadeus = new Amadeus({
  clientId: AMADEUS_ID,
  clientSecret: AMADEUS_SECRET,
  hostname: 'test' // sandbox
});

// ----------------- Utilidades -----------------
function withTimeout(promise, ms = 15000) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), ms))
  ]);
}

// Caché 5 min
const CACHE_TTL_MS = 5 * 60 * 1000;
const cache = new Map(); // key -> { ts, data }

// ----------------- API real: /api/vuelos -----------------
app.get('/api/vuelos', async (req, res) => {
  try {
    const origin = (req.query.origin || '').toUpperCase().trim();
    const destination = (req.query.destination || '').toUpperCase().trim();
    const date = (req.query.date || '').trim();
    const adults = Number(req.query.adults || 1);
    const currency = (req.query.currency || 'USD').toUpperCase().trim();
    const returnDate = (req.query.returnDate || '').trim();

    // Validaciones
    if (!/^[A-Z]{3}$/.test(origin)) return res.status(400).json({ error: 'Origin inválido (IATA 3 letras).' });
    if (!/^[A-Z]{3}$/.test(destination)) return res.status(400).json({ error: 'Destination inválido (IATA 3 letras).' });
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return res.status(400).json({ error: 'Fecha salida inválida (YYYY-MM-DD).' });
    if (!Number.isInteger(adults) || adults < 1) return res.status(400).json({ error: 'Adults inválido (>=1).' });
    if (returnDate) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(returnDate)) return res.status(400).json({ error: 'Fecha regreso inválida (YYYY-MM-DD).' });
      if (new Date(returnDate) < new Date(date)) return res.status(400).json({ error: 'Regreso no puede ser antes de salida.' });
    }

    // Caché
    const cacheKey = JSON.stringify({ origin, destination, date, adults, currency, returnDate });
    const cached = cache.get(cacheKey);
    if (cached && (Date.now() - cached.ts) < CACHE_TTL_MS) {
      return res.json(cached.data);
    }

    // Llamada a Amadeus
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

    const dict = response.result?.dictionaries || {};
    const carriers = dict.carriers || {};

    const data = (response.data || []).map((offer) => {
      const it0 = offer.itineraries?.[0];
      const it1 = offer.itineraries?.[1]; // puede no existir (solo ida)

      const seg0 = it0?.segments || [];
      const seg1 = it1?.segments || [];

      // Ida
      const first0 = seg0[0];
      const last0  = seg0[seg0.length - 1];

      // Vuelta
      const first1 = seg1[0];
      const last1  = seg1[seg1.length - 1];

      const airlineCode = first0?.carrierCode || '';
      const airlineName = carriers[airlineCode] || airlineCode;

      const legsOut = seg0.map(s => ({
        airlineCode: s.carrierCode || '',
        flightNumber: s.number || '',
        from: s.departure?.iataCode || null,
        departAt: s.departure?.at || null,
        to: s.arrival?.iataCode || null,
        arriveAt: s.arrival?.at || null,
        duration: s.duration || null
      }));
      const legsRet = seg1.map(s => ({
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

        // IDA
        departureAt: first0?.departure?.at || null,
        departureIata: first0?.departure?.iataCode || null,
        arrivalAt: last0?.arrival?.at || null,
        arrivalIata: last0?.arrival?.iataCode || null,
        durationOut: it0?.duration || null,
        stops: Math.max(0, seg0.length - 1),
        legs: legsOut,

        // VUELTA
        hasReturn: !!it1,
        returnDepartureAt: first1?.departure?.at || null,
        returnDepartureIata: first1?.departure?.iataCode || null,
        returnArrivalAt: last1?.arrival?.at || null,
        returnArrivalIata: last1?.arrival?.iataCode || null,
        durationRet: it1?.duration || null,
        returnLegs: legsRet
      };
    });

    const payload = { results: data };
    cache.set(cacheKey, { ts: Date.now(), data: payload });
    return res.json(payload);
  } catch (err) {
    console.error('🔴 /api/vuelos error:', err?.response?.result || err.message || err);
    const status = err?.response?.statusCode || (err.message === 'timeout' ? 504 : 500);
    const body = err?.response?.result || { error: err.message || 'Error inesperado' };
    return res.status(status).json(body);
  }
});

// ----------------- Arranque -----------------
const PORT = process.env.PORT || 3000;
// 0.0.0.0 para Render
app.listen(PORT, '0.0.0.0', () => {
  console.log(`✅ Servidor en 0.0.0.0:${PORT}`);
});

