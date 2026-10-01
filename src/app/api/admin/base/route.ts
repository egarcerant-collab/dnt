import { NextResponse } from 'next/server';
import { ARCHIVO_BASE, invalidarBase, validarLibroBase } from '@/lib/dnt/excel-source';
import { getStore } from '@/lib/dnt/store';
import { getSesion } from '@/lib/sesion';

const TAMANO_MAX = 25 * 1024 * 1024;
const MIME_XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

/** El administrador carga la matriz de seguimiento; reemplaza la base anterior en el almacenamiento. */
export async function POST(req: Request) {
  const sesion = await getSesion();
  if (sesion?.rol !== 'admin') return NextResponse.json({ error: 'No autorizado' }, { status: 403 });

  const archivo = (await req.formData().catch(() => null))?.get('archivo');
  if (!(archivo instanceof File) || archivo.size === 0) return NextResponse.json({ error: 'Adjunta el Excel de la base' }, { status: 400 });
  if (archivo.size > TAMANO_MAX) return NextResponse.json({ error: 'El archivo supera 25 MB' }, { status: 413 });

  const contenido = Buffer.from(await archivo.arrayBuffer());
  const error = validarLibroBase(contenido);
  if (error) return NextResponse.json({ error }, { status: 400 });

  await getStore().guardarArchivo(ARCHIVO_BASE, contenido, MIME_XLSX);
  invalidarBase();
  return NextResponse.json({ ok: true });
}
