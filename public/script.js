console.log("script.js Flysky Cards ✅");

const $ = (s) => document.querySelector(s);
const $$ = (s) => document.querySelectorAll(s);

const form = $('#form');
const btn  = $('#btn');
const msg  = $('#msg');
const cards = $('#cards');
const controls = $('#controls');
const sortSel = $('#sort');
const airlineSel = $('#airline');
const directOnly = $('#directOnly');
const sum = $('#sum');
const roundTripCheckbox = $('#roundTrip');
const returnDateWrap = $('#returnDateWrap');

roundTripCheckbox?.addEventListener('change', () => {
  returnDateWrap.style.display = roundTripCheckbox.checked ? 'block' : 'none';
});

function fmt(iso){ if(!iso) return '-'; const d=new Date(iso); return d.toLocaleString(); }
function pad(n){ return n<10? '0'+n: String(n); }
function parseISODur(iso){ // PT7H55M → {h:7,m:55}
  if(!iso) return {h:0,m:0};
  const m = iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?/i);
  const h = m && m[1] ? +m[1] : 0;
  const mi = m && m[2] ? +m[2] : 0;
  return {h, m:mi};
}
function durText(iso){ const {h,m}=parseISODur(iso); return `${h} h ${pad(m)} m`; }

let lastResults = []; // se guardan para filtros/orden

function buildAirlineOptions(list){
  const set = new Set(list.map(r => r.airline).filter(Boolean));
  airlineSel.innerHTML = `<option value="">Todas</option>` + [...set].sort().map(n=>`<option>${n}</option>`).join('');
}

function applyFiltersAndSort(){
  let arr = [...lastResults];

  // filtros
  if (directOnly.checked) arr = arr.filter(r => (r.stops||0) === 0);
  const selAir = airlineSel.value;
  if (selAir) arr = arr.filter(r => r.airline === selAir);

  // ordenar
  switch (sortSel.value){
    case 'priceAsc':  arr.sort((a,b)=> (+a.priceTotal||1e9) - (+b.priceTotal||1e9)); break;
    case 'priceDesc': arr.sort((a,b)=> (+b.priceTotal||0) - (+a.priceTotal||0)); break;
    case 'durAsc':    arr.sort((a,b)=> durMinutes(a.durationOut) - durMinutes(b.durationOut)); break;
    case 'durDesc':   arr.sort((a,b)=> durMinutes(b.durationOut) - durMinutes(a.durationOut)); break;
    case 'depAsc':    arr.sort((a,b)=> new Date(a.departureAt) - new Date(b.departureAt)); break;
    case 'depDesc':   arr.sort((a,b)=> new Date(b.departureAt) - new Date(a.departureAt)); break;
  }

  renderCards(arr);
  sum.textContent = `${arr.length} resultado(s)`;
}

function durMinutes(iso){ const {h,m}=parseISODur(iso); return h*60+m; }

