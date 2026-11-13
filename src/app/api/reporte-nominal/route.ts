import { NextResponse } from 'next/server';
import { generarReporteNominal } from '@/lib/dnt/reporte-nominal';
import { getStore } from '@/lib/dnt/store';
import { esEpsi, getSesion } from '@/lib/sesion';

export const maxDuration = 60;

/**
 * Formato de reporte nominal (Word) para una IPS de primer nivel.
 * ?primaria=<IPS primer nivel>&ruta=<prestador de seguimiento>. El prestador solo genera los de sus propios niños.
 */
export async function GET(req: Request) {
  const sesion = await getSesion();
  if (!sesion) return NextResponse.json({ error: 'No autorizado' }, { status: 403 });
  const q = new URL(req.url).searchParams;
  const primaria = q.get('primaria') ?? '';
  const ruta = sesion.rol === 'prestador' ? sesion.ips : q.get('ruta') ?? '';
  if (!primaria || !ruta) return NextResponse.json({ error: 'Indica la IPS de primer nivel y el prestador' }, { status: 400 });
  if (sesion.rol !== 'prestador' && !esEpsi(sesion.rol)) return NextResponse.json({ error: 'No autorizado' }, { status: 403 });

  const r = await generarReporteNominal({ primaria, ruta });
  const store = getStore();
  const log = (await store.leer<object[]>('auditoria-exportaciones.json')) ?? [];
  log.push({ fecha: new Date().toISOString(), usuario: sesion.usuario, tipo: 'reporte-nominal', ips: `${ruta} → ${primaria}`, casos: r.ninos });
  await store.escribir('auditoria-exportaciones.json', log.slice(-5000));
  return new Response(new Uint8Array(r.docx), {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'Content-Disposition': `attachment; filename="${r.nombre}"`,
      'Cache-Control': 'no-store',
    },
  });
}
