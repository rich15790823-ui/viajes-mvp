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
    const b = req.body || {}; const origin=(b.origin||"").toUpperCase(); const dest=(b.dest||"").toUpperCase();
    if(!/^[A-Z]{3}$/.test(origin)||!/^[A-Z]{3}$/.test(dest)) return res.status(400).json({ok:false,error:"IATA inválido"});
    const axios=(await import("axios")).default;
    const effToken = process.env.TRAVELPAYOUTS_TOKEN || req.get("X-Access-Token-Proxy");
    if(!effToken) return res.status(500).json({ ok:false, error:"Falta TRAVELPAYOUTS_TOKEN (o envía X-Access-Token-Proxy)" });
    const pad=n=>n<10?"0"+n:n; const todayISO=()=>{const d=new Date();return d.getFullYear()+"-"+pad(d.getMonth()+1)+"-"+pad(d.getDate())};
    const date = b.date || todayISO();
    const mapRows = (rows)=>rows.map((r,i)=>({
      id:r.id||("TP-"+i),
      airlineName:r.airline||"Desconocida", airline:r.airline||"Desconocida",
      origin:r.origin||origin, destination:r.destination||dest, dest:(r.destination||dest),
      price:{ amount:r.price, currency:"MXN" }, price_mxn:r.price,
      departureTime:r.departure_at||r.departure_date, depart_at:r.departure_at||r.departure_date,
      return_at:r.return_at||null,
      transfers:(r.transfers!=null?r.transfers:r.number_of_changes),
      deeplink:r.link||null
    }));
    const get1 = async ()=>{
      const url="https://api.travelpayouts.com/aviasales/v3/prices_for_dates";
      const params={ origin, destination:dest, currency:"mxn", departure_at:date, limit:20 };
      const r=await axios.get(url,{ headers:{"X-Access-Token":effToken}, params });
      return Array.isArray(r.data?.data)?r.data.data:[];
    };
    const get2 = async ()=>{
      const d=new Date(date); d.setDate(d.getDate()+7); const alt=d.getFullYear()+"-"+pad(d.getMonth()+1)+"-"+pad(d.getDate());
      const url="https://api.travelpayouts.com/aviasales/v3/prices_for_dates";
      const params={ origin, destination:dest, currency:"mxn", departure_at:alt, limit:20 };
      const r=await axios.get(url,{ headers:{"X-Access-Token":effToken}, params });
      return Array.isArray(r.data?.data)?r.data.data:[];
    };
    const get3 = async ()=>{
      const url="https://api.travelpayouts.com/aviasales/v3/prices_latest";
      const params={ origin, destination:dest, currency:"mxn", limit:20, page:1 };
      const r=await axios.get(url,{ headers:{"X-Access-Token":effToken}, params });
      return Array.isArray(r.data?.data)?r.data.data:[];
    };
    let rows = await get1();
    if(rows.length===0) rows = await get2();
    if(rows.length===0) rows = await get3();
    const items = mapRows(rows);
    return res.json({ ok:true, msg:`Resultados reales: ${origin} → ${dest} (${items.length})`, count:items.length, hasResults:items.length>0, results:items, flights:items, data:{ items } });
  } catch(err){
    return res.status(err.response?.status||500).json({ ok:false, error:"Provider error", detail: err.response?.data||err.message });
  }
});
    }

    // Token desde env var o header-proxy (para pruebas)
    const effToken = process.env.TRAVELPAYOUTS_TOKEN;
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
