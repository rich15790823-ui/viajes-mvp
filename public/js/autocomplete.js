const NV = {
  debounce(fn, wait=220){ let t; return (...a)=>{ clearTimeout(t); t=setTimeout(()=>fn(...a), wait); }; },
  fetchPlaces: async (q)=>{ if(!q) return []; const r = await fetch(`/api/places?q=${encodeURIComponent(q)}`); if(!r.ok) return []; return r.json(); },
  formatItem: (x)=> `${x.code || x.id} — ${x.city || x.name} (${x.country||""})`.trim(),
  choose(elInput, listEl, item){ elInput.value = item.code || item.id || item.name; listEl.classList.remove("open"); listEl.innerHTML = ""; },
  bindAutocomplete(elInput, listEl){
    const onType = NV.debounce(async ()=>{
      const q = elInput.value.trim();
      if(!q){ listEl.classList.remove("open"); listEl.innerHTML=""; return; }
      const items = await NV.fetchPlaces(q);
      if(!items.length){ listEl.classList.remove("open"); listEl.innerHTML=""; return; }
      const ul = document.createElement("ul");
      items.forEach(it=>{
        const li = document.createElement("li");
        li.textContent = NV.formatItem(it);
        li.addEventListener("click", ()=> NV.choose(elInput, listEl, it));
        ul.appendChild(li);
      });
      listEl.innerHTML = ""; listEl.appendChild(ul); listEl.classList.add("open");
    });
    elInput.addEventListener("input", onType);
    elInput.addEventListener("focus", onType);
    document.addEventListener("click", (e)=>{ if(!listEl.contains(e.target) && e.target!==elInput){ listEl.classList.remove("open"); } });
  },
  parseRoute(raw){ const s=(raw||"").toUpperCase().trim(); const norm=s.replace(/[–—-]+/g," ").replace(/\s+/g," ").trim(); const parts=norm.split(" "); if(parts.length===2) return { from:parts[0], to:parts[1] }; return null; },
};

window.addEventListener("DOMContentLoaded", ()=>{
  const o = document.getElementById("nv-origin");
  const od = document.getElementById("nv-origin-dd");
  const d = document.getElementById("nv-dest");
  const dd = document.getElementById("nv-dest-dd");
  const r = document.getElementById("nv-route");
  if(o && od) NV.bindAutocomplete(o, od);
  if(d && dd) NV.bindAutocomplete(d, dd);
  if(r){ r.addEventListener("change", ()=>{ const parsed = NV.parseRoute(r.value); if(parsed){ if(o) o.value = parsed.from; if(d) d.value = parsed.to; } }); }
});

