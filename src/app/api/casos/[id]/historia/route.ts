import { NextResponse } from 'next/server';
import { leerExcel } from '@/lib/dnt/excel-source';
import { TAMANO_MAX, guardarHistoria } from '@/lib/dnt/historias';
import { getSesion } from '@/lib/sesion';

/** Carga de historia clínica de un niño (PDF/JPG/PNG, máx. 10 MB). */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const sesion = await getSesion();
  if (!sesion || sesion.debeCambiarClave || (sesion.rol !== 'prestador' && sesion.rol !== 'admin')) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 403 });
  }
  const id = decodeURIComponent((await params).id);
  const caso = leerExcel().casos.find(c => c.id === id);
  if (!caso) return NextResponse.json({ error: 'Caso no encontrado' }, { status: 404 });
  if (sesion.rol === 'prestador' && caso.ipsSeguimiento !== sesion.ips) {
    return NextResponse.json({ error: 'El caso no pertenece a tu IPS' }, { status: 403 });
  }

  const form = await req.formData().catch(() => null);
  const archivo = form?.get('archivo');
  if (!(archivo instanceof File) || archivo.size === 0) return NextResponse.json({ error: 'Adjunta un archivo' }, { status: 400 });
  if (archivo.size > TAMANO_MAX) return NextResponse.json({ error: 'El archivo supera 10 MB' }, { status: 413 });

  try {
    await guardarHistoria({
      casoId: id,
      ips: caso.ipsSeguimiento,
      nombreOriginal: archivo.name,
      contenido: Buffer.from(await archivo.arrayBuffer()),
      subidoPor: sesion.nombre,
    });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
  return NextResponse.json({ ok: true });
}
