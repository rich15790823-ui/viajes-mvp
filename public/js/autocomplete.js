// public/autocomplete.js
import { resolveQueryUniversal } from "./js/i18n/resolve.js";

/* Utils */
const norm = (s = "") =>
  s.toLowerCase().normalize("NFD").replace(/\p{Diacritic}/gu, "").replace(/\s+/g, " ").trim();

const deb = (fn, ms = 240) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };

function groupByCity(list) {
  const m = new Map();
  for (const a of list) {
    const key = `${a.city}|${a.country}`;
    if (!m.has(key)) m.set(key, { city: a.city, country: a.country, items: [] });
    m.get(key).items.push(a);
  }
  return [...m.values()];
}

function shapeAirport(obj) {
  // normaliza diferentes respuestas del backend
  const iata =
    obj.iata || obj.iataCode || obj.code || obj.airportCode || obj?.location?.iata || obj?.iata_code || "";
  const city =
    obj.city || obj.cityName || obj?.address?.cityName || obj?.municipalityName || obj?.city_name || obj?.location?.city || "";
  const country =
    obj.country || obj.countryName || obj?.address?.countryName || obj?.country_name || obj?.address?.country || "";
  const name = obj.name || obj.detailedName || obj.airportName || obj.label || (iata ? `${iata} Airport` : "Airport");
  if (!iata || !city || !country) return null;
  return { iata, city, country, name };
}

/* Variantes nativas para ciudades comunes (clave en inglés) */
const CITY_VARIANTS = {
  prague: ["prague", "praha"],
  vienna: ["vienna", "wien"],
  munich: ["munich", "muenchen", "münchen"],
  cologne: ["cologne", "koln", "koeln", "köln"],
  florence: ["florence", "firenze"],
  rome: ["rome", "roma"],
  venice: ["venice", "venezia"],
  milan: ["milan", "milano"],
  geneva: ["geneva", "geneve", "genf"],
  copenhagen: ["copenhagen", "kobenhavn", "københavn"],
  brussels: ["brussels", "bruxelles", "brussel"],
  lisbon: ["lisbon", "lisboa"],
  seville: ["seville", "sevilla"],
  saragossa: ["saragossa", "zaragoza"],
  // puedes añadir más aquí si lo necesitas
};

function cityVariants(en) {
  const k = norm(en);
  if (CITY_VARIANTS[k]) return CITY_VARIANTS[k];
  return [k]; // default: solo la inglesa
}

/* Fallback local: carga un dataset del repo si el backend no devuelve nada */
let _localAirports = null;
async function loadLocalAirports() {
  if (_localAirports) return _localAirports;
  // intenta dos rutas típicas del repo
  const candidates = ["/data/airports.min.json", "/data/airports.json"];
  for (const url of candidates) {
    try {
      const r = await fetch(url);
      if (r.ok) {
        const raw = await r.json();
        const arr = Array.isArray(raw) ? raw : (raw?.airports || raw?.results || []);
        _localAirports = arr.map(shapeAirport).filter(Boolean);
        if (_localAirports.length) return _localAirports;
      }
    } catch {}
  }
  _localAirports = [];
  return _localAirports;
}

function filterLocalAirports(all, key) {
  const q = norm(key);
  const out = [];
  const seen = new Set();
  for (const a of all) {
    const city = norm(a.city);
    const name = norm(a.name);
    const country = norm(a.country);
    const iata = norm(a.iata);
    if (city.includes(q) || name.includes(q) || country.includes(q) || iata === q) {
      if (!seen.has(a.iata)) { seen.add(a.iata); out.push(a); }
    }
  }
  return out;
}

/* Llamadas al backend con múltiples nombres de parámetro */
async function fetchAirportsFromAPI(key) {
  const paramsList = [
    new URLSearchParams({ q: key }),
    new URLSearchParams({ city: key }),
    new URLSearchParams({ search: key }),
    new URLSearchParams({ term: key }),
    new URLSearchParams({ name: key }),
    new URLSearchParams({ keyword: key }),
  ];

  for (const p of paramsList) {
    try {
      const url = `/api/suggest?${p.toString()}`;
      const r = await fetch(url);
      if (!r.ok) continue;
      const data = await r.json();
      const raw = Array.isArray(data) ? data : (data?.airports || data?.results || data?.data || []);
      const shaped = raw.map(shapeAirport).filter(Boolean);
      if (shaped.length) return shaped;
    } catch {}
  }
  return [];
}

