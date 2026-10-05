import { NextResponse } from 'next/server';
import { crearRespaldo } from '@/lib/respaldo';

export const maxDuration = 60;

/**
 * Respaldo diario automático (6:00 a. m. hora Colombia) de la información de la app.
 * Lo ejecuta Vercel Cron (vercel.json) con el encabezado Authorization: Bearer CRON_SECRET.
 */
export async function GET(req: Request) {
  const secreto = process.env.CRON_SECRET;
  if (!secreto || req.headers.get('authorization') !== `Bearer ${secreto}`) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }
  try {
    const r = await crearRespaldo('automatico');
    return NextResponse.json({ ok: true, ...r });
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 500 });
  }
}
