const API = (window.NAVUARA_API_BASE || '').replace(/\/+$/,''); // sin slash final

async function fetchJSON(url){
  const r = await fetch(url, { credentials: 'omit' });
  if(!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
}

function urlFlights({from,to,date}){
  return `${API}/api/flights?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}&date=${encodeURIComponent(date)}`;
}
function urlPlaces(q){
  return `${API}/api/places?q=${encodeURIComponent(q)}`;
}

// ... tu código de UI; ejemplo rápido:
document.addEventListener('DOMContentLoaded', ()=>{
  const $ = s => document.querySelector(s);
  $('#btn')?.addEventListener('click', async ()=>{
    const from = ($('#from')?.value || 'MEX').toUpperCase();
    const to   = ($('#to')?.value || 'CUN').toUpperCase();
    const date = $('#date')?.value || '2025-08-25';
    try{
      const data = await fetchJSON(urlFlights({from,to,date}));
      const list = data.results || data.flights || data.data?.items || [];
      $('#flights').innerHTML = list.map(f=>`<div>${(f.airlineName||f.airline||'').toUpperCase()} ${f.origin}→${f.destination}</div>`).join('');
    }catch(e){
      alert('No se pudo consultar la API');
      console.error(e);
    }
  });
});
