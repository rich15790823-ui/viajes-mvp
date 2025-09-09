import countries from "i18n-iso-countries";
import en from "i18n-iso-countries/langs/en.json";
import es from "i18n-iso-countries/langs/es.json";

countries.registerLocale(en);
countries.registerLocale(es);

export function normalize(str = "") {
  return str
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[^a-z0-9\s-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function parseCountry(input: string): { iso2: string; enName: string } | null {
  const n = normalize(input);
  let iso2 = countries.getAlpha2Code(n, "es");
  if (!iso2) iso2 = countries.getAlpha2Code(n, "en");
  if (!iso2) return null;
  const enName = countries.getName(iso2, "en")!;
  return { iso2, enName };
}
