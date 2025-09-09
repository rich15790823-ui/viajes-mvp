// public/js/airlines.js

// Saca el carrier IATA (2 letras) desde el offer (Amadeus/compat)
export function extractCarrierCode(offer) {
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

  return out[0] || null;
}

// URL de los CDNs
const cdn1 = (c, size) => `https://pics.avs.io/${size}/${size}/${c}.png`;
const cdn2 = (c) => `https://images.kiwi.com/airlines/64/${c}.png`;

// Devuelve el <img> listo para insertar (con fallback)
export function airlineLogoHTML(code, { size = 44, alt = "Airline" } = {}) {
  const cc = (code || "").toUpperCase().trim();
  if (!cc) {
    return `<div class="airline-logo-fallback" style="width:${size}px;height:${size}px">${alt[0] ?? "N"}</div>`;
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
