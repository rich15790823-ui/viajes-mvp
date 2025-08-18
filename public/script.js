console.log("script.js cargado ✅");

// ===== Helpers =====
const $ = (sel) => document.querySelector(sel);
const fmt = (iso) => !iso ? '-' : new Date(iso).toLocaleString();
const num = (n) => Number(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// ISO-8601 (P[n]DT[n]H[n]M[n]S) -> "1 d 2 h 30 min"
function fmtDuration(iso) {
  if (!iso || typeof iso !== 'string') return '-';
  // Ejemplos: PT7H55M, PT4H, PT35M, P1DT2H5M
  const re = /^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/i;
  const m = iso.match(re);
  if (!m) return iso;
  const d = m[1] ? parseInt(m[1], 10) : 0;
  const h = m[2] ? parseInt(m[2], 10) : 0;
  const mm = m[3] ? parseInt(m[3], 10) : 0;
  const s = m[4] ? parseInt(m[4], 10) : 0;
  const parts = [];
  if (d) parts.push(`${d} d`);
  if (h) parts.push(`${h} h`);
  if (mm) parts.push(`${mm} min`);
  if (!d && !h && !mm && s) parts.push(`${s} s`);
  return parts.length ? parts.join(' ') : '0 min';
}

// ===== Elementos =====
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
roundTripCheckbox?.addEventListener("change", () => {
  if (!returnDateWrap) return;
  returnDateWrap.style.display = roundTripCheckbox.checked ? "block" : "none";
});

// ===== Autocompletado =====
let suggestTimer = null;

async function fetchSuggest(q) {
  const res = await fetch(`/api/suggest?q=${encodeURIComponent(q)}`);
  if (!res.ok) return [];
  const data = await res.json();
  return Array.isArray(data) ? data : [];
}

function bindAutocomplete(input, listEl) {
  if (!input || !listEl) return;

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
        const items = await fetchSuggest(q);
        listEl.innerHTML = "";
        items.forEach(item => {
          const li = document.createElement("li");
          const city = item.detailed?.cityName || item.name || "";
          const code = (item.iataCode || "").toUpperCase();
          li.textContent = `${city} • ${code}`;
          li.addEventListener("click", () => {
            input.value = code; // Rellenamos IATA
            listEl.style.display = "none";
            listEl.innerHTML = "";
          });
          listEl.appendChild(li);
        });
        listEl.style.display = items.length ? "block" : "none";
      } catch (e) {
        console.error("suggest error", e);
        listEl.style.display = "none";
      }
    }, 250);
  });

  document.addEventListener("click", (ev) => {
    if (!listEl.contains(ev.target) && ev.target !== input) {
      listEl.style.display = "none";
    }
  });
}

bindAutocomplete(originInput, originList);
bindAutocomplete(destInput, destList);

// Resolver nombre → IATA si el usuario no eligió de la lista
async function resolveToIATA(value) {
  if (/^[A-Za-z]{3}$/.test(value)) return value.toUpperCase();
  try {
    const items = await fetchSuggest(value);
    const best = items.find(x => x.iataCode) || items[0];
    return best?.iataCode ? best.iataCode.toUpperCase() : "";
  } catch {
    return "";
  }
}

// Estado de resultados
let currentResults = [];

