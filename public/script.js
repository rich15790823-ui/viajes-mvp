document.getElementById('searchForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const from = document.getElementById('from').value.trim().toUpperCase();
  const to   = document.getElementById('to').value.trim().toUpperCase();
  const date = document.getElementById('date').value;

  // En el PASO 2 conectamos esto a tu backend de Render:
  const url = `/api/search?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}${date?`&date=${encodeURIComponent(date)}`:''}`;

  const box = document.getElementById('results');
  box.innerHTML = '<p>Buscando vuelos…</p>';

  try {
    const r = await fetch(url);
    if (!r.ok) throw new Error('Error de red/servidor');
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
    console.error(e);
    box.innerHTML = '<p>Error al buscar. En el PASO 2 revisamos el backend.</p>';
  }
});
