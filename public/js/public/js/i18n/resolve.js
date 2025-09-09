// public/js/i18n/resolve.js
const LT_URL = "https://libretranslate.com/translate"; // traductor (auto -> en)

function normalize(str = "") {
  return str.toLowerCase().normalize("NFD").replace(/\p{Diacritic}/gu, "")
           .replace(/\s+/g, " ").trim();
}

// Atajos de exónimos (funciona aunque falle el traductor)
const QUICK_EXONYMS = {
  "londres":"london","milan":"milan","munich":"munich","múnich":"munich",
  "francfort":"frankfurt","colonia":"cologne","bruselas":"brussels","ginebra":"geneva",
  "ciudad de mexico":"mexico city","nueva york":"new york","pekin":"beijing","moscu":"moscow",
  "praga":"prague","viena":"vienna","copenhague":"copenhagen","estocolmo":"stockholm",
  "cracovia":"krakow","varsovia":"warsaw","venecia":"venice","sevilla":"seville",
  "napoles":"naples","florencia":"florence","tunez":"tunis","atenas":"athens","estambul":"istanbul"
};

async function translateToEnglish(raw) {
  const n = normalize(raw);
  if (!n) return "";
  if (/^[A-Z0-9]{2,4}$/i.test(raw.trim())) return raw.trim().toUpperCase(); // IATA/ICAO
  if (QUICK_EXONYMS[n]) return QUICK_EXONYMS[n];

  try {
    const r = await fetch(LT_URL, {
      method: "POST",
      headers: {"Content-Type":"application/json"},
      body: JSON.stringify({ q: raw, source:"auto", target:"en", format:"text" })
    });
    if (!r.ok) throw 0;
    const d = await r.json();
    const out = (d.translatedText || "").toString().trim();
    return normalize(out) || n;
  } catch {
    return n; // fallback si hay CORS o error
  }
}

async function tryCountry(raw) {
  const q = raw.trim();
  // 1) por traducción (ES → EN)
  try {
    const r = await fetch(`https://restcountries.com/v3.1/translation/${encodeURIComponent(q)}`);
    if (r.ok) {
      const data = await r.json();
      if (Array.isArray(data) && data.length) {
        const c = data[0];
        const iso2 = c?.cca2 || "";
        const enName = c?.name?.common || "";
        if (iso2 && enName) return { iso2, enName };
      }
    }
  } catch {}
  // 2) por nombre directo
  try {
    const r2 = await fetch(`https://restcountries.com/v3.1/name/${encodeURIComponent(q)}?fullText=false`);
    if (r2.ok) {
      const d2 = await r2.json();
      if (Array.isArray(d2) && d2.length) {
        const c = d2[0];
        const iso2 = c?.cca2 || "";
        const enName = c?.name?.common || "";
        if (iso2 && enName) return { iso2, enName };
      }
    }
  } catch {}
  return null;
}

export async function resolveQueryUniversal(raw) {
  if (!raw || !raw.trim()) return null;
  const asCountry = await tryCountry(raw);
  if (asCountry) return { kind: "country", iso2: asCountry.iso2, countryEn: asCountry.enName, raw };
  const cityEn = await translateToEnglish(raw);
  return { kind: "city", cityEn, raw };
}
