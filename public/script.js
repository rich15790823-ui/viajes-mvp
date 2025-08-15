console.log('SCRIPT ACTUAL ✅ build=', Date.now());

// =================== script.js limpio ===================
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
function escapeHtml(s){
  return String(s).replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
}

/* ========= Refs al DOM ========= */
const form = document.getElementById('form');
const btn  = document.getElementById('btn');
const msg  = document.getElementById('msg');
const sum  = document.getElementById('sum');
const tabla= document.getElementById('tabla');
const tbody= document.getElementById('tbody');

const roundTripCheckbox = document.getElementById('roundTrip');
const returnDateWrap    = document.getElementById('returnDateWrap');

const controls   = document.getElementById('controls');   // opcional
const sortSel    = document.getElementById('sort');        // opcional
const directOnly = document.getElementById('directOnly');  // opcional
const airlineSel = document.getElementById('airline');     // opcional

/* ========= Estado ========= */
let lastResults = [];

/* ========= Render de resultados, filtros y detalles ========= */
function renderResults(list){
  if (!tbody) return;
  tbody.innerHTML='';
  list.forEach((r,idx)=>{
    const price = r.priceTotal ? `${r.currency || 'USD'} ${num(r.priceTotal)}` : '-';
    const regresoCol = r.hasReturn ? `<b>${r.returnArrivalIata || '-'}</b><br><span class="mono">${fmt(r.returnArrivalAt)}</span>` : '—';

    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${escapeHtml(r.airline || '-') }<br><span class="mono">${escapeHtml(r.airlineCode || '')}</span></td>
      <td><b>${escapeHtml(r.departureIata || '-')}</b><br><span class="mono">${fmt(r.departureAt)}</span></td>
      <td><b>${escapeHtml(r.arrivalIata || '-')}</b><br><span class="mono">${fmt(r.arrivalAt)}</span></td>
      <td>${escapeHtml(r.duration || '-')}</td>
      <td>${(r.stops ?? '-') }</td>
      <td>${regresoCol}</td>
      <td>${price}</td>
      <td><button type="button" data-idx="${idx}" class="btn-detalles">Ver detalles</button></td>
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

    trDet.innerHTML = `<td colspan="8"><div style="display:none" id="det-${idx}"><pre>${escapeHtml(content)}</pre></div></td>`;
    tbody.appendChild(trDet);
  });
}

// Toggle detalles (delegado, permite abrir/cerrar múltiples filas)
if (tbody) {
  tbody.addEventListener('click', (ev)=>{
    const b = ev.target.closest('.btn-detalles');
    if(!b) return;
    const i = b.getAttribute('data-idx');
    const panel = document.getElementById('det-'+i);
    const visible = panel && panel.style.display !== 'none';
    if (!panel) return;
    panel.style.display = visible ? 'none' : 'block';
    b.textContent = visible ? 'Ver detalles' : 'Ocultar';
  });
}

