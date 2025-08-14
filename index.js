require('dotenv').config();
const Amadeus = require('amadeus');

// Conectar con Amadeus usando las llaves de .env
const amadeus = new Amadeus({
  clientId: process.env.AMADEUS_CLIENT_ID,
  clientSecret: process.env.AMADEUS_CLIENT_SECRET
});

// Hacer búsqueda de vuelos
amadeus.shopping.flightOffersSearch.get({
  originLocationCode: 'MAD',
  destinationLocationCode: 'JFK',
  departureDate: '2025-09-01',
  adults: 1
})
.then(response => {
  console.log(response.data); // Mostrar resultados
})
.catch(error => {
  console.error(error); // Mostrar error si algo sale mal
});

