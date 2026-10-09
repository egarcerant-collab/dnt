import 'server-only';
import { leerExcel, type CasoBase } from './excel-source';
import { getStore } from './store';

/**
 * Casos de la base de seguimiento: los del Excel más los incorporados desde el pre-registro
 * (niños de una base externa que se verificaron y se sumaron a Nutria). El Excel nunca se modifica.
 */
export const ARCHIVO_ADICIONALES = 'casos-adicionales.json';

export async function leerAdicionales(): Promise<Record<string, CasoBase>> {
  return (await getStore().leer<Record<string, CasoBase>>(ARCHIVO_ADICIONALES)) ?? {};
}

export async function casosFuente(): Promise<CasoBase[]> {
  const [excel, adicionales] = await Promise.all([leerExcel(), leerAdicionales()]);
  const ids = new Set(excel.casos.map(c => c.id));
  return [...excel.casos, ...Object.values(adicionales).filter(c => !ids.has(c.id))];
}
