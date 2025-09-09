// public/script.js
// 1) Importa los módulos (requiere <script type="module" ...> en index.html)
import { setupAutocomplete } from "./autocomplete.js";
import { resolveQueryUniversal } from "./js/i18n/resolve.js"; // opcional, para logs/pruebas

// 2) Inicia el autocompletado en Origen y Destino
setupAutocomplete({ input: "#from", panel: "#fromSugs", side: "from" });
setupAutocomplete({ input: "#to",   panel: "#toSugs",   side: "to"   });

// 3) (Opcional) Logs para ver la traducción en tiempo real
const $from = document.getElementById("from");
const $to   = document.getElementById("to");
["input","change"].forEach(evt=>{
  $to?.addEventListener(evt, async ()=>{
    const rq = await resolveQueryUniversal($to.value);
    console.log("[Destino canonizado] →", rq);
  });
  $from?.addEventListener(evt, async ()=>{
    const rq = await resolveQueryUniversal($from.value);
    console.log("[Origen canonizado]  →", rq);
  });
});

// 4) Submit del formulario (usa IATA elegidos por el usuario)
const form = document.getElementById("searchForm");
const $date = document.getElementById("date");

form?.addEventListener("submit", async (e) => {
  e.preventDefault();

  if (!window.selectedFromIATA || !window.selectedToIATA) {
    alert("Elige un aeropuerto específico de la ciudad (necesitamos el código IATA).");
    return;
  }

  const url =
    `/api/vuelos/buscar?originLocationCode=${window.selectedFromIATA}` +
    `&destinationLocationCode=${window.selectedToIATA}` +
    `&departureDate=${$date?.value || ""}&adults=1&currency=MXN`;

  console.log("→ Llamaría a:", url);
  // const res = await fetch(url);
  // const data = await res.json();
  // TODO: renderiza resultados aquí
});
