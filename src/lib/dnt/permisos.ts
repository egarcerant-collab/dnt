import 'server-only';
import { getSesion, type Sesion } from '../sesion';
import { leerExcel } from './excel-source';

/** Verifica que la sesión pueda cargar información al caso (prestador de su IPS o administrador). */
export async function autorizarCargaCaso(id: string): Promise<{ sesion: Sesion; ips: string } | { error: string; estado: number }> {
  const sesion = await getSesion();
  if (!sesion || sesion.debeCambiarClave || (sesion.rol !== 'prestador' && sesion.rol !== 'admin')) return { error: 'No autorizado', estado: 403 };
  const caso = (await leerExcel()).casos.find(c => c.id === id);
  if (!caso) return { error: 'Caso no encontrado', estado: 404 };
  if (sesion.rol === 'prestador' && caso.ipsSeguimiento !== sesion.ips) return { error: 'El caso no pertenece a tu IPS', estado: 403 };
  return { sesion, ips: caso.ipsSeguimiento };
}
