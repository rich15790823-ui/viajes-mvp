// public/js/logo-patcher.js
(function () {
  const NAME_TO_CODE = {
    "IBERIA":"IB","TURKISH AIRLINES":"TK","KLM":"KL","AIR FRANCE":"AF","AMERICAN AIRLINES":"AA",
    "UNITED":"UA","DELTA":"DL","AEROMEXICO":"AM","LATAM":"LA","LUFTHANSA":"LH","BRITISH AIRWAYS":"BA",
    "RYANAIR":"FR","VUELING":"VY","EASYJET":"U2","WIZZAIR":"W6","QATAR AIRWAYS":"QR","EMIRATES":"EK",
    "QANTAS":"QF","COPA AIRLINES":"CM","AVIANCA":"AV","JETBLUE":"B6","SPIRIT":"NK","ALASKA AIRLINES":"AS",
    "AIR CANADA":"AC"
  };

  const cdn1 = (c, n) => `https://pics.avs.io/${n}/${n}/${c}.png`;
  const cdn2 = (c)     => `https://images.kiwi.com/airlines/64/${c}.png`;

  function codeFromName(name) {
    if (!name) return null;
    const key = String(name).toUpperCase().trim();
    return NAME_TO_CODE[key] || null;
  }

  function makeLogo(code, name, size=44) {
    const div = document.createElement("div");
    div.className = "airline-logo-wrap";
    if (!code) {
      div.innerHTML = `<div class="airline-logo-fallback" style="width:${size}px;height:${size}px;display:flex;align-items:center;justify-content:center;border-radius:12px;background:rgba(255,255,255,.12);font-weight:700">${(name||"A")[0]}</div>`;
      return div;
    }
    const img = document.createElement("img");
    img.width = size; img.height = size;
    img.alt = `${name||"Airline"} logo`;
    img.className = "airline-logo";
    img.style.cssText = "width:"+size+"px;height:"+size+"px;border-radius:12px;background:rgba(255,255,255,.08);padding:6px;object-fit:contain";
    img.src = cdn1(code, size);
    img.onerror = () => { if (!img.dataset.fb){ img.dataset.fb=1; img.src = cdn2(code); } };
    div.appendChild(img);
    return div;
  }

  // Heurística para leer nombre/código dentro de una card
  function extractNameAndCode(card) {
    // 1) busca texto grande al inicio (ej: "KLM ROYAL DUTCH AIRLINES")
    const nameCand = card.querySelector('h3, h4, [data-airline-name], .airline-name, .title, .name');
    let name = nameCand?.textContent?.trim() || "";

    // 2) intenta leer un code visible (ej: "IB", "KL")
    let code = (card.querySelector('.airline-code, [data-airline-code]')?.textContent || "").trim().toUpperCase();

    // 3) si el code no está, intenta deducirlo por el nombre
    if (!code || code.length !== 2) {
      if (name) code = codeFromName(name) || "";
    }
    // 4) como último recurso, busca un bloque con letras mayúsculas largas (nombre)
    if (!name) {
      const firstBig = Array.from(card.querySelectorAll("div, span, p"))
        .map(el => el.textContent?.trim() || "")
        .find(t => /^[A-Z0-9 \-]{6,}$/.test(t) && !/MXN|\$|\d{1,2}:\d{2}/.test(t));
      if (firstBig) {
        name = firstBig;
        if (!code) code = codeFromName(name) || "";
      }
    }
    if (code) code = code.toUpperCase().replace(/[^A-Z0-9]/g,"");
    if (code && code.length !== 2) code = ""; // código inválido
    return { name, code: code || null };
  }

  function placeLogo(card) {
    if (card.dataset.logoReady === "1") return;
    const { name, code } = extractNameAndCode(card);
    // contenedor típico del header (ajústalo si quieres)
    let header = card.querySelector(".airline-chip, .header, .top, .card-header") || card.firstElementChild;
    if (!header) header = card;

    // ya existe un logo?
    if (header.querySelector(".airline-logo, .airline-logo-fallback")) {
      card.dataset.logoReady = "1";
      return;
    }

    const logo = makeLogo(code, name, 44);

    // Inserta el logo al principio del header
    header.insertBefore(logo, header.firstChild);
    card.dataset.logoReady = "1";
  }

  function scan() {
    // intenta encontrar tarjetas de vuelo. Heurísticas de clase/estructura:
    const cards = document.querySelectorAll(
      ".flight-card, article, .card"
    );
    cards.forEach((card) => {
      // solo si parece tarjeta de vuelo (tiene un botón "Select Flight" o algo de horarios)
      const hasSelect = !!card.querySelector("button, a");
      const hasTime = /:/.test(card.textContent || "");
      if (hasSelect && hasTime) placeLogo(card);
    });
  }

  // Observa cambios en #results (o en todo el body si no existe)
  const container = document.querySelector("#results") || document.body;
  const mo = new MutationObserver(() => { scan(); });
  mo.observe(container, { childList: true, subtree: true });

  // Primer barrido
  scan();
})();
