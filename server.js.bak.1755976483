import express from "express";
import cors from "cors";
import axios from "axios";

const app = express();
app.use(express.json());
app.use(cors({
  origin: "*",
  methods: ["GET","POST","OPTIONS"],
  allowedHeaders: ["Content-Type","X-Requested-With"]
}));

// Raíz visible (para validaciones externas)
app.get("/", (_req, res) => {
  res.send(`<!DOCTYPE html><html lang="es"><head><meta charset="utf-8" /><title>Navuara</title></head><body><h1>Hola, soy Navuara 🚀</h1><p>Buscador de vuelos en desarrollo.</p></body></html>`);
});

// Health JSON (muestra el archivo que corre en Render)
app.get("/health", (_req, res) => res.json({ ok: true, file: __filename }));

// Util: formateo de fechas YYYY-MM-DD -> para Travelpayouts usamos YYYY-MM-DD en 'departure_at'
const pad = (n) => (n < 10 ? "0" : "") + n;
const todayISO = () => {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
};

// Handler REAL con Travelpayouts (Aviasales)
app.post("/api/search", async (req, res) => {
  try {
    const b = req.body || {};
    const origin = (b.origin || "").toUpperCase();
    const dest   = (b.dest   || "").toUpperCase();

    if (!/^[A-Z]{3}$/.test(origin) || !/^[A-Z]{3}$/.test(dest)) {
      return res.status(400).json({ ok:false, error:"IATA inválido (usa 3 letras, ej. MEX, CUN)" });
    }

    const token = process.env.TRAVELPAYOUTS_TOKEN;
    if (!token) {
      return res.status(500).json({ ok:false, error:"Falta TRAVELPAYOUTS_TOKEN en el servidor" });
    }

    // Fecha por defecto hoy (puedes enviar b.date = "2025-09-01")
    const departure_at = b.date || todayISO();

    const url = "https://api.travelpayouts.com/aviasales/v3/prices_for_dates";
    const params = {
      origin,
      destination: dest,
      currency: "mxn",
      departure_at,   // YYYY-MM-DD
      limit: 10
    };

    const tpResp = await axios.get(url, {
      headers: { "X-Access-Token": token },
      params
    });

    const rows = Array.isArray(tpResp.data?.data) ? tpResp.data.data : [];

    // Mapear al formato que ya usa tu front (results / flights / data.items)
    const items = rows.map((r, i) => {
      return {
        id: r.id || `TP-${i}`,
        airlineName: r.airline || "Desconocida",
        airline: r.airline || "Desconocida",
        origin: r.origin,
        destination: r.destination,
        dest: r.destination,
        price: { amount: r.price, currency: "MXN" },
        price_mxn: r.price,
        departureTime: r.departure_at,
        depart_at: r.departure_at,
        return_at: r.return_at,
        transfers: r.transfers,
        // Si el endpoint trae 'link', úsalo como deeplink de afiliado (botón "Reservar")
        deeplink: r.link || null
      };
    });

    return res.json({
      ok: true,
      msg: `Resultados reales: ${origin} → ${dest} (${items.length})`,
      count: items.length,
      hasResults: items.length > 0,
      results: items,
      flights: items,
      data: { items }
    });
  } catch (err) {
    const status = err.response?.status || 500;
    const detail = err.response?.data || err.message;
    return res.status(status).json({ ok:false, error:"Provider error", detail });
  }
});

// 404 claro
app.use((_req, res) => res.status(404).send("Not Found (app)"));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log("Servidor corriendo en puerto", PORT));
