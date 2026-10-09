import { NextResponse } from 'next/server';
import { leerPreregistro, registrarCargue } from '@/lib/dnt/preregistro';
import { esEpsi, getSesion } from '@/lib/sesion';

export const maxDuration = 60;

/** Estado del pre-registro por niño, para mostrarlo en Cruce de bases. */
export async function GET() {
  const sesion = await getSesion();
  if (!sesion || !esEpsi(sesion.rol)) return NextResponse.json({ error: 'No autorizado' }, { status: 403 });
  const pre = await leerPreregistro();
  const ultimo = pre.cargues.at(-1);
  return NextResponse.json(
    {
      registros: Object.fromEntries(Object.values(pre.registros).map(r => [r.clave, { estado: r.estado, ips: r.ipsSeguimiento ?? '', casoId: r.casoId ?? '' }])),
      cargues: pre.cargues.length,
      ultimoCargue: ultimo ? { id: ultimo.id, fecha: ultimo.fecha, por: ultimo.por, nuevos: ultimo.nuevos } : null,
    },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}

/** Registra un cargue de la base externa: los niños que faltan en Nutria pasan al pre-registro. */
export async function POST(req: Request) {
  const sesion = await getSesion();
  if (!sesion || !esEpsi(sesion.rol)) return NextResponse.json({ error: 'No autorizado' }, { status: 403 });
  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: 'Datos inválidos' }, { status: 400 });
  try {
    const cargue = await registrarCargue(body, sesion.nombre);
    return NextResponse.json(cargue);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}
