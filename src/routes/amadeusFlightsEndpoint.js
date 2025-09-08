// src/routes/amadeusFlightsEndpoint.js (ESM)
// Backend Navuara: Vuelos reales (Amadeus) + Autocomplete mundial (Amadeus + fallback local)

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

import express from 'express';
import fetch from 'node-fetch';

const router = express.Router();

// ------------------ Config Amadeus ------------------
const AMADEUS_ENV   = process.env.AMADEUS_ENV || 'test'; // 'test' | 'production'
const AMADEUS_BASE  = AMADEUS_ENV === 'production' ? 'https://api.amadeus.com' : 'https://test.api.amadeus.com';
const AMADEUS_KEY   = process.env.AMADEUS_API_KEY;
const AMADEUS_SECRET= process.env.AMADEUS_API_SECRET;

if (!AMADEUS_KEY || !AMADEUS_SECRET) {
  console.warn('[Amadeus] Faltan AMADEUS_API_KEY / AMADEUS_API_SECRET en variables de entorno.');
}

// CORS básico dentro del router (además del global en server.js)
router.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.sendStatus(200);
  next();
});
router.use(express.json());

// ------------------ Token cache ------------------
let _token = null;
let _tokenExp = 0; // epoch ms

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

// ------------------ Buscar vuelos ------------------
function buildParams({
  origen,
  destino,
  fechaIda,
  fechaVuelta,
  adultos = 1,
  cabina,
  moneda = 'MXN',
  nonStop = undefined,
  max = 20,
}) {
  if (!origen || !destino || !fechaIda) {
    throw new Error('Faltan datos: origen, destino y fechaIda son obligatorios');
  }
  const p = new URLSearchParams();
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

// GET o POST: /api/vuelos/buscar
router.all('/api/vuelos/buscar', async (req, res) => {
  try {
    const input = { ...(req.query || {}), ...(req.body || {}) };

    // Campos aceptados (varios alias)
    const _origen = (input.origen || input.origin || input.from || input.originLocationCode || input.originCode || '').toString().trim().toUpperCase();
    const _destino = (input.destino || input.destination || input.to || input.destinationLocationCode || input.destinationCode || '').toString().trim().toUpperCase();
    const _fechaIda = (input.fechaIda || input.departureDate || input.date || input.departure || '').toString().trim();
    const _fechaVuelta = (input.fechaVuelta || input.returnDate || input.return || '').toString().trim();
    const _adultos = Number(input.adultos || input.adults || input.passengers || 1);
    const _cabina = (input.cabina || input.travelClass || 'ECONOMY').toString().trim().toUpperCase();
    const _moneda = (input.moneda || input.currency || 'MXN').toString().trim().toUpperCase();
    const _max = Number(input.max || 20);

    if (!_origen || !_destino || !_fechaIda) {
      return res.status(400).json({ ok:false, error:'Faltan parámetros: origen/destino/fechaIda' });
    }

    // 1) Directos primero
    const paramsDirect = buildParams({
      origen:_origen, destino:_destino, fechaIda:_fechaIda, fechaVuelta:_fechaVuelta || undefined,
      adultos:_adultos, cabina:_cabina, moneda:_moneda, nonStop:true, max:_max
    });
    let offers = await searchOffers(paramsDirect);
    let message;

    // 2) Si no hay directos, permitir 1 escala
    if (offers.length > 0) {
      message = 'Directos encontrados';
    } else {
      const paramsAny = buildParams({
        origen:_origen, destino:_destino, fechaIda:_fechaIda, fechaVuelta:_fechaVuelta || undefined,
        adultos:_adultos, cabina:_cabina, moneda:_moneda, nonStop:false, max:50
      });
      const offersAny = await searchOffers(paramsAny);
      offers = offersAny.filter(hasAtMostOneConnection);
      message = offers.length > 0 ? 'No hay directos, mostrando 1 escala' : 'Sin resultados';
    }

    // Orden por precio asc, desempate por duración de ida
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
    res.status(500).json({ ok:false, error: 'SEARCH_FAILED', detail: String(err?.message || err) });
  }
});

// ------------------ Autocomplete mundial ------------------
// Fallback local: carga una sola vez el JSON con todos los IATA
let LOCAL_AIRPORTS = null;
function loadLocalAirports() {
  if (LOCAL_AIRPORTS) return LOCAL_AIRPORTS;
  try {
    const p = path.join(__dirname, '..', 'data', 'airports.json'); // src/data/airports.json
    LOCAL_AIRPORTS = JSON.parse(fs.readFileSync(p, 'utf-8'));
  } catch {
    LOCAL_AIRPORTS = [];
  }
  return LOCAL_AIRPORTS;
}
const norm = s => (s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();

// Países (ES/EN) → ISO (amplía cuando quieras)
const COUNTRY_MAP = {
  'polonia':'PL','poland':'PL','suiza':'CH','switzerland':'CH','alemania':'DE','germany':'DE',
  'francia':'FR','france':'FR','italia':'IT','italy':'IT','espana':'ES','españa':'ES','spain':'ES',
  'paises bajos':'NL','netherlands':'NL','reino unido':'GB','uk':'GB','united kingdom':'GB',
  'marruecos':'MA','morocco':'MA','egipto':'EG','egypt':'EG','sudafrica':'ZA','sudáfrica':'ZA','south africa':'ZA',
  'kenia':'KE','kenya':'KE','nigeria':'NG','ghana':'GH','etiopia':'ET','ethiopia':'ET','tunez':'TN','túnez':'TN','tunisia':'TN'
};

// GET /api/airports/suggest?q=xxx&limit=8
router.get('/api/airports/suggest', async (req, res) => {
  try {
    const qRaw  = (req.query.q || '').toString().trim();
    const q     = qRaw.replace(/\s+/g, ' ');
    const limit = Math.min(20, parseInt(req.query.limit || '8', 10) || 8);
    if (q.length < 2) return res.json({ ok:true, results: [] });

    const qLower     = q.toLowerCase();
    const qNorm      = norm(q);
    const iataGuess  = (q.length === 3 && /^[A-Za-z]{3}$/.test(q)) ? q.toUpperCase() : null;
    const countryISO = COUNTRY_MAP[qNorm] || null;

    // 1) Amadeus (dos fuentes)
    const token   = await getAccessToken();
    const headers = { Authorization: `Bearer ${token}` };

    const p1 = new URLSearchParams({
      keyword:q, subType:'CITY,AIRPORT', 'page[limit]': String(limit), view:'FULL',
     
