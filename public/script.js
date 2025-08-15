console.log('script.js cargado ✅');

/* ========= Helpers ========= */
function fmt(iso){ if(!iso) return '-'; const d=new Date(iso); return d.toLocaleString(); }
function num(n){ return Number(n).toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2}); }
function durationToMin(iso){
  if(!iso) return Infinity;
  const m = /PT(?:(\d+)H)?(?:(\d+)M)?/i.exec(iso);
  if(!m) return Infinity;
  return (Number(m[1]||0)*60)+(Number(m[2]||0));
}
function debounce(fn, ms){ let t; return (...args)=>{ clearTimeout(t); t=setTimeout(()=>fn(...args), ms); }; }

/* ========= Refs al DOM (tu HTML ya los tiene) ========= */
const form = document.getElementById('form');
const btn  = document.getElementById('btn');
const msg  = document.getElementById('msg');
const sum  = document.getElementById('sum');
const tabla= document.getElementById('tabla');
const tbody= document.getElementById('tbody');

const roundTripCheckbox = document.getElementById('roundTrip');
const returnDateWrap    = document.getElementById('returnDateWrap');

const controls   = document.getElementById('controls');
const sortSel    = document.getElementById('sort');
const directOnly = document.getElementById('directOnly');
const airlineSel = document.getElementById('airline');

/* ========= Render de resultados, filtros y detalles ========= */
let lastResults = [];

