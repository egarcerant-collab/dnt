import { NextResponse } from 'next/server';
import { leerExcel } from '@/lib/dnt/excel-source';
import { diagnosticarStore } from '@/lib/dnt/store';
import { verificarCorreo } from '@/lib/correo';
import { getSesion } from '@/lib/sesion';

/** Estado de configuración para el administrador: Drive, cuenta de servicio y base. */
export async function GET() {
  const sesion = await getSesion();
  if (!sesion) {
    return NextResponse.json({ error: 'No autorizado: este navegador no tiene sesión iniciada en Nutria. Entra primero a la página principal con usuario y contraseña de administrador.' }, { status: 401 });
  }
  if (sesion.rol !== 'admin') {
    return NextResponse.json({ error: `No autorizado: la sesión actual es de ${sesion.nombre} (rol ${sesion.rol}). Cierra sesión y entra como administrador (egarcerant).` }, { status: 403 });
  }

  const r: Record<string, unknown> = { ...(await diagnosticarStore()) };
  try {
    const base = await leerExcel();
    r.base = base.disponible ? `cargada (${base.casos.length} casos, origen: ${base.origen})` : 'NO CARGADA';
  } catch (e) {
    r.base = `ERROR: ${(e as Error).message}`;
  }
  r.SESSION_SECRET = process.env.SESSION_SECRET ? 'configurado' : 'derivado de ADMIN_PASSWORD';
  r.correo = await verificarCorreo();
  r.CRON_SECRET = process.env.CRON_SECRET ? 'configurado (informe semanal activo)' : 'FALTA (no se enviará el informe de los lunes)';
  return NextResponse.json(r);
}
