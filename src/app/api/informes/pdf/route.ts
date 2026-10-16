import { NextResponse } from 'next/server';
import { firmantesDisponibles } from '@/lib/firmas';
import { generarInformePdf } from '@/lib/dnt/informe-pdf';
import { getStore } from '@/lib/dnt/store';
import { esEpsi, getSesion } from '@/lib/sesion';

export const maxDuration = 60;

/**
 * Informe PDF con membrete y firmas. ?ips=<IPS> (vacío = consolidado de la red) &firmante=<id> (hasta 3).
 * Solo se aceptan la firma propia y las que sus dueños compartieron.
 */
export async function GET(req: Request) {
  const sesion = await getSesion();
  if (!sesion || !esEpsi(sesion.rol)) return NextResponse.json({ error: 'No autorizado' }, { status: 403 });

  const q = new URL(req.url).searchParams;
  // Tipo de informe: ips (una IPS), territorio (departamento y municipios opcionales) o red (consolidado)
  const tipo = q.get('tipo') || (q.get('ips') ? 'ips' : 'red');
  const ips = tipo === 'ips' ? q.get('ips') || undefined : undefined;
  const depto = tipo === 'territorio' ? q.get('depto') || undefined : undefined;
  const municipios = depto ? [...new Set(q.getAll('municipio').filter(Boolean))].slice(0, 60) : [];
  if (tipo === 'ips' && !ips) return NextResponse.json({ error: 'Selecciona la IPS' }, { status: 400 });
  if (tipo === 'territorio' && !depto) return NextResponse.json({ error: 'Selecciona el departamento' }, { status: 400 });
  const pedidos = [...new Set(q.getAll('firmante'))].slice(0, 3);
  const disponibles = await firmantesDisponibles(sesion.id);
  const firmantes = pedidos.map(id => disponibles.find(f => f.id === id)).filter(f => !!f);
  if (firmantes.length !== pedidos.length) return NextResponse.json({ error: 'Una de las firmas seleccionadas no está disponible' }, { status: 400 });

  try {
    const r = await generarInformePdf({ ips, depto, municipios, nominal: q.get('nominal') === 'si', firmantes, generadoPor: sesion.nombre });
    const store = getStore();
    const log = (await store.leer<object[]>('auditoria-exportaciones.json')) ?? [];
    log.push({ fecha: new Date().toISOString(), usuario: sesion.usuario, tipo: 'informe-pdf', ips: ips ?? (depto ? [depto, ...municipios].join(' / ') : 'RED'), firmantes: firmantes.map(f => f.nombre), casos: r.casos });
    await store.escribir('auditoria-exportaciones.json', log.slice(-5000));
    return new Response(r.pdf as BodyInit, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename="${r.nombre}"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}
