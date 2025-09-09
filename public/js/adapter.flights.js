// public/js/adapter.flights.js
// Render de ofertas de vuelo (HTML/JS plano) con:
// - Logo de aerolínea
// - Itinerario de IDA y VUELTA (si existe)
// - Detalle de escalas y tiempos
// - Precio formateado
//
// Requisitos:
// 1) Cargar scripts como módulo en public/index.html:
//    <script type="module" src="./script.js"></script>
// 2) Tener este archivo y airlines.js en public/js/
// 3) Desde tu script principal, llama a window.renderOffers(container, offers)

import { extractCarrierCode, airlineLogoHTML } from "./airlines.js";

/* =======================
   Utils de tiempo/formatos
   ======================= */
function toDate(x) {
  // Amadeus entrega ISO como "2025-09-20T09:10:00"
  try { return new Date(x); } catch { return null; }
}
function fmtTime(iso) {
  const d = toDate(iso);
  if (!d || isNaN(d.getTime())) return "--:--";
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}
function fmtDate(iso) {
  const d = toDate(iso);
  if (!d || isNaN(d.getTime())) return "";
  return d.toLocaleDateString([], { day: "2-digit", month: "short" });
}
function diffMinutes(aISO, bISO) {
  const a = toDate(aISO), b = toDate(bISO);
  if (!a || !b) return 0;
  return Math.max(0, Math.round((b.getTime() - a.getTime()) / 60000));
}
function fmtHM(min) {
  const h = Math.floor(min / 60), m = min % 60;
  return `${h}h ${m}m`;
}
function parseISODurToMin(isoDur) {
  // Formato típico "PT8H35M"
  if (!isoDur || typeof isoDur !== "string") return null;
  const m = isoDur.match(/PT(?:(\d+)H)?(?:(\d+)M)?/i);
  if (!m) return null;
  const h = parseInt(m[1] || "0", 10);
  const mi = parseInt(m[2] || "0", 10);
  return h * 60 + mi;
}

/* =======================
   Escalas (Layovers)
   ======================= */
function computeLayovers(segments) {
  const out = [];
  if (!Array.isArray(segments)) return out;
  for (let i = 0; i < segments.length - 1; i++) {
    const cur = segments[i];
    const nxt = segments[i + 1];
    const minutes = diffMinutes(cur?.arrival?.at, nxt?.departure?.at);
    out.push({
      from: cur?.arrival?.iataCode || "—",
      to: nxt?.departure?.iataCode || "—",
      arrival: cur?.arrival?.at,
      departureNext: nxt?.departure?.at,
      minutes,
    });
  }
  return out;
}

/* =======================
   Nombres y códigos
   ======================= */
function pickAirlineName(offer, carrierCode) {
  // Intenta distintas rutas comunes; si no, usa el código
  return (
    offer?.airlineName ||
    offer?.carrierName ||
    offer?.itineraries?.[0]?.segments?.[0]?.carrierName ||
    (carrierCode ? `Aerolínea ${carrierCode}` : "Aerolínea")
  );
}

function flightNumber(seg) {
  const c = seg?.carrierCode || seg?.marketingCarrierCode || "";
  const n = seg?.number || "";
  return c && n ? `${c}${n}` : (n || c || "");
}

/* =======================
   Precio
   ======================= */
function fmtPrice(offer) {
  const amt = offer?.price?.grandTotal ?? offer?.price?.total;
  const cur = offer?.price?.currency || offer?.price?.currencyCode || "USD";
  if (!amt) return "";
  try {
    return new Intl.NumberFormat("es-MX", { style: "currency", currency: cur }).format(Number(amt));
  } catch {
    return `${amt} ${cur}`;
  }
}

/* =======================
   Render de segmentos
   ======================= */
function renderSegmentRow(seg) {
  const dep = seg?.departure?.iataCode || "—";
  const arr = seg?.arrival?.iataCode || "—";
  const depT = fmtTime(seg?.departure?.at);
  const arrT = fmtTime(seg?.arrival?.at);
  const fn = flightNumber(seg);
  return `
    <div class="seg-row">
      <div class="seg-codes">
        <span class="seg-iata">${dep}</span>
        <span class="seg-arrow">→</span>
        <span class="seg-iata">${arr}</span>
      </div>
      <div class="seg-times">
        <span>${depT}</span>
        <span class="seg-dash">–</span>
        <span>${arrT}</span>
      </div>
      <div class="seg-meta">${fn ? `Vuelo ${fn}` : ""}</div>
    </div>
  `;
}

