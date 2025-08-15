// server.js — Express + Amadeus (sandbox) + cache + ida/vuelta + retry/timeout
require('dotenv').config({ path: require('path').join(__dirname, '.env') });

const express = require('express');
const cors = require('cors');
const path = require('path');
const Amadeus = require('amadeus');

const app = express();

// ---------- Middlewares y estáticos ----------
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public'), {
  maxAge: '7d',
  etag: true,
  lastModified: true,
  setHeaders: (res, filePath) => {
    if (filePath.endsWith('.html')) {
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
    }
  }
}));


app.get('/', (_req, res) => {
  res.set('Content-Type', 'text/html; charset=utf-8');
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});


app.get('/health', (_req, res) => res.json({ ok: true }));

// ---------- Amadeus (sandbox) ----------
const AMADEUS_ID = (process.env.AMADEUS_CLIENT_ID || '').trim();
const AMADEUS_SECRET = (process.env.AMADEUS_CLIENT_SECRET || '').trim();

if (!AMADEUS_ID || !AMADEUS_SECRET) {
  console.warn('⚠️ Faltan AMADEUS_CLIENT_ID o AMADEUS_CLIENT_SECRET. El servidor arranca, pero /api/vuelos fallará.');
}

const amadeus = new Amadeus({
  clientId: AMADEUS_ID,
  clientSecret: AMADEUS_SECRET,
  hostname: 'test' // sandbox
});

// ---------- Utilidades ----------
function withTimeout(promise, ms = 30000) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), ms))
  ]);
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function withRetry(fn, { attempts = 2, delayMs = 800 } = {}) {
  let lastErr;
  for (let i = 0; i <= attempts; i++) {
    try { return await fn(); }
    catch (err) {
      lastErr = err;
      const status = err?.response?.statusCode;
      const retriable = err?.message === 'timeout' || status === 429 || (status >= 500 && status < 600);
      if (i < attempts && retriable) { await sleep(delayMs * (i + 1)); continue; }
      throw err;
    }
  }
  throw lastErr;
}

// Cache en memoria (5 min)
const CACHE_TTL_MS = 5 * 60 * 1000;
const cache = new Map(); // key -> { ts, data }

// ---------- API principal ----------
app.get('/api/vuelos', async (req, res) => {
  try {
    const origin = (req.query.origin || '').toUpperCase().trim();
    const destination = (req.query.destination || '').toUpperCase().trim();
    const date = (req.query.date || '').trim();
    const returnDate = (req.query.returnDate || '').trim(); // opcional
    const adults = Number(req.query.adults || 1);
    const currency = (req.query.currency || 'USD').toUpperCase().trim();

    // Validaciones
    if (!/^[A-Z]{3}$/.test(origin)) return res.status(400).json({ error: 'Origin inválido (IATA de 3 letras).' });
    if (!/^[A-Z]{3}$/.test(destination)) return res.status(400).json({ error: 'Destination inválido (IATA de 3 letras).' });
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return res.status(400).json({ error: 'Date inválido. Use YYYY-MM-DD.' });
    if (returnDate) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(returnDate)) return res.status(400).json({ error: 'returnDate inválido. Use YYYY-MM-DD.' });
      if (new Date(returnDate) < new Date(date)) return res.status(400).json({ error: 'returnDate no puede ser antes de date.' });
    }
    if (!Number.isInteger(adults) || adults < 1) return res.status(400).json({ error: 'Adults debe ser entero >= 1.' });

    // Cache
    const cacheKey = JSON.stringify({ origin, destination, date, returnDate, adults, currency });
    const cached = cache.get(cacheKey);
    if (cached && (Date.now() - cached.ts) < CACHE_TTL_MS) {
      return res.json(cached.data);
    }

    // Parámetros Amadeus
    const params = {
      originLocationCode: origin,
      destinationLocationCode: destination,
      departureDate: date,
      adults,
      currencyCode: currency,
      max: returnDate ? 5 : 10 // roundtrip más ágil
    };
    if (returnDate) params.returnDate = returnDate;

    // Llamada con timeout + retry
    const response = await withRetry(
      () => withTimeout(amadeus.shopping.flightOffersSearch.get(params), 30000),
      { attempts: 2, delayMs: 1000 }
    );

    // Diccionarios
    const dict = response.result?.dictionaries || {};
    const carriers = dict.carriers || {};

    // Transformación con ida y (si existe) vuelta
    const data = (response.data || []).map((offer) => {
      // ----- IDA -----
      const itinOut = offer.itineraries?.[0]; // ida
      const segOut = itinOut?.segments || [];
      const firstOut = segOut[0];
      const lastOut = segOut[segOut.length - 1];

      const airlineCode = firstOut?.carrierCode || '';
      const airlineName = carriers[airlineCode] || airlineCode;

      // Legs de ida
      const legsOut = segOut.map((s) => ({
        airlineCode: s.carrierCode || '',
        flightNumber: s.number || '',
        from: s.departure?.iataCode || null,
        departAt: s.departure?.at || null,
        to: s.arrival?.iataCode || null,
        arriveAt: s.arrival?.at || null,
        duration: s.duration || null
      }));

      // ----- VUELTA (si existe) -----
      const itinRet = offer.itineraries?.[1] || null;
      const segRet = itinRet?.segments || [];
      const firstRet = segRet[0];
      const lastRet = segRet[segRet.length - 1];

      // Legs de vuelta
      const legsRet = segRet.map((s) => ({
        airlineCode: s.carrierCode || '',
        flightNumber: s.number || '',
        from: s.departure?.iataCode || null,
        departAt: s.departure?.at || null,
        to: s.arrival?.iataCode || null,
        arriveAt: s.arrival?.at || null,
        duration: s.duration || null
      }));

      return {
        // Precio / moneda
        priceTotal: offer.price?.total || null,
        currency: offer.price?.currency || currency,

        // Info principal (basada en la ida)
        airline: airlineName,
        airlineCode,

        // Ida (outbound)
        departureAt: firstOut?.departure?.at || null,
        departureIata: firstOut?.departure?.iataCode || null,
        arrivalAt: lastOut?.arrival?.at || null,
        arrivalIata: lastOut?.arrival?.iataCode || null,
        duration: itinOut?.duration || null,
        stops: Math.max(0, segOut.length - 1),
        legs: legsOut,

        // Vuelta (return) — puede venir null si no pediste returnDate
        hasReturn: !!itinRet,
        returnDepartureAt: firstRet?.departure?.at || null,
        returnDepartureIata: firstRet?.departure?.iataCode || null,
        returnArrivalAt: lastRet?.arrival?.at || null,
        returnArrivalIata: lastRet?.arrival?.iataCode || null,
        returnDuration: itinRet?.duration || null,
        returnStops: segRet.length ? Math.max(0, segRet.length - 1) : null,
        returnLegs: legsRet
      };
    });

    const payload = { results: data };
    cache.set(cacheKey, { ts: Date.now(), data: payload });
    return res.json(payload);
  } catch (err) {
    const status = err?.response?.statusCode || (err?.message === 'timeout' ? 504 : 500);
    const body = err?.response?.result || { error: err?.message || 'Error inesperado' };
    return res.status(status).json(body);
  }
});

// ---------- Arranque (Render) ----------
const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
  console.log('Servidor corriendo en 0.0.0.0:' + PORT);
});