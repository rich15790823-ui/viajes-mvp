const AIR={AM:"Aeroméxico",VB:"Viva Aerobus",Y4:"Volaris"};
const fmtTime=s=>{const d=new Date(s); return isNaN(d)?"-":d.toLocaleTimeString([], {hour:"2-digit",minute:"2-digit"});};
const $=(s)=>document.querySelector(s);

function card(f){
  const code=(f.airlineName||f.airline||"").toUpperCase();
  const name=AIR[code]||code||"—";
  return `
    <div class="card">
      <div class="top">
        <div>
          <div style="font-weight:700">${name} <span class="muted">(${code})</span></div>
          <div class="muted">${f.origin} → ${f.destination}</div>
        </div>
        <div style="text-align:right">
          <div>Sale: <strong>${fmtTime(f.departureTime||f.depart_at)}</strong></div>
          <div>Llega: <strong>${fmtTime(f.arrivalTime||f.arr_time)}</strong></div>
        </div>
      </div>
      <div style="margin-top:6px" class="muted">
        ${f.price?.amount ? 'Desde: <strong>'+ (f.price.currency||"MXN") + ' ' + f.price.amount + '</strong>' : (f.price_mxn? 'Desde: <strong>MXN '+f.price_mxn+'</strong>' : '')}
      </div>
      ${f.deeplink ? '<a class="link" href="'+f.deeplink+'" target="_blank">Reservar</a>' : ''}
    </div>`;
}

async function fetchFlights(params){
  const url = `/api/flights?from=${encodeURIComponent(params.from)}&to=${encodeURIComponent(params.to)}&date=${params.date}`;
  const r = await fetch(url); const j = await r.json();
  return j.results || j.flights || j.data?.items || [];
}

async function go(){
  const params = {
    from: ($("#from").value||"MEX").toUpperCase(),
    to: ($("#to").value||"CUN").toUpperCase(),
    date: $("#date").value || "2025-08-25"
  };
  const list = await fetchFlights(params);
  $("#flights").innerHTML = list.map(card).join("");
}

document.addEventListener("DOMContentLoaded", ()=>{
  $("#btn").addEventListener("click", go);
});
