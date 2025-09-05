// src/routes/amadeusFlightsEndpoint.js (ESM)
// Endpoint Express para buscar vuelos reales con Amadeus (TEST o PROD)
// - Intenta DIRECTOS primero (nonStop=true)
// - Si no hay, permite 1 ESCALA (<=1 conexión por trayecto)
// - Respuesta simplificada para la UI de Navuara

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

import express from 'express';
import fetch from 'node-fetch';

const router = express.Router();

// --- Config ---
const AMADEUS_ENV = process.env.AMADEUS_ENV || 'test'; // 'test' | 'production'
const AMADEUS_BASE = AMADEUS_ENV === 'production'
  ? 'https://api.amadeus.com'
  : 'https://test.api.amadeus.com';
const AMADEUS_KEY = process.env.AMADEUS_API_KEY;
const AMADEUS_SECRET = process.env.AMADEUS_API_SECRET;

if (!AMADEUS_KEY || !AMADEUS_SECRET) {
  console.warn('[Amadeus] Faltan AMADEUS_API_KEY / AMADEUS_API_SECRET en variables de entorno.');
}

// --- CORS básico para este router ---
router.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.sendStatus(200);
  next();
});

router.use(express.json());

// --- Cache de token ---
let _token = null;
let _tokenExp = 0;

