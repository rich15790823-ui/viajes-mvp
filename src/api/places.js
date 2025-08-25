import fetch from "node-fetch";

const TEQUILA_KEY = process.env.TEQUILA_KEY;
const clean = (s="") => s.normalize("NFKD").replace(/[^\w\s-]/g,"").trim();

export async function placesHandler(req, res) {
  try {
    const term = clean(String(req.query.q || ""));
    if (!term) return res.json([]);

    const url = `https://tequila-api.kiwi.com/locations/query?` +
      `term=${encodeURIComponent(term)}&location_types=airport,city&limit=8&active_only=true`;

    const r = await fetch(url, { headers: { apikey: TEQUILA_KEY }});
    const json = await r.json();
    const items = (json.locations || []).map(x => ({
      id: x.id,
      code: x.code || x.id,
      name: x.name,
      city: x.city?.name || x.name,
      country: x.country?.name,
      type: x.type,
    }));
    res.json(items);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "places_failed" });
  }
}
