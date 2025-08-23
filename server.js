import express from "express";
import cors from "cors";
import axios from "axios";

const app = express();
app.use(express.json());
app.use(cors({
  origin: "*",
  methods: ["GET","POST","OPTIONS"],
  allowedHeaders: ["Content-Type","X-Requested-With","X-Access-Token-Proxy"]
}));

// Raíz visible (para validaciones externas)
app.get("/", (_req, res) => {
  res.send(`<!DOCTYPE html><html lang="es"><head><meta charset="utf-8" /><title>Navuara</title></head><body><h1>Hola, soy Navuara 🚀</h1><p>Buscador de vuelos en desarrollo.</p></body></html>`);
});

// Health JSON
app.get("/health", (_req, res) => res.json({ ok: true, file: __filename }));

// ¿Qué archivo corre?
app.get("/whoami", (_req, res) => res.json({ file: __filename, pid: process.pid }));

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

    // Token desde env var o header-proxy (para pruebas)
    const envToken = process.env.TRAVELPAYOUTS_TOKEN;
    const headerToken = req.get("X-Access-Token-Proxy");
    const effToken = headerToken || envToken;
    if (!effToken) {
      return res.status(500).json({ ok:false, error:"Falta TRAVELPAYOUTS_TOKEN (o envía header X-Access-Token-Proxy)" });
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
      headers: { "X-Access-Token": effToken },
      params
    });

    const rows = Array.isArray(tpResp.data?.data) ? tpResp.data.data : [];

    // Mapear al formato que ya usa tu front
    const items = rows.map((r, i) => ({
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
      deeplink: r.link || null
    }));

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

// 404
app.use((_req, res) => res.status(404).send("Not Found (app)"));

const PORT = process.env.PORT || 3000;
app.get("/whoami", (_req, res) => res.json({ file: __filename, pid: process.pid }));
app.get("/env", (_req, res) => res.json({ hasToken: Boolean(process.env.TRAVELPAYOUTS_TOKEN) }));
app.get("/debug/headers", (req, res) => res.json({ headers: req.headers }));

app.listen(PORT, () => console.log("Servidor corriendo en puerto", PORT));
