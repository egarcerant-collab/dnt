import { NextResponse } from 'next/server';
import { enviarInformes } from '@/lib/dnt/informe-ips';

/**
 * Informe semanal automático a todas las IPS con correo registrado.
 * Lo ejecuta Vercel Cron (vercel.json) con el encabezado Authorization: Bearer CRON_SECRET.
 */
export async function GET(req: Request) {
  const secreto = process.env.CRON_SECRET;
  if (!secreto || req.headers.get('authorization') !== `Bearer ${secreto}`) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }
  const r = await enviarInformes();
  return NextResponse.json({ enviados: r.filter(x => x.ok).length, fallidos: r.filter(x => !x.ok) });
}
