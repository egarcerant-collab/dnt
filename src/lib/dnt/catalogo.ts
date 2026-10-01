/**
 * Catálogo maestro de IPS y municipios.
 * Unifica las variantes de escritura de la matriz (espacios, puntos, IPS/IPSI, sufijos de municipio).
 * Próximo paso: reemplazar por el código de habilitación REPS / NIT de cada prestador.
 */

/** Clave compacta: mayúsculas, sin tildes, solo letras y números. */
export function claveCompacta(v: unknown): string {
  return String(v ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');
}

// [patrón sobre la clave compacta, nombre canónico]
const IPS: Array<[RegExp, string]> = [
  [/^ALESALUD/, 'ALE SALUD SAS'],
  [/^ANASHANTA/, 'ANASHANTA IPS'],
  [/^ANOUTAWAKUAIPA/, 'ANOUTA WAKUAIPA IPS'],
  [/^AYUULEEPALA/, 'AYUULEEPALA IPSI'],
  [/^DUSAKAWI/, 'DUSAKAWI IPS'],
  [/^EITERRAJAWAPIA/, 'EITERRA JAWAPIA IPSI'],
  [/^ER+E+JE+R+IA/, 'ERREJERIA WAYUU IPSI'],
  [/^EZEQSALUD/, 'EZEQ SALUD IPS'],
  [/^GONAWINDUA/, 'GONAWINDUA ETTE ENNAKA IPS'],
  [/NAZARETH/, 'ESE HOSPITAL DE NAZARETH'],
  [/NUESTRASENORADELCARMEN/, 'ESE HOSPITAL NUESTRA SEÑORA DEL CARMEN'],
  [/PERPETUOSOCORRO/, 'HOSPITAL NUESTRA SEÑORA DEL PERPETUO SOCORRO'],
  [/NUESTRASENORADELPILAR/, 'HOSPITAL NUESTRA SEÑORA DEL PILAR'],
  [/ARMANDOPABON/, 'HOSPITAL ARMANDO PABON'],
  [/INMACULADACONCEPCION/, 'HOSPITAL INMACULADA CONCEPCION'],
  [/HOSPITALSANAGUSTIN/, 'HOSPITAL SAN AGUSTIN'],
  [/SANRAFAELDEALBANIA/, 'HOSPITAL SAN RAFAEL DE ALBANIA'],
  [/SANTARITADECASSIA/, 'HOSPITAL SANTA RITA DE CASSIA'],
  [/SANTATERESADEJESUS/, 'HOSPITAL SANTA TERESA DE JESUS DE AVILA'],
  [/COTTUSHI/, 'IPSI COTTUSHI SUSHI ANAIN WAKUA IPA'],
  [/KOTTUSHI/, 'IPSI KOTTUSHI SAO ANA'],
  [/JEKEET/, 'IPSI CENTRO EPIDEMIOLOGICO JEKEET AKUAITA'],
  [/KARAQUITA/, 'KARAQUITA IPSI'],
  [/SUPULAWAYUU/, 'SUPULA WAYUU IPS'],
  [/^KANKUAMA/, 'KANKUAMA IPSI'],
  [/^MAKUSHAMA/, 'MAKUSHAMA SALUD IPS'],
  [/^MUNDOMEDIC/, 'MUNDO MEDIC IPS SAS'],
  [/^OUTAJIAPULEE/, 'OUTAJIAPULEE IPSI'],
  [/^PALAIMA/, 'PALAIMA IPS'],
  [/^WALEKERU/, 'WALE KERU IPSI'],
  [/^WAYUUANASHI/, 'WAYUU ANASHI IPS'],
  [/^WAYUUTALATSHI/, 'WAYUU TALATSHI IPS'],
  [/^WINTUKWA/, 'WINTUKWA IPS'],
];

const MUNICIPIOS: Record<string, string> = {
  HATONUEVO: 'HATONUEVO',
  AGUSTINCODAZZI: 'AGUSTIN CODAZZI',
  CODAZZI: 'AGUSTIN CODAZZI',
};

const limpio = (v: unknown) =>
  String(v ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/\s+/g, ' ').trim();

export function ipsCanonica(v: unknown): string {
  const k = claveCompacta(v);
  if (!k) return '';
  const hit = IPS.find(([re]) => re.test(k));
  return hit ? hit[1] : limpio(v).replace(/\bI\.?\s?P\.?\s?S\.?\s?I?\.?(?=\s|$)/g, 'IPS');
}

export function municipioCanonico(v: unknown): string {
  return MUNICIPIOS[claveCompacta(v)] ?? limpio(v);
}

export function departamentoCanonico(v: unknown): string {
  const k = claveCompacta(v);
  if (k.includes('GUAJIRA')) return 'LA GUAJIRA';
  return limpio(v);
}
