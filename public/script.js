// === script.js — robusto para que el botón Buscar SIEMPRE funcione ===
console.log("script.js cargado ✅ (build:", Date.now(), ")");

(function () {
  // Debounce util
  function debounce(fn, ms = 250) {
    let t; return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
  }

  function fmt(iso) {
    if (!iso) return "-";
    const d = new Date(iso);
    return d.toLocaleString();
  }
  function num(n) {
    return Number(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
  function end(btn) {
    if (!btn) return;
    btn.disabled = false;
    btn.classList.remove("loading");
    btn.textContent = "Buscar";
  }
  // Coloca placeholder por JS (sin tocar HTML)
  document.addEventListener("DOMContentLoaded", () => {
    const origin = document.getElementById("origin");
    const destination = document.getElementById("destination");
    if (origin) origin.setAttribute("placeholder", "Ciudad o Aeropuerto");
    if (destination) destination.setAttribute("placeholder", "Ciudad o Aeropuerto");
  });

  // ------- Autocomplete mínimo (opcional: comenta si da igual) -------
  function buildList() {
    const ul = document.createElement("ul");
    ul.className = "autocomplete";
    Object.assign(ul.style, {
      position: "absolute", zIndex: "1000", listStyle: "none",
      margin: "0", padding: "0", border: "1px solid #ccc",
      background: "#fff", maxHeight: "200px", overflowY: "auto", display: "none"
    });
    document.body.appendChild(ul);
    return ul;
  }
  function placeList(ul, input) {
    const rect = input.getBoundingClientRect();
    ul.style.left = window.scrollX + rect.left + "px";
    ul.style.top = window.scrollY + rect.bottom + "px";
    ul.style.width = rect.width + "px";
  }
  function setupAutocomplete(inputId) {
    const input = document.getElementById(inputId);
    if (!input) return;
    input.dataset.iata = "";
    const list = buildList();
    const closeList = () => { list.style.display = "none"; list.innerHTML = ""; };
    const openList = () => { placeList(list, input); list.style.display = "block"; };
    function render(items) {
      list.innerHTML = "";
      if (!items || !items.length) return closeList();
      items.forEach((it) => {
        const li = document.createElement("li");
        li.textContent = it.label || it.iata || "";
        li.style.padding = "8px 10px"; li.style.cursor = "pointer";
        li.addEventListener("mouseenter", () => li.style.background = "#eee");
        li.addEventListener("mouseleave", () => li.style.background = "#fff");
        li.addEventListener("click", () => {
          input.value = it.label || it.iata || "";
          input.dataset.iata = it.iata || "";
          closeList();
        });
        list.appendChild(li);
      });
      openList();
    }
    const search = debounce(async () => {
      const q = input.value.trim();
      input.dataset.iata = "";
      if (q.length < 2) return closeList();
      try {
        const res = await fetch("/api/airports?q=" + encodeURIComponent(q));
        const data = await res.json();
        render(data.results || []);
      } catch (e) {
        console.error("❌ Autocomplete error:", e);
        closeList();
      }
    }, 300);
    input.addEventListener("input", search);
    input.addEventListener("focus", () => { if (list.children.length > 0) openList(); });
    input.addEventListener("blur", () => setTimeout(closeList, 150));
    window.addEventListener("resize", () => { if (list.style.display === "block") placeList(list, input); });
    window.addEventListener("scroll", () => { if (list.style.display === "block") placeList(list, input); });
  }

  // ------- Enlace robusto del formulario y botón -------
  document.addEventListener("DOMContentLoaded", () => {
    // Detecta elementos aunque cambien IDs/clases
    const form = document.getElementById("form") || document.querySelector("form");
    const btn  = document.getElementById("btn")  || (form ? form.querySelector('button[type="submit"], button') : null);
    const msg  = document.getElementById("msg")  || document.querySelector("#msg, .msg, .status");
    const tabla = document.getElementById("tabla") || document.querySelector("table");
    const tbody = document.getElementById("tbody") || (tabla ? tabla.querySelector("tbody") : null);
    const roundTripCheckbox = document.getElementById("roundTrip") || document.querySelector('#roundTrip, input[name="roundTrip"]');
    const returnDateWrap = document.getElementById("returnDateWrap") || document.querySelector("#returnDateWrap");

    console.log("🔎 Hook form:", !!form, "btn:", !!btn, "msg:", !!msg, "tabla:", !!tabla, "tbody:", !!tbody);

    // Si falta el form, no seguimos
    if (!form || !btn || !msg || !tabla || !tbody) {
      console.error("❌ No encuentro algún elemento clave del UI. Revisa IDs: form, btn, msg, tabla, tbody");
      return;
    }

    // Autocomplete en campos
    setupAutocomplete("origin");
    setupAutocomplete("destination");

    if (roundTripCheckbox && returnDateWrap) {
      roundTripCheckbox.addEventListener("change", () => {
        returnDateWrap.style.display = roundTripCheckbox.checked ? "block" : "none";
      });
    }

    // Handler único de búsqueda
    async function handleSearch(e) {
      if (e) e.preventDefault();

      // Limpia estado
      msg.className = "muted";
      msg.textContent = "Buscando...";
      btn.disabled = true;
      btn.classList.add("loading");
      btn.textContent = "Buscando…";
      tabla.style.display = "none";
      tbody.innerHTML = "";

      // Captura campos (tolerante a IDs)
      const originEl = document.getElementById("origin");
      const destEl   = document.getElementById("destination");
      const dateEl = document.getElementById("date");
      const adultsEl = document.getElementById("adults");
      const currencyEl = document.getElementById("currency");
      const returnDateEl = document.getElementById("returnDate");

      // Obtiene IATA o deduce
      let originIata = (originEl?.dataset?.iata || "").trim();
      let destIata   = (destEl?.dataset?.iata || "").trim();
      if (!originIata && originEl?.value) originIata = originEl.value.replace(/[^A-Za-z]/g, "").toUpperCase().slice(0,3);
      if (!destIata && destEl?.value)     destIata   = destEl.value.replace(/[^A-Za-z]/g, "").toUpperCase().slice(0,3);

      const date = dateEl?.value?.trim() || "";
      const adults = (adultsEl?.value || "1").trim();
      const currency = (currencyEl?.value || "USD").trim();
      const isRound = !!roundTripCheckbox?.checked;
      const returnDate = isRound ? (returnDateEl?.value?.trim() || "") : "";

      console.log("➡️ Buscar:", { originIata, destIata, date, returnDate, adults, currency });

      // Validaciones
      if (!/^[A-Z]{3}$/.test(originIata)) {
        msg.className="error"; msg.textContent="Origen inválido. Elige de la lista o escribe ciudad/aeropuerto."; return end(btn);
      }
      if (!/^[A-Z]{3}$/.test(destIata)) {
        msg.className="error"; msg.textContent="Destino inválido. Elige de la lista o escribe ciudad/aeropuerto."; return end(btn);
      }
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        msg.className="error"; msg.textContent="Salida inválida (YYYY-MM-DD)."; return end(btn);
      }
      if (isRound && !/^\d{4}-\d{2}-\d{2}$/.test(returnDate)) {
        msg.className="error"; msg.textContent="Regreso inválido (YYYY-MM-DD)."; return end(btn);
      }

      try {
        const q = new URLSearchParams({ origin: originIata, destination: destIata, date, adults, currency });
        if (returnDate) q.set("returnDate", returnDate);

        console.log("🌐 GET /api/vuelos?" + q.toString());
        const res = await fetch("/api/vuelos?" + q.toString());
        const data = await res.json();

        if (!res.ok) {
          msg.className = "error";
          msg.textContent = data?.error || "Error en la búsqueda.";
          return;
        }

        const resultados = data.results || [];
        if (!resultados.length) {
          msg.className = "ok";
          msg.textContent = "Sin resultados. Prueba otras fechas o rutas.";
          return;
        }

        resultados.forEach((r, idx) => {
          const price = r.priceTotal ? `${r.currency || "USD"} ${num(r.priceTotal)}` : "-";
          const durOut = r.durOut || r.duration || "-";
          const durRet = r.durRet || (r.hasReturn ? (r.returnDuration || "-") : "—");

          const tr = document.createElement("tr");
          tr.innerHTML = `
            <td>${r.airline || "-"}<br><span class="mono">${r.airlineCode || ""}</span></td>
            <td><b>${r.departureIata || "-"}</b><br><span class="mono">${fmt(r.departureAt)}</span></td>
            <td><b>${r.arrivalIata || "-"}</b><br><span class="mono">${fmt(r.arrivalAt)}</span></td>
            <td>${durOut}</td>
            <td>${r.stops ?? "-"}</td>
            <td>${r.hasReturn ? `<b>${r.returnArrivalIata || "-"}</b><br><span class="mono">${fmt(r.returnArrivalAt)}</span>` : "—"}</td>
            <td>${durRet}</td>
            <td>${price}</td>
            <td><button type="button" data-idx="${idx}" class="btn-detalles">Ver detalles</button></td>
          `;
          tbody.appendChild(tr);

          const trDet = document.createElement("tr");
          trDet.className = "details";
          const legsOutText = (r.legs || []).map((s, i) =>
            `IDA ${i+1} — ${s.airlineCode} ${s.flightNumber}\n  ${s.from}  ${fmt(s.departAt)}  →  ${s.to}  ${fmt(s.arriveAt)}\n  Duración: ${s.duration || "-"}`
          ).join("\n\n");
          const legsRetText = (r.returnLegs || []).map((s, i) =>
            `VUELTA ${i+1} — ${s.airlineCode} ${s.flightNumber}\n  ${s.from}  ${fmt(s.departAt)}  →  ${s.to}  ${fmt(s.arriveAt)}\n  Duración: ${s.duration || "-"}`
          ).join("\n\n");
          const content = [
            legsOutText ? legsOutText : "Sin detalle de ida.",
            r.hasReturn ? (legsRetText || "Sin detalle de vuelta.") : ""
          ].filter(Boolean).join("\n\n");
          trDet.innerHTML = `
            <td colspan="9">
              <div style="display:none" id="det-${idx}">
                <pre>${content}</pre>
              </div>
            </td>`;
          tbody.appendChild(trDet);
        });

        // Delegado (solo se añade una vez)
        if (!tbody.dataset.listener) {
          tbody.addEventListener("click", (ev) => {
            const b = ev.target.closest(".btn-detalles");
            if (!b) return;
            const i = b.getAttribute("data-idx");
            const panel = document.getElementById(`det-${i}`);
            const visible = panel.style.display !== "none";
            panel.style.display = visible ? "none" : "block";
            b.textContent = visible ? "Ver detalles" : "Ocultar";
          });
          tbody.dataset.listener = "1";
        }

        msg.className = "ok";
        msg.textContent = `Listo: ${resultados.length} resultado(s).`;
        tabla.style.display = "";
      } catch (e) {
        console.error("❌ Error buscando:", e);
        msg.className = "error";
        msg.textContent = "Error de red o servidor.";
      } finally {
        end(btn);
      }
    }

    // Enlace robusto:
    // 1) Submit del form (si el navegador lo dispara)
    form.addEventListener("submit", handleSearch);

    // 2) Click del botón (por si el submit no llega)
    btn.addEventListener("click", (e) => {
      // Si el botón ya es type="submit", igual prevenimos y llamamos a handleSearch
      e.preventDefault();
      handleSearch(e);
    });

    console.log("✅ Listeners armados (submit + click)");
  });
})();

