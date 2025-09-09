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
