import express from "express";
import cors from "cors";
import { placesHandler } from "./api/places.js";

const app = express();
app.use(express.static("public"));
app.use(cors());
app.get("/api/places", placesHandler);

// Salud
app.get("/api/health", (_req,res)=>res.send("ok"));

const PORT = process.env.PORT || 3000;
app.listen(PORT, ()=> console.log("server on", PORT));
