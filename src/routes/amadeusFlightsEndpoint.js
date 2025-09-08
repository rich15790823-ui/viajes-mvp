// src/routes/amadeusFlightsEndpoint.js (ESM)
// Navuara API: Vuelos (Amadeus) + Autosuggest mundial (Amadeus + JSON local)
// Requiere env: AMADEUS_ENV=('test'|'production'), AMADEUS_API_KEY, AMADEUS_API_SECRET

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

import express from 'express';
import fetch from 'node-fetch';

const router = express.Router();

/* ------------------------------- Config ---------------------------------- */
const AMADEUS_ENV     = process.env.AMADEUS_ENV || 'test'; // 'test' | 'production'
const AMADEUS_BASE    = AMADEUS_ENV === 'production' ? 'https://api.amadeus.com' : 'https://test.api.amadeus.com';
const AMADEUS_KEY     = process.env.AMADEUS_API_KEY;
const AMADEUS_SECRET  = process.env.AMADEUS_API_SECRET;

if (!AMADEUS_KEY || !AMADEUS_SECRET) {
  console.warn('[Amadeus] Faltan AMADEUS_API_KEY / AMADEUS_API_SECRET en variables de entorno.');
}

/* --------------------------- CORS (router-scope) -------------------------- */
router.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*'); // abre para Nerd/preview
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

router.use(express.json());

