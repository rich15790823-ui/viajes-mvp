// 👇 importa el traductor universal (ya existe en public/js/i18n/resolve.js)
import { resolveQueryUniversal } from "./js/i18n/resolve.js";

const $ = (s)=>document.querySelector(s);

function debounce(fn, ms=250){
  let t; return (...a)=>{ clearTimeout(t); t=setTimeout(()=>fn(...a), ms); };
}

function setupSuggest(inputSel, boxSel){
  const input = $(inputSel);
  const box = $(boxSel);

  const render = (items=[])=>{
    if(!items.length){ box.classList.remove('show'); box.innerHTML=''; return; }
    box.innerHTML = items.map(a =>
      `<button type="button" data-iata="${a.iata}">
         ${a.iata} — ${a.city}${a.country?`, ${a.country}`:''}
       </button>`
    ).join('');
    box.classList.add('show');
  };

  const fetchSugs = debounce(async ()=>{
    const q = input.value.trim();
    if(q.length<2){ render([]); return; }
    try{
      const r = await fetch(`/api/suggest?q=${encodeURIComponent(q)}&limit=8`);
      if(!r.ok) throw new Error('net');
      const data = await r.json();
      render(data.results||[]);
    }catch(e){
      render([]);
    }
  }, 200);

  input.addEventListener('input', fetchSugs);
  input.addEventListener('focus', fetchSugs);
  input.addEventListener('blur', ()=>setTimeout(()=>{ box.classList.remove('show'); }, 150));

  box.addEventListener('click', (e)=>{
    const btn = e.target.closest('button[data-iata]');
    if(!btn) return;
    input.value = btn.dataset.iata;
    box.classList.remove('show');
  });
}

setupSuggest('#from','#fromSugs');
setupSuggest('#to','#toSugs');

document.getElementById('searchForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const from = $('#from').value.trim().toUpperCase();
  const to   = $('#to').value.trim().toUpperCase();
  const date = $('#date').value;

  const url = `/api/search?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}${date?`&date=${encodeURIComponent(date)}`:''}`;

  const box = $('#results');
  box.innerHTML = '<p>Buscando vuelos…</p>';

  try {
    const r = await fetch(url);
    if (!r.ok) throw new Error('net');
    const data = await r.json();

    if (!data?.results?.length) {
      box.innerHTML = '<p>Sin resultados. Prueba otra ruta/fecha.</p>';
      return;
    }

    // IDs que ya tienes en index.html
const form = document.getElementById("searchForm");
const $from = document.getElementById("from");
const $to   = document.getElementById("to");
const $date = document.getElementById("date");

async function canonize(text) {
  const rq = await resolveQueryUniversal(text);
  if (!rq) return "";
  return rq.kind === "country" ? rq.countryEn : rq.cityEn;  // EN canónico
}

form?.addEventListener("submit", async (e) => {
  e.preventDefault();

  const fromRaw = $from?.value || "";
  const toRaw   = $to?.value   || "";
  const date    = $date?.value || "";

  // 🎯 Traduce / normaliza lo que escribió el usuario
  const fromCanon = await canonize(fromRaw);
  const toCanon   = await canonize(toRaw);

  // Útil para depurar: abre la consola y verifica que “Ginebra” => geneva
  console.log("FROM →", fromCanon, "TO →", toCanon, "DATE →", date);

  // IMPORTANTE:
  // Tu backend de vuelos usa IATA (ej. MAD, GVA). La traducción sirve para
  // encontrar y sugerir la ciudad correcta; cuando el usuario elija un
  // aeropuerto, guarda su IATA y úsalo en la búsqueda real.

  // Si ya guardas los IATA en variables globales al elegir del autocompletado,
  // dispara la búsqueda aquí:
  if (window.selectedFromIATA && window.selectedToIATA) {
    const url = `/api/vuelos/buscar?originLocationCode=${window.selectedFromIATA}` +
                `&destinationLocationCode=${window.selectedToIATA}` +
                `&departureDate=${date}&adults=1&currency=MXN`;
    // TODO: usa tu fetch existente aquí
    // const res = await fetch(url); const data = await res.json(); render(data);
  } else {
    // Si aún no hay IATA, usa fromCanon/toCanon para filtrar la lista y
    // pedirle al usuario que elija aeropuerto (paso de "Ciudad → Aeropuertos").
    alert("Elige un aeropuerto específico de la ciudad (necesitamos el código IATA).");
  }
});


    box.innerHTML = data.results.map(v => `
      <article class="result">
        <div class="badge">${v.airlineName || v.airline || 'Airline'}</div>
        <h3>${v.origin || v.from} → ${v.destination || v.to}</h3>
        <p><strong>Precio:</strong> ${
          v.price?.amount ? (v.price.amount + ' ' + (v.price.currency||'')) :
          v.price_mxn ? ('$' + v.price_mxn + ' MXN') : 'N/D'
        }</p>
        ${v.depart_at ? `<p><strong>Sale:</strong> ${new Date(v.depart_at).toLocaleString()}</p>` : ''}
        ${v.transfers!=null ? `<p><strong>Escalas:</strong> ${v.transfers}</p>` : ''}
        ${v.deeplink ? `<p><a href="${v.deeplink}" target="_blank" rel="noopener">Reservar</a></p>` : ''}
      </article>
    `).join('');
  } catch (e) {
    box.innerHTML = '<p>Error al buscar. Intenta de nuevo.</p>';
  }
});