function renderCards(list){
  if (!list || list.length===0){ cards.style.display='none'; cards.innerHTML=''; return; }
  cards.style.display = 'grid';
  cards.innerHTML = list.map((r,idx)=>{
    const price = r.priceTotal ? `${r.currency||'USD'} ${Number(r.priceTotal).toLocaleString()}` : '-';
    const outDur  = r.durationOut ? durText(r.durationOut) : '-';
    const retDur  = r.durationRet ? durText(r.durationRet) : '—';
    const regreso = r.hasReturn
      ? `<div class="row"><strong>Vuelta:</strong> <span class="mono">${r.returnArrivalIata||'-'} · ${fmt(r.returnArrivalAt)}</span></div>`
      : `<div class="row"><strong>Vuelta:</strong> <span class="mono">—</span></div>`;

    // legs ida
    const legsOut = (r.legs||[]).map((s,i)=>`
      <tr>
        <td>IDA ${i+1}</td>
        <td class="mono">${s.airlineCode} ${s.flightNumber||''}</td>
        <td class="mono">${s.from} → ${s.to}</td>
        <td class="mono">${fmt(s.departAt)} → ${fmt(s.arriveAt)}</td>
        <td>${durText(s.duration||'')}</td>
      </tr>
    `).join('');

    // legs vuelta
    const legsRet = (r.returnLegs||[]).map((s,i)=>`
      <tr>
        <td>VUELTA ${i+1}</td>
        <td class="mono">${s.airlineCode} ${s.flightNumber||''}</td>
        <td class="mono">${s.from} → ${s.to}</td>
        <td class="mono">${fmt(s.departAt)} → ${fmt(s.arriveAt)}</td>
        <td>${durText(s.duration||'')}</td>
      </tr>
    `).join('');

    return `
    <article class="card">
      <div class="card-header">
        <div class="card-title">${r.airline || '-' } <span class="mono">(${r.airlineCode||''})</span></div>
        <div class="price">${price}</div>
      </div>
      <div class="card-body">
        <div class="block">
          <h4>Itinerario</h4>
          <div class="row"><strong>Salida:</strong> <span class="mono">${r.departureIata||'-'} · ${fmt(r.departureAt)}</span></div>
          <div class="row"><strong>Llegada:</strong> <span class="mono">${r.arrivalIata||'-'} · ${fmt(r.arrivalAt)}</span></div>
          ${regreso}
          <div class="kpi">
            <div class="kpi-item">Duración ida<br><b>${outDur}</b></div>
            <div class="kpi-item">Duración vuelta<br><b>${retDur}</b></div>
            <div class="kpi-item">Escalas ida<br><b>${r.stops ?? '-'}</b></div>
          </div>
        </div>
        <div class="block">
          <h4>Resumen</h4>
          <div>Mejor relación <span class="badge">Precio/tiempo</span></div>
          <div class="muted" style="margin-top:6px">Precios en ${r.currency||'USD'} — datos demostrativos</div>
        </div>
      </div>
      <div class="card-footer">
        <button class="btn-detalles" data-idx="${idx}">Ver detalles</button>
        <span class="muted">${r.legs?.length || 0} tramo(s) ida ${r.hasReturn ? `· ${r.returnLegs?.length||0} vuelta` : ''}</span>
      </div>
      <div id="det-${idx}" class="details">
        <div class="block" style="margin:12px">
          <h4>Detalle de tramos</h4>
          <table class="seg-table">
            <thead><tr><th>Trayecto</th><th>Vuelo</th><th>Ruta</th><th>Horario</th><th>Duración</th></tr></thead>
            <tbody>
              ${legsOut || `<tr><td colspan="5">Sin detalle de ida.</td></tr>`}
              ${r.hasReturn ? (legsRet || `<tr><td colspan="5">Sin detalle de vuelta.</td></tr>`) : ``}
            </tbody>
          </table>
        </div>
      </div>
    </article>`;
  }).join('');

  // toggle detalles (delegado)
  cards.addEventListener('click', (ev)=>{
    const btn = ev.target.closest('.btn-detalles');
    if(!btn) return;
    const i = btn.getAttribute('data-idx');
    const panel = document.getElementById(`det-${i}`);
    const isOpen = panel.classList.contains('open');
    panel.classList.toggle('open', !isOpen);
    btn.textContent = isOpen ? 'Ver detalles' : 'Ocultar';
  }, { once:true });
}

function end(){ btn.disabled=false; btn.classList.remove('loading'); btn.textContent='Buscar vuelos'; }

