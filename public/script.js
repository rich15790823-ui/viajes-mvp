console.log("script.js (rollback) ✅", Date.now());

document.addEventListener("DOMContentLoaded", () => {
  const form = document.getElementById("form");
  const btn = document.getElementById("btn");
  const msg = document.getElementById("msg");
  const roundTrip = document.getElementById("roundTrip");
  const returnWrap = document.getElementById("returnDateWrap");
  const tabla = document.getElementById("tabla");
  const tbody = document.getElementById("tbody");

  function toggleReturn() {
    if (!roundTrip || !returnWrap) return;
    returnWrap.style.display = roundTrip.checked ? "block" : "none";
  }
  if (roundTrip) {
    roundTrip.addEventListener("change", toggleReturn);
    toggleReturn();
  }

  function start() {
    btn.disabled = true;
    btn.textContent = "Buscando...";
    msg.className = "muted";
    msg.textContent = "Buscando...";
    tbody.innerHTML = "";
    tabla.style.display = "none";
  }
  function stop() {
    btn.disabled = false;
    btn.textContent = "Buscar";
  }
  function fmt(iso) {
    try { return iso ? new Date(iso).toLocaleString() : "-"; } catch { return "-"; }
  }
  function fmtDur(isoDur) {
    // Convierte PT7H55M -> 7h 55m (simple)
    if (!isoDur || !isoDur.startsWith("PT")) return "-";
    const h = (isoDur.match(/(\d+)H/) || [])[1] || "0";
    const m = (isoDur.match(/(\d+)M/) || [])[1] || "0";
    return `${h}h ${m}m`.replace(/^0h\s?/,'').trim() || "-";
  }

  async function doSearch(e) {
    e.preventDefault();
    start();

    const origin = (document.getElementById("origin")?.value || "").trim().toUpperCase();
    const destination = (document.getElementById("destination")?.value || "").trim().toUpperCase();
    const date = (document.getElementById("date")?.value || "").trim();
    const adults = (document.getElementById("adults")?.value || "1").trim();
    const currency = (document.getElementById("currency")?.value || "USD").trim();
    const back = (roundTrip && roundTrip.checked) ? ((document.getElementById("returnDate")?.value || "").trim()) : "";

    if (!/^[A-Z]{3}$/.test(origin)) { msg.textContent = "Origen inválido (IATA 3 letras)."; stop(); return; }
    if (!/^[A-Z]{3}$/.test(destination)) { msg.textContent = "Destino inválido (IATA 3 letras)."; stop(); return; }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) { msg.textContent = "Salida inválida (YYYY-MM-DD)."; stop(); return; }
    if (roundTrip && roundTrip.checked) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(back)) { msg.textContent = "Regreso inválido (YYYY-MM-DD)."; stop(); return; }
      if (new Date(back) < new Date(date)) { msg.textContent = "Regreso no puede ser antes de salida."; stop(); return; }
    }

    try {
      const q = new URLSearchParams({ origin, destination, date, adults, currency });
      if (back) q.set("returnDate", back);

      const res = await fetch("/api/vuelos?" + q.toString());
      const data = await res.json();

      if (!res.ok) {
        msg.textContent = res.status === 504 ? "Timeout: intenta otra fecha." : (data?.error || "Error en búsqueda.");
        stop(); return;
      }

      const results = Array.isArray(data.results) ? data.results : [];
      msg.textContent = `Listo: ${results.length} resultado(s).`;

      if (!results.length) { tabla.style.display = "none"; stop(); return; }

      tbody.innerHTML = "";
      results.forEach((r, idx) => {
        const price = r.priceTotal ? `${r.currency || "USD"} ${Number(r.priceTotal).toFixed(2)}` : "-";
        const regresoCol = r.hasReturn
          ? `<b>${r.returnArrivalIata || "-"}</b><br><span class="mono">${fmt(r.returnArrivalAt)}</span>`
          : "—";

        const tr = document.createElement("tr");
        tr.innerHTML = `
          <td>${r.airline || "-"}<br><span class="mono">${r.airlineCode || ""}</span></td>
          <td><b>${r.departureIata || "-"}</b><br><span class="mono">${fmt(r.departureAt)}</span></td>
          <td><b>${r.arrivalIata || "-"}</b><br><span class="mono">${fmt(r.arrivalAt)}</span></td>
          <td>${fmtDur(r.durationOut)}</td>
          <td>${r.stops ?? "-"}</td>
          <td>${regresoCol}</td>
          <td>${fmtDur(r.durationRet)}</td>
          <td>${price}</td>
          <td><button type="button" class="btn-detalles" data-idx="${idx}">Ver detalles</button></td>
        `;
        tbody.appendChild(tr);

        const legsOutText = (r.legs || []).map((s, i) =>
          `IDA ${i+1} — ${s.airlineCode} ${s.flightNumber}
  ${s.from}  ${fmt(s.departAt)} → ${s.to}  ${fmt(s.arriveAt)}
  Duración: ${fmtDur(s.duration)}`
        ).join('\n\n');

        const legsRetText = (r.returnLegs || []).map((s, i) =>
          `VUELTA ${i+1} — ${s.airlineCode} ${s.flightNumber}
  ${s.from}  ${fmt(s.departAt)} → ${s.to}  ${fmt(s.arriveAt)}
  Duración: ${fmtDur(s.duration)}`
        ).join('\n\n');

        const content = [
          legsOutText || 'Sin detalle de ida.',
          r.hasReturn ? (legsRetText || 'Sin detalle de vuelta.') : ''
        ].filter(Boolean).join('\n\n');

        const trDet = document.createElement("tr");
        trDet.className = "details";
        trDet.innerHTML = `<td colspan="9"><div style="display:none" id="det-${idx}"><pre>${content}</pre></div></td>`;
        tbody.appendChild(trDet);
      });

      // Toggle de detalles (delegado)
      tbody.onclick = (ev) => {
        const btn = ev.target.closest(".btn-detalles");
        if (!btn) return;
        const i = btn.getAttribute("data-idx");
        const panel = document.getElementById(`det-${i}`);
        const visible = panel.style.display !== "none";
        panel.style.display = visible ? "none" : "block";
        btn.textContent = visible ? "Ver detalles" : "Ocultar";
      };

      tabla.style.display = "";
    } catch (err) {
      console.error(err);
      msg.textContent = "Error de red o servidor.";
    } finally {
      stop();
    }
  }

  form.addEventListener("submit", doSearch);
  btn.addEventListener("click", doSearch);
});

