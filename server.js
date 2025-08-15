require('dotenv').config({ path: require('path').join(__dirname, '.env') });
const express = require('express');
const cors = require('cors');
const path = require('path');
const Amadeus = require('amadeus');

  // --------- referencias al DOM ----------
  const form = document.getElementById('form');
  const btn = document.getElementById('btn');
  const msg = document.getElementById('msg');
  const sum = document.getElementById('sum') || document.createElement('span'); // por si no existe
  const tabla = document.getElementById('tabla');
  const tbody = document.getElementById('tbody');
let lastResults = []; // guardamos el último resultado para ordenar/filtrar
const controls   = document.getElementById('controls');
const sortSel    = document.getElementById('sort');
const directOnly = document.getElementById('directOnly');
const airlineSel = document.getElementById('airline');

function populateAirlines(list) {
  // Llena el select de aerolíneas a partir de resultados
  const uniq = Array.from(new Set(list.map(r => r.airline || '').filter(Boolean))).sort();
  airlineSel.innerHTML = '<option value="">Todas</option>' + uniq.map(n => `<option value="${n}">${n}</option>`).join('');
}

function applyFiltersSort() {
  if (!lastResults || !lastResults.length) return;

  let arr = [...lastResults];

  // Filtro directos
  if (directOnly.checked) {
    arr = arr.filter(r => (r.stops || 0) === 0);
  }

  // Filtro aerolínea por nombre
  const selAir = airlineSel.value;
  if (selAir) {
    arr = arr.filter(r => (r.airline || '') === selAir);
  }

  // Orden
  const key = sortSel.value;
  arr.sort((a, b) => {
    if (key === 'priceAsc')  return Number(a.priceTotal||Infinity) - Number(b.priceTotal||Infinity);
    if (key === 'priceDesc') return Number(b.priceTotal||-Infinity) - Number(a.priceTotal||-Infinity);

    if (key === 'durAsc')  return durationToMin(a.duration) - durationToMin(b.duration);
    if (key === 'durDesc') return durationToMin(b.duration) - durationToMin(a.duration);

    if (key === 'depAsc')  return new Date(a.departureAt) - new Date(b.departureAt);
    if (key === 'depDesc') return new Date(b.departureAt) - new Date(a.departureAt);

    return 0;
  });

  renderResults(arr);
  sum && (sum.textContent = `${arr.length} resultado(s).`);
}

// Eventos de controles
sortSel?.addEventListener('change', applyFiltersSort);
directOnly?.addEventListener('change', applyFiltersSort);
airlineSel?.addEventListener('change', applyFiltersSort);

function durationToMin(isoDur) {
  // Amadeus usa formato tipo "PT9H30M"
  if (!isoDur) return Infinity;
  const m = /PT(?:(\d+)H)?(?:(\d+)M)?/i.exec(isoDur);
  if (!m) return Infinity;
  const h = Number(m[1] || 0);
  const min = Number(m[2] || 0);
  return h * 60 + min;
}

