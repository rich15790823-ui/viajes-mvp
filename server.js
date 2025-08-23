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
app.post("/api/search", async (req, res) => {
  try {
    const b = req.body || {};
    const origin = (b.origin||"").toUpperCase();
    const dest   = (b.dest||"").toUpperCase();
    if (!/^[A-Z]{3}$/.test(origin) || !/^[A-Z]{3}$/.test(dest)) {
      return res.status(400).json({ ok:false, error:"IATA inválido (3 letras)" });
    }

    // Fechas por defecto: hoy → hoy+30
    const pad = n => (n<10?"0":"")+n;
    const toDMY = d => pad(d.getDate())+"/"+pad(d.getMonth()+1)+"/"+d.getFullYear();
    const today = new Date();
    const to    = new Date(); to.setDate(today.getDate()+30);
    const date_from = b.date_from || toDMY(today);
    const date_to   = b.date_to   || toDMY(to);

    const axios = (await import("axios")).default;
    const apiKey = process.env.TEQUILA_API_KEY;
    if (!apiKey) return res.status(500).json({ ok:false, error:"Falta TEQUILA_API_KEY en el servidor" });

    const url = "https://tequila-api.kiwi.com/v2/search";
    const params = {
      fly_from: origin,
      fly_to: dest,
      date_from,
      date_to,
      curr: "MXN",
      sort: "price",
      limit: 20
    };
    const resp = await axios.get(url, { headers: { apikey: apiKey }, params });
    const rows = Array.isArray(resp.data && resp.data.data) ? resp.data.data : [];

    const items = rows.map((r, i) => {
      const price_mxn = r.price;
      const route = (r.route && r.route[0]) || {};
      const d1 = route.local_departure || r.local_departure || r.dTimeUTC;
      const a1 = route.local_arrival   || r.local_arrival   || r.aTimeUTC;
      // Duración aproximada (minutos) si existe r.duration.total (segundos)
      const durMin = r.duration && r.duration.total ? Math.round(r.duration.total/60) : undefined;
      return {
        id: r.id || ("KWI-"+i),
        airlineName: (r.airlines && r.airlines[0]) || "Desconocida",
        airline: (r.airlines && r.airlines[0]) || "Desconocida",
        origin: origin,
        destination: dest,
        dest: dest,
        price: { amount: price_mxn, currency: "MXN" },
        price_mxn: price_mxn,
        departureTime: d1,
        depart_at: d1,
        arrivalTime: a1,
        arrive_at: a1,
        durationMinutes: durMin,
        duration_min: durMin,
        stops: (r.route ? r.route.length-1 : 0)
      };
    });

    return res.json({
      ok: true,
      msg: `Resultados reales: ${origin} → ${dest} (${items.length})`,
      count: items.length,
      hasResults: items.length>0,
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
