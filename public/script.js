// script.js — Autocompletado sin tocar HTML (crea listas y maneja selección)
console.log('script.js Autocomplete ✅');

(function () {
  // Utilidad: debounce para no saturar la API
  function debounce(fn, ms = 250) {
    let t;
    return (...args) => {
      clearTimeout(t);
      t = setTimeout(() => fn(...args), ms);
    };
  }

  // Crea un <ul> flotante para sugerencias
  function buildList() {
    const ul = document.createElement('ul');
    ul.className = 'autocomplete';
    ul.style.position = 'absolute';
    ul.style.zIndex = '1000';
    ul.style.listStyle = 'none';
    ul.style.margin = '0';
    ul.style.padding = '0';
    ul.style.border = '1px solid #ccc';
    ul.style.background = '#fff';
    ul.style.maxHeight = '200px';
    ul.style.overflowY = 'auto';
    ul.style.display = 'none';
    document.body.appendChild(ul);
    return ul;
  }

  // Posiciona el <ul> debajo del input
  function placeList(ul, input) {
    const rect = input.getBoundingClientRect();
    ul.style.left = window.scrollX + rect.left + 'px';
    ul.style.top = window.scrollY + rect.bottom + 'px';
    ul.style.width = rect.width + 'px';
  }

  // Aplica autocompletado a un input por id
  function setupAutocomplete(inputId) {
    const input = document.getElementById(inputId);
    if (!input) return;

    // dataset.iata guardará el código elegido
    input.dataset.iata = '';

    const list = buildList();

    const closeList = () => {
      list.style.display = 'none';
      list.innerHTML = '';
    };

    const openList = () => {
      placeList(list, input);
      list.style.display = 'block';
    };

    // Renderiza opciones
    function renderOptions(items) {
      list.innerHTML = '';
      if (!items || items.length === 0) {
        closeList();
        return;
      }
      items.forEach((it) => {
        const li = document.createElement('li');
        li.textContent = it.label || it.iata || '';
        li.style.padding = '8px 10px';
        li.style.cursor = 'pointer';
        li.addEventListener('mouseenter', () => { li.style.background = '#eee'; });
        li.addEventListener('mouseleave', () => { li.style.background = '#fff'; });
        li.addEventListener('click', () => {
          input.value = it.label || it.iata || '';
          input.dataset.iata = it.iata || '';
          closeList();
        });
        list.appendChild(li);
      });
      openList();
    }

    // Llama a /api/airports con debounce
    const search = debounce(async () => {
      const q = input.value.trim();
      input.dataset.iata = ''; // si se cambia el texto, anulamos selección previa
      if (q.length < 2) {
        closeList();
        return;
      }
      try {
        const res = await fetch('/api/airports?q=' + encodeURIComponent(q));
        const data = await res.json();
        renderOptions(data.results || []);
      } catch (e) {
        console.error(e);
        closeList();
      }
    }, 300);

    // Eventos
    input.addEventListener('input', search);
    input.addEventListener('focus', () => {
      if (list.children.length > 0) openList();
    });
    input.addEventListener('blur', () => {
      // Cierra un poco después para permitir click en items
      setTimeout(closeList, 150);
    });
    window.addEventListener('resize', () => {
      if (list.style.display === 'block') placeList(list, input);
    });
    window.addEventListener('scroll', () => {
      if (list.style.display === 'block') placeList(list, input);
    });
  }

  // Utilidades ya existentes (formato)
  function fmt(iso) {
    if (!iso) return '-';
    const d = new Date(iso);
    return d.toLocaleString();
  }
  function num(n) {
    return Number(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
  function end(btn) {
    btn.disabled = false;
    btn.classList.remove('loading');
    btn.textContent = 'Buscar';
  }

  document.addEventListener('DOMContentLoaded', () => {
    // Placeholders (sin tocar HTML)
    const origin = document.getElementById('origin');
    const destination = document.getElementById('destination');
    if (origin) origin.setAttribute('placeholder', 'Ciudad o Aeropuerto');
    if (destination) destination.setAttribute('placeholder', 'Ciudad o Aeropuerto');

    // Autocomplete para ambos campos
    setupAutocomplete('origin');
    setupAutocomplete('destination');

    // Mostrar/ocultar regreso
    const roundTripCheckbox = document.getElementById('roundTrip');
    const returnDateWrap = document.getElementById('returnDateWrap');
    if (roundTripCheckbox && returnDateWrap) {
      roundTripCheckbox.addEventListener('change', () => {
        returnDateWrap.style.display = roundTripCheckbox.checked ? 'block' : 'none';
      });
    }

    // Submit del formulario
    const form = document.getElementById('form');
    const btn = document.getElementById('btn');
    const msg = document.getElementById('msg');
    const tabla = document.getElementById('tabla');
    const tbody = document.getElementById('tbody');

    if (!form) return;

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (!btn || !msg || !tabla || !tbody) return;

      msg.className = 'muted';
      msg.textContent = 'Buscando...';
      btn.disabled = true;
      btn.classList.add('loading');
      btn.textContent = 'Buscando…';
      tabla.style.display = 'none';
      tbody.innerHTML = '';

      const adultsEl = document.getElementById('adults');
      const currencyEl = document.getElementById('currency');
      const dateEl = document.getElementById('date');
      const returnDateEl = document.getElementById('returnDate');

      // **IMPORTANTE**: si el usuario eligió de la lista, usamos IATA
      // si no, intentamos tomar las primeras 3 letras "limpias"
      let originIata = (origin?.dataset?.iata || '').trim();
      let destIata   = (destination?.dataset?.iata || '').trim();

      if (!originIata && origin?.value) {
        originIata = origin.value.replace(/[^A-Za-z]/g, '').toUpperCase().slice(0, 3);
      }
      if (!destIata && destination?.value) {
        destIata = destination.value.replace(/[^A-Za-z]/g, '').toUpperCase().slice(0, 3);
      }

      const date = dateEl?.value?.trim() || '';
      const adults = (adultsEl?.value || '1').trim();
      const currency = currencyEl?.value || 'USD';
      const isRound = !!roundTripCheckbox?.checked;
      const returnDate = isRound ? (returnDateEl?.value?.trim() || '') : '';

      // Validaciones básicas
      if (!/^[A-Z]{3}$/.test(originIata)) {
        msg.className='error'; msg.textContent='Origen inválido. Elige de la lista o escribe una ciudad/aeropuerto.'; end(btn); return;
      }
      if (!/^[A-Z]{3}$/.test(destIata)) {
        msg.className='error'; msg.textContent='Destino inválido. Elige de la lista o escribe una ciudad/aeropuerto.'; end(btn); return;
      }
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        msg.className='error'; msg.textContent='Salida inválida (YYYY-MM-DD).'; end(btn); return;
      }
      if (isRound && !/^\d{4}-\d{2}-\d{2}$/.test(returnDate)) {
        msg.className='error'; msg.textContent='Regreso inválido (YYYY-MM-DD).'; end(btn); return;
      }

      try {
        const q = new URLSearchParams({
          origin: originIata,
          destination: destIata,
          date, adults, currency
        });
        if (returnDate) q.set('returnDate', returnDate);

        const res = await fetch('/api/vuelos?' + q.toString());
        const data = await res.json();

        if (!res.ok) {
          msg.className = 'error';
          msg.textContent = data?.error || 'Error en la búsqueda.';
          end(btn);
          return;
        }

        const resultados = data.results || [];
        if (resultados.length === 0) {
          msg.className = 'ok';
          msg.textContent = 'Sin resultados. Prueba otras fechas o rutas.';
          end(btn);
          return;
        }

        // Pintar filas (si tu servidor ya devuelve durOut/durRet, úsalo;
        // si no, usa el campo duration general del itinerario de ida)
        resultados.forEach((r, idx) => {
          const price = r.priceTotal ? `${r.currency || 'USD'} ${num(r.priceTotal)}` : '-';

          // Compatibilidad: si tu server no envía durOut/durRet aún
          const durOut = r.durOut || r.duration || '-';
          const durRet = r.durRet || (r.hasReturn ? (r.returnDuration || '-') : '—');

          const tr = document.createElement('tr');
          tr.innerHTML = `
            <td>${r.airline || '-'}<br><span class="mono">${r.airlineCode || ''}</span></td>
            <td><b>${r.departureIata || '-'}</b><br><span class="mono">${fmt(r.departureAt)}</span></td>
            <td><b>${r.arrivalIata || '-'}</b><br><span class="mono">${fmt(r.arrivalAt)}</span></td>
            <td>${durOut}</td>
            <td>${r.stops ?? '-'}</td>
            <td>${r.hasReturn ? `<b>${r.returnArrivalIata || '-'}</b><br><span class="mono">${fmt(r.returnArrivalAt)}</span>` : '—'}</td>
            <td>${durRet}</td>
            <td>${price}</td>
            <td><button type="button" data-idx="${idx}" class="btn-detalles">Ver detalles</button></td>
          `;
          tbody.appendChild(tr);

          // Detalles
          const trDet = document.createElement('tr');
          trDet.className = 'details';
          const legsOutText = (r.legs || []).map((s, i) =>
            `IDA ${i+1} — ${s.airlineCode} ${s.flightNumber}\n  ${s.from}  ${fmt(s.departAt)}  →  ${s.to}  ${fmt(s.arriveAt)}\n  Duración: ${s.duration || '-'}`
          ).join('\n\n');

          const legsRetText = (r.returnLegs || []).map((s, i) =>
            `VUELTA ${i+1} — ${s.airlineCode} ${s.flightNumber}\n  ${s.from}  ${fmt(s.departAt)}  →  ${s.to}  ${fmt(s.arriveAt)}\n  Duración: ${s.duration || '-'}`
          ).join('\n\n');

          const content = [
            legsOutText ? legsOutText : 'Sin detalle de ida.',
            r.hasReturn ? (legsRetText || 'Sin detalle de vuelta.') : ''
          ].filter(Boolean).join('\n\n');

          trDet.innerHTML = `
            <td colspan="9">
              <div style="display:none" id="det-${idx}">
                <pre>${content}</pre>
              </div>
            </td>`;
          tbody.appendChild(trDet);
        });

        // Toggle detalles (delegado)
        tbody.addEventListener('click', (ev) => {
          const b = ev.target.closest('.btn-detalles');
          if (!b) return;
          const i = b.getAttribute('data-idx');
          const panel = document.getElementById(`det-${i}`);
          const visible = panel.style.display !== 'none';
          panel.style.display = visible ? 'none' : 'block';
          b.textContent = visible ? 'Ver detalles' : 'Ocultar';
        }, { once: true });

        msg.className = 'ok';
        msg.textContent = `Listo: ${resultados.length} resultado(s).`;
        tabla.style.display = '';
      } catch (e) {
        console.error(e);
        msg.className = 'error';
        msg.textContent = 'Error de red o servidor.';
      } finally {
        end(btn);
      }
    });
  });
})();
