import { renderOffers as _renderOffers } from "./js/adapter.flights.js";
window.renderOffers = _renderOffers;

// public/script.js  (reemplaza TODO)
import { renderOffers as _renderOffers } from "./js/adapter.flights.js";

// expón en window para que puedas llamarlo desde otros scripts o la consola
window.renderOffers = _renderOffers;

// log útil para verificar
console.log("[bootstrap] renderOffers =", typeof window.renderOffers);

// --------- (tu código de app puede ir debajo) ---------
// Si ya tienes listeners o fetch a tu API, déjalos aquí.
// Ejemplo mínimo de submit que NO llama tu API, solo prueba el render:
//
// document.getElementById("searchForm")?.addEventListener("submit", (e) => {
//   e.preventDefault();
//   // aquí llamarías a tu backend y luego: window.renderOffers("#results", offers)
// });