/* Render UI */
function render(panel, groups, onPick) {
  if (!groups.length) {
    panel.innerHTML = `<div class="sugs-empty">Sin coincidencias</div>`;
    return;
  }

  const html = groups.map(g => {
    const key = `${g.city}|${g.country}`.replace(/"/g, "&quot;");
    const items = g.items.map(a => `
      <li class="sug-air" data-iata="${a.iata}" data-city="${a.city}" data-name="${a.name}" data-country="${a.country}">
        <span class="iata">${a.iata}</span>
        <span class="title">${a.name}</span>
        <span class="meta">${a.city}</span>
      </li>`).join("");

    return `
      <li class="sug-city">
        <button class="sug-toggle" data-key="${key}" type="button">
          <span class="title">${g.city}, ${g.country}</span>
          <span class="meta">${g.items.length} aeropuerto${g.items.length > 1 ? "s" : ""}</span>
        </button>
        <ul class="sug-list" data-list="${key}" hidden>${items}</ul>
      </li>`;
  }).join("");

  panel.innerHTML = `<ul class="sugs">${html}</ul>`;

  panel.querySelectorAll(".sug-toggle").forEach(btn => {
    btn.addEventListener("click", () => {
      const key = btn.dataset.key;
      const ul = panel.querySelector(`.sug-list[data-list="${key}"]`);
      ul.hidden = !ul.hidden;
    });
  });

  panel.querySelectorAll(".sug-air").forEach(li => {
    li.addEventListener("click", () => {
      const a = {
        iata: li.dataset.iata,
        city: li.dataset.city,
        name: li.dataset.name,
        country: li.dataset.country,
      };
      onPick(a);
    });
  });
}

/* Main */
export function setupAutocomplete({ input, panel, side }) {
  const $inp = typeof input === "string" ? document.querySelector(input) : input;
  const $pan = typeof panel === "string" ? document.querySelector(panel) : panel;
  if (!$inp || !$pan) return;

  const search = deb(async () => {
    const raw = $inp.value;
    if (!raw.trim()) { $pan.innerHTML = ""; return; }

    const rq = await resolveQueryUniversal(raw);
    if (!rq) { $pan.innerHTML = ""; return; }

    // City or Country key (in English)
    const key = rq.kind === "country" ? rq.countryEn : rq.cityEn;

    // 1) intenta el backend con variantes (para casos como Praha/Wien/Koeln…)
    let airports = [];
    if (rq.kind === "city") {
      const variants = cityVariants(key);
      for (const v of variants) {
        airports = await fetchAirportsFromAPI(v);
        if (airports.length) break;
      }
    } else {
      airports = await fetchAirportsFromAPI(key);
    }

    // 2) fallback local si el backend no devuelve nada
    if (!airports.length) {
      const local = await loadLocalAirports();
      if (rq.kind === "city") {
        for (const v of cityVariants(key)) {
          airports = filterLocalAirports(local, v);
          if (airports.length) break;
        }
      } else {
        // país: filtra por country exacto (en inglés) si existe en dataset local
        airports = local.filter(a => norm(a.country) === norm(key));
      }
    }

    // Dedup final por IATA
    const seen = new Set(); const dedup = [];
    for (const a of airports) { if (!seen.has(a.iata)) { seen.add(a.iata); dedup.push(a); } }

    const groups = groupByCity(dedup);
    render($pan, groups, (a) => {
      $inp.value = `${a.city} (${a.iata})`;
      if (side === "from") window.selectedFromIATA = a.iata;
      else window.selectedToIATA = a.iata;
      $pan.innerHTML = "";
    });
  }, 260);

  $inp.addEventListener("input", search);
  $inp.addEventListener("focus", search);
  document.addEventListener("click", (e) => {
    if (!($pan.contains(e.target) || $inp.contains(e.target))) $pan.innerHTML = "";
  });
}
