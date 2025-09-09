import { setupAutocomplete } from "./autocomplete.js";

// load adapter
;(()=>{
// Mapa de aerolíneas (añade las que uses)
const AIRLINES = {
  "AM": "Aeroméxico",
  "VB": "Viva Aerobus",
  "Y4": "Volaris",
  "IB": "Iberia",
  "UX": "Air Europa",
  "AV": "Avianca",
  "CM": "Copa Airlines",
  "AA": "American Airlines",
  "DL": "Delta",
  "UA": "United",
  "LH": "Lufthansa",
  "AF": "Air France",
  "BA": "British Airways",
};

function pick(o, keys, def=null){
  for(const k of keys){
    if(o && o[k] != null) return o[k];
  }
  return def;
}

function toIsoMaybe(v){
  if(!v) return null;
  if(typeof v === "number"){ // epoch sec/ms
    const ms = v > 1e12 ? v : v*1000;
    return new Date(ms).toISOString();
  }
  // strings: ISO, "YYYY-MM-DD HH:mm", etc.
  const d = new Date(v);
  return isNaN(d.getTime()) ? null : d.toISOString();
}

function fmtTimeLocal(iso){
  if(!iso) return "";
  const d = new Date(iso);
  if(isNaN(d.getTime())) return "";
  // hora:min 24h
  return d.toLocaleTimeString([], {hour: '2-digit', minute: '2-digit'});
}

function normalizeOne(raw){
  // Intenta extraer datos desde distintos nombres posibles
  const airlineCode = (pick(raw, ["airline","carrier","marketingCarrier","carrierCode","airline_code","carrier_code","marketing_airline"], "") || "").toString().toUpperCase();
  const airlineName = AIRLINES[airlineCode] || pick(raw, ["airlineName","carrierName","marketingCarrierName"], airlineCode || "—");

  const origin = pick(raw, ["from","origin","dept","departure","depart","orig","o","originCode","departureIata","fromIata"], "");
  const destination = pick(raw, ["to","dest","destination","arrive","arrival","d","destinationCode","arrivalIata","toIata"], "");

  const depRaw = pick(raw, ["departureTime","departure","departTime","dep_time","outbound_departure","start_time","timeFrom","departAt"], null);
  const arrRaw = pick(raw, ["arrivalTime","arrival","arriveTime","arr_time","outbound_arrival","end_time","timeTo","arriveAt"], null);

  const depISO = toIsoMaybe(depRaw);
  const arrISO = toIsoMaybe(arrRaw);

  const price = pick(raw, ["price","totalPrice","amount","fare","price_mxn","price_mx","total","min_price"], null);

  return {
    airlineCode,
    airlineName,
    origin: (origin||"").toString().toUpperCase(),
    destination: (destination||"").toString().toUpperCase(),
    departureISO: depISO,
    arrivalISO: arrISO,
    departureLocal: fmtTimeLocal(depISO),
    arrivalLocal: fmtTimeLocal(arrISO),
    price
  };
}

function normalizeFlights(list){
  if(!Array.isArray(list)) return [];
  // NO hacer slice(0,1): devolvemos todo
  const out = list.map(normalizeOne);
  // Filtra basura mínima: requieren carrier y origen/destino
  return out.filter(x => x.airlineCode && x.origin && x.destination);
}

window.NAVUARA = window.NAVUARA || {};
window.NAVUARA.normalizeFlights = normalizeFlights;
})();

// Hook de normalización justo antes de renderizar
function renderFlights(results){
  const flights = (window.NAVUARA && window.NAVUARA.normalizeFlights)
    ? window.NAVUARA.normalizeFlights(results)
    : results;

  // Limpia contenedor (ajusta el selector a tu grid/lista actual)
  const container = document.getElementById('flights') || document.querySelector('.flights') || document.body;

  // Borra todo lo previo (opcional)
  // container.innerHTML = "";

  // Render simple (ajusta a tu UI)
  flights.forEach(f=>{
    const el = document.createElement('div');
    el.className = 'flight-card';
    el.style.border = '1px solid #eee';
    el.style.borderRadius = '12px';
    el.style.padding = '12px';
    el.style.marginBottom = '10px';

    el.innerHTML = `
      <div style="display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap">
        <div>
          <div style="font-weight:700">${f.airlineName} <span style="opacity:.6">(${f.airlineCode})</span></div>
          <div style="opacity:.8">${f.origin} → ${f.destination}</div>
        </div>
        <div style="text-align:right">
          <div>Sale: <strong>${f.departureLocal || '-'}</strong></div>
          <div>Llega: <strong>${f.arrivalLocal || '-'}</strong></div>
        </div>
      </div>
      <div style="margin-top:6px; font-size:14px; opacity:.8">
        ${f.price ? 'Desde: $' + f.price : ''}
      </div>
    `;
    container.appendChild(el);
  });
}
let __ALL_FLIGHTS = [];

function setFlights(results){
  __ALL_FLIGHTS = (window.NAVUARA && window.NAVUARA.normalizeFlights) ? window.NAVUARA.normalizeFlights(results) : results;
  const container = document.getElementById('flights') || document.querySelector('.flights') || document.body;
  container.innerHTML = "";
  __ALL_FLIGHTS.forEach(f => {
    // reusa tu render de card aquí si quieres
  });
}

function filterByAirline(code){
  const container = document.getElementById('flights') || document.querySelector('.flights') || document.body;
  container.innerHTML = "";
  __ALL_FLIGHTS.filter(f => !code || f.airlineCode === code).forEach(f => {
    // reusa tu render de card aquí
  });
}
