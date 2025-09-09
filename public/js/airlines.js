// public/js/airlines.js

// 🔎 Mapa por si el offer trae solo el nombre de la aerolínea
const NAME_TO_CODE = {
  "IBERIA": "IB",
  "TURKISH AIRLINES": "TK",
  "KLM": "KL",
  "AIR FRANCE": "AF",
  "AMERICAN AIRLINES": "AA",
  "UNITED": "UA",
  "DELTA": "DL",
  "AEROMEXICO": "AM",
  "LATAM": "LA",
  "LUFTHANSA": "LH",
  "BRITISH AIRWAYS": "BA",
  "RYANAIR": "FR",
  "VUELING": "VY",
  "EASYJET": "U2",
  "WIZZAIR": "W6",
  "QATAR AIRWAYS": "QR",
  "EMIRATES": "EK",
  "QANTAS": "QF",
  "COPA AIRLINES": "CM",
  "AVIANCA": "AV",
  "JETBLUE": "B6",
  "SPIRIT": "NK",
  "ALASKA AIRLINES": "AS",
  "AIR CANADA": "AC",
};

export function codeFromName(name) {
  if (!name) return null;
  const key = String(name).toUpperCase().trim();
  return NAME_TO_CODE[key] || null;
}

// 👉 Intenta sacar un código IATA (2 letras) desde el offer
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

  // ⛑️ Fallback: si no vino código, intenta por el nombre
  if (!out.length) {
    const name =
      offer?.airlineName ||
      offer?.carrierName ||
      offer?.itineraries?.[0]?.segments?.[0]?.carrierName ||
      null;
    const byName = codeFromName(name);
    if (byName) out.push(byName);
  }

  return out[0] || null;
}

// CDNs de logos
const cdn1 = (c, n) => `https://pics.avs.io/${n}/${n}/${c}.png`;
const cdn2 = (c) => `https://images.kiwi.com/airlines/64/${c}.png`;

// Devuelve el <img> listo para insertar
export function airlineLogoHTML(code, { size = 44, alt = "Airline" } = {}) {
  const cc = (code || "").toUpperCase().trim();
  if (!cc) {
    return `<div class="airline-logo-fallback" style="width:${size}px;height:${size}px">${(alt||'N')[0]}</div>`;
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