function renderResults(list) {
  tbody.innerHTML = '';
  list.forEach((r, idx) => {
    const price = r.priceTotal ? `${r.currency || 'USD'} ${Number(r.priceTotal).toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2})}` : '-';
    const regresoCol = r.hasReturn
      ? `<b>${r.returnArrivalIata || '-'}</b><br><span class="mono">${fmt(r.returnArrivalAt)}</span>`
      : '—';

    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${r.airline || '-'}<br><span class="mono">${r.airlineCode || ''}</span></td>
      <td><b>${r.departureIata || '-'}</b><br><span class="mono">${fmt(r.departureAt)}</span></td>
      <td><b>${r.arrivalIata || '-'}</b><br><span class="mono">${fmt(r.arrivalAt)}</span></td>
      <td>${r.duration || '-'}</td>
      <td>${r.stops ?? '-'}</td>
      <td>${regresoCol}</td>
      <td>${price}</td>
      <td><button type="button" data-idx="${idx}" class="btn-detalles" style="padding:8px 10px; background: var(--rasp); color:#fff; border:0; border-radius:8px;">Ver detalles</button></td>
    `;
    tbody.appendChild(tr);

    const trDet = document.createElement('tr');
    trDet.className = 'details';
    const legsOutText = (r.legs || []).map((s, i) =>
`IDA ${i+1} — ${s.airlineCode} ${s.flightNumber}
  ${s.from}  ${fmt(s.departAt)}  →  ${s.to}  ${fmt(s.arriveAt)}
  Duración: ${s.duration || '-'}`).join('\n\n');

    const legsRetText = (r.returnLegs || []).map((s, i) =>
`VUELTA ${i+1} — ${s.airlineCode} ${s.flightNumber}
  ${s.from}  ${fmt(s.departAt)}  →  ${s.to}  ${fmt(s.arriveAt)}
  Duración: ${s.duration || '-'}`).join('\n\n');

    const content = [legsOutText || 'Sin detalle de ida.', r.hasReturn ? (legsRetText || 'Sin detalle de vuelta.') : '']
      .filter(Boolean).join('\n\n');

    trDet.innerHTML = `<td colspan="8"><div style="display:none" id="det-${idx}"><pre>${content}</pre></div></td>`;
    tbody.appendChild(trDet);
  });
}

// 🔧 Listener PERMANENTE (sin { once:true }) para abrir/cerrar detalles y poder usar varios
tbody.addEventListener('click', (ev) => {
  const btn = ev.target.closest('.btn-detalles');
  if (!btn) return;
  const i = btn.getAttribute('data-idx');
  const panel = document.getElementById(`det-${i}`);
  const visible = panel.style.display !== 'none';

  // Comportamiento tipo “acordeón suave”: cierra otros y abre el actual
  [...tbody.querySelectorAll('[id^="det-"]')].forEach(el => { el.style.display = 'none'; });
  [...tbody.querySelectorAll('.btn-detalles')].forEach(b => b.textContent = 'Ver detalles');

  panel.style.display = visible ? 'none' : 'block';
  btn.textContent = visible ? 'Ver detalles' : 'Ocultar';
});

  const roundTripCheckbox = document.getElementById('roundTrip');
  const returnDateWrap   = document.getElementById('returnDateWrap');

  // --------- helpers ----------
  function fmt(iso) {
    if (!iso) return '-';
    const d = new Date(iso);
    return d.toLocaleString();
  }
  function num(n) {
    return Number(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
  function fail(text) {
    msg.className = 'error';
    msg.textContent = text;
    end();
  }
  function end() {
    btn.disabled = false;
    btn.classList.remove('loading');
    btn.textContent = 'Buscar';
  }

  // --------- mostrar/ocultar regreso ----------
  // Estado inicial
  if (returnDateWrap) {
    returnDateWrap.style.display = roundTripCheckbox && roundTripCheckbox.checked ? 'block' : 'none';
  }
  // Cambios
  if (roundTripCheckbox && returnDateWrap) {
    roundTripCheckbox.addEventListener('change', () => {
      returnDateWrap.style.display = roundTripCheckbox.checked ? 'block' : 'none';
    });
  }

  // --------- submit ----------
  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    msg.className = 'muted';
    msg.textContent = 'Buscando...';
    if (sum) sum.textContent = '';
    btn.disabled = true;
    btn.classList.add('loading');
    btn.textContent = 'Buscando…';
    tabla.style.display = 'none';
    tbody.innerHTML = '';

    // valores del formulario
    const origin      = document.getElementById('origin').value.trim().toUpperCase();
    const destination = document.getElementById('destination').value.trim().toUpperCase();
    const date        = document.getElementById('date').value.trim();
    const adults      = (document.getElementById('adults').value || '1').trim();
    const currency    = document.getElementById('currency').value;
    const returnDate  = (roundTripCheckbox && roundTripCheckbox.checked)
      ? (document.getElementById('returnDate').value || '').trim()
      : '';

    // validaciones
    if (!/^[A-Z]{3}$/.test(origin))      return fail('Origen inválido (IATA, ej. CUN).');
    if (!/^[A-Z]{3}$/.test(destination)) return fail('Destino inválido (IATA, ej. MAD).');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return fail('Salida inválida (YYYY-MM-DD).');
    if (roundTripCheckbox && roundTripCheckbox.checked) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(returnDate)) return fail('Regreso inválido (YYYY-MM-DD).');
      if (new Date(returnDate) < new Date(date))    return fail('El regreso no puede ser antes de la salida.');
    }

    try {
      // construir query
      const q = new URLSearchParams({ origin, destination, date, adults, currency });
      if (returnDate) q.set('returnDate', returnDate);

      // llamada al backend
      const res = await fetch('/api/vuelos?' + q.toString());
      const data = await res.json();

      if (!res.ok) {
        return fail(
          res.status === 504
            ? 'La búsqueda tardó demasiado (timeout). Intenta otras fechas.'
            : (data?.error || 'Error en la búsqueda.')
        );
      }

      const resultados = data.results || [];
      lastResults = resultados;
populateAirlines(lastResults);
controls.style.display = 'flex'; // muestra los controles
applyFiltersSort();              // aplica estado inicial (orden/filtros)
msg.className = 'ok';
msg.textContent = 'Listo.';
tabla.style.display = '';
end();


      // pintar resultados
      resultados.forEach((r, idx) => {
        const tr = document.createElement('tr');
        const price = r.priceTotal ? `${r.currency || 'USD'} ${num(r.priceTotal)}` : '-';
        const regresoCol = r.hasReturn
          ? `<b>${r.returnArrivalIata || '-'}</b><br><span class="mono">${fmt(r.returnArrivalAt)}</span>`
          : '—';

        tr.innerHTML = `
          <td>${r.airline || '-'}<br><span class="mono">${r.airlineCode || ''}</span></td>
          <td><b>${r.departureIata || '-'}</b><br><span class="mono">${fmt(r.departureAt)}</span></td>
          <td><b>${r.arrivalIata || '-'}</b><br><span class="mono">${fmt(r.arrivalAt)}</span></td>
          <td>${r.duration || '-'}</td>
          <td>${r.stops ?? '-'}</td>
          <td>${regresoCol}</td>
          <td>${price}</td>
          <td><button type="button" data-idx="${idx}" class="btn-detalles">Ver detalles</button></td>
        `;
        tbody.appendChild(tr);

        // fila de detalles
        const trDet = document.createElement('tr');
        trDet.className = 'details';
        const legsOutText = (r.legs || []).map((s, i) =>
          `IDA ${i+1} — ${s.airlineCode} ${s.flightNumber}
  ${s.from}  ${fmt(s.departAt)}  →  ${s.to}  ${fmt(s.arriveAt)}
  Duración: ${s.duration || '-'}`
        ).join('\n\n');

        const legsRetText = (r.returnLegs || []).map((s, i) =>
          `VUELTA ${i+1} — ${s.airlineCode} ${s.flightNumber}
  ${s.from}  ${fmt(s.departAt)}  →  ${s.to}  ${fmt(s.arriveAt)}
  Duración: ${s.duration || '-'}`
        ).join('\n\n');

        const content = [
          legsOutText || 'Sin detalle de ida.',
          r.hasReturn ? (legsRetText || 'Sin detalle de vuelta.') : ''
        ].filter(Boolean).join('\n\n');

        trDet.innerHTML = `<td colspan="8"><div style="display:none" id="det-${idx}"><pre>${content}</pre></div></td>`;
        tbody.appendChild(trDet);
      });

      // toggle de detalles (se registra una sola vez por render)
      tbody.addEventListener('click', (ev) => {
        const btn = ev.target.closest('.btn-detalles');
        if (!btn) return;
        const i = btn.getAttribute('data-idx');
        const panel = document.getElementById(`det-${i}`);
        const visible = panel.style.display !== 'none';
        panel.style.display = visible ? 'none' : 'block';
        btn.textContent = visible ? 'Ver detalles' : 'Ocultar';
      }, { once: true });

      msg.className = 'ok';
      msg.textContent = 'Listo.';
      if (sum) sum.textContent = `${resultados.length} resultado(s).`;
      tabla.style.display = '';
      end();
    } catch (e) {
      console.error(e);
      fail('Error de red o servidor.');
    }
  });
</script>
// ===== /api/suggest: autocompletar ciudades/aeropuertos =====
app.get('/api/suggest', async (req, res) => {
  try {
    const q = (req.query.q || '').trim();
    if (q.length < 2) return res.json([]);

    // cache simple (re-usa tu cache y constantes)
    const key = `suggest:${q.toLowerCase()}`;
    const cached = cache.get(key);
    if (cached && (Date.now() - cached.ts) < CACHE_TTL_MS) {
      return res.json(cached.data);
    }

    const resp = await withTimeout(
      amadeus.referenceData.locations.get({
        keyword: q,
        subType: 'CITY,AIRPORT'
      }),
      10000
    );

    const out = (resp.data || []).map(x => {
      const code = x.iataCode || '';
      const city = x.address?.cityName || x.detailedName || x.name || '';
      const name = x.name || x.detailedName || city || '';
      const country = x.address?.countryCode || '';
      const sub = x.subType; // 'CITY' o 'AIRPORT'
      const label = sub === 'CITY'
        ? `${city} (${code}) — Ciudad${country ? ' · ' + country : ''}`
        : `${name} (${code}) — Aeropuerto${country ? ' · ' + country : ''}`;
      return { label, iataCode: code, subType: sub, name, detailed: { cityName: city, countryCode: country } };
    });

    const payload = out.slice(0, 12);
    cache.set(key, { ts: Date.now(), data: payload });
    res.json(payload);
  } catch (err) {
    console.error('Error /api/suggest:', err?.response?.result || err.message || err);
    res.status(500).json({ error: 'suggest_failed' });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`✅ Servidor corriendo en 0.0.0.0:${PORT}`);
});