// Filtros opcionales (se activan si existen en tu HTML)
function populateAirlines(list){
  if(!airlineSel) return;
  const uniq = Array.from(new Set(list.map(r => r.airline || '').filter(Boolean))).sort();
  airlineSel.innerHTML = '<option value="">Todas</option>' + uniq.map(n => `<option value="${escapeHtml(n)}">${escapeHtml(n)}</option>`).join('');
}
function applyFiltersSort(){
  if(!lastResults.length || !tabla) return;
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
function fail(text){ if(msg){ msg.className='error'; msg.textContent=text; } end(); }
function end(){
  if(btn){
    btn.disabled=false; btn.classList.remove('loading'); btn.textContent='Buscar';
  }
}

if (returnDateWrap && roundTripCheckbox) {
  returnDateWrap.style.display = roundTripCheckbox.checked ? 'block' : 'none';
  roundTripCheckbox.addEventListener('change', () => {
    returnDateWrap.style.display = roundTripCheckbox.checked ? 'block' : 'none';
  });
}

if (form) {
  form.addEventListener('submit', async (e)=>{
    e.preventDefault();
    if(msg){ msg.className='muted'; msg.textContent='Buscando...'; }
    if(sum) sum.textContent='';
    if(btn){ btn.disabled=true; btn.classList.add('loading'); btn.textContent='Buscando…'; }
    if(tabla) tabla.style.display='none';
    if(tbody) tbody.innerHTML='';

    const origin      = (document.getElementById('origin')?.value || '').trim().toUpperCase();
    const destination = (document.getElementById('destination')?.value || '').trim().toUpperCase();
    const date        = (document.getElementById('date')?.value || '').trim();
    const adults      = (document.getElementById('adults')?.value || '1').trim();
    const currency    = (document.getElementById('currency')?.value || 'USD');
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
      if(!resultados.length){
        if(msg){ msg.className='ok'; msg.textContent='Sin resultados. Prueba otras fechas o rutas.'; }
        return end();
      }
      lastResults = resultados;
      populateAirlines(lastResults); // si hay select de aerolíneas
      if (controls) controls.style.display = 'flex';
      if(msg){ msg.className='ok'; msg.textContent='Listo.'; }
      applyFiltersSort(); // pinta y aplica orden seleccionado (si existe)
      end();
    }catch(err){
      console.error(err);
      fail('Error de red o servidor.');
    }
  });
}

/* ========= AUTOCOMPLETE AISLADO con Shadow DOM (no altera estilos globales) ========= */
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
    :host { all: initial; } /* aísla TODA herencia */
    .box{
      all: initial;
      display: block;
      background: #fff;
      border: 1px solid #E6E7EA;
      border-radius: 12px;
      box-shadow: 0 16px 40px rgba(0,0,0,.15);
      max-height: 320px;
      overflow: auto;
      font-family: system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif;
      color: #111;
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
    /* scrollbars dentro del shadow */
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
  let isOpen = false;
  let activeIndex = -1;

  function openBox(){ DD.host.style.display = 'block'; isOpen = true; }
  function closeBox(){ DD.host.style.display = 'none'; DD.list.innerHTML=''; isOpen = false; }

  function render(items){
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
      el.addEventListener('click', ()=> select(Number(el.getAttribute('data-i'))));
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

  const onType = debounce(async ()=>{
    const q = input.value.trim();
    if (q.length < 2) { closeBox(); return; }
    if (/^[a-z]{3}$/i.test(q)) { closeBox(); return; } // ya es IATA
    try{
      const res = await fetch('/api/suggest?q=' + encodeURIComponent(q));
      const items = res.ok ? await res.json() : [];
      render(items);
    }catch(e){ console.error(e); closeBox(); }
  }, 220);

  input.addEventListener('input', onType);
  input.addEventListener('focus', onType);
  input.addEventListener('blur', ()=> setTimeout(closeBox, 150));

  // teclado
  input.addEventListener('keydown', (e)=>{
    if (!isOpen) return;
    const total = itemsCache.length;
    if(e.key === 'ArrowDown'){
      e.preventDefault(); setActive((activeIndex + 1) % Math.max(1, total));
    } else if(e.key === 'ArrowUp'){
      e.preventDefault(); setActive((activeIndex - 1 + Math.max(1, total)) % Math.max(1, total));
    } else if(e.key === 'Enter'){
      if(activeIndex >= 0 && activeIndex < total){ e.preventDefault(); select(activeIndex); }
    } else if(e.key === 'Escape'){
      closeBox();
    }
  });

  // reposición si la página cambia
  window.addEventListener('scroll', ()=> { if(isOpen) positionHostBelowInput(DD.host, input); }, true);
  window.addEventListener('resize', ()=> { if(isOpen) positionHostBelowInput(DD.host, input); });
}

// Activar (SIN cambiar HTML)
bindShadowAutocomplete('origin');
bindShadowAutocomplete('destination');

// =================== fin script.js ===================
