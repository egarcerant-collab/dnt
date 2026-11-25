import { NextResponse } from 'next/server';
import { guardarSemanaBase } from '@/lib/dnt/semana';
import { getSesion } from '@/lib/sesion';

/** El administrador fija la semana epidemiológica de corte de la base. */
export async function POST(req: Request) {
  const sesion = await getSesion();
  if (sesion?.rol !== 'admin') return NextResponse.json({ error: 'No autorizado' }, { status: 403 });
  const b = (await req.json().catch(() => ({}))) as { semana?: unknown; anio?: unknown };
  try {
    await guardarSemanaBase(Number(b.semana), Number(b.anio), sesion.usuario);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}