/* =======================
   Render de layovers
   ======================= */
function renderLayovers(segments) {
  const lays = computeLayovers(segments);
  if (!lays.length) return "";
  const items = lays
    .map(
      (x) => `
      <div class="lay-item">
        <div>
          <div class="lay-title">Escala en ${x.from}</div>
          <div class="lay-time">
            ${fmtTime(x.arrival)} → ${fmtTime(x.departureNext)}
          </div>
        </div>
        <div class="lay-dur">${fmtHM(x.minutes)}</div>
      </div>`
    )
    .join("");
  return `<div class="lay-list">${items}</div>`;
}

/* =======================
   Render de itinerario (IDA/VUELTA)
   ======================= */
function renderItinerary(it, etiqueta = "Itinerario") {
  if (!it) return "";
  const segs = it.segments || [];
  // Duración total (pref: la que viene del API; si no, la calculamos)
  let totalMin = null;
  if (it.duration) totalMin = parseISODurToMin(it.duration);
  if (totalMin == null && segs.length) {
    totalMin = diffMinutes(segs[0]?.departure?.at, segs[segs.length - 1]?.arrival?.at);
  }
  const durText = totalMin != null ? fmtHM(totalMin) : "";

  const segsHTML = segs.map(renderSegmentRow).join("");

  // Toggle para escalas
  const layHTML = renderLayovers(segs);
  const hasLayovers = (segs?.length || 0) > 1;

  const firstDep = segs?.[0]?.departure?.at || "";
  const lastArr = segs?.[segs.length - 1]?.arrival?.at || "";

  return `
    <section class="itin">
      <div class="itin-header">
        <div class="itin-tag">${etiqueta}</div>
        <div class="itin-date">
          ${fmtDate(firstDep)} · ${durText}
        </div>
      </div>
      <div class="itin-segs">
        ${segsHTML || "<div class='seg-empty'>Sin segmentos</div>"}
      </div>
      ${
        hasLayovers
          ? `
        <button type="button" class="lay-toggle">Ver escalas y tiempos</button>
        <div class="lay-container" hidden>
          ${layHTML}
        </div>`
          : ""
      }
    </section>
  `;
}

/* =======================
   Card de una oferta
   ======================= */
function createOfferCard(offer) {
  const carrier = extractCarrierCode(offer);
  const airlineName = pickAirlineName(offer, carrier);
  const price = fmtPrice(offer);

  const ida = offer?.itineraries?.[0] || null;
  const vuelta = offer?.itineraries?.[1] || null;

  // Root
  const card = document.createElement("article");
  card.className = "flight-card";

  // Header con logo + nombre
  const headerHTML = `
    <div class="airline-chip">
      ${airlineLogoHTML(carrier, { size: 44, alt: airlineName })}
      <div class="airline-title">
        <div class="name">${airlineName}</div>
        <div class="code">${carrier || "N/A"}</div>
      </div>
      <div class="price">${price}</div>
    </div>
  `;

  // Cuerpo (itinerarios)
  const bodyHTML = `
    ${renderItinerary(ida, "Ida")}
    ${vuelta ? renderItinerary(vuelta, "Vuelta") : ""}
  `;

  card.innerHTML = headerHTML + bodyHTML;

  // Comportamiento: toggles de layovers
  card.querySelectorAll(".lay-toggle").forEach((btn) => {
    btn.addEventListener("click", () => {
      const cont = btn.nextElementSibling;
      const isOpen = !cont.hasAttribute("hidden");
      if (isOpen) cont.setAttribute("hidden", "");
      else cont.removeAttribute("hidden");
      btn.textContent = isOpen ? "Ver escalas y tiempos" : "Ocultar escalas";
    });
  });

  return card;
}

/* =======================
   Render de todas las ofertas
   ======================= */
export function renderOffers(container, offers) {
  // container: selector o elemento
  const root = typeof container === "string" ? document.querySelector(container) : container;
  if (!root) return;

  // Limpia
  root.innerHTML = "";

  if (!Array.isArray(offers) || !offers.length) {
    root.innerHTML = `<div class="no-results">No hay vuelos disponibles.</div>`;
    return;
  }

  // Render cards
  const frag = document.createDocumentFragment();
  offers.forEach((offer, i) => {
    // opcional: expón el último offer para debug en consola
    if (i === offers.length - 1) window.lastOffer = offer;
    const card = createOfferCard(offer);
    frag.appendChild(card);
  });
  root.appendChild(frag);
}

// También lo dejamos accesible globalmente por si tu script actual lo llama así:
window.renderOffers = renderOffers;
