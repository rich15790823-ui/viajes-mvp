// server.js — limpio (estáticos + health + Amadeus + caché + ida/vuelta)
require('dotenv').config({ path: require('path').join(__dirname, '.env') });

const express = require('express');
const cors = require('cors');
const path = require('path');
const Amadeus = require('amadeus');

const app = express();

// ----------------- Config básica -----------------
app.use(cors());
app.use(express.json());

// Estáticos con cache básico
app.use(express.static(path.join(__dirname, 'public'), {
  maxAge: '7d',
  etag: true,
  lastModified: true
}));

// Página principal
app.get('/', (_req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Healthcheck
app.get('/health', (_req, res) => res.json({ ok: true }));

// ----------------- Amadeus (TEST) -----------------
const AMADEUS_ID = (process.env.AMADEUS_CLIENT_ID || '').trim();
const AMADEUS_SECRET = (process.env.AMADEUS_CLIENT_SECRET || '').trim();

if (!AMADEUS_ID || !AMADEUS_SECRET) {
  console.warn('Faltan AMADEUS_CLIENT_ID o AMADEUS_CLIENT_SECRET. El servidor arranca, pero /api/vuelos fallará.');
}

const amadeus = new Amadeus({
  clientId: AMADEUS_ID,
  clientSecret: AMADEUS_SECRET,
  hostname: 'test' // usar sandbox
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
  try {
    const origin = (req.query.origin || '').toUpperCase().trim();
    const destination = (req.query.destination || '').toUpperCase().trim();
    const date = (req.query.date || '').trim();
    const returnDate = (req.query.returnDate || '').trim(); // opcional
    const adults = Number(req.query.adults || 1);
    const currency = (req.query.currency || 'USD').toUpperCase().trim();

    // Validaciones
    if (!/^[A-Z]{3}$/.test(origin)) {
      return res.status(400).json({ error: 'Parámetro "origin" inválido. Usa código IATA de 3 letras.' });
    }
    if (!/^[A-Z]{3}$/.test(destination)) {
      return res.status(400).json({ error: 'Parámetro "destination" inválido. Usa código IATA de 3 letras.' });
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return res.status(400).json({ error: 'Parámetro "date" inválido. Formato YYYY-MM-DD.' });
    }
    if (returnDate) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(returnDate)) {
        return res.status(400).json({ error: 'Parámetro "returnDate" inválido. Formato YYYY-MM-DD.' });
      }
      if (new Date(returnDate) < new Date(date)) {
        return res.status(400).json({ error: '"returnDate" no puede ser antes de "date".' });
      }
    }
    if (!Number.isInteger(adults) || adults < 1) {
      return res.status(400).json({ error: 'Parámetro "adults" inválido. Debe ser entero >= 1.' });
    }

    // Caché
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
      max: 10
    };
    if (returnDate) params.returnDate = returnDate;

    // Llamada con timeout
    const response = await withTimeout(
      amadeus.shopping.flightOffersSearch.get(params),
      15000
    );

    // Diccionarios
    const dict = (response.result && response.result.dictionaries) || {};
    const carriers = dict.carriers || {};

    // Transformar datos
    const data = (response.data || []).map((offer) => {
      const itin = offer.itineraries && offer.itineraries[0];
      const segments = (itin && itin.segments) || [];
      const first = segments[0];
      const last = segments[segments.length - 1];
      const code = (first && first.carrierCode) || '';
      const airlineName = carriers[code] || code;

      const legs = segments.map((s) => ({
        airlineCode: s.carrierCode || '',
        flightNumber: s.number || '',
        from: (s.departure && s.departure.iataCode) || null,
        departAt: (s.departure && s.departure.at) || null,
        to: (s.arrival && s.arrival.iataCode) || null,
        arriveAt: (s.arrival && s.arrival.at) || null,
        duration: s.duration || null
      }));

      return {
        priceTotal: (offer.price && offer.price.total) || null,
        currency: (offer.price && offer.price.currency) || currency,
        airline: airlineName,
        airlineCode: code,
        departureAt: (first && first.departure && first.departure.at) || null,
        departureIata: (first && first.departure && first.departure.iataCode) || null,
        arrivalAt: (last && last.arrival && last.arrival.at) || null,
        arrivalIata: (last && last.arrival && last.arrival.iataCode) || null,
        duration: (itin && itin.duration) || null,
        stops: Math.max(0, segments.length - 1),
        legs
      };
    });

    const payload = { results: data };
    cache.set(cacheKey, { ts: Date.now(), data: payload });
    return res.json(payload);
  } catch (err) {
    const status = (err && err.response && err.response.statusCode)
      || (err && err.message === 'timeout' ? 504 : 500);
    const body = (err && err.response && err.response.result)
      || { error: (err && err.message) || 'Error inesperado' };
    return res.status(status).json(body);
  }
});

// ----------------- Arranque (Render) -----------------
const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
  console.log('Servidor corriendo en 0.0.0.0:' + PORT);
});
