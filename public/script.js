console.log("script.js cargado ✅");

// Helpers
const $ = (sel) => document.querySelector(sel);
const fmt = (iso) => !iso ? '-' : new Date(iso).toLocaleString();
const num = (n) => Number(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// Elementos
const form = $("#form");
const btn = $("#btn");
const msg = $("#msg");
const tabla = $("#tabla");
const tbody = $("#tbody");
const roundTripCheckbox = $("#roundTrip");
const returnDateWrap = $("#returnDateWrap");
const sortSel = $("#sort");
const directOnly = $("#directOnly");
const airlineSel = $("#airline");
const sum = $("#sum");
const controls = $("#controls");

const originInput = $("#origin");
const originList = $("#originList");
const destInput = $("#destination");
const destList = $("#destinationList");

// Mostrar/ocultar regreso
roundTripCheckbox.addEventListener("change", () => {
  returnDateWrap.style.display = roundTripCheckbox.checked ? "block" : "none";
});

// Autocompletado
let suggestTimer = null;
function bindAutocomplete(input, listEl) {
  input.addEventListener("input", () => {
    const q = input.value.trim();
    if (q.length < 2) {
      listEl.style.display = "none";
      listEl.innerHTML = "";
      return;
    }
    clearTimeout(suggestTimer);
    suggestTimer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/suggest?q=${encodeURIComponent(q)}`);
        const data = await res.json();
        listEl.innerHTML = "";
        (data || []).forEach(item => {
          const li = document.createElement("li");
          const city = item.detailed?.cityName || item.name || "";
          const code = (item.iataCode || "").toUpperCase();
          li.textContent = `${city} • ${code}`;
          li.addEventListener("click", () => {
            input.value = code;            // rellenamos con el IATA
            listEl.style.display = "none";
            listEl.innerHTML = "";
          });
          listEl.appendChild(li);
        });
        listEl.style.display = data?.length ? "block" : "none";
      } catch (e) {
        console.error("suggest error", e);
        listEl.style.display = "none";
      }
    }, 300);
  });

  // Ocultar la lista si haces click fuera
  document.addEventListener("click", (ev) => {
    if (!listEl.contains(ev.target) && ev.target !== input) {
      listEl.style.display = "none";
    }
  });
}

bindAutocomplete(originInput, originList);
bindAutocomplete(destInput, destList);

// Estado de resultados actual (para ordenar/filtrar)
let currentResults = [];

// Submit búsqueda
form.addEventListener("submit", async (e) => {
  e.preventDefault();
  setLoading(true);
  msg.className = "muted";
  msg.textContent = "Buscando...";
  tabla.style.display = "none";
  tbody.innerHTML = "";
  controls.style.display = "none";

  const origin = originInput.value.trim().toUpperCase();
  const destination = destInput.value.trim().toUpperCase();
  const date = $("#date").value.trim();
  const adults = ($("#adults").value || "1").trim();
  const currency = $("#currency").value;
  const returnDate = roundTripCheckbox.checked ? ($("#returnDate").value || "").trim() : "";

  // Validaciones
  if (!/^[A-Z]{3}$/.test(origin)) return fail("Origen inválido (usa el autocompletado).");
  if (!/^[A-Z]{3}$/.test(destination)) return fail("Destino inválido (usa el autocompletado).");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return fail("Salida inválida (YYYY-MM-DD).");
  if (roundTripCheckbox.checked && !/^\d{4}-\d{2}-\d{2}$/.test(returnDate)) return fail("Regreso inválido (YYYY-MM-DD).");

  try {
    const q = new URLSearchParams({ origin, destination, date, adults, currency });
    if (returnDate) q.set("returnDate", returnDate);

    const res = await fetch("/api/vuelos?" + q.toString());
    const data = await res.json();

    if (!res.ok) {
      msg.className = "error";
      msg.textContent = res.status === 504 ? "Timeout. Prueba otra fecha." : (data?.error || "Error en la búsqueda.");
      setLoading(false);
      return;
    }

    const resultados = data.results || [];
    if (!resultados.length) {
      msg.className = "ok";
      msg.textContent = "Sin resultados.";
      setLoading(false);
      return;
    }

    currentResults = resultados;
    renderResults(); // pinta tabla con filtros/orden
    msg.className = "ok";
    msg.textContent = `Listo: ${resultados.length} resultado(s).`;
    controls.style.display = "";
    tabla.style.display = "";
  } catch (err) {
    console.error(err);
    msg.className = "error";
    msg.textContent = "Error de red o servidor.";
  } finally {
    setLoading(false);
  }
});

function fail(text) {
  msg.className = "error";
  msg.textContent = text;
  setLoading(false);
}

function setLoading(v) {
  btn.disabled = v;
  btn.classList.toggle("loading", v);
  btn.textContent = v ? "Buscando…" : "Buscar";
}

// Orden y filtros
sortSel.addEventListener("change", renderResults);
directOnly.addEventListener("change", renderResults);
airlineSel.addEventListener("change", renderResults);

function renderResults() {
  // Filtro directos / aerolínea
  let arr = [...currentResults];
  if (directOnly.checked) arr = arr.filter(r => (r.stops || 0) === 0);

  // Aerolínea
  const selAir = airlineSel.value || "";
  if (selAir) arr = arr.filter(r => (r.airlineCode || "") === selAir);

  // Orden
  const key = sortSel.value;
  arr.sort((a, b) => {
    const pa = Number(a.priceTotal || 0), pb = Number(b.priceTotal || 0);
    const da = a.duration || "", db = b.duration || "";
    const ta = a.departureAt ? new Date(a.departureAt).getTime() : 0;
    const tb = b.departureAt ? new Date(b.departureAt).getTime() : 0;
    if (key === "priceAsc") return pa - pb;
    if (key === "priceDesc") return pb - pa;
    if (key === "durAsc") return da.localeCompare(db);
    if (key === "durDesc") return db.localeCompare(da);
    if (key === "depAsc") return ta - tb;
    if (key === "depDesc") return tb - ta;
    return 0;
  });

  // Construir selector de aerolínea (único)
  const codes = [...new Set(currentResults.map(r => r.airlineCode).filter(Boolean))].sort();
  airlineSel.innerHTML = `<option value="">Todas</option>` + codes.map(c => `<option value="${c}">${c}</option>`).join("");

  // Pintar tabla
  tbody.innerHTML = "";
  arr.forEach((r, idx) => {
    const price = r.priceTotal ? `${r.currency || "USD"} ${num(r.priceTotal)}` : "-";
    const regresoCol = r.hasReturn
      ? `<b>${r.returnArrivalIata || "-"}</b><br><span class="mono">${fmt(r.returnArrivalAt)}</span>`
      : "—";

    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${r.airline || "-"}<br><span class="mono">${r.airlineCode || ""}</span></td>
      <td><b>${r.departureIata || "-"}</b><br><span class="mono">${fmt(r.departureAt)}</span></td>
      <td><b>${r.arrivalIata || "-"}</b><br><span class="mono">${fmt(r.arrivalAt)}</span></td>
      <td>${r.duration || "-"}</td>
      <td>${r.stops ?? "-"}</td>
      <td>${regresoCol}</td>
      <td>${price}</td>
      <td><button type="button" class="btn-detalles" data-idx="${idx}">Ver detalles</button></td>
    `;
    tbody.appendChild(tr);

    const trDet = document.createElement("tr");
    trDet.className = "details";
    const legsOutText = (r.legs || []).map((s, i) =>
      `IDA ${i+1} — ${s.airlineCode} ${s.flightNumber}
  ${s.from}  ${fmt(s.departAt)}  →  ${s.to}  ${fmt(s.arriveAt)}
  Duración: ${s.duration || "-"}`
    ).join("\n\n");
    const legsRetText = (r.returnLegs || []).map((s, i) =>
      `VUELTA ${i+1} — ${s.airlineCode} ${s.flightNumber}
  ${s.from}  ${fmt(s.departAt)}  →  ${s.to}  ${fmt(s.arriveAt)}
  Duración: ${s.duration || "-"}`
    ).join("\n\n");
    const content = [
      legsOutText || "Sin detalle de ida.",
      r.hasReturn ? (legsRetText || "Sin detalle de vuelta.") : ""
    ].filter(Boolean).join("\n\n");

    trDet.innerHTML = `
      <td colspan="8">
        <div style="display:none" id="det-${idx}">
          <pre>${content}</pre>
        </div>
      </td>
    `;
    tbody.appendChild(trDet);
  });

  // toggles (delegado — permite abrir/cerrar varias veces)
  tbody.onclick = (ev) => {
    const btn = ev.target.closest(".btn-detalles");
    if (!btn) return;
    const i = btn.getAttribute("data-idx");
    const panel = document.getElementById(`det-${i}`);
    const visible = panel.style.display !== "none";
    panel.style.display = visible ? "none" : "block";
    btn.textContent = visible ? "Ver detalles" : "Ocultar";
  };

  sum.textContent = `Mostrando ${arr.length} de ${currentResults.length} resultados.`;
}