function renderResults(list){
  tbody.innerHTML='';
  list.forEach((r,idx)=>{
    const price = r.priceTotal ? `${r.currency || 'USD'} ${num(r.priceTotal)}` : '-';
    const regresoCol = r.hasReturn ? `<b>${r.returnArrivalIata || '-'}</b><br><span class="mono">${fmt(r.returnArrivalAt)}</span>` : '—';

    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${r.airline || '-'}<br><span class="mono">${r.airlineCode || ''}</span></td>
      <td><b>${r.departureIata || '-'}</b><br><span class="mono">${fmt(r.departureAt)}</span></td>
      <td><b>${r.arrivalIata || '-'}</b><br><span class="mono">${fmt(r.arrivalAt)}</span></td>
      <td>${r.duration || '-'}</td>
      <td>${r.stops ?? '-'}</td>
      <td>${regresoCol}</td>
      <td>${price}</td>
      <td><button type="button" data-idx="${idx}" class="btn-detalles" style="padding:8px 10px; background: var(--rasp,#B42150); color:#fff; border:0; border-radius:8px;">Ver detalles</button></td>
    `;
    tbody.appendChild(tr);

    const trDet = document.createElement('tr');
    trDet.className='details';
    const legsOutText = (r.legs || []).map((s,i)=>`IDA ${i+1} — ${s.airlineCode} ${s.flightNumber}
  ${s.from}  ${fmt(s.departAt)}  →  ${s.to}  ${fmt(s.arriveAt)}
  Duración: ${s.duration || '-'}`).join('\n\n');

    const legsRetText = (r.returnLegs || []).map((s,i)=>`VUELTA ${i+1} — ${s.airlineCode} ${s.flightNumber}
  ${s.from}  ${fmt(s.departAt)}  →  ${s.to}  ${fmt(s.arriveAt)}
  Duración: ${s.duration || '-'}`).join('\n\n');

    const content = [legsOutText || 'Sin detalle de ida.', r.hasReturn ? (legsRetText || 'Sin detalle de vuelta.') : '']
      .filter(Boolean).join('\n\n');

    trDet.innerHTML = `<td colspan="8"><div style="display:none" id="det-${idx}"><pre>${content}</pre></div></td>`;
    tbody.appendChild(trDet);
  });
}

// Delegado: abrir/cerrar cualquier “Ver detalles”
tbody.addEventListener('click', (ev)=>{
  const b = ev.target.closest('.btn-detalles');
  if(!b) return;
  const i = b.getAttribute('data-idx');
  const panel = document.getElementById('det-'+i);
  const visible = panel.style.display !== 'none';
  panel.style.display = visible ? 'none' : 'block';
  b.textContent = visible ? 'Ver detalles' : 'Ocultar';
});

// Filtros/orden
function populateAirlines(list){
  if(!airlineSel) return;
  const uniq = Array.from(new Set(list.map(r => r.airline || '').filter(Boolean))).sort();
  airlineSel.innerHTML = '<option value="">Todas</option>' + uniq.map(n => `<option value="${n}">${n}</option>`).join('');
}
function applyFiltersSort(){
  if(!lastResults.length) return;
  let arr = [...lastResults];
  if (directOnly?.checked) arr = arr.filter(r => (r.stops || 0) === 0);
  const selAir = airlineSel?.value || '';
  if (selAir) arr = arr.filter(r => (r.airline || '') === selAir);
  const key = sortSel?.value || 'priceAsc';
  arr.sort((a,b)=>{
    if(key==='priceAsc')  return Number(a.priceTotal||Infinity) - Number(b.priceTotal||Infinity);
    if(key==='priceDesc') return Number(b.priceTotal||-Infinity) - Number(a.priceTotal||-Infinity);
    if(key==='durAsc')    return durationToMin(a.duration) - durationToMin(b.duration);
    if(key==='durDesc')   return durationToMin(b.duration) - durationToMin(a.duration);
    if(key==='depAsc')    return new Date(a.departureAt) - new Date(b.departureAt);
    if(key==='depDesc')   return new Date(b.departureAt) - new Date(a.departureAt);
    return 0;
  });
  renderResults(arr);
  if (sum) sum.textContent = `${arr.length} resultado(s).`;
  tabla.style.display = '';
}
sortSel?.addEventListener('change', applyFiltersSort);
directOnly?.addEventListener('change', applyFiltersSort);
airlineSel?.addEventListener('change', applyFiltersSort);

/* ========= Submit (búsqueda) ========= */
function fail(text){ msg.className='error'; msg.textContent=text; end(); }
function end(){ btn.disabled=false; btn.classList.remove('loading'); btn.textContent='Buscar'; }

if (returnDateWrap && roundTripCheckbox) {
  returnDateWrap.style.display = roundTripCheckbox.checked ? 'block' : 'none';
  roundTripCheckbox.addEventListener('change', () => {
    returnDateWrap.style.display = roundTripCheckbox.checked ? 'block' : 'none';
  });
}

form.addEventListener('submit', async (e)=>{
  e.preventDefault();
  msg.className='muted'; msg.textContent='Buscando...';
  sum && (sum.textContent='');
  btn.disabled=true; btn.classList.add('loading'); btn.textContent='Buscando…';
  tabla.style.display='none'; tbody.innerHTML='';

  const origin      = document.getElementById('origin').value.trim().toUpperCase();
  const destination = document.getElementById('destination').value.trim().toUpperCase();
  const date        = document.getElementById('date').value.trim();
  const adults      = (document.getElementById('adults').value || '1').trim();
  const currency    = document.getElementById('currency').value;
  const returnDateEl= document.getElementById('returnDate');
  const returnDate  = (roundTripCheckbox?.checked && returnDateEl) ? (returnDateEl.value || '').trim() : '';

  if(!/^[A-Z]{3}$/.test(origin))        return fail('Origen inválido (elige de la lista o usa IATA).');
  if(!/^[A-Z]{3}$/.test(destination))   return fail('Destino inválido (elige de la lista o usa IATA).');
  if(!/^\d{4}-\d{2}-\d{2}$/.test(date)) return fail('Salida inválida (YYYY-MM-DD).');
  if(roundTripCheckbox?.checked){
    if(!/^\d{4}-\d{2}-\d{2}$/.test(returnDate)) return fail('Regreso inválido (YYYY-MM-DD).');
    if(new Date(returnDate) < new Date(date))   return fail('El regreso no puede ser antes de la salida.');
  }

  try{
    const q = new URLSearchParams({ origin, destination, date, adults, currency });
    if(returnDate) q.set('returnDate', returnDate);
    const res = await fetch('/api/vuelos?' + q.toString());
    const data = await res.json();
    if(!res.ok){
      return fail(res.status===504 ? 'La búsqueda tardó demasiado (timeout).' : (data?.error || 'Error en la búsqueda.'));
    }
    const resultados = data.results || [];
    if(!resultados.length){ msg.className='ok'; msg.textContent='Sin resultados. Prueba otras fechas o rutas.'; return end(); }
    lastResults = resultados;
    populateAirlines(lastResults);
    controls && (controls.style.display = 'flex');
    msg.className='ok'; msg.textContent='Listo.';
    applyFiltersSort();
    end();
  }catch(err){
    console.error(err);
    fail('Error de red o servidor.');
  }
});

/* ========= AUTOCOMPLETE 100% en JS (sin editar HTML) ========= */
// Inyecta el CSS del dropdown
(() => {
  const css = `
  .ac-float{position:absolute; z-index:9999; background:#fff; border:1px solid #E6E7EA; border-radius:10px;
    box-shadow:0 10px 24px rgba(0,0,0,.12); max-height:280px; overflow:auto; display:none;}
  .ac-item{padding:10px 12px; cursor:pointer; font-size:14px;}
  .ac-item:hover{background:#f3f6ff;}
  .ac-empty{padding:10px 12px; color:#6b7280; font-size:13px;}
  `;
  const s = document.createElement('style');
  s.textContent = css;
  document.head.appendChild(s);
})();

async function acFetchSuggest(q){
  const res = await fetch('/api/suggest?q=' + encodeURIComponent(q));
  if(!res.ok) return [];
  return await res.json();
}
function acCreateListEl(){
  const el = document.createElement('div');
  el.className = 'ac-float';
  document.body.appendChild(el);
  return el;
}
function acPlaceListUnderInput(listEl, input){
  const r = input.getBoundingClientRect();
  listEl.style.left   = Math.round(window.scrollX + r.left) + 'px';
  listEl.style.top    = Math.round(window.scrollY + r.bottom + 4) + 'px';
  listEl.style.width  = Math.round(r.width) + 'px';
}
function acClose(listEl){ listEl.style.display='none'; listEl.innerHTML=''; }
function acOpen(listEl){ listEl.style.display='block'; }

function bindFloatingAutocomplete(inputId){
  const input = document.getElementById(inputId);
  if(!input) return;
  const listEl = acCreateListEl();

  function render(items){
    if(!items.length){
      listEl.innerHTML = `<div class="ac-empty">Sin coincidencias</div>`;
      acPlaceListUnderInput(listEl, input);
      acOpen(listEl);
      return;
    }
    listEl.innerHTML = items.map((it, idx)=>`<div class="ac-item" data-idx="${idx}">${it.label}</div>`).join('');
    acPlaceListUnderInput(listEl, input);
    acOpen(listEl);
    [...listEl.querySelectorAll('.ac-item')].forEach(el=>{
      el.addEventListener('click', ()=>{
        const i = Number(el.getAttribute('data-idx'));
        const sel = items[i];
        input.value = (sel?.iataCode || '').toUpperCase();
        acClose(listEl);
        input.dispatchEvent(new Event('input', { bubbles:true }));
      });
    });
  }

  const onType = debounce(async ()=>{
    const q = input.value.trim();
    if(q.length < 2){ acClose(listEl); return; }
    if(/^[a-z]{3}$/i.test(q)){ acClose(listEl); return; } // ya es IATA
    try{ render(await acFetchSuggest(q)); }catch(e){ console.error(e); acClose(listEl); }
  }, 250);

  input.addEventListener('input', onType);
  input.addEventListener('focus', onType);
  input.addEventListener('blur', ()=> setTimeout(()=> acClose(listEl), 150));
  window.addEventListener('scroll', ()=> { if(listEl.style.display!=='none') acPlaceListUnderInput(listEl, input); }, true);
  window.addEventListener('resize', ()=> { if(listEl.style.display!=='none') acPlaceListUnderInput(listEl, input); });
}

// Activa autocomplete en los inputs actuales (SIN cambiar HTML)
bindFloatingAutocomplete('origin');
bindFloatingAutocomplete('destination');
