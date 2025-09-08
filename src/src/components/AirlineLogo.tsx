import * as React from "react";

type AirlineLogoProps = {
  code?: string | null;     // IATA de 2 letras: ej. "TK"
  name?: string | null;     // Nombre opcional: ej. "Turkish Airlines"
  size?: number;            // Tamaño del cuadro (px)
  className?: string;       // Clases extra (Tailwind, etc.)
};

const cdn1 = (code: string, size: number) =>
  `https://pics.avs.io/${size}/${size}/${code}.png`;
const cdn2 = (code: string) =>
  `https://images.kiwi.com/airlines/64/${code}.png`;

export default function AirlineLogo({
  code,
  name,
  size = 44,
  className = "",
}: AirlineLogoProps) {
  const cc = (code || "").toUpperCase().trim();

  // Fuentes (con fallback)
  const sources = React.useMemo(() => (cc ? [cdn1(cc, size), cdn2(cc)] : []), [cc, size]);
  const [idx, setIdx] = React.useState(0);   // índice del source actual

  // Si no hay código, placeholder N/A
  if (!cc) {
    return (
      <div
        role="img"
        aria-label="Airline unknown"
        className={`flex items-center justify-center rounded-xl bg-white/20 text-xs font-semibold ${className}`}
        style={{ width: size, height: size }}
      >
        N/A
      </div>
    );
  }

  const onError = () => {
    // intenta siguiente CDN; si ya no hay más, muestra siglas
    setIdx((i) => (i + 1 < sources.length ? i + 1 : -1));
  };

  // Último fallback: cuadro con siglas (p. ej., "TK")
  if (idx === -1 || sources.length === 0) {
    return (
      <div
        role="img"
        aria-label={`${name || cc} logo placeholder`}
        className={`flex items-center justify-center rounded-xl bg-white/20 text-sm font-semibold ${className}`}
        style={{ width: size, height: size }}
      >
        {cc}
      </div>
    );
  }

  // Logo desde CDN
  return (
    <img
      src={sources[idx]}
      alt={`${name || cc} logo`}
      width={size}
      height={size}
      loading="lazy"
      onError={onError}
      className={`rounded-xl object-contain bg-white/10 p-2 ${className}`}
      style={{ width: size, height: size }}
    />
  );
}
