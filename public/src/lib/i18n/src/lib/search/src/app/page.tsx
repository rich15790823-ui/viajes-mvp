import { resolveQueryUniversal } from "@/lib/search/resolve";

async function onSearch(raw: string) {
  const rq = await resolveQueryUniversal(raw);
  if (!rq) return;

  if (rq.kind === "country") {
    // aquí decides: abrir lista de ciudades del país o expandir a IATA del país
    // por ahora, puedes guardar el país seleccionado:
    setCountrySelected?.(rq.countryEn);
    return;
  }

  // ciudad: usa rq.cityEn
  await fetch(`/api/vuelos/buscar?q=${encodeURIComponent(rq.cityEn)}`);
}
