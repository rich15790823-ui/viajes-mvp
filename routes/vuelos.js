// routes/vuelos.js
const express = require('express');

module.exports = function makeVuelosRouter(amadeus) {
  const router = express.Router();

  // GET /api/vuelos?origin=XXX&destination=YYY&date=YYYY-MM-DD&adults=1&currency=USD
  router.get('/', async (req, res) => {
    try {
      const origin = (req.query.origin || '').toUpperCase().trim();
      const destination = (req.query.destination || '').toUpperCase().trim();
      const date = (req.query.date || '').trim();
      const adults = Number(req.query.adults || 1);
      const currency = (req.query.currency || 'USD').toUpperCase().trim();

      if (!/^[A-Z]{3}$/.test(origin)) {
        return res.status(400).json({ error: 'Parámetro "origin" inválido. Usa código IATA de 3 letras (ej. MAD).' });
      }
      if (!/^[A-Z]{3}$/.test(destination)) {
        return res.status(400).json({ error: 'Parámetro "destination" inválido. Usa código IATA de 3 letras (ej. JFK).' });
      }
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        return res.status(400).json({ error: 'Parámetro "date" inválido. Usa formato YYYY-MM-DD (ej. 2025-09-01).' });
      }
      if (!Number.isInteger(adults) || adults < 1) {
        return res.status(400).json({ error: 'Parámetro "adults" inválido. Debe ser entero >= 1.' });
      }

      const response = await amadeus.shopping.flightOffersSearch.get({
        originLocationCode: origin,
        destinationLocationCode: destination,
        departureDate: date,
        adults,
        currencyCode: currency,
        max: 10
      });

      const dict = response.result?.dictionaries || {};
      const carriers = dict.carriers || {};

      const data = (response.data || []).map((offer) => {
        const priceTotal = offer.price?.total || null;
        const itin = offer.itineraries?.[0];
        const segments = itin?.segments || [];
        const first = segments[0];
        const last = segments[segments.length - 1];
        const airlineCode = first?.carrierCode || '';
        const airlineName = carriers[airlineCode] || airlineCode;

        return {
          priceTotal,
          currency: offer.price?.currency || currency,
          airline: airlineName,
          airlineCode,
          departureAt: first?.departure?.at || null,
          departureIata: first?.departure?.iataCode || null,
          arrivalAt: last?.arrival?.at || null,
          arrivalIata: last?.arrival?.iataCode || null,
          duration: itin?.duration || null,
          stops: Math.max(0, segments.length - 1)
        };
      });

      res.json({ results: data });
    } catch (err) {
      console.error('Error en /api/vuelos:', err?.response?.result || err.message || err);
      const status = err?.response?.statusCode || 500;
      const body = err?.response?.result || { error: 'Error inesperado' };
      res.status(status).json(body);
    }
  });

  return router;
};

