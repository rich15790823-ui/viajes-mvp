const URL_LT = process.env.NEXT_PUBLIC_LIBRE_TRANSLATE_URL || "";
const API_KEY = process.env.NEXT_PUBLIC_LIBRE_TRANSLATE_API_KEY || "";

const memCache = new Map<string, string>();

function normalize(str = "") {
  return str
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/\s+/g, " ")
    .trim();
}

const QUICK_EXONYMS: Record<string, string> = {
  "londres": "london","milan":"milan","munich":"munich","múnich":"munich",
  "francfort":"frankfurt","colonia":"cologne","bruselas":"brussels","ginebra":"geneva",
  "ciudad de mexico":"mexico city","nueva york":"new york","pekin":"beijing","moscu":"moscow",
  "praga":"prague","viena":"vienna","copenhague":"copenhagen","estocolmo":"stockholm",
  "cracovia":"krakow","varsovia":"warsaw","venecia":"venice","sevilla":"seville",
  "napoles":"naples","florencia":"florence","tunez":"tunis","atenas":"athens","estambul":"istanbul"
};

function getLocal(k: string){ try{return localStorage.getItem(k)}catch{return null} }
function setLocal(k: string,v:string){ try{localStorage.setItem(k,v)}catch{} }

export async function translateToEnglish(raw: string): Promise<string> {
  const n = normalize(raw);
  if (!n) return "";
  if (/^[A-Z0-9]{2,4}$/i.test(raw.trim())) return raw.trim().toUpperCase();
  if (QUICK_EXONYMS[n]) return QUICK_EXONYMS[n];
  if (memCache.has(n)) return memCache.get(n)!;
  const cached = getLocal(`tr:en:${n}`);
  if (cached){ memCache.set(n,cached); return cached; }
  if (!URL_LT){ memCache.set(n,n); return n; }

  try{
    const res = await fetch(URL_LT,{
      method:"POST",
      headers:{ "Content-Type":"application/json" },
      body: JSON.stringify({ q: raw, source:"auto", target:"en", format:"text", api_key: API_KEY || undefined }),
    });
    if(!res.ok) throw new Error(String(res.status));
    const data = await res.json();
    const out = (data?.translatedText || "").toString().trim();
    const finalOut = normalize(out) || n;
    memCache.set(n, finalOut); setLocal(`tr:en:${n}`, finalOut);
    return finalOut;
  }catch{
    memCache.set(n,n); return n;
  }
}
