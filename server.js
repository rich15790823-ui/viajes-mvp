import express from "express";
import cors from "cors";

const app = express();
app.use(express.json());
app.use(cors({
  origin: "*",
  methods: ["GET","POST","OPTIONS"],
  allowedHeaders: ["Content-Type"]
}));

// Health claro (JSON para que sepamos cuál corre)
app.get("/health", (_req, res) => res.json({ ok: true, file: __filename }));

// Endpoint de búsqueda que SIEMPRE devuelve lista en varios formatos
app.post("/api/search", (req, res) => {
  const b = req.body || {};
  const origin = (b.origin || "").toUpperCase();
  const dest   = (b.dest   || "").toUpperCase();
  if (!origin || !dest) return res.status(400).json({ ok:false, error:"Faltan origin/dest" });

  const items = [
    {
      id: "MOCK1",
      airlineName: "AeroDemo",
      airline: "AeroDemo",
      origin,
      destination: dest,
      dest,
      price: { amount: 1299, currency: "MXN" },
      price_mxn: 1299,
      departureTime: "2025-09-01T08:00:00-06:00",
      depart_at: "2025-09-01T08:00:00-06:00",
      arrivalTime: "2025-09-01T09:45:00-06:00",
      arrive_at: "2025-09-01T09:45:00-06:00",
      durationMinutes: 105,
      duration_min: 105,
      stops: 0
    },
    {
      id: "MOCK2",
      airlineName: "AeroDemo",
      airline: "AeroDemo",
      origin,
      destination: dest,
      dest,
      price: { amount: 1499, currency: "MXN" },
      price_mxn: 1499,
      departureTime: "2025-09-01T18:00:00-06:00",
      depart_at: "2025-09-01T18:00:00-06:00",
      arrivalTime: "2025-09-01T19:45:00-06:00",
      arrive_at: "2025-09-01T19:45:00-06:00",
      durationMinutes: 105,
      duration_min: 105,
      stops: 0
    }
  ];

  return res.json({
    ok: true,
    msg: `Búsqueda recibida: ${origin} → ${dest}`,
    count: items.length,
    hasResults: items.length > 0,
    results: items,        // forma 1
    flights: items,        // forma 2
    data: { items }        // forma 3
  });
});

// 404 claro
app.use((_req, res) => res.status(404).send("Not Found (app)"));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log("Servidor corriendo en puerto", PORT));
