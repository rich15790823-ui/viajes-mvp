// public/js/adapter.standalone.js
// Versión SIN módulos. Expone window.renderOffers directamente (y pinta logos).

(function (global) {
  // --- Helpers de aerolíneas (código y logo) ---
  const NAME_TO_CODE = {
    "IBERIA":"IB","TURKISH AIRLINES":"TK","KLM":"KL","AIR FRANCE":"AF","AMERICAN AIRLINES":"AA",
    "UNITED":"UA","DELTA":"DL","AEROMEXICO":"AM","LATAM":"LA","LUFTHANSA":"LH","BRITISH AIRWAYS":"BA",
    "RYANAIR":"FR","VUELING":"VY","EASYJET":"U2","WIZZAIR":"W6","QATAR AIRWAYS":"QR","EMIRATES":"EK",
    "QANTAS":"QF","COPA AIRLINES":"CM","AVIANCA":"AV","JETBLUE":"B6","SPIRIT":"NK","ALASKA AIRLINES":"AS",
    "AIR CANADA":"AC"
  };

  function codeFromName(name) {
    if (!name) return null;
    const key = String(name).toUpperCase().trim();
    return NAME_TO_CODE[key] || null;
  }

  function extractCarrierCode(offer) {
    const out = [];
    const add = (v) => {
      if (typeof v === "string") {
        const cc = v.toUpperCase().replace(/[^A-Z0-9]/g, "");
        if (cc.length === 2 && !out.includes(cc)) out.push(cc);
      }
    };

    if (Array.isArray(offer?.validatingAirlineCodes)) offer.validatingAirlineCodes.forEach(add);
    add(offer?.validatingCarrierCode);

    (offer?.itineraries || []).forEach((it) =>
      (it?.segments || []).forEach((s) => {
        add(s?.carrierCode);
        add(s?.marketingCarrierCode);
        add(s?.operating?.carrierCode);
      })
    );

    if (!out.length) {
      const byName = codeFromName(
        offer?.airlineName || offer?.carrierName || offer?.itineraries?.[0]?.segments?.[0]?.carrierName
      );
      if (byName) out.push(byName);
    }
    return out[0] || null;
  }

  const cdn1 = (c, n) => `https://pics.avs.io/${n}/${n}/${c}.png`;
  const cdn2 = (c)     => `https://images.kiwi.com/airlines/64/${c}.png`;

  function airlineLogoHTML(code, { size = 44, alt = "Airline" } = {}) {
    const cc = (code || "").toUpperCase().trim();
    if (!cc) {
      return `<div class="airline-logo-fallback" style="width:${size}px;height:${size}px">${(alt||"N")[0]}</div>`;
    }
    return `
      <img
        src="${cdn1(cc, size)}"
        alt="${alt} logo"
        width="${size}" height="${size}"
        class="airline-logo"
        loading="lazy"
        onerror="if(!this.dataset.fb){ this.dataset.fb=1; this.src='${cdn2(cc)}'; }"
        style="width:${size}px;height:${size}px"
      />
    `;
  }

  // --- Utils tiempo/formatos ---
  const toDate = (x) => { try { return new Date(x); } catch { return null; } };
  const fmtTime = (iso) => { const d=toDate(iso); return (!d||isNaN(d))?"--:--":d.toLocaleTimeString([], {hour:"2-digit",minute:"2-digit"}); };
  const fmtDate = (iso) => { const d=toDate(iso); return (!d||isNaN(d))?"":d.toLocaleDateString([], {day:"2-digit",month:"short"}); };
  const diffMinutes = (a,b) => { const A=toDate(a), B=toDate(b); if(!A||!B) return 0; return Math.max(0, Math.round((B-A)/60000)); };
  const fmtHM = (m) => `${Math.floor(m/60)}h ${m%60}m`;
  const parseISODurToMin = (s) => { const m = typeof s==="string" && s.match(/PT(?:(\d+)H)?(?:(\d+)M)?/i); if(!m) return null; return (parseInt(m[1]||"0")*60)+(parseInt(m[2]||"0")); };

  // --- Layovers ---
  function computeLayovers(segs=[]) {
    const out=[]; for (let i=0;i<segs.length-1;i++){
      const cur=segs[i], nxt=segs[i+1];
      out.push({ from:cur?.arrival?.iataCode, to:nxt?.departure?.iataCode,
        arrival:cur?.arrival?.at, departureNext:nxt?.departure?.at,
        minutes:diffMinutes(cur?.arrival?.at, nxt?.departure?.at) });
    } return out;
  }

  // --- Ayudas ---
  const flightNumber = (s) => { const c=s?.carrierCode||s?.marketingCarrierCode||""; const n=s?.number||""; return c&&n?`${c}${n}`:(n||c||""); };
  const fmtPrice = (offer) => {
    const amt = offer?.price?.grandTotal ?? offer?.price?.total;
    const cur = offer?.price?.currency || offer?.price?.currencyCode || "USD";
    if (!amt) return "";
    try { return new Intl.NumberFormat("es-MX",{style:"currency",currency:cur}).format(Number(amt)); }
    catch { return `${amt} ${cur}`; }
  };
  const pickAirlineName = (offer, code) =>
    offer?.airlineName || offer?.carrierName || offer?.itineraries?.[0]?.segments?.[0]?.carrierName || (code?`Aerolínea ${code}`:"Aerolínea");

  // --- Render ---
  function renderSegmentRow(seg){
    return `
      <div class="seg-row">
        <div class="seg-codes"><span class="seg-iata">${seg?.departure?.iataCode||"—"}</span><span class="seg-arrow">→</span><span class="seg-iata">${seg?.arrival?.iataCode||"—"}</span></div>
        <div class="seg-times"><span>${fmtTime(seg?.departure?.at)}</span><span class="seg-dash">–</span><span>${fmtTime(seg?.arrival?.at)}</span></div>
        <div class="seg-meta">${flightNumber(seg) ? `Vuelo ${flightNumber(seg)}` : ""}</div>
      </div>`;
  }

  function renderLayovers(segs){
    const lays = computeLayovers(segs);
    if(!lays.length) return "";
    return `<div class="lay-list">${
      lays.map(x=>`
        <div class="lay-item">
          <div>
            <div class="lay-title">Escala en ${x.from}</div>
            <div class="lay-time">${fmtTime(x.arrival)} → ${fmtTime(x.departureNext)}</div>
          </div>
          <div class="lay-dur">${fmtHM(x.minutes)}</div>
        </div>`).join("")
    }</div>`;
  }

  function renderItinerary(it, tag){
    if(!it) return "";
    const segs = it.segments || [];
    let tot = it.duration ? parseISODurToMin(it.duration) : null;
    if(tot==null && segs.length) tot = diffMinutes(segs[0]?.departure?.at, segs[segs.length-1]?.arrival?.at);
    return `
      <section class="itin">
        <div class="itin-header">
          <div class="itin-tag">${tag}</div>
          <div class="itin-date">${fmtDate(segs?.[0]?.departure?.at || "")} · ${tot!=null?fmtHM(tot):""}</div>
        </div>
        <div class="itin-segs">${segs.map(renderSegmentRow).join("") || "<div class='seg-empty'>Sin segmentos</div>"}</div>
        ${
          (segs.length>1)
          ? `<button type="button" class="lay-toggle">Ver escalas y tiempos</button><div class="lay-container" hidden>${renderLayovers(segs)}</div>`
          : ""
        }
      </section>`;
  }

  function createOfferCard(offer){
    const code = extractCarrierCode(offer);
    const name = pickAirlineName(offer, code);
    const price = fmtPrice(offer);

    const ida    = offer?.itineraries?.[0] || null;
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

  function renderOffers(container, offers){
    const root = typeof container==="string" ? document.querySelector(container) : container;
    if(!root) return;
    root.innerHTML = "";
    if(!Array.isArray(offers) || !offers.length){
      root.innerHTML = `<div class="no-results">No hay vuelos disponibles.</div>`; return;
    }
    const frag = document.createDocumentFragment();
    offers.forEach((offer,i)=>{ if(i===offers.length-1) global.lastOffer = offer; frag.appendChild(createOfferCard(offer)); });
    root.appendChild(frag);
  }

  // 👉 Exporta global
  global.renderOffers = renderOffers;
  console.log("[standalone] renderOffers =", typeof global.renderOffers);
})(window);