async function getAccessToken() {
  const now = Date.now();
  if (_token && now < _tokenExp - 120000) return _token; // margen 2m

  const body = new URLSearchParams({
    grant_type: 'client_credentials',
    client_id: AMADEUS_KEY,
    client_secret: AMADEUS_SECRET,
  });

  const resp = await fetch(`${AMADEUS_BASE}/v1/security/oauth2/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  if (!resp.ok) throw new Error(`Amadeus token error ${resp.status}`);
  const data = await resp.json();
  _token = data.access_token;
  _tokenExp = Date.now() + (data.expires_in || 1799) * 1000; // ~30m
  return _token;
}

function buildParams({
  origen, destino, fechaIda, fechaVuelta,
  adultos = 1, cabina, moneda = 'MXN',
  nonStop = undefined, max = 20,
}) {
  const p = new URLSearchParams();
  if (!origen || !destino || !fechaIda) {
    throw new Error('Faltan datos: origen, destino y fechaIda son obligatorios');
  }
  p.set('originLocationCode', String(origen).toUpperCase());
  p.set('destinationLocationCode', String(destino).toUpperCase());
  p.set('departureDate', fechaIda);
  if (fechaVuelta) p.set('returnDate', fechaVuelta);
  p.set('adults', String(adultos || 1));
  if (cabina) p.set('travelClass', String(cabina)); // ECONOMY, PREMIUM_ECONOMY, BUSINESS, FIRST
  p.set('currencyCode', moneda || 'MXN');
  p.set('max', String(max || 20));
  if (typeof nonStop === 'boolean') p.set('nonStop', String(nonStop));
  return p;
}

async function searchOffers(params) {
  const token = await getAccessToken();
  const url = `${AMADEUS_BASE}/v2/shopping/flight-offers?${params.toString()}`;
  const r = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!r.ok) throw new Error(`Amadeus search error ${r.status}`);
  const data = await r.json();
  return data?.data || [];
}

function hasAtMostOneConnection(offer) {
  if (!offer?.itineraries) return false;
  return offer.itineraries.every((it) => {
    const segs = it?.segments || [];
    const connections = Math.max(0, segs.length - 1);
    return connections <= 1;
  });
}

function mapOffer(offer) {
  const it0 = offer.itineraries?.[0];
  const it1 = offer.itineraries?.[1];
  const segs0 = it0?.segments || [];
  const segs1 = it1?.segments || [];

  const mapSeg = (s) => ({
    salida: {
      iata: s?.departure?.iataCode,
      terminal: s?.departure?.terminal || null,
      at: s?.departure?.at,
    },
    llegada: {
      iata: s?.arrival?.iataCode,
      terminal: s?.arrival?.terminal || null,
      at: s?.arrival?.at,
    },
    aerolinea: s?.carrierCode,
    vuelo: s?.number,
    duracionSegmento: s?.duration || null,
  });

  const escalasIda = Math.max(0, segs0.length - 1);
  const escalasVuelta = Math.max(0, segs1.length - 1);

  return {
    precioTotal: offer?.price?.grandTotal,
    moneda: offer?.price?.currency || 'MXN',
    duracionIda: it0?.duration || null,
    duracionVuelta: it1?.duration || null,
    escalasIda,
    escalasVuelta: segs1.length ? escalasVuelta : null,
    segmentosIda: segs0.map(mapSeg),
    segmentosVuelta: segs1.length ? segs1.map(mapSeg) : null,
    asientosDisponibles: offer?.numberOfBookableSeats ?? null,
  };
}

// ✅ Acepta GET y POST; lee query params o body (flexible para Nerd)
router.all('/api/vuelos/buscar', async (req, res) => {
  try {
    const input = { ...(req.query || {}), ...(req.body || {}) };

    const _origen  = (input.origen  || input.origin  || input.from  || input.originLocationCode      || input.originCode || '').toString().trim().toUpperCase();
    const _destino = (input.destino || input.destination || input.to || input.destinationLocationCode || input.destinationCode || '').toString().trim().toUpperCase();
    const _fechaIda    = (input.fechaIda    || input.departureDate || input.date || input.departure || '').toString().trim();
    const _fechaVuelta = (input.fechaVuelta || input.returnDate    || input.return || '').toString().trim();
    const _adultos = Number(input.adultos || input.adults || input.passengers || 1);
    const _cabina  = (input.cabina || input.travelClass || 'ECONOMY').toString().trim().toUpperCase();
    const _moneda  = (input.moneda || input.currency || 'MXN').toString().trim().toUpperCase();
    const _max     = Number(input.max || 20);

    if (!_origen || !_destino || !_fechaIda) {
      return res.status(400).json({ ok:false, error:'Faltan parámetros: origen/destino/fechaIda' });
    }

    // 1) Directos
    const paramsDirect = buildParams({
      origen:_origen, destino:_destino, fechaIda:_fechaIda, fechaVuelta:_fechaVuelta || undefined,
      adultos:_adultos, cabina:_cabina, moneda:_moneda, nonStop:true, max:_max
    });
    let offers = await searchOffers(paramsDirect);

    let message;
    if (offers.length > 0) {
      message = 'Directos encontrados';
    } else {
      // 2) Con escalas (máx. 1)
      const paramsAny = buildParams({
        origen:_origen, destino:_destino, fechaIda:_fechaIda, fechaVuelta:_fechaVuelta || undefined,
        adultos:_adultos, cabina:_cabina, moneda:_moneda, nonStop:false, max:50
      });
      const offersAny = await searchOffers(paramsAny);
      offers = offersAny.filter(hasAtMostOneConnection);
      message = offers.length > 0 ? 'No hay directos, mostrando 1 escala' : 'Sin resultados';
    }

    // Orden: precio asc; empate por duración de ida
    offers.sort((a, b) => {
      const pa = Number(a?.price?.grandTotal || Infinity);
      const pb = Number(b?.price?.grandTotal || Infinity);
      if (pa !== pb) return pa - pb;
      const da = a?.itineraries?.[0]?.duration || '';
      const db = b?.itineraries?.[0]?.duration || '';
      return da.localeCompare(db);
    });

    res.status(200).json({
      ok: true,
      message,
      ofertas: offers.map(mapOffer).slice(0, Number(_max) || 20),
    });
  } catch (err) {
    console.error('[/api/vuelos/buscar] Error:', err);
    res.status(500).json({ error: 'SEARCH_FAILED', detail: String(err?.message || err) });
  }
});

// Autocomplete de aeropuertos/ciudades desde Amadeus (ampliado + países ES/EN + fallback)
router.get('/api/airports/suggest', async (req, res) => {
  try {
    const qRaw = (req.query.q || '').toString().trim();
    const q = qRaw.replace(/\s+/g, ' ');
    const limit = Math.min(20, parseInt(req.query.limit || '8', 10) || 8);
    if (q.length < 2) return res.json({ ok: true, results: [] });

    const token = await getAccessToken();

    // Normalizador básico (sin acentos, minúsculas)
    const normalize = (s) =>
      (s || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .trim();

    const qNorm = normalize(q);

    // Mapa ES/EN -> ISO alpha-2 y nombre EN (solo países más pedidos; puedes ampliar)
    const COUNTRY_MAP = {
      // Europa
      'polonia': { code: 'PL', en: 'Poland' },
      'poland': { code: 'PL', en: 'Poland' },
      'suiza': { code: 'CH', en: 'Switzerland' },
      'switzerland': { code: 'CH', en: 'Switzerland' },
      'alemania': { code: 'DE', en: 'Germany' },
      'germany': { code: 'DE', en: 'Germany' },
      'francia': { code: 'FR', en: 'France' },
      'france': { code: 'FR', en: 'France' },
      'italia': { code: 'IT', en: 'Italy' },
      'italy': { code: 'IT', en: 'Italy' },
      'espana': { code: 'ES', en: 'Spain' },
      'españa': { code: 'ES', en: 'Spain' },
      'spain': { code: 'ES', en: 'Spain' },
      'paises bajos': { code: 'NL', en: 'Netherlands' },
      'paisesbajos': { code: 'NL', en: 'Netherlands' },
      'netherlands': { code: 'NL', en: 'Netherlands' },
      'reino unido': { code: 'GB', en: 'United Kingdom' },
      'uk': { code: 'GB', en: 'United Kingdom' },
      'united kingdom': { code: 'GB', en: 'United Kingdom' },
      'suiza': { code: 'CH', en: 'Switzerland' },
      // África (ejemplos comunes)
      'marruecos': { code: 'MA', en: 'Morocco' },
      'morocco': { code: 'MA', en: 'Morocco' },
      'egipto': { code: 'EG', en: 'Egypt' },
      'egypt': { code: 'EG', en: 'Egypt' },
      'sudafrica': { code: 'ZA', en: 'South Africa' },
      'sudáfrica': { code: 'ZA', en: 'South Africa' },
      'south africa': { code: 'ZA', en: 'South Africa' },
      'kenia': { code: 'KE', en: 'Kenya' },
      'kenya': { code: 'KE', en: 'Kenya' },
      'nigeria': { code: 'NG', en: 'Nigeria' },
      'ghana': { code: 'GH', en: 'Ghana' },
      'etiopia': { code: 'ET', en: 'Ethiopia' },
      'ethiopia': { code: 'ET', en: 'Ethiopia' },
      'tunez': { code: 'TN', en: 'Tunisia' },
      'túnez': { code: 'TN', en: 'Tunisia' },
      'tunisia': { code: 'TN', en: 'Tunisia' },
    };

    // Catálogo curado (fallback) por país
    const CURATED = {
      PL: [
        { iata: 'WAW', city: 'Warsaw', name: 'Chopin' },
        { iata: 'KRK', city: 'Krakow', name: 'John Paul II' },
        { iata: 'GDN', city: 'Gdansk', name: 'Lech Wałęsa' },
        { iata: 'WRO', city: 'Wroclaw', name: 'Copernicus' },
      ],
      CH: [
        { iata: 'ZRH', city: 'Zurich', name: 'Zurich' },
        { iata: 'GVA', city: 'Geneva', name: 'Geneva' },
        { iata: 'BSL', city: 'Basel', name: 'EuroAirport' },
      ],
      MA: [
        { iata: 'CMN', city: 'Casablanca', name: 'Mohammed V' },
        { iata: 'RAK', city: 'Marrakesh', name: 'Menara' },
        { iata: 'FEZ', city: 'Fes', name: 'Saiss' },
      ],
      EG: [
        { iata: 'CAI', city: 'Cairo', name: 'Cairo Int’l' },
        { iata: 'HRG', city: 'Hurghada', name: 'Hurghada' },
        { iata: 'SSH', city: 'Sharm El Sheikh', name: 'Sharm El Sheikh' },
      ],
      ZA: [
        { iata: 'JNB', city: 'Johannesburg', name: 'O. R. Tambo' },
        { iata: 'CPT', city: 'Cape Town', name: 'Cape Town' },
        { iata: 'DUR', city: 'Durban', name: 'King Shaka' },
      ],
      KE: [
        { iata: 'NBO', city: 'Nairobi', name: 'Jomo Kenyatta' },
        { iata: 'MBA', city: 'Mombasa', name: 'Moi' },
      ],
    };

    // ¿Se parece a un nombre de país?
    let country = null;
    for (const key of Object.keys(COUNTRY_MAP)) {
      if (qNorm === key || qNorm.includes(key)) {
        country = COUNTRY_MAP[key];
        break;
      }
    }

    // Llamadas Amadeus
    const headers = { Authorization: `Bearer ${token}` };

    const normRec = (d) => ({
      iata: d.iataCode,
      city: d.address?.cityName || d.name || '',
      name: d.name || '',
    });

    const byIata = new Map();

    // 1) CITY + AIRPORT (view=FULL; sin sort sesgado)
    const p1 = new URLSearchParams({
      keyword: q,
      subType: 'CITY,AIRPORT',
      'page[limit]': String(limit),
      view: 'FULL',
      ...(country ? { countryCode: country.code } : {}),
    });
    const r1 = await fetch(`${AMADEUS_BASE}/v1/reference-data/locations?${p1}`, { headers });
    if (r1.ok) {
      const j1 = await r1.json();
      for (const d of (j1.data || [])) if (d?.iataCode) byIata.set(d.iataCode, normRec(d));
    }

    // 2) SOLO AIRPORTS (a veces trae otros matches)
    const p2 = new URLSearchParams({
      keyword: q,
      'page[limit]': String(limit),
      ...(country ? { countryCode: country.code } : {}),
    });
    const r2 = await fetch(`${AMADEUS_BASE}/v1/reference-data/locations/airports?${p2}`, { headers });
    if (r2.ok) {
      const j2 = await r2.json();
      for (const d of (j2.data || [])) if (d?.iataCode) byIata.set(d.iataCode, normRec(d));
    }

    // 3) Fallback curado si sigue flojo pero detectamos país
    if (byIata.size < limit && country && CURATED[country.code]) {
      for (const d of CURATED[country.code]) {
        if (!byIata.has(d.iata)) byIata.set(d.iata, d);
      }
    }

    let results = Array.from(byIata.values());

    // Bonus: si escribió exactamente un IATA (3 letras), muéstralo arriba
    const iataGuess = (q.length === 3 && /^[A-Za-z]{3}$/.test(q)) ? q.toUpperCase() : null;
    if (iataGuess && !byIata.has(iataGuess)) {
      results.unshift({ iata: iataGuess, city: iataGuess, name: 'Typed code' });
    }

    // Orden: exact IATA > prefijo de ciudad/nombre > alfabético
    const qLower = q.toLowerCase();
    results.sort((a, b) => {
      const aExact = (a.iata || '').toUpperCase() === (iataGuess || '');
      const bExact = (b.iata || '').toUpperCase() === (iataGuess || '');
      if (aExact !== bExact) return aExact ? -1 : 1;

      const aHit = (a.city||'').toLowerCase().startsWith(qLower) || (a.name||'').toLowerCase().startsWith(qLower);
      const bHit = (b.city||'').toLowerCase().startsWith(qLower) || (b.name||'').toLowerCase().startsWith(qLower);
      if (aHit !== bHit) return aHit ? -1 : 1;

      return (a.city||a.name||a.iata).localeCompare(b.city||b.name||b.iata);
    });

    res.json({ ok: true, results: results.slice(0, limit) });
  } catch (err) {
    console.error('[/api/airports/suggest] Error:', err);
    res.status(500).json({ ok:false, error:'SUGGEST_FAILED', detail: String(err?.message || err) });
  }
});
