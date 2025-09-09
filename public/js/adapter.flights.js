// public/js/adapter.flights.js
import { extractCarrierCode, airlineLogoHTML } from "./airlines.js";

function toDate(x){ try{return new Date(x);}catch{return null;} }
function fmtTime(iso){ const d=toDate(iso); return (!d||isNaN(d))?"--:--":d.toLocaleTimeString([], {hour:"2-digit",minute:"2-digit"}); }
function fmtDate(iso){ const d=toDate(iso); return (!d||isNaN(d))?"":d.toLocaleDateString([], {day:"2-digit",month:"short"}); }
function diffMinutes(a,b){ const A=toDate(a), B=toDate(b); if(!A||!B) return 0; return Math.max(0, Math.round((B-A)/60000)); }
function fmtHM(m){ const h=Math.floor(m/60), mm=m%60; return `${h}h ${mm}m`; }
function parseISODurToMin(s){ const m = typeof s==="string" && s.match(/PT(?:(\d+)H)?(?:(\d+)M)?/i); if(!m) return null; return (parseInt(m[1]||"0")*60)+(parseInt(m[2]||"0")); }

function computeLayovers(segs){
  const out=[]; for(let i=0;i<(segs?.length||0)-1;i++){ const cur=segs[i], nxt=segs[i+1];
    out.push({ from:cur?.arrival?.iataCode, to:nxt?.departure?.iataCode, arrival:cur?.arrival?.at, departureNext:nxt?.departure?.at, minutes:diffMinutes(cur?.arrival?.at, nxt?.departure?.at) });
  } return out;
}

function pickAirlineName(offer, code){
  return offer?.airlineName || offer?.carrierName || offer?.itineraries?.[0]?.segments?.[0]?.carrierName || (code?`Aerolínea ${code}`:"Aerolínea");
}
function flightNumber(seg){ const c = seg?.carrierCode || seg?.marketingCarrierCode || ""; const n = seg?.number || ""; return c&&n?`${c}${n}`:(n||c||""); }

function fmtPrice(offer){
  const amt = offer?.price?.grandTotal ?? offer?.price?.total;
  const cur = offer?.price?.currency || offer?.price?.currencyCode || "USD";
  if (!amt) return ""; try { return new Intl.NumberFormat("es-MX",{style:"currency",currency:cur}).format(Number(amt)); } catch { return `${amt} ${cur}`; }
}

function renderSegmentRow(seg){
  const dep = seg?.departure?.iataCode || "—";
  const arr = seg?.arrival?.iataCode || "—";
  const depT = fmtTime(seg?.departure?.at);
  const arrT = fmtTime(seg?.arrival?.at);
  const fn = flightNumber(seg);
  return `
    <div class="seg-row">
      <div class="seg-codes"><span class="seg-iata">${dep}</span><span class="seg-arrow">→</span><span class="seg-iata">${arr}</span></div>
      <div class="seg-times"><span>${depT}</span><span class="seg-dash">–</span><span>${arrT}</span></div>
      <div class="seg-meta">${fn ? `Vuelo ${fn}` : ""}</div>
    </div>
  `;
}
function renderLayovers(segs){
  const lays = computeLayovers(segs||[]);
  if(!lays.length) return "";
  return `<div class="lay-list">${
    lays.map(x=>`
      <div class="lay-item">
        <div><div class="lay-title">Escala en ${x.from}</div><div class="lay-time">${fmtTime(x.arrival)} → ${fmtTime(x.departureNext)}</div></div>
        <div class="lay-dur">${fmtHM(x.minutes)}</div>
      </div>`).join("")
  }</div>`;
}
function renderItinerary(it, tag){
  if(!it) return "";
  const segs = it.segments || [];
  let tot = it.duration ? parseISODurToMin(it.duration) : null;
  if(tot==null && segs.length) tot = diffMinutes(segs[0]?.departure?.at, segs[segs.length-1]?.arrival?.at);
  const segsHTML = segs.map(renderSegmentRow).join("");
  const laysHTML = renderLayovers(segs);
  const hasLay = (segs?.length||0)>1;
  const firstDep = segs?.[0]?.departure?.at || "";
  return `
    <section class="itin">
      <div class="itin-header">
        <div class="itin-tag">${tag}</div>
        <div class="itin-date">${fmtDate(firstDep)} · ${tot!=null?fmtHM(tot):""}</div>
      </div>
      <div class="itin-segs">${segsHTML || "<div class='seg-empty'>Sin segmentos</div>"}</div>
      ${hasLay ? `<button type="button" class="lay-toggle">Ver escalas y tiempos</button><div class="lay-container" hidden>${laysHTML}</div>` : ""}
    </section>
  `;
}

function createOfferCard(offer){
  const code = extractCarrierCode(offer);
  const name = pickAirlineName(offer, code);
  const price = fmtPrice(offer);
  // debug para ver qué trae tu API:
  console.debug("[NAVUARA][logo]", { code, name, validatingAirlineCodes: offer?.validatingAirlineCodes, seg0: offer?.itineraries?.[0]?.segments?.[0] });

  const ida = offer?.itineraries?.[0] || null;
  const vuelta = offer?.itineraries?.[1] || null;

  const card = document.createElement("article");
  card.className = "flight-card";
  card.innerHTML = `
    <div class="airline-chip">
      ${airlineLogoHTML(code, { size: 44, alt: name })}
      <div class="airline-title">
        <div class="name">${name}</div>
        <div class="code">${code || "N/A"}</div>
      </div>
      <div class="price">${price}</div>
    </div>
    ${renderItinerary(ida, "Ida")}
    ${vuelta ? renderItinerary(vuelta, "Vuelta") : ""}
  `;

  card.querySelectorAll(".lay-toggle").forEach(btn=>{
    btn.addEventListener("click", ()=>{
      const cont = btn.nextElementSibling;
      const open = !cont.hasAttribute("hidden");
      if (open) cont.setAttribute("hidden",""); else cont.removeAttribute("hidden");
      btn.textContent = open ? "Ver escalas y tiempos" : "Ocultar escalas";
    });
  });

  return card;
}

export function renderOffers(container, offers){
  const root = typeof container==="string" ? document.querySelector(container) : container;
  if(!root) return;
  root.innerHTML = "";
  if(!Array.isArray(offers) || !offers.length){
    root.innerHTML = `<div class="no-results">No hay vuelos disponibles.</div>`; return;
  }
  const frag = document.createDocumentFragment();
  offers.forEach((offer,i)=>{ if(i===offers.length-1) window.lastOffer = offer; frag.appendChild(createOfferCard(offer)); });
  root.appendChild(frag);
}

window.renderOffers = renderOffers;
