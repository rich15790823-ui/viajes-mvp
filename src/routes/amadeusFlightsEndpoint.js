// src/routes/amadeusFlightsEndpoint.js (ESM)
// API de Navuara: vuelos reales (Amadeus) + autocompletar mundial (Amadeus + fallback local)

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

import express from 'express';
import fetch from 'node-fetch';

const router = express.Router();

// -------------------------
// Config Amadeus
// -------------------------
const AMADEUS_ENV   = process.env.AMADEUS_ENV || 'test'; // 'test' | 'production'
const AMADEUS_BASE  = AMADEUS_ENV === 'production' ? 'https://api.amadeus.com' : 'https://test.api.amadeus.com';
const AMADEUS_KEY   = process.env.AMADEUS_API_KEY;
const AMADEUS_SECRET= process.env.AMADEUS_API_SECRET;

if (!AMADEUS_KEY || !AMADEUS_SECRET) {
  console.warn('[Amadeus] Faltan AMADEUS_API_KEY / AMADEUS_API_SECRET en variables de entorno.');
}

// CORS básico del router (seguro si tu server ya usa cors(), pero ayuda con preflight)
router.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

router.use(express.json());

// -------------------------
// Cache de token Amadeus
// -------------------------
let _token = null;
let _tokenExp = 0; // epoch ms

