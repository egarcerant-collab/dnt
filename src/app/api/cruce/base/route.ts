import { NextResponse } from 'next/server';
import { obtenerBase } from '@/lib/dnt/repositorio';
import { esEpsi, getSesion } from '@/lib/sesion';

/** Documentos de la base de Nutria para el cruce que se hace en el navegador (solo funcionarios EPSI). */
export async function GET() {
  const sesion = await getSesion();
  if (!sesion || !esEpsi(sesion.rol)) return NextResponse.json({ error: 'No autorizado' }, { status: 403 });
  const base = await obtenerBase();
  return NextResponse.json(
    base.casos.map(c => ({
      id: c.id,
      tipo: c.tipoDocumento,
      documento: c.documento,
      nombre: c.nombre,
      departamento: c.departamento,
      municipio: c.municipio,
      ips: c.ipsSeguimiento,
      notificacion: c.fechaNotificacion,
    })),
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
