import 'server-only';
import { departamentoCanonico, ipsCanonica, municipioCanonico } from './catalogo';
import { leerExcel } from './excel-source';
import { actualizarJson, getStore } from './store';
import type { Caso } from './types';

/**
 * Correcciones de la EPSI sobre la base de seguimiento, sin modificar el Excel original:
 * - mover el caso de departamento, municipio o IPS de seguimiento;
 * - eliminar un registro (duplicado, error de digitación). Se oculta pero se conserva y se puede restaurar.
 * Cada cambio queda en el historial del caso (quién, cuándo y qué).
 */
const ARCHIVO = 'ajustes-casos.json';

export interface AjusteCaso {
  departamento?: string;
  municipio?: string;
  ipsSeguimiento?: string;
  eliminado?: { motivo: string; por: string; fecha: string };
  historial: { fecha: string; por: string; cambio: string }[];
}
export type Ajustes = Record<string, AjusteCaso>;

export async function leerAjustes(): Promise<Ajustes> {
  return (await getStore().leer<Ajustes>(ARCHIVO)) ?? {};
}

export function aplicarAjuste<T extends Pick<Caso, 'departamento' | 'municipio' | 'ipsSeguimiento'>>(caso: T, a?: AjusteCaso): T {
  if (!a) return caso;
  return {
    ...caso,
    departamento: a.departamento ?? caso.departamento,
    municipio: a.municipio ?? caso.municipio,
    ipsSeguimiento: a.ipsSeguimiento ?? caso.ipsSeguimiento,
  };
}

/** Caso de la base con sus ajustes; null si no existe o fue eliminado. Para validar permisos sin cargar todo. */
export async function casoVigente(id: string) {
  const [excel, ajustes] = await Promise.all([leerExcel(), leerAjustes()]);
  const caso = excel.casos.find(c => c.id === id);
  if (!caso || ajustes[id]?.eliminado) return null;
  return aplicarAjuste(caso, ajustes[id]);
}

async function existe(id: string) {
  const caso = (await leerExcel()).casos.find(c => c.id === id);
  if (!caso) throw new Error('Caso no encontrado');
  return caso;
}

export async function moverCaso(id: string, destino: { departamento: string; municipio: string; ips: string }, por: string) {
  const original = await existe(id);
  const nuevo = {
    departamento: departamentoCanonico(destino.departamento),
    municipio: municipioCanonico(destino.municipio),
    ipsSeguimiento: ipsCanonica(destino.ips),
  };
  if (!nuevo.departamento || !nuevo.municipio || !nuevo.ipsSeguimiento) throw new Error('Indica departamento, municipio e IPS de destino');
  await actualizarJson<Ajustes>(ARCHIVO, () => ({}), ajustes => {
    const a: AjusteCaso = ajustes[id] ?? { historial: [] };
    const actual = aplicarAjuste(original, a);
    const cambios = (['departamento', 'municipio', 'ipsSeguimiento'] as const)
      .filter(k => nuevo[k] !== actual[k])
      .map(k => `${k === 'ipsSeguimiento' ? 'IPS' : k}: ${actual[k] || '—'} → ${nuevo[k]}`);
    if (!cambios.length) throw new Error('No hay cambios: el caso ya está en esa ubicación');
    // Solo se guarda lo que difiere del Excel; si se devuelve al valor original, se limpia el ajuste
    (['departamento', 'municipio', 'ipsSeguimiento'] as const).forEach(k => {
      if (nuevo[k] === original[k]) delete a[k];
      else a[k] = nuevo[k];
    });
    a.historial.push({ fecha: new Date().toISOString(), por, cambio: `Movido · ${cambios.join(' · ')}` });
    ajustes[id] = a;
  });
}

export async function eliminarCaso(id: string, motivo: string, por: string) {
  await existe(id);
  const m = motivo.trim();
  if (m.length < 10 || m.length > 300) throw new Error('Explica el motivo de la eliminación (entre 10 y 300 caracteres)');
  await actualizarJson<Ajustes>(ARCHIVO, () => ({}), ajustes => {
    const a: AjusteCaso = ajustes[id] ?? { historial: [] };
    if (a.eliminado) throw new Error('El registro ya estaba eliminado');
    const fecha = new Date().toISOString();
    a.eliminado = { motivo: m, por, fecha };
    a.historial.push({ fecha, por, cambio: `Eliminado · ${m}` });
    ajustes[id] = a;
  });
}

export async function restaurarCaso(id: string, por: string) {
  await actualizarJson<Ajustes>(ARCHIVO, () => ({}), ajustes => {
    const a = ajustes[id];
    if (!a?.eliminado) throw new Error('El registro no está eliminado');
    delete a.eliminado;
    a.historial.push({ fecha: new Date().toISOString(), por, cambio: 'Restaurado' });
  });
}