// ===== Submit =====
form?.addEventListener("submit", async (e) => {
  e.preventDefault();
  setLoading(true);
  msg.className = "muted";
  msg.textContent = "Buscando...";
  tabla.style.display = "none";
  tbody.innerHTML = "";
  controls.style.display = "none";

  const originRaw = originInput.value.trim();
  const destRaw = destInput.value.trim();
  const origin = await resolveToIATA(originRaw);
  const destination = await resolveToIATA(destRaw);

  const date = $("#date").value.trim();
  const adults = ($("#adults").value || "1").trim();
  const currency = $("#currency").value;
  const returnDate = roundTripCheckbox?.checked ? ($("#returnDate")?.value || "").trim() : "";

  if (!/^[A-Z]{3}$/.test(origin)) return fail("Origen inválido (elige una opción del autocompletado).");
  if (!/^[A-Z]{3}$/.test(destination)) return fail("Destino inválido (elige una opción del autocompletado).");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return fail("Salida inválida (YYYY-MM-DD).");
  if (roundTripCheckbox?.checked && !/^\d{4}-\d{2}-\d{2}$/.test(returnDate)) return fail("Regreso inválido (YYYY-MM-DD).");

  try {
    const q = new URLSearchParams({ origin, destination, date, adults, currency });
    if (returnDate) q.set("returnDate", returnDate);

    const res = await fetch("/api/vuelos?" + q.toString());
    const data = await res.json();

    if (!res.ok) {
      msg.className = "error";
      msg.textContent = res.status === 504 ? "La búsqueda tardó demasiado (timeout). Prueba otra fecha." : (data?.error || "Error en la búsqueda.");
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
    renderResults();
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

// ===== Orden / Filtros =====
sortSel?.addEventListener("change", renderResults);
directOnly?.addEventListener("change", renderResults);
airlineSel?.addEventListener("change", renderResults);

function renderResults() {
  let arr = [...currentResults];
  if (directOnly?.checked) arr = arr.filter(r => (r.stops || 0) === 0);

  const selAir = airlineSel?.value || "";
  if (selAir) arr = arr.filter(r => (r.airlineCode || "") === selAir);

  const key = sortSel?.value || "priceAsc";
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

  const codes = [...new Set(currentResults.map(r => r.airlineCode).filter(Boolean))].sort();
  if (airlineSel) {
    airlineSel.innerHTML = `<option value="">Todas</option>` + codes.map(c => `<option value="${c}">${c}</option>`).join("");
  }

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
      <td>${fmtDuration(r.duration)}</td>
      <td>${r.stops ?? "-"}</td>
      <td>${regresoCol}</td>
      <td>${price}</td>
      <td><button type="button" class="btn-detalles" data-idx="${idx}">Ver detalles</button></td>
    `;
    tbody.appendChild(tr);

    // ----- Detalles — tablas por tramo -----
    const trDet = document.createElement("tr");
    trDet.className = "details";

    const legsOutRows = (r.legs || []).map((s, i) => `
      <tr>
        <td>${i+1}</td>
        <td>${s.airlineCode || ""} ${s.flightNumber || ""}</td>
        <td>${s.from || "-"}</td>
        <td class="mono">${fmt(s.departAt)}</td>
        <td>→</td>
        <td>${s.to || "-"}</td>
        <td class="mono">${fmt(s.arriveAt)}</td>
        <td>${fmtDuration(s.duration)}</td>
      </tr>
    `).join("");

    const legsRetRows = (r.returnLegs || []).map((s, i) => `
      <tr>
        <td>${i+1}</td>
        <td>${s.airlineCode || ""} ${s.flightNumber || ""}</td>
        <td>${s.from || "-"}</td>
        <td class="mono">${fmt(s.departAt)}</td>
        <td>→</td>
        <td>${s.to || "-"}</td>
        <td class="mono">${fmt(s.arriveAt)}</td>
        <td>${fmtDuration(s.duration)}</td>
      </tr>
    `).join("");

    const idaTable = `
      <div class="seg-title">IDA</div>
      <table class="seg-table">
        <thead>
          <tr><th>#</th><th>Vuelo</th><th>Desde</th><th>Sale</th><th></th><th>Hasta</th><th>Llega</th><th>Duración</th></tr>
        </thead>
        <tbody>${legsOutRows || `<tr><td colspan="8">Sin detalle de ida.</td></tr>`}</tbody>
      </table>
    `;

    const vueltaTable = r.hasReturn ? `
      <div class="seg-title">VUELTA</div>
      <table class="seg-table">
        <thead>
          <tr><th>#</th><th>Vuelo</th><th>Desde</th><th>Sale</th><th></th><th>Hasta</th><th>Llega</th><th>Duración</th></tr>
        </thead>
        <tbody>${legsRetRows || `<tr><td colspan="8">Sin detalle de vuelta.</td></tr>`}</tbody>
      </table>
    ` : "";

    trDet.innerHTML = `
      <td colspan="8">
        <div style="display:none" id="det-${idx}">
          ${idaTable}
          ${vueltaTable}
        </div>
      </td>
    `;
    tbody.appendChild(trDet);
  });

  // Toggle detalles (abre/cierra libremente)
  tbody.onclick = (ev) => {
    const btn = ev.target.closest(".btn-detalles");
    if (!btn) return;
    const i = btn.getAttribute("data-idx");
    const panel = document.getElementById(`det-${i}`);
    const visible = panel.style.display !== "none";
    panel.style.display = visible ? "none" : "block";
    btn.textContent = visible ? "Ver detalles" : "Ocultar";
  };

  if (sum) sum.textContent = `Mostrando ${arr.length} de ${currentResults.length} resultados.`;
}
