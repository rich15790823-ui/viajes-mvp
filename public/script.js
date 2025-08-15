console.log("✅ build=", Date.now());
console.log("script.js cargado ✅");

const form = document.getElementById("form");
const msg = document.getElementById("msg");
const tbody = document.getElementById("tbody");
const tabla = document.getElementById("tabla");
const controls = document.getElementById("controls");
const sortSelect = document.getElementById("sort");
const directOnly = document.getElementById("directOnly");
const airlineSelect = document.getElementById("airline");
const sumSpan = document.getElementById("sum");
const roundTripCheckbox = document.getElementById("roundTrip");
const returnDateWrap = document.getElementById("returnDateWrap");

// Mostrar/ocultar fecha de regreso
roundTripCheckbox.addEventListener("change", () => {
  returnDateWrap.style.display = roundTripCheckbox.checked ? "block" : "none";
});

// Autocompletado de aeropuertos
async function setupAutocomplete(inputId) {
  const input = document.getElementById(inputId);
  let timeout;

  input.addEventListener("input", () => {
    clearTimeout(timeout);
    const query = input.value.trim();
    if (query.length < 2) return;

    timeout = setTimeout(async () => {
      try {
        const res = await fetch(`/api/autocomplete?query=${encodeURIComponent(query)}`);
        const data = await res.json();
        showAutocompleteList(input, data);
      } catch (err) {
        console.error("Error en autocompletado:", err);
      }
    }, 300);
  });
}

function showAutocompleteList(input, list) {
  let datalist = document.getElementById(input.id + "-list");
  if (!datalist) {
    datalist = document.createElement("datalist");
    datalist.id = input.id + "-list";
    document.body.appendChild(datalist);
    input.setAttribute("list", datalist.id);
  }
  datalist.innerHTML = "";
  list.forEach(item => {
    const option = document.createElement("option");
    option.value = `${item.iata} - ${item.name} (${item.city}, ${item.country})`;
    datalist.appendChild(option);
  });
}

setupAutocomplete("origin");
setupAutocomplete("destination");

// Petición al servidor
form.addEventListener("submit", async (e) => {
  e.preventDefault();
  msg.textContent = "Buscando...";
  tabla.style.display = "none";
  controls.style.display = "none";
  tbody.innerHTML = "";

  const params = {
    origin: document.getElementById("origin").value.split(" - ")[0].trim(),
    destination: document.getElementById("destination").value.split(" - ")[0].trim(),
    date: document.getElementById("date").value,
    adults: document.getElementById("adults").value,
    currency: document.getElementById("currency").value,
    roundTrip: roundTripCheckbox.checked,
    returnDate: document.getElementById("returnDate").value
  };

  try {
    const res = await fetch("/api/search?" + new URLSearchParams(params));
    const data = await res.json();

    if (!data.results || data.results.length === 0) {
      msg.textContent = "No se encontraron vuelos.";
      return;
    }

    renderResults(data.results);
    controls.style.display = "flex";
    tabla.style.display = "table";
    msg.textContent = "";
  } catch (err) {
    console.error(err);
    msg.textContent = "Error en la búsqueda.";
  }
});

// Renderizar resultados
function renderResults(results) {
  tbody.innerHTML = "";
  const airlines = new Set();

  results.forEach(r => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${r.airline}</td>
      <td>${r.departureTime}</td>
      <td>${r.arrivalTime}</td>
      <td>${r.duration}</td>
      <td>${r.stops}</td>
      <td>${r.returnArrivalTime || "-"}</td>
      <td>${r.price} ${r.currency}</td>
      <td><a href="${r.link}" target="_blank">Ver</a></td>
    `;
    tbody.appendChild(tr);
    airlines.add(r.airline);
  });

  airlineSelect.innerHTML = `<option value="">Todas</option>`;
  airlines.forEach(a => {
    const opt = document.createElement("option");
    opt.value = a;
    opt.textContent = a;
    airlineSelect.appendChild(opt);
  });

  sumSpan.textContent = `${results.length} resultados`;
}