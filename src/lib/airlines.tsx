// src/lib/airlines.tsx
import * as React from "react";

// Fallback por nombre → código IATA (por si el offer trae solo nombre)
const NAME_TO_CODE: Record<string, string> = {
  "IBERIA":"IB","TURKISH AIRLINES":"TK","KLM":"KL","AIR FRANCE":"AF","AMERICAN AIRLINES":"AA",
  "UNITED":"UA","DELTA":"DL","AEROMEXICO":"AM","LATAM":"LA","LUFTHANSA":"LH","BRITISH AIRWAYS":"BA",
  "RYANAIR":"FR","VUELING":"VY","EASYJET":"U2","WIZZAIR":"W6","QATAR AIRWAYS":"QR","EMIRATES":"EK",
  "QANTAS":"QF","COPA AIRLINES":"CM","AVIANCA":"AV","JETBLUE":"B6","SPIRIT":"NK","ALASKA AIRLINES":"AS",
  "AIR CANADA":"AC"
};

export function codeFromName(name?: string | null) {
  if (!name) return null;
  const key = String(name).toUpperCase().trim();
  return NAME_TO_CODE[key] || null;
}

// Extrae un código IATA (2 letras) desde la oferta (Amadeus/compat)
export function getAirlineCode(offer: any): string | null {
  const out: string[] = [];
  const add = (v?: string) => {
    if (typeof v === "string") {
      const cc = v.toUpperCase().replace(/[^A-Z0-9]/g, "");
      if (cc.length === 2 && !out.includes(cc)) out.push(cc);
    }
  };

  if (Array.isArray(offer?.validatingAirlineCodes)) offer.validatingAirlineCodes.forEach(add);
  add(offer?.validatingCarrierCode);

  (offer?.itineraries || []).forEach((it: any) =>
    (it?.segments || []).forEach((s: any) => {
      add(s?.carrierCode);
      add(s?.marketingCarrierCode);
      add(s?.operating?.carrierCode);
    })
  );

  if (!out.length) {
    const byName = codeFromName(
      offer?.airlineName || offer?.carrierName || offer?.itineraries?.[0]?.segments?.[0]?.carrierName
    );
    if (byName) out.push(byName);
  }
  return out[0] || null;
}

export function airlineLogoSrc(code: string, size = 44) {
  return `https://pics.avs.io/${size}/${size}/${code}.png`;
}
export function airlineLogoFallback(code: string) {
  return `https://images.kiwi.com/airlines/64/${code}.png`;
}

type LogoProps = { code?: string | null; name?: string; size?: number; className?: string };

// Componente listo para usar en React
export function AirlineLogo({ code, name = "Airline", size = 40, className }: LogoProps) {
  if (!code) {
    return (
      <div
        className={className || "rounded-xl bg-black/10 flex items-center justify-center"}
        style={{ width: size, height: size }}
        title={name}
      >
        {(name[0] || "A").toUpperCase()}
      </div>
    );
  }
  const [src, setSrc] = React.useState(airlineLogoSrc(code, size));
  return (
    <img
      src={src}
      alt={`${name} logo`}
      width={size}
      height={size}
      className={className || "rounded-xl bg-black/10 p-1 object-contain"}
      onError={() => setSrc(airlineLogoFallback(code))}
    />
  );
}
