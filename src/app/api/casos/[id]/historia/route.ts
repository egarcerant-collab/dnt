import { NextResponse } from 'next/server';
import { TAMANO_MAX_SERVIDOR, guardarHistoria } from '@/lib/dnt/historias';
import { autorizarCargaCaso } from '@/lib/dnt/permisos';

/** Subida a través del servidor (almacenamiento local o archivos de hasta 4 MB). */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const id = decodeURIComponent((await params).id);
  const auth = await autorizarCargaCaso(id);
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.estado });

  const form = await req.formData().catch(() => null);
  const archivo = form?.get('archivo');
  const control = Number(form?.get('control')) || undefined;
  if (!(archivo instanceof File) || archivo.size === 0) return NextResponse.json({ error: 'Adjunta un archivo' }, { status: 400 });
  if (archivo.size > TAMANO_MAX_SERVIDOR) return NextResponse.json({ error: 'El archivo supera 4 MB' }, { status: 413 });

  try {
    await guardarHistoria({
      casoId: id,
      ips: auth.ips,
      control,
      nombreOriginal: archivo.name,
      contenido: Buffer.from(await archivo.arrayBuffer()),
      subidoPor: auth.sesion.nombre,
    });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
  return NextResponse.json({ ok: true });
}
