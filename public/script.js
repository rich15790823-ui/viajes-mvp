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
  const css = `
  .ac-float{
    position:absolute !important; z-index:99999 !important; background:#ffffff !important;
    border:1px solid #E6E7EA !important; border-radius:12px !important;
    box-shadow:0 16px 40px rgba(0,0,0,.18) !important;
    max-height:320px !important; overflow:auto !important; display:none !important;
    font-family: system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif !important;
  }
  .ac-header{
    padding:8px 12px !important; font-size:12px !important; color:#6b7280 !important;
    border-bottom:1px solid #F0F1F3 !important; background:#fafafa !important;
    position:sticky !important; top:0 !important;
  }
  .ac-item{
    padding:10px 12px !important; cursor:pointer !important; display:flex !important;
    align-items:center !important; gap:10px !important;
  }
  .ac-item:hover, .ac-item.active{ background:#eef5ff !important; }
  .ac-item .text{display:flex !important; flex-direction:column !important; line-height:1.1 !important}
  .ac-title{ font-size:14px !important; color:#001f54 !important; font-weight:700 !important; }
  .ac-meta{ font-size:12px !important; color:#6b7280 !important; }
  .ac-pill{
    margin-left:auto !important; font-size:12px !important; min-width:46px !important; text-align:center !important;
    background:#b42150 !important; color:#fff !important; border-radius:999px !important; padding:4px 8px !important;
    font-weight:800 !important; letter-spacing:.4px !important;
  }
  `;

  .ac-float{
    position:absolute; z-index:9999; background:#fff;
    border:1px solid #E6E7EA; border-radius:12px;
    box-shadow:0 16px 40px rgba(0,0,0,.15); max-height:320px; overflow:auto; display:none;
  }
  .ac-header{ padding:8px 12px; font-size:12px; color:#6b7280; border-bottom:1px solid #F0F1F3; }
  .ac-item{
    padding:10px 12px; cursor:pointer; display:flex; align-items:center; gap:10px;
  }
  .ac-item:hover, .ac-item.active{ background: #eef5ff; }
  .ac-item .text{display:flex; flex-direction:column; line-height:1.1}
  .ac-title{ font-size:14px; color:#001f54; font-weight:600; }
  .ac-meta{ font-size:12px; color:#6b7280; }
  .ac-pill{
    margin-left:auto; font-size:12px; min-width:46px; text-align:center;
    background:#b42150; color:#fff; border-radius:999px; padding:4px 8px;
    font-weight:700; letter-spacing:0.5px;
  }
  .ac-empty{ padding:12px; color:#6b7280; font-size:13px; }
  `;
  const s = document.createElement('style');
  s.textContent = css;
  document.head.appendChild(s);
})();

function acFetchSuggest(q){
  return fetch('/api/suggest?q=' + encodeURIComponent(q))
    .then(r => r.ok ? r.json() : [])
    .catch(() => []);
}

function acCreateListEl(){
  const el = document.createElement('div');
  el.className = 'ac-float';
  el.innerHTML = `<div class="ac-header">Sugerencias</div>`;
  document.body.appendChild(el);
  return el;
}
function acPlaceListUnderInput(listEl, input){
  const r = input.getBoundingClientRect();
  listEl.style.left   = Math.round(window.scrollX + r.left) + 'px';
  listEl.style.top    = Math.round(window.scrollY + r.bottom + 6) + 'px';
  listEl.style.width  = Math.round(r.width) + 'px';
}
function acClose(listEl){ listEl.style.display='none'; listEl._open = false; }
function acOpen(listEl){ listEl.style.display='block'; listEl._open = true; }

function bindFloatingAutocomplete(inputId){
  const input = document.getElementById(inputId);
  if(!input) return;

  const listEl = acCreateListEl();
  let itemsCache = [];
  let activeIndex = -1;

  function render(items){
    itemsCache = items;
    activeIndex = -1;

    const inner = items.length
      ? items.map((it, idx)=>`
        <div class="ac-item" data-idx="${idx}">
          <div class="text">
            <div class="ac-title">${escapeHtml(it.name || it.label || '')}</div>
            <div class="ac-meta">
              ${it.subType === 'CITY' ? 'Ciudad' : 'Aeropuerto'}
              ${it.detailed?.cityName ? ' · ' + escapeHtml(it.detailed.cityName) : ''}
              ${it.detailed?.countryCode ? ' · ' + escapeHtml(it.detailed.countryCode) : ''}
            </div>
          </div>
          <div class="ac-pill">${escapeHtml((it.iataCode || '').toUpperCase())}</div>
        </div>
      `).join('')
      : `<div class="ac-empty">Sin coincidencias</div>`;

    listEl.innerHTML = `<div class="ac-header">Sugerencias</div>${inner}`;
    acPlaceListUnderInput(listEl, input);
    acOpen(listEl);

    [...listEl.querySelectorAll('.ac-item')].forEach(el=>{
      el.addEventListener('mousemove', ()=>{
        setActive(Number(el.getAttribute('data-idx')));
      });
      el.addEventListener('click', ()=>{
        const i = Number(el.getAttribute('data-idx'));
        select(i);
      });
    });
  }

  function setActive(i){
    activeIndex = i;
    [...listEl.querySelectorAll('.ac-item')].forEach((el, idx) => {
      el.classList.toggle('active', idx === activeIndex);
    });
  }

  function select(i){
    const sel = itemsCache[i];
    if(!sel) return;
    input.value = (sel.iataCode || '').toUpperCase();
    acClose(listEl);
    input.dispatchEvent(new Event('input', { bubbles:true }));
  }

  const onType = debounce(async ()=>{
    const q = input.value.trim();
    if(q.length < 2){ acClose(listEl); return; }
    if(/^[a-z]{3}$/i.test(q)){ acClose(listEl); return; } // ya es IATA
    const items = await acFetchSuggest(q);
    render(items);
  }, 220);

  // Teclado: ↑ ↓ Enter Esc
  input.addEventListener('keydown', (e)=>{
    if(!listEl._open) return;
    const total = itemsCache.length;
    if(e.key === 'ArrowDown'){
      e.preventDefault();
      setActive((activeIndex + 1) % Math.max(1, total));
    } else if(e.key === 'ArrowUp'){
      e.preventDefault();
      setActive((activeIndex - 1 + Math.max(1, total)) % Math.max(1, total));
    } else if(e.key === 'Enter'){
      if(activeIndex >= 0 && activeIndex < total){
        e.preventDefault();
        select(activeIndex);
      }
    } else if(e.key === 'Escape'){
      acClose(listEl);
    }
  });

  input.addEventListener('input', onType);
  input.addEventListener('focus', onType);
  input.addEventListener('blur', ()=> setTimeout(() => acClose(listEl), 150));
  window.addEventListener('scroll', ()=> { if(listEl._open) acPlaceListUnderInput(listEl, input); }, true);
  window.addEventListener('resize', ()=> { if(listEl._open) acPlaceListUnderInput(listEl, input); });
}

function escapeHtml(s){
  return String(s).replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
}

// Activa autocomplete en los inputs actuales (SIN cambiar HTML)
bindFloatingAutocomplete('origin');
bindFloatingAutocomplete('destination');
/* ========= AUTOCOMPLETE con Shadow DOM (aislado, sin afectar estilos globales) ========= */
function createShadowDropdown() {
  const host = document.createElement('div');
  host.style.position = 'absolute';
  host.style.zIndex = '99999';
  host.style.display = 'none';
  host.style.left = '0px';
  host.style.top = '0px';
  host.style.width = '240px';
  document.body.appendChild(host);

  const shadow = host.attachShadow({ mode: 'open' });
  const style = document.createElement('style');
  style.textContent = `
    :host { all: initial; } /* aísla TODAS las herencias */
    .box{
      all: unset;
      display: block;
      background: #fff;
      border: 1px solid #E6E7EA;
      border-radius: 12px;
      box-shadow: 0 16px 40px rgba(0,0,0,.15);
      max-height: 320px;
      overflow: auto;
      font-family: system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif;
    }
    .hdr{ position: sticky; top:0; background:#fafafa; border-bottom:1px solid #F0F1F3; padding:8px 12px; font-size:12px; color:#6b7280; }
    .itm{ display:flex; align-items:center; gap:10px; padding:10px 12px; cursor:pointer; }
    .itm:hover, .itm.active{ background:#eef5ff; }
    .text{ display:flex; flex-direction:column; line-height:1.1; }
    .ttl{ font-size:14px; color:#001f54; font-weight:700; }
    .meta{ font-size:12px; color:#6b7280; }
    .pill{
      margin-left:auto; font-size:12px; min-width:46px; text-align:center;
      background:#b42150; color:#fff; border-radius:999px; padding:4px 8px; font-weight:800; letter-spacing:.4px;
    }
    .empty{ padding:12px; color:#6b7280; font-size:13px; }
    /* scrollbars propios (solo dentro del shadow) */
    ::-webkit-scrollbar{ width:10px; height:10px; }
    ::-webkit-scrollbar-thumb{ background:#E6E7EA; border-radius:999px; }
    ::-webkit-scrollbar-thumb:hover{ background:#d6d7da; }
  `;
  const wrap = document.createElement('div');
  wrap.className = 'box';
  wrap.innerHTML = `<div class="hdr">Sugerencias</div><div id="list"></div>`;
  shadow.append(style, wrap);

  return { host, shadow, list: wrap.querySelector('#list') };
}

function positionHostBelowInput(host, input) {
  const r = input.getBoundingClientRect();
  host.style.left = Math.round(window.scrollX + r.left) + 'px';
  host.style.top  = Math.round(window.scrollY + r.bottom + 6) + 'px';
  host.style.width= Math.round(r.width) + 'px';
}

function bindShadowAutocomplete(inputId) {
  const input = document.getElementById(inputId);
  if (!input) return;

  const DD = createShadowDropdown();
  let itemsCache = [];
  let open = false;
  let activeIndex = -1;

  function openBox()  { DD.host.style.display = 'block'; open = true; }
  function closeBox() { DD.host.style.display = 'none'; DD.list.innerHTML = ''; open = false; }

  function render(items) {
    itemsCache = items || [];
    activeIndex = -1;

    if (!itemsCache.length) {
      DD.list.innerHTML = `<div class="empty">Sin coincidencias</div>`;
    } else {
      DD.list.innerHTML = itemsCache.map((it, i)=>`
        <div class="itm" data-i="${i}">
          <div class="text">
            <div class="ttl">${escapeHtml(it.name || it.label || '')}</div>
            <div class="meta">
              ${it.subType === 'CITY' ? 'Ciudad' : 'Aeropuerto'}
              ${it.detailed?.cityName ? ' · ' + escapeHtml(it.detailed.cityName) : ''}
              ${it.detailed?.countryCode ? ' · ' + escapeHtml(it.detailed.countryCode) : ''}
            </div>
          </div>
          <div class="pill">${escapeHtml((it.iataCode || '').toUpperCase())}</div>
        </div>
      `).join('');
    }

    // eventos dentro del shadow
    [...DD.list.querySelectorAll('.itm')].forEach(el=>{
      el.addEventListener('mousemove', ()=> setActive(Number(el.getAttribute('data-i'))));
      el.addEventListener('click',     ()=> select(Number(el.getAttribute('data-i'))));
    });

    positionHostBelowInput(DD.host, input);
    openBox();
  }

  function setActive(i){
    activeIndex = i;
    [...DD.list.querySelectorAll('.itm')].forEach((el, idx)=>{
      el.classList.toggle('active', idx === activeIndex);
    });
  }

  function select(i){
    const sel = itemsCache[i];
    if (!sel) return;
    input.value = (sel.iataCode || '').toUpperCase();
    closeBox();
    input.dispatchEvent(new Event('input', { bubbles:true }));
  }

  const deb = (fn, ms)=>{ let t; return (...a)=>{ clearTimeout(t); t=setTimeout(()=>fn(...a), ms); }; };
  const onType = deb(async ()=>{
    const q = input.value.trim();
    if (q.length < 2) { closeBox(); return; }
    if (/^[a-z]{3}$/i.test(q)) { closeBox(); return; } // ya es IATA
    try {
      const res = await fetch('/api/suggest?q=' + encodeURIComponent(q));
      const items = res.ok ? await res.json() : [];
      render(items);
    } catch(e) { console.error(e); closeBox(); }
  }, 220);

  input.addEventListener('input', onType);
  input.addEventListener('focus', onType);
  input.addEventListener('blur', ()=> setTimeout(closeBox, 150));

  // teclado dentro del input
  input.addEventListener('keydown', (e)=>{
    if (!open) return;
    const total = itemsCache.length;
    if (e.key === 'ArrowDown'){
      e.preventDefault(); setActive((activeIndex + 1) % Math.max(1, total));
    } else if (e.key === 'ArrowUp'){
      e.preventDefault(); setActive((activeIndex - 1 + Math.max(1, total)) % Math.max(1, total));
    } else if (e.key === 'Enter'){
      if (activeIndex >= 0 && activeIndex < total){ e.preventDefault(); select(activeIndex); }
    } else if (e.key === 'Escape'){
      closeBox();
    }
  });

  // reposicionar si la página se mueve/redimensiona
  window.addEventListener('scroll', ()=> { if(open) positionHostBelowInput(DD.host, input); }, true);
  window.addEventListener('resize', ()=> { if(open) positionHostBelowInput(DD.host, input); });
}

function escapeHtml(s){
  return String(s).replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
}

// activar (SIN cambiar HTML)
bindShadowAutocomplete('origin');
bindShadowAutocomplete('destination');
