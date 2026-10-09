import { NextResponse } from 'next/server';
import { registrarCargue } from '@/lib/dnt/preregistro';
import { esEpsi, getSesion } from '@/lib/sesion';

export const maxDuration = 60;

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
