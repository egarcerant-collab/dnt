import 'server-only';
import crypto from 'crypto';
import type { Rol } from '../sesion';
import { actualizarJson, getStore } from './store';

/**
 * Notificaciones y preguntas entre la EPSI y los prestadores.
 * - casoId = null → notificación general para la IPS.
 * - La EPSI envía notificaciones o preguntas; el prestador responde.
 */
export type TipoMensaje = 'notificacion' | 'pregunta' | 'respuesta';

export interface Mensaje {
  id: string;
  casoId: string | null;
  ips: string;
  tipo: TipoMensaje;
  texto: string;
  autorRol: Rol;
  autorNombre: string;
  fecha: string;
  leidoEpsi: boolean;
  leidoPrestador: boolean;
}

const ARCHIVO = 'mensajes.json';

export async function listarMensajes(): Promise<Mensaje[]> {
  return (await getStore().leer<Mensaje[]>(ARCHIVO)) ?? [];
}

export async function enviarMensaje(m: Pick<Mensaje, 'casoId' | 'ips' | 'tipo' | 'texto' | 'autorRol' | 'autorNombre'>) {
  const deEpsi = m.autorRol !== 'prestador';
  await actualizarJson<Mensaje[]>(ARCHIVO, () => [], lista => {
    lista.push({ ...m, id: crypto.randomUUID(), fecha: new Date().toISOString(), leidoEpsi: deEpsi, leidoPrestador: !deEpsi });
  });
}

/** Marca como leídos los mensajes que el rol actual ve en un caso (o los generales de una IPS). */
export async function marcarLeidos(rol: Rol, filtro: { casoId?: string; ips?: string }) {
  const campo = rol === 'prestador' ? 'leidoPrestador' : 'leidoEpsi';
  const aplica = (m: Mensaje) =>
    !m[campo] && (filtro.casoId ? m.casoId === filtro.casoId : m.casoId === null && m.ips === filtro.ips);
  if (!(await listarMensajes()).some(aplica)) return;
  await actualizarJson<Mensaje[]>(ARCHIVO, () => [], lista => {
    for (const m of lista) if (aplica(m)) m[campo] = true;
  });
}

export function noLeidos(lista: Mensaje[], rol: Rol, ips?: string) {
  return rol === 'prestador' ? lista.filter(m => m.ips === ips && !m.leidoPrestador) : lista.filter(m => !m.leidoEpsi);
}
