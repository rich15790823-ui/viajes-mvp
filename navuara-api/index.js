import express from "express";
import cors from "cors";

const app = express();
app.use(express.json());
app.use(cors());

// health check público
app.get("/health", (_, res) => res.send("ok"));

// endpoint de prueba (sin token)
app.post("/api/search", (req, res) => {
  const { origin, dest } = req.body || {};
  res.json({ ok: true, msg: `Búsqueda recibida: ${origin} → ${dest}` });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log("Servidor corriendo en puerto", PORT));