async function getAccessToken() {
  const now = Date.now();
  if (_token && now < _tokenExp - 120_000) return _token; // margen 2 min

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
  if (!r.ok) {
  const txt = await r.text().catch(()=> '');
  // Ej: {"errors":[{"title":"DATE_OUT_OF_RANGE", "detail":"..."}]}
  throw new Error(`Amadeus search error ${r.status}: ${txt}`);
}


// -------------------------
// Búsqueda de vuelos reales
// -------------------------
function buildFlightParams({
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
  const p = new URLSearchParams();
  if (!origen || !destino || !fechaIda) throw new Error('Faltan datos: origen, destino y fechaIda son obligatorios');
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

// Acepta GET y POST para facilitar integración desde Nerd
router.all('/api/vuelos/buscar', async (req, res) => {
  try {
    const input = { ...(req.query || {}), ...(req.body || {}) };

    const _origen = (input.origen || input.origin || input.from || input.originLocationCode || input.originCode || '').toString().trim().toUpperCase();
    const _destino = (input.destino || input.destination || input.to || input.destinationLocationCode || input.destinationCode || '').toString().trim().toUpperCase();
    const _fechaIda = (input.fechaIda || input.departureDate || input.date || input.departure || '').toString().trim();
    const _fechaVuelta = (input.fechaVuelta || input.returnDate || input.return || '').toString().trim();
    const _adultos = Number(input.adultos || input.adults || input.passengers || 1);
    const _cabina = (input.cabina || input.travelClass || 'ECONOMY').toString().trim().toUpperCase();
    const _moneda = (input.moneda || input.currency || 'MXN').toString().trim().toUpperCase();
    const _max = Number(input.max || 20);

    // Validación mínima (evita 400 de Amadeus por parámetros malos)
    if (!/^[A-Z]{3}$/.test(_origen) || !/^[A-Z]{3}$/.test(_destino)) {
      return res.status(400).json({ ok:false, error:'IATA inválido' });
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(_fechaIda)) {
      return res.status(400).json({ ok:false, error:'Fecha inválida (YYYY-MM-DD)' });
    }
    const SAFE_MAX = Math.min(Math.max(Number(_max||20), 1), 200);

    // Helpers
    const connCount = (it) => Math.max(0, (it?.segments || []).length - 1);
    const maxConnsPerItin = (off) => (off?.itineraries || []).reduce((m,it)=>Math.max(m, connCount(it)), 0);
    async function searchFiltered({ origin, dest, date, retDate, adults, cabin, currency, maxStops = 2, maxResults = 200 }) {
      const p = buildFlightParams({
        origen: origin, destino: dest, fechaIda: date, fechaVuelta: retDate || undefined,
        adultos: adults, cabina: cabin, moneda: currency, max: maxResults
      });
      const any = await searchOffers(p);
      return any.filter(off => maxConnsPerItin(off) <= maxStops);
    }

    // 1) Directos primero (rápido)
    const paramsDirect = buildFlightParams({
      origen:_origen, destino:_destino, fechaIda:_fechaIda, fechaVuelta:_fechaVuelta || undefined,
      adultos:_adultos, cabina:_cabina, moneda:_moneda, nonStop:true, max:50
    });
    let offers = await searchOffers(paramsDirect);

    let message = '';
    if (offers.length > 0) {
      message = 'Directos encontrados';
    } else {
      // 2) Hasta 2 escalas
      let filtered = await searchFiltered({
        origin:_origen, dest:_destino, date:_fechaIda, retDate:_fechaVuelta,
        adults:_adultos, cabin:_cabina, currency:_moneda, maxStops:2, maxResults:Math.max(150, SAFE_MAX)
      });

      if (filtered.length > 0) {
        offers = filtered;
        message = 'Mostrando vuelos con escalas (hasta 2)';
      } else {
        // 3) Alternos de ciudad + fechas ±2 días
        const origins = cityAirports(_origen);
        const dests   = cityAirports(_destino);
        const offsets = [0, -1, 1, -2, 2];

        let found = null;
        for (const off of offsets) {
          const d = new Date(_fechaIda);
          d.setDate(d.getDate() + off);
          const yyyy = d.getUTCFullYear();
          const mm   = String(d.getUTCMonth()+1).padStart(2,'0');
          const dd   = String(d.getUTCDate()).padStart(2,'0');
          const dateTry = `${yyyy}-${mm}-${dd}`;

          for (const o of origins) {
            for (const de of dests) {
              const res = await searchFiltered({
                origin:o, dest:de, date:dateTry, retDate:_fechaVuelta,
                adults:_adultos, cabin:_cabina, currency:_moneda, maxStops:2, maxResults:Math.max(150, SAFE_MAX)
              });
              if (res.length > 0) { found = { res, o, de, dateTry, off }; break; }
            }
            if (found) break;
          }
          if (found) {
            offers = found.res;
            message = `Sin directos; mostrando escalas (hasta 2), ${ (found.o!==_origen||found.de!==_destino) ? `aeropuertos alternos (${found.o}→${found.de})` : 'misma pareja' }${ found.off===0 ? '' : `, fecha cercana (${found.dateTry})` }`;
            break;
          }
        }

        if (!found) {
          offers = [];
          message = 'Sin resultados';
        }
      }
    }

    // Orden: precio ↑, luego #escalas, luego duración ida
    offers.sort((a, b) => {
      const pa = Number(a?.price?.grandTotal || Infinity);
      const pb = Number(b?.price?.grandTotal || Infinity);
      if (pa !== pb) return pa - pb;
      const aConns = Math.max(0, (a?.itineraries?.[0]?.segments?.length || 1) - 1);
      const bConns = Math.max(0, (b?.itineraries?.[0]?.segments?.length || 1) - 1);
      if (aConns !== bConns) return aConns - bConns;
      const da = a?.itineraries?.[0]?.duration || '';
      const db = b?.itineraries?.[0]?.duration || '';
      return da.localeCompare(db);
    });

    const payload = { ok:true, message, ofertas: offers.map(mapOffer).slice(0, SAFE_MAX || 20) };
    return res.status(200).json(payload);
  } catch (err) {
    console.error('[/api/vuelos/buscar] Error:', err);
    return res.status(500).json({ error:'SEARCH_FAILED', detail:String(err?.message || err) });
  }
});


// (Opcional) puedes incluir en la respuesta info de depuración si te sirve:
// res.set('X-Search-Used', JSON.stringify(used));

// Orden: precio ↑, luego #escalas, luego duración ida
offers.sort((a, b) => {
  const pa = Number(a?.price?.grandTotal || Infinity);
  const pb = Number(b?.price?.grandTotal || Infinity);
  if (pa !== pb) return pa - pb;

  const aConns = Math.max(0, (a?.itineraries?.[0]?.segments?.length || 1) - 1);
  const bConns = Math.max(0, (b?.itineraries?.[0]?.segments?.length || 1) - 1);
  if (aConns !== bConns) return aConns - bConns;

  const da = a?.itineraries?.[0]?.duration || '';
  const db = b?.itineraries?.[0]?.duration || '';
  return da.localeCompare(db);
});


    // Orden: precio asc; empate por duración de ida
    offers.sort((a, b) => {
      const pa = Number(a?.price?.grandTotal || Infinity);
      const pb = Number(b?.price?.grandTotal || Infinity);
      if (pa !== pb) return pa - pb;
      const da = a?.itineraries?.[0]?.duration || '';
      const db = b?.itineraries?.[0]?.duration || '';
      return da.localeCompare(db);
    });

    const payload = {
      ok: true,
      message,
      ofertas: offers.map(mapOffer).slice(0, Number(_max) || 20),
    };

    res.status(200).json(payload);
  } catch (err) {
    console.error('[/api/vuelos/buscar] Error:', err);
    res.status(500).json({ error: 'SEARCH_FAILED', detail: String(err?.message || err) });
  }
});

