import { parseCountry, normalize as norm } from "@/lib/i18n/countries";
import { translateToEnglish } from "@/lib/i18n/translate";

export type CanonQuery =
  | { kind: "country"; iso2: string; countryEn: string; raw: string }
  | { kind: "city"; cityEn: string; raw: string };

export async function resolveQueryUniversal(raw: string): Promise<CanonQuery | null> {
  const n = norm(raw);
  if (!n) return null;
  const c = parseCountry(raw);
  if (c) return { kind: "country", iso2: c.iso2, countryEn: c.enName, raw };
  const cityEn = await translateToEnglish(raw);
  return { kind: "city", cityEn, raw };
}