/* -------------------------- Utilidades y helpers -------------------------- */
const norm = (s) => (s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();

let LOCAL_AIRPORTS = null;
function loadLocalAirports() {
  if (LOCAL_AIRPORTS) return LOCAL_AIRPORTS;
  try {
    // Ruta esperada: src/data/airports.json
    const p = path.join(__dirname, '..', 'data', 'airports.json');
    LOCAL_AIRPORTS = JSON.parse(fs.readFileSync(p, 'utf-8'));
  } catch {
    LOCAL_AIRPORTS = [];
  }
  return LOCAL_AIRPORTS;
}

// Alias de ciudades ES → EN (amplía cuando quieras)
const CITY_ALIASES = {
  'nueva york':'new york',
  'ciudad de mexico':'mexico city',
  'paris':'paris','parís':'paris',
  'londres':'london',
  'roma':'rome',
  'madrid':'madrid',
  'barcelona':'barcelona',
  'lisboa':'lisbon',
  'atenas':'athens',
  'moscu':'moscow','moscú':'moscow',
  'praga':'prague',
  'varsovia':'warsaw',
  'cracovia':'krakow',
  'colonia':'cologne',
  'bruselas':'brussels',
  'estocolmo':'stockholm',
  'copenhague':'copenhagen',
  'florencia':'florence',
  'genova':'genoa','génova':'genoa',
  'milan':'milan','milán':'milan',
  'venecia':'venice',
  'napoles':'naples','nápoles':'naples',
  'turin':'turin','turín':'turin',
  'sevilla':'seville',
  'estambul':'istanbul',
  'pekin':'beijing','pekín':'beijing',
  'shanghai':'shanghai','shanghái':'shanghai',
  'canton':'guangzhou','cantón':'guangzhou',
  'el cairo':'cairo','cairo':'cairo',
  'ciudad del cabo':'cape town',
  'marrakech':'marrakesh','marrakesh':'marrakesh',
  'zúrich':'zurich','zurich':'zurich'
};

// País por nombre → ISO-2 (ES/EN)
const COUNTRY_NAME_TO_ISO = {
  'switzerland':'CH','suiza':'CH',
  'belgium':'BE','belgica':'BE','bélgica':'BE',
  'netherlands':'NL','paises bajos':'NL','países bajos':'NL','holanda':'NL',
  'germany':'DE','alemania':'DE',
  'france':'FR','francia':'FR',
  'italy':'IT','italia':'IT',
  'spain':'ES','españa':'ES','espana':'ES',
  'ireland':'IE','irlanda':'IE',
  'poland':'PL','polonia':'PL',
  'morocco':'MA','marruecos':'MA',
  'egypt':'EG','egipto':'EG',
  'south africa':'ZA','sudafrica':'ZA','sudáfrica':'ZA',
  'kenya':'KE','kenia':'KE',
  'nigeria':'NG','ghana':'GH'
};
function isoFromCountryQuery(qBase) {
  const qNorm = norm(qBase);
  if (COUNTRY_NAME_TO_ISO[qNorm]) return COUNTRY_NAME_TO_ISO[qNorm];
  if (/^[A-Za-z]{2}$/.test(qBase)) return qBase.toUpperCase(); // CH, BE, NL...
  return null;
}

// “Metro areas” (aeropuertos alternos por ciudad)
const METRO_MAP = {
  // CDMX
  MEX: ['MEX','NLU','TLC'], NLU: ['MEX','NLU','TLC'], TLC: ['MEX','NLU','TLC'],
  // New York
  JFK: ['JFK','LGA','EWR'], LGA: ['JFK','LGA','EWR'], EWR: ['JFK','LGA','EWR'],
  // London
  LHR: ['LHR','LGW','STN','LTN','LCY'], LGW: ['LHR','LGW','STN','LTN','LCY'],
  STN: ['LHR','LGW','STN','LTN','LCY'], LTN: ['LHR','LGW','STN','LTN','LCY'], LCY: ['LHR','LGW','STN','LTN','LCY'],
  // Paris
  CDG: ['CDG','ORY','BVA'], ORY: ['CDG','ORY','BVA'], BVA: ['CDG','ORY','BVA'],
  // Tokyo
  NRT: ['NRT','HND'], HND: ['NRT','HND'],
  // Istanbul
  IST: ['IST','SAW'], SAW: ['IST','SAW'],
  // Beijing
  PEK: ['PEK','PKX'], PKX: ['PEK','PKX'],
  // Shanghai
  PVG: ['PVG','SHA'], SHA: ['PVG','SHA'],
  // Rome
  FCO: ['FCO','CIA'], CIA: ['FCO','CIA'],
  // Milan
  MXP: ['MXP','LIN','BGY'], LIN: ['MXP','LIN','BGY'], BGY: ['MXP','LIN','BGY'],
  // Dubai
  DXB: ['DXB','DWC'], DWC: ['DXB','DWC'],
  // São Paulo
  GRU: ['GRU','CGH','VCP'], CGH: ['GRU','CGH','VCP'], VCP: ['GRU','CGH','VCP'],
  // Moscow
  SVO: ['SVO','DME','VKO'], DME: ['SVO','DME','VKO'], VKO: ['SVO','DME','VKO'],
  // Dublín
  DUB: ['DUB']
};

// Alternos por país (destinos comunes)
const COUNTRY_DEST_MAP = {
  CH: ['ZRH','GVA','BSL'],
  BE: ['BRU','CRL'],
  NL: ['AMS','RTM','EIN'],
  DE: ['FRA','MUC','BER','DUS','HAM','STR','CGN'],
  FR: ['CDG','ORY','BVA','LYS','NCE','MRS'],
  IT: ['FCO','CIA','MXP','LIN','BGY','VCE','NAP','BLQ'],
  GB: ['LHR','LGW','STN','LTN','LCY','MAN','EDI']
};

function cityAirports(iata) {
  const code = (iata || '').toUpperCase();
  if (METRO_MAP[code]) return METRO_MAP[code];

  const all  = loadLocalAirports();
  const base = all.find(a => a.iata === code);
  if (!base) return [code];

  // 1) Mismos aeropuertos de la ciudad
  const tag = norm(base.city);
  const cityMates = all.filter(a => norm(a.city) === tag).map(a => a.iata);

  // 2) Cluster por país (si procede)
  const country = base.country;
  const countryCluster = COUNTRY_DEST_MAP[country] || [];

  const set = new Set([code, ...cityMates, ...countryCluster]);
  return Array.from(set);
}

/* ---------------------------- Amadeus helpers ----------------------------- */
let _token = null;
let _tokenExp = 0;

async function getAccessToken() {
  const now = Date.now();
  if (_token && now < _tokenExp - 120_000) return _token;
  const body = new URLSearchParams({
    grant_type: 'client_credentials',
    client_id: AMADEUS_KEY,
    client_secret: AMADEUS_SECRET
  });
  const resp = await fetch(`${AMADEUS_BASE}/v1/security/oauth2/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body
  });
  if (!resp.ok) throw new Error(`Amadeus token error ${resp.status}`);
  const data = await resp.json();
  _token = data.access_token;
  _tokenExp = Date.now() + (data.expires_in || 1799) * 1000;
  return _token;
}

function buildFlightParams({
  origen, destino, fechaIda, fechaVuelta,
  adultos = 1, cabina, moneda = 'MXN',
  nonStop = undefined, max = 20
}) {
  if (!origen || !destino || !fechaIda) throw new Error('Faltan datos: origen, destino y fechaIda son obligatorios');
  const p = new URLSearchParams();
  p.set('originLocationCode', String(origen).toUpperCase());
  p.set('destinationLocationCode', String(destino).toUpperCase());
  p.set('departureDate', fechaIda);
  if (fechaVuelta) p.set('returnDate', fechaVuelta);
  p.set('adults', String(adultos || 1));
  if (cabina) p.set('travelClass', String(cabina));
  p.set('currencyCode', moneda || 'MXN');
  p.set('max', String(max || 20));
  if (typeof nonStop === 'boolean') p.set('nonStop', String(nonStop));
  return p;
}

async function searchOffers(params) {
  const token = await getAccessToken();
  const url = `${AMADEUS_BASE}/v2/shopping/flight-offers?${params.toString()}`;
  const r = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!r.ok) {
    const txt = await r.text().catch(()=> '');
    throw new Error(`Amadeus search error ${r.status}: ${txt}`);
  }
  const data = await r.json();
  return data?.data || [];
}

function mapOffer(offer) {
  const it0 = offer.itineraries?.[0];
  const it1 = offer.itineraries?.[1];
  const segs0 = it0?.segments || [];
  const segs1 = it1?.segments || [];

  const mapSeg = (s) => ({
    salida:  { iata:s?.departure?.iataCode, terminal:s?.departure?.terminal || null, at:s?.departure?.at },
    llegada: { iata:s?.arrival?.iataCode,   terminal:s?.arrival?.terminal   || null, at:s?.arrival?.at   },
    aerolinea: s?.carrierCode, vuelo: s?.number, duracionSegmento: s?.duration || null
  });

  const escalasIda    = Math.max(0, segs0.length - 1);
  const escalasVuelta = Math.max(0, segs1.length - 1);

  return {
    precioTotal: offer?.price?.grandTotal,
    moneda: offer?.price?.currency || 'MXN',
    duracionIda: it0?.duration || null,
    duracionVuelta: segs1.length ? (it1?.duration || null) : null,
    escalasIda,
    escalasVuelta: segs1.length ? escalasVuelta : null,
    segmentosIda: segs0.map(mapSeg),
    segmentosVuelta: segs1.length ? segs1.map(mapSeg) : null,
    asientosDisponibles: offer?.numberOfBookableSeats ?? null
  };
}

/* ----------------------------- Rutas de API ------------------------------- */
// Diagnóstico: cuenta del JSON local
router.get('/api/airports/local-stats', (req, res) => {
  try {
    const arr = loadLocalAirports();
    res.json({ ok:true, count: Array.isArray(arr)?arr.length:0, sample:(arr||[]).slice(0,3) });
  } catch (e) {
    res.status(500).json({ ok:false, error:String(e) });
  }
});

// Autosuggest mundial: país (ES/EN/ISO-2) → JSON local; ciudad/aeropuerto → Amadeus + fallback
router.get('/api/airports/suggest', async (req, res) => {
  try {
    const qRaw  = (req.query.q || '').toString().trim();
    const qBase = qRaw.replace(/\s+/g, ' ');
    const limit = Math.min(20, parseInt(req.query.limit || '8', 10) || 8);
    if (qBase.length < 2) return res.json({ ok:true, results: [] });

    // Si es consulta de país, responde directo desde el JSON local
    const isoCountry = isoFromCountryQuery(qBase);
    if (isoCountry) {
      const all = loadLocalAirports();
      const inCountry = all.filter(a => a.country === isoCountry);
      inCountry.sort((a,b) => {
        const ai = /international/i.test(a.name) ? 0 : 1;
        const bi = /international/i.test(b.name) ? 0 : 1;
        if (ai !== bi) return ai - bi;
        return (a.city || a.name).localeCompare(b.city || b.name);
      });
      const results = inCountry.slice(0, Math.max(10, limit)).map(({ iata, city, name }) => ({ iata, city, name }));
      return res.json({ ok:true, results });
    }

    // Alias ES→EN en ciudad
    const qNormBase = norm(qBase);
    let qEff = qBase;
    for (const [es, en] of Object.entries(CITY_ALIASES)) {
      const esNorm = norm(es);
      if (qNormBase === esNorm) { qEff = en; break; }
      if (qNormBase.includes(esNorm)) {
        const re = new RegExp(es, 'ig');
        qEff = qEff.replace(re, en);
      }
    }

    const qLower = qEff.toLowerCase();
    const qNorm  = norm(qEff);
    const iataGuess = (qEff.length === 3 && /^[A-Za-z]{3}$/.test(qEff)) ? qEff.toUpperCase() : null;

    // 1) Amadeus (dos fuentes)
    const token   = await getAccessToken();
    const headers = { Authorization: `Bearer ${token}` };

    const p1 = new URLSearchParams({ keyword:qEff, subType:'CITY,AIRPORT', 'page[limit]': String(limit), view:'FULL' });
    const r1 = await fetch(`${AMADEUS_BASE}/v1/reference-data/locations?${p1}`, { headers });
    const j1 = r1.ok ? await r1.json() : { data: [] };

    const p2 = new URLSearchParams({ keyword:qEff, 'page[limit]': String(limit) });
    const r2 = await fetch(`${AMADEUS_BASE}/v1/reference-data/locations/airports?${p2}`, { headers });
    const j2 = r2.ok ? await r2.json() : { data: [] };

    const normRec = d => ({ iata:d.iataCode, city:d.address?.cityName || d.name || '', name:d.name || '' });

    const byIata = new Map();
    for (const d of (j1.data || [])) if (d?.iataCode) byIata.set(d.iataCode, normRec(d));
    for (const d of (j2.data || [])) if (d?.iataCode) byIata.set(d.iataCode, normRec(d));

    // 2) Fallback local si falta
    if (byIata.size < limit) {
      const all = loadLocalAirports();
      const matches = all.filter(a => {
        const cityN = norm(a.city);
        const nameN = norm(a.name);
        const byIataMatch = a.iata.toLowerCase().startsWith(qLower);
        const byCityName  = cityN.includes(qNorm) || nameN.includes(qNorm);
        return byIataMatch || byCityName;
      });
      for (const a of matches) if (!byIata.has(a.iata)) {
        byIata.set(a.iata, { iata:a.iata, city:a.city, name:a.name });
      }
    }

    let results = Array.from(byIata.values());
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
    res.status(500).json({ ok:false, error:'SUGGEST_FAILED', detail:String(err?.message || err) });
  }
});

// Buscar vuelos: directos → escalas → alternos ciudad/país → fechas ±2 días
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

    // Validación mínima
    if (!/^[A-Z]{3}$/.test(_origen) || !/^[A-Z]{3}$/.test(_destino)) {
      return res.status(400).json({ ok:false, error:'IATA inválido' });
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(_fechaIda)) {
      return res.status(400).json({ ok:false, error:'Fecha inválida (YYYY-MM-DD)' });
    }
    const SAFE_MAX = Math.min(Math.max(Number(_max||20), 1), 200);

    // Helpers de filtrado
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

    const DEBUG = { tries: [] };
    let offers = [];
    let message = '';

    // Intento A: directos (nonStop)
    try {
      const paramsDirect = buildFlightParams({
        origen:_origen, destino:_destino, fechaIda:_fechaIda, fechaVuelta:_fechaVuelta || undefined,
        adultos:_adultos, cabina:_cabina, moneda:_moneda, nonStop:true, max:50
      });
      DEBUG.tries.push({ kind:'direct-nonStop', origin:_origen, dest:_destino, date:_fechaIda, asked:50 });
      offers = await searchOffers(paramsDirect);
      if (offers.length > 0) message = 'Directos encontrados';
    } catch (e) {
      console.warn('[direct-nonStop] falló:', String(e));
    }

    // Intento B: sin nonStop, hasta 2 escalas
    if (offers.length === 0) {
      DEBUG.tries.push({ kind:'up-to-2-stops', origin:_origen, dest:_destino, date:_fechaIda, asked:200 });
      const any = await searchFiltered({
        origin:_origen, dest:_destino, date:_fechaIda, retDate:_fechaVuelta,
        adults:_adultos, cabin:_cabina, currency:_moneda, maxStops:2, maxResults:Math.max(150, SAFE_MAX)
      });
      if (any.length > 0) {
        offers = any;
        message = 'Mostrando vuelos con escalas (hasta 2)';
      }
    }

    // Intento C: alternos de ciudad/país + fechas cercanas
    if (offers.length === 0) {
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
            DEBUG.tries.push({ kind:'alt-city/±days', origin:o, dest:de, date:dateTry, asked:200 });
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
          const odMsg = (found.o!==_origen || found.de!==_destino)
            ? `aeropuertos alternos (${found.o}→${found.de})`
            : 'misma pareja';
          const dateMsg = found.off===0 ? 'misma fecha' : `fecha cercana (${found.dateTry})`;
          message = `Sin directos; mostrando escalas (hasta 2), ${odMsg}, ${dateMsg}`;
          break;
        }
      }

      if (!found) {
        message = 'Sin resultados';
      }
    }

    // Orden: precio ↑, luego #escalas, luego duración (ida)
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
    if (String(req.query.debug) === '1') payload.debug = DEBUG;
    return res.status(200).json(payload);
  } catch (err) {
    console.error('[/api/vuelos/buscar] Error:', err);
    return res.status(500).json({ error:'SEARCH_FAILED', detail:String(err?.message || err) });
  }
});

export default router;