// -------------------------
// Autocomplete mundial (Amadeus + fallback local)
// -------------------------
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

const norm = (s) => (s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();

// Alias de ciudades ES → EN (puedes ampliarlo cuando quieras)
const CITY_ALIASES = {
  // muy comunes
  'nueva york': 'new york',
  'ciudad de mexico': 'mexico city',
  'paris': 'paris', 'parís': 'paris',
  'londres': 'london',
  'roma': 'rome',
  'madrid': 'madrid',
  'barcelona': 'barcelona',
  'lisboa': 'lisbon',
  'atenas': 'athens',
  'moscu': 'moscow', 'moscú': 'moscow',
  'munich': 'munich', 'múnich': 'munich', 'munchen': 'munich', 'múnich': 'munich',
  'praga': 'prague',
  'varsovia': 'warsaw',
  'cracovia': 'krakow',
  'colonia': 'cologne',
  'bruselas': 'brussels',
  'estocolmo': 'stockholm',
  'copenhague': 'copenhagen',
  'florencia': 'florence',
  'genova': 'genoa', 'génova': 'genoa',
  'milan': 'milan', 'milán': 'milan',
  'venecia': 'venice',
  'napoles': 'naples', 'nápoles': 'naples',
  'turin': 'turin', 'turín': 'turin',
  'sevilla': 'seville',
  'estambul': 'istanbul',
  'pekin': 'beijing', 'pekín': 'beijing',
  'shanghai': 'shanghai', 'shanghái': 'shanghai',
  'cantón': 'guangzhou', 'canton': 'guangzhou',
  'el cairo': 'cairo', 'cairo': 'cairo',
  'ciudad del cabo': 'cape town',
  'marrakech': 'marrakesh', 'marrakesh': 'marrakesh'
};

const COUNTRY_MAP = {
  // Europa
  'polonia':'PL','poland':'PL','suiza':'CH','switzerland':'CH','alemania':'DE','germany':'DE',
  'francia':'FR','france':'FR','italia':'IT','italy':'IT','espana':'ES','españa':'ES','spain':'ES',
  'paises bajos':'NL','netherlands':'NL','reino unido':'GB','uk':'GB','united kingdom':'GB',
  // África
  'marruecos':'MA','morocco':'MA','egipto':'EG','egypt':'EG','sudafrica':'ZA','sudáfrica':'ZA','south africa':'ZA',
  'kenia':'KE','kenya':'KE','nigeria':'NG','ghana':'GH','etiopia':'ET','ethiopia':'ET','tunez':'TN','túnez':'TN','tunisia':'TN'
};

// Diagnóstico (temporal): ¿cargó el JSON local?
router.get('/api/airports/local-stats', (req, res) => {
  try {
    const arr = loadLocalAirports();
    res.json({ ok:true, count: Array.isArray(arr)?arr.length:0, sample: (arr||[]).slice(0,3) });
  } catch (e) {
    res.status(500).json({ ok:false, error:String(e) });
  }
});

router.get('/api/airports/suggest', async (req, res) => {
  try {
    const qRaw  = (req.query.q || '').toString().trim();
    const q     = qRaw.replace(/\s+/g, ' ');
    const limit = Math.min(20, parseInt(req.query.limit || '8', 10) || 8);
    if (q.length < 2) return res.json({ ok:true, results: [] });

    const qLower = q.toLowerCase();
    const qNorm  = norm(q);
    const iataGuess = (q.length === 3 && /^[A-Za-z]{3}$/.test(q)) ? q.toUpperCase() : null;
    const countryCode = COUNTRY_MAP[qNorm] || null;

    // 1) Amadeus (dos fuentes)
    const token   = await getAccessToken();
    const headers = { Authorization: `Bearer ${token}` };

    const p1 = new URLSearchParams({
      keyword:q, subType:'CITY,AIRPORT', 'page[limit]': String(limit), view:'FULL',
      ...(countryCode ? { countryCode } : {})
    });
    const r1 = await fetch(`${AMADEUS_BASE}/v1/reference-data/locations?${p1}`, { headers });
    const j1 = r1.ok ? await r1.json() : { data: [] };

    const p2 = new URLSearchParams({
      keyword:q, 'page[limit]': String(limit),
      ...(countryCode ? { countryCode } : {})
    });
    const r2 = await fetch(`${AMADEUS_BASE}/v1/reference-data/locations/airports?${p2}`, { headers });
    const j2 = r2.ok ? await r2.json() : { data: [] };

    const normRec = d => ({ iata:d.iataCode, city:d.address?.cityName || d.name || '', name:d.name || '' });

    const byIata = new Map();
    for (const d of (j1.data || [])) if (d?.iataCode) byIata.set(d.iataCode, normRec(d));
    for (const d of (j2.data || [])) if (d?.iataCode) byIata.set(d.iataCode, normRec(d));

    // 2) Fallback local si falta cubrir
    if (byIata.size < limit) {
      const all = loadLocalAirports();
      const matches = all.filter(a => {
        const cityN = norm(a.city);
        const nameN = norm(a.name);
        const byIataMatch = a.iata.toLowerCase().startsWith(qLower);
        const byCityName  = cityN.includes(qNorm) || nameN.includes(qNorm);
        const byCountry   = countryCode ? a.country === countryCode : false;
        return byIataMatch || byCityName || byCountry;
      });
      for (const a of matches) if (!byIata.has(a.iata)) {
        byIata.set(a.iata, { iata:a.iata, city:a.city, name:a.name });
      }
    }

    let results = Array.from(byIata.values());

    // Orden: IATA exacto > prefijo ciudad/nombre > alfabético
    results.sort((a,b)=>{
      const aExact = iataGuess && a.iata === iataGuess;
      const bExact = iataGuess && b.iata === iataGuess;
      if (aExact !== bExact) return aExact ? -1 : 1;

      const aHit = a.city.toLowerCase().startsWith(qLower) || a.name.toLowerCase().startsWith(qLower);
      const bHit = b.city.toLowerCase().startsWith(qLower) || b.name.toLowerCase().startsWith(qLower);
      if (aHit !== bHit) return aHit ? -1 : 1;

      return (a.city || a.name || a.iata).localeCompare(b.city || b.name || b.iata);
    });

    if (iataGuess && !results.find(r => r.iata === iataGuess)) {
      results.unshift({ iata:iataGuess, city:iataGuess, name:'Typed code' });
    }

    res.json({ ok:true, results: results.slice(0, limit) });
  } catch (err) {
    console.error('[/api/airports/suggest] Error:', err);
    res.status(500).json({ ok:false, error:'SUGGEST_FAILED', detail: String(err?.message || err) });
  }
});

export default router;
