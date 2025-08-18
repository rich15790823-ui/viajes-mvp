console.log("script.js WIRE ✅", Date.now());

document.addEventListener("DOMContentLoaded", () => {
  const form = document.getElementById("form");
  const btn = document.getElementById("btn");
  const msg = document.getElementById("msg");
  const roundTrip = document.getElementById("roundTrip");
  const returnWrap = document.getElementById("returnDateWrap");
  const returnDate = document.getElementById("returnDate");
  const tabla = document.getElementById("tabla");
  const tbody = document.getElementById("tbody");

  // Comprobación de presencia de elementos
  console.log("HOOKS:",
    "form", !!form,
    "btn", !!btn,
    "msg", !!msg,
    "tabla", !!tabla,
    "tbody", !!tbody,
    "roundTrip", !!roundTrip,
    "returnWrap", !!returnWrap
  );

  if (!form || !btn || !msg) {
    console.error("Faltan elementos base (form/btn/msg). Revisa IDs en la vista.");
    return;
  }

  // Toggle regreso
  function toggleReturn() {
    if (!roundTrip || !returnWrap) return;
    returnWrap.style.display = roundTrip.checked ? "block" : "none";
    console.log("roundTrip checked:", roundTrip.checked);
  }
  if (roundTrip) {
    roundTrip.addEventListener("change", toggleReturn);
    toggleReturn();
  }

  // Helpers
  function start() {
    btn.disabled = true;
    btn.textContent = "Buscando...";
    msg.className = "muted";
    msg.textContent = "Buscando...";
    if (tbody) tbody.innerHTML = "";
    if (tabla) tabla.style.display = "none";
  }
  function stop() {
    btn.disabled = false;
    btn.textContent = "Buscar";
  }
  function fmt(iso) {
    try {
      if (!iso) return "-";
      const d = new Date(iso);
      return d.toLocaleString();
    } catch { return "-"; }
  }

  async function doSearch(e) {
    e.preventDefault();
    console.log("🔎 doSearch click/submit");
    start();

    const origin = (document.getElementById("origin")?.value || "").trim().toUpperCase();
    const destination = (document.getElementById("destination")?.value || "").trim().toUpperCase();
    const date = (document.getElementById("date")?.value || "").trim();
    const adults = (document.getElementById("adults")?.value || "1").trim();
    const currency = (document.getElementById("currency")?.value || "USD").trim();
    const back = (roundTrip && roundTrip.checked) ? ((returnDate?.value || "").trim()) : "";

    // Validaciones básicas para que veas errores en pantalla
    if (!/^[A-Z]{3}$/.test(origin)) { msg.textContent = "Origen inválido (usa IATA de 3 letras, ej. CUN)."; stop(); return; }
    if (!/^[A-Z]{3}$/.test(destination)) { msg.textContent = "Destino inválido (IATA 3 letras, ej. MAD)."; stop(); return; }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) { msg.textContent = "Salida inválida (YYYY-MM-DD)."; stop(); return; }
    if (roundTrip && roundTrip.checked) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(back)) { msg.textContent = "Regreso inválido (YYYY-MM-DD)."; stop(); return; }
      if (new Date(back) < new Date(date)) { msg.textContent = "Regreso no puede ser antes de salida."; stop(); return; }
    }

    try {
      const q = new URLSearchParams({ origin, destination, date, adults, currency });
      if (back) q.set("returnDate", back);

      console.log("➡️ fetch /api/vuelos?" + q.toString());
      const res = await fetch("/api/vuelos?" + q.toString());
      const data = await res.json();
      console.log("⬅️ respuesta", res.status, data);

      if (!res.ok) {
        msg.textContent = data?.error || "Error en la búsqueda.";
        stop(); return;
      }

      const results = Array.isArray(data.results) ? data.results : [];
      msg.textContent = `Listo: ${results.length} resultado(s).`;

      if (!tabla || !tbody) { stop(); return; } // si no hay tabla, ahí lo dejamos (ya logueamos)

      if (!results.length) {
        tabla.style.display = "none";
        stop(); return;
      }

      tbody.innerHTML = "";
      results.forEach(r => {
        const tr = document.createElement("tr");
        tr.innerHTML = `
          <td>${r.airline || "-"} (${r.airlineCode || ""})</td>
          <td>${r.departureIata || "-"}<br><small>${fmt(r.departureAt)}</small></td>
          <td>${r.arrivalIata || "-"}<br><small>${fmt(r.arrivalAt)}</small></td>
          <td>${r.priceTotal ? (r.currency || "USD") + " " + r.priceTotal : "-"}</td>
          <td>${r.hasReturn ? (r.returnArrivalIata || "-") + "<br><small>" + fmt(r.returnArrivalAt) + "</small>" : "—"}</td>
        `;
        tbody.appendChild(tr);
      });
      tabla.style.display = "";

    } catch (err) {
      console.error(err);
      msg.textContent = "Error de red o servidor.";
    } finally {
      stop();
    }
  }

  // Enganches — si alguno falla, vemos el log
  form.addEventListener("submit", doSearch);
  btn.addEventListener("click", doSearch);
  console.log("✅ listeners listos");
});

