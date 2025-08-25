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
