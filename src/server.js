import express from "express";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";
import { placesHandler } from "./api/places.js";
import { flightsHandler } from "./api/flights.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(cors());
app.use(express.static("public"));

app.get("/api/places", placesHandler);
app.get("/api/flights", flightsHandler);
app.get("/api/health", (_req,res)=>res.send("ok"));
app.get("/", (_req,res)=>res.sendFile(path.join(__dirname, "../views/index.html")));

const PORT = process.env.PORT || 3000;
app.listen(PORT, ()=> console.log("server on", PORT));