form.addEventListener('submit', async (e)=>{
  e.preventDefault();
  msg.className='muted'; msg.textContent='Buscando...';
  btn.disabled=true; btn.classList.add('loading'); btn.textContent='Buscando…';
  cards.style.display='none'; cards.innerHTML='';

  const origin = $('#origin').dataset.code || $('#origin').value.trim().toUpperCase();
  const destination = $('#destination').dataset.code || $('#destination').value.trim().toUpperCase();
  const date = $('#date').value.trim();
  const adults = ($('#adults').value || '1').trim();
  const currency = $('#currency').value;
  const returnDate = roundTripCheckbox.checked ? ($('#returnDate').value || '').trim() : '';

  // validaciones
  if (!origin){ msg.className='error'; msg.textContent='Origen inválido.'; return end(); }
  if (!destination){ msg.className='error'; msg.textContent='Destino inválido.'; return end(); }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)){ msg.className='error'; msg.textContent='Fecha de salida inválida.'; return end(); }
  if (roundTripCheckbox.checked && !/^\d{4}-\d{2}-\d{2}$/.test(returnDate)){ msg.className='error'; msg.textContent='Fecha de regreso inválida.'; return end(); }

  try{
    const q = new URLSearchParams({ origin, destination, date, adults, currency });
    if (returnDate) q.set('returnDate', returnDate);
    const res = await fetch('/api/vuelos?' + q.toString());
    const data = await res.json();
    if (!res.ok){
      msg.className='error';
      msg.textContent = res.status===504 ? 'Timeout. Intenta otra fecha.' : (data?.error || 'Error en la búsqueda.');
      return;
    }
    // Adaptamos resultados para cards: separar duración ida/vuelta
    lastResults = (data.results||[]).map(r=>{
      // en server mandamos duration (ida) y returnDuration (vuelta) — si no, calcula desde itineraries
      const out = r.duration || r.durationOut;
      const ret = r.returnDuration || r.durationRet;
      return {...r, durationOut: out, durationRet: ret};
    });

    if (lastResults.length===0){
      msg.className='ok'; msg.textContent='Sin resultados. Prueba otras fechas o rutas.';
      cards.style.display='none'; return;
    }
    buildAirlineOptions(lastResults);
    controls.style.display='flex';
    applyFiltersAndSort();

    msg.className='ok'; msg.textContent=`Listo: ${lastResults.length} resultado(s).`;
  } catch(err){
    console.error(err);
    msg.className='error'; msg.textContent='Error de red o servidor.';
  } finally {
    end();
  }
});

/* ===== Autocomplete mínimo con /api/airports?q= ===== */
function attachAutocomplete(input, listEl){
  let t;
  input.addEventListener('input', ()=>{
    clearTimeout(t);
    const q = input.value.trim();
    input.dataset.code = '';
    if (q.length < 2){ listEl.style.display='none'; listEl.innerHTML=''; return; }
    t = setTimeout(async ()=>{
      try{
        const res = await fetch('/api/airports?q=' + encodeURIComponent(q));
        const items = await res.json(); // espera [{code:'CUN', city:'Cancún', name:'Intl', country:'MX'}]
        listEl.innerHTML = items.slice(0,8).map(i=>`
          <li data-code="${i.code}">
            <span class="autocode">${i.code}</span>
            <span class="autocity">${i.city || i.name || ''}</span>
          </li>`).join('');
        listEl.style.display = items.length ? 'block' : 'none';
      }catch(e){ console.error(e); listEl.style.display='none'; }
    }, 180);
  });
  listEl.addEventListener('click', (ev)=>{
    const li = ev.target.closest('li'); if(!li) return;
    input.value = li.querySelector('.autocity')?.textContent || li.dataset.code;
    input.dataset.code = li.dataset.code;
    listEl.style.display='none'; listEl.innerHTML='';
  });
  document.addEventListener('click', (e)=>{ if(!listEl.contains(e.target) && e.target!==input){ listEl.style.display='none'; }});
}
attachAutocomplete($('#origin'), $('#originList'));
attachAutocomplete($('#destination'), $('#destinationList'));

// fecha por defecto (hoy + 20 días)
(function setDefaultDate(){
  const d=new Date(); d.setDate(d.getDate()+20);
  $('#date').value = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
})();
