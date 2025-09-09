// public/autocomplete.js
import { resolveQueryUniversal } from "./js/i18n/resolve.js";

/** Utils **/
const normalize = (s="") => s.toLowerCase().normalize("NFD").replace(/\p{Diacritic}/gu,"").replace(/\s+/g," ").trim();
const debounce = (fn, ms=200) => { let t; return (...a)=>{ clearTimeout(t); t=setTimeout(()=>fn(...a), ms); }; };

function groupByCity(list){
  const m = new Map();
  for (const a of list){
    const key = `${a.city}|${a.country}`;
    if(!m.has(key)) m.set(key, { city:a.city, country:a.country, items:[] });
    m.get(key).items.push(a);
  }
  return [...m.values()];
}

async function fetchAirports(params){
  // /api/suggest debe existir en tu backend (lo vi en tus commits)
  const url = `/api/suggest?${params.toString()}`;
  const r = await fetch(url);
  if(!r.ok) return [];
  const data = await r.json();
  // soporta distintos formatos: {airports:[...]}, {results:[...]}, [...]
  return data?.airports || data?.results || data || [];
}

/** Render **/
function renderSuggestions(panel, groups, onPick){
  if(!groups.length){
    panel.innerHTML = `<div class="sugs-empty">Sin coincidencias</div>`;
    return;
  }

  const html = groups.map(g=>{
    const key = `${g.city}|${g.country}`.replace(/"/g,'&quot;');
    const items = g.items.map(a=>`
      <li class="sug-air" data-iata="${a.iata}" data-city="${a.city}" data-name="${a.name}" data-country="${a.country}">
        <span class="iata">${a.iata}</span>
        <span class="title">${a.name}</span>
        <span class="meta">${a.city}</span>
      </li>`).join("");

    return `
      <li class="sug-city">
        <button class="sug-toggle" data-key="${key}" type="button">
          <span class="title">${g.city}, ${g.country}</span>
          <span class="meta">${g.items.length} aeropuerto${g.items.length>1?"s":""}</span>
        </button>
        <ul class="sug-list" data-list="${key}" hidden>
          ${items}
        </ul>
      </li>`;
  }).join("");

  panel.innerHTML = `<ul class="sugs">${html}</ul>`;

  // expand/collapse por ciudad
  panel.querySelectorAll(".sug-toggle").forEach(btn=>{
    btn.addEventListener("click", ()=>{
      const key = btn.dataset.key;
      const ul = panel.querySelector(`.sug-list[data-list="${key}"]`);
      ul.hidden = !ul.hidden;
    });
  });

  // click en aeropuerto -> onPick
  panel.querySelectorAll(".sug-air").forEach(li=>{
    li.addEventListener("click", ()=>{
      const a = {
        iata: li.dataset.iata,
        city: li.dataset.city,
        name: li.dataset.name,
        country: li.dataset.country
      };
      onPick(a);
    });
  });
}

/** Main setup **/
export function setupAutocomplete({ input, panel, side }){
  const $inp = (typeof input==="string") ? document.querySelector(input) : input;
  const $panel = (typeof panel==="string") ? document.querySelector(panel) : panel;

  if(!$inp || !$panel) return;

  const doSearch = debounce(async ()=>{
    const raw = $inp.value;
    if(!raw.trim()){ $panel.innerHTML = ""; return; }

    // 1) Resolver (traducción ES→EN o país)
    const rq = await resolveQueryUniversal(raw);
    if(!rq){ $panel.innerHTML = ""; return; }

    // 2) Llamar a /api/suggest con la clave correcta
    const params = new URLSearchParams(
      rq.kind === "country" ? { country: rq.countryEn } : { q: rq.cityEn }
    );

    const airports = await fetchAirports(params);

    // Espera objetos { iata, city, name, country }
    const groups = groupByCity(airports);
    renderSuggestions($panel, groups, (a)=>{
      // setear input visible y variables globales con el IATA
      $inp.value = `${a.city} (${a.iata})`;
      if(side === "from"){
        window.selectedFromIATA = a.iata;
      } else {
        window.selectedToIATA = a.iata;
      }
      // cerrar panel
      $panel.innerHTML = "";
    });
  }, 220);

  $inp.addEventListener("input", doSearch);
  $inp.addEventListener("focus", doSearch);
  document.addEventListener("click", (e)=>{
    if(!($panel.contains(e.target) || $inp.contains(e.target))){
      $panel.innerHTML = "";
    }
  });
}