// ===== NAVUARA: adaptador y render sin tocar HTML =====
;(()=>{
  const AIRLINES = {
    "AM":"Aeroméxico","VB":"Viva Aerobus","Y4":"Volaris","IB":"Iberia","UX":"Air Europa","AV":"Avianca",
    "CM":"Copa Airlines","AA":"American Airlines","DL":"Delta","UA":"United","LH":"Lufthansa",
    "AF":"Air France","BA":"British Airways"
  };

  function pick(o, keys, def=null){ for(const k of keys){ if(o && o[k]!=null) return o[k]; } return def; }
  function toIso(v){ if(!v) return null; if(typeof v==="number"){ const ms=v>1e12?v:v*1000; return new Date(ms).toISOString(); } const d=new Date(v); return isNaN(d.getTime())?null:d.toISOString(); }
  function tLocal(iso){ if(!iso) return "-"; const d=new Date(iso); return isNaN(d.getTime())?"-":d.toLocaleTimeString([], {hour:"2-digit", minute:"2-digit"}); }

  function normalizeOne(raw){
    const code = (pick(raw, ["airline","airlineName","carrier","carrierCode","marketingCarrier"], "")||"").toString().toUpperCase();
    const airlineName = AIRLINES[code] || code || "—";
    const origin = (pick(raw, ["origin","from","originCode","departureIata","orig"], "")||"").toString().toUpperCase();
    const destination = (pick(raw, ["destination","to","dest","destinationCode","arrivalIata"], "")||"").toString().toUpperCase();
    const depISO = toIso(pick(raw, ["departureTime","depart_at","departure","departTime"], null));
    const arrISO = toIso(pick(raw, ["arrivalTime","arrival","arriveTime","arr_time"], null));
    const price = pick(raw, ["price","totalPrice","amount","fare","price_mxn"], null);
    let priceStr = "";
    if (price && typeof price === "object" && "amount" in price && "currency" in price) {
      priceStr = `${price.currency} ${price.amount}`;
    } else if (typeof price === "number") {
      priceStr = `$ ${price}`;
    } else if (price) {
      priceStr = `${price}`;
    }
    return {
      airlineCode: code,
      airlineName,
      origin,
      destination,
      departureISO: depISO,
      arrivalISO: arrISO,
      departureLocal: tLocal(depISO),
      arrivalLocal: tLocal(arrISO),
      priceStr,
      deeplink: pick(raw, ["deeplink","deepLink","url"], null),
    };
  }

  function normalizeList(json){
    let list = Array.isArray(json) ? json
             : (json?.results && Array.isArray(json.results)) ? json.results
             : (json?.flights && Array.isArray(json.flights)) ? json.flights
             : (json?.data?.items && Array.isArray(json.data.items)) ? json.data.items
             : [];
    return list.map(normalizeOne).filter(x=>x.airlineCode && x.origin && x.destination);
  }

  function ensureContainer(){
    // Busca un contenedor de resultados; si no hay, crea uno fijo.
    let c = document.getElementById("flights") || document.querySelector(".flights");
    if (!c) {
      c = document.createElement("div");
      c.id = "flights";
      c.style.maxWidth = "900px";
      c.style.margin = "20px auto";
      c.style.display = "grid";
      c.style.gridTemplateColumns = "repeat(auto-fill, minmax(260px, 1fr))";
      c.style.gap = "12px";
      document.body.appendChild(c);
    }
    return c;
  }

  function renderFlights(json){
    const flights = normalizeList(json);
    const container = ensureContainer();
    container.innerHTML = ""; // limpia para nueva búsqueda

    if (!flights.length){
      const empty = document.createElement("div");
      empty.textContent = "Sin resultados.";
      empty.style.opacity = ".7";
      container.appendChild(empty);
      return;
    }

    flights.forEach(f=>{
      const card = document.createElement("div");
      card.style.border = "1px solid #eee";
      card.style.borderRadius = "12px";
      card.style.padding = "12px";
      card.style.background = "#fff";
      card.style.boxShadow = "0 8px 20px rgba(0,0,0,.04)";

      card.innerHTML = `
        <div style="display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap">
          <div>
            <div style="font-weight:700">${f.airlineName} <span style="opacity:.6">(${f.airlineCode})</span></div>
            <div style="opacity:.9">${f.origin} → ${f.destination}</div>
          </div>
          <div style="text-align:right">
            <div>Sale: <strong>${f.departureLocal}</strong></div>
            <div>Llega: <strong>${f.arrivalLocal || '-'}</strong></div>
          </div>
        </div>
        <div style="margin-top:6px; font-size:14px; opacity:.9">
          ${f.priceStr ? 'Desde: <strong>'+f.priceStr+'</strong>' : ''}
        </div>
      `;
      if (f.deeplink){
        const a = document.createElement("a");
        a.href = f.deeplink;
        a.textContent = "Ver";
        a.style.display = "inline-block";
        a.style.marginTop = "8px";
        a.style.color = "#2f2c79";
        a.target = "_blank";
        card.appendChild(a);
      }
      container.appendChild(card);
    });
  }

  // Monkeypatch suave: intercepta fetch y, si parece respuesta de vuelos, pintamos
  const _fetch = window.fetch;
  window.fetch = async function(...args){
    const resp = await _fetch.apply(this, args);
    try {
      const clone = resp.clone();
      const data = await clone.json().catch(()=>null);
      if (data && (Array.isArray(data) || data.results || data.flights || (data.data && data.data.items))){
        renderFlights(data);
      }
    } catch(e){ /* ignorar */ }
    return resp;
  };

  // API pública opcional por si quieres llamar manualmente:
  window.NAVUARA = window.NAVUARA || {};
  window.NAVUARA.renderFlightsFromApi = renderFlights;
})();
