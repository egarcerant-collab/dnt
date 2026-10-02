import { NextResponse } from 'next/server';
import { detectarTipo, registrarHistoria } from '@/lib/dnt/historias';
import { autorizarCargaCaso } from '@/lib/dnt/permisos';
import { DriveStore, getStore } from '@/lib/dnt/store';
import { verificarToken } from '@/lib/sesion';
import type { TokenSubida } from '../iniciar/route';

/** Paso 2 de la subida directa: verifica el archivo que quedó en Drive y lo registra. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const id = decodeURIComponent((await params).id);
  const auth = await autorizarCargaCaso(id);
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.estado });

  const b = (await req.json().catch(() => null)) as { token?: string; fileId?: string } | null;
  const t = verificarToken<TokenSubida>(String(b?.token ?? ''));
  if (!t || t.casoId !== id || !b?.fileId) return NextResponse.json({ error: 'Autorización de subida inválida o vencida' }, { status: 400 });

  const store = getStore();
  if (!(store instanceof DriveStore)) return NextResponse.json({ error: 'Almacenamiento no compatible' }, { status: 400 });

  try {
    const { tamano, inicio } = await store.verificarSubida(b.fileId, t.archivo);
    const tipo = detectarTipo(inicio);
    if (!tipo || tipo.mime !== t.mime) {
      await store.eliminarPorId(b.fileId);
      return NextResponse.json({ error: 'El archivo no es un PDF, JPG o PNG válido' }, { status: 400 });
    }
    await registrarHistoria({
      id: t.archivo.split('.')[0], casoId: id, ips: t.ips, control: t.control, nombreOriginal: t.nombre,
      archivo: t.archivo, mime: tipo.mime, tamano, subidoPor: t.por, origen: 'app',
    });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
  return NextResponse.json({ ok: true });
}
