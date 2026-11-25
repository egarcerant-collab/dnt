import 'server-only';
import { hoyColombia } from '../fecha';
import { getStore } from './store';

/**
 * Semana epidemiológica de corte de la base (la que define el administrador al cargarla).
 * Si no se ha definido, se usa la semana epidemiológica en curso.
 */
const ARCHIVO = 'base-meta.json';

export interface SemanaBase { semana: number; anio: number; definida: boolean }

/** Semana epidemiológica INS/MMWR: domingo a sábado; la semana 1 es la que contiene el 4 de enero (≥ 4 días del año). */
export function semanaEpidemiologica(iso: string): { semana: number; anio: number } {
  const d = new Date(`${iso.slice(0, 10)}T12:00:00Z`);
  const inicioSemana = (anio: number) => {
    const ene4 = new Date(Date.UTC(anio, 0, 4, 12));
    return new Date(ene4.getTime() - ene4.getUTCDay() * 864e5); // domingo de la semana que contiene el 4 de enero
  };
  let anio = d.getUTCFullYear();
  if (d < inicioSemana(anio)) anio--;
  else if (d >= inicioSemana(anio + 1)) anio++;
  return { semana: Math.floor((d.getTime() - inicioSemana(anio).getTime()) / (7 * 864e5)) + 1, anio };
}

export async function semanaDeLaBase(): Promise<SemanaBase> {
  const meta = await getStore().leer<{ semana: number; anio: number }>(ARCHIVO).catch(() => null);
  if (meta?.semana) return { semana: meta.semana, anio: meta.anio, definida: true };
  return { ...semanaEpidemiologica(hoyColombia()), definida: false };
}

export async function guardarSemanaBase(semana: number, anio: number, por: string) {
  if (!Number.isInteger(semana) || semana < 1 || semana > 53) throw new Error('La semana epidemiológica debe estar entre 1 y 53');
  if (!Number.isInteger(anio) || anio < 2020 || anio > 2100) throw new Error('Año inválido');
  await getStore().escribir(ARCHIVO, { semana, anio, actualizado: new Date().toISOString(), por });
}
