import crypto from 'crypto';
import { NextResponse } from 'next/server';
import { TAMANO_MAX, tipoDeclarado } from '@/lib/dnt/historias';
import { autorizarCargaCaso } from '@/lib/dnt/permisos';
import { DriveStore, getStore } from '@/lib/dnt/store';
import { firmarToken } from '@/lib/sesion';

export interface TokenSubida { casoId: string; ips: string; control?: number; archivo: string; nombre: string; mime: string; tamano: number; por: string }

/**
 * Paso 1 de la subida directa: autoriza y abre una sesión de subida en Drive.
 * El navegador sube el archivo directo a Google (sin pasar por Vercel) y luego confirma.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const id = decodeURIComponent((await params).id);
  const auth = await autorizarCargaCaso(id);
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.estado });

  const store = getStore();
  if (!(store instanceof DriveStore)) return NextResponse.json({ modo: 'servidor' });

  const b = (await req.json().catch(() => null)) as { nombre?: string; mime?: string; tamano?: number; control?: number } | null;
  const tipo = tipoDeclarado(String(b?.mime ?? ''), String(b?.nombre ?? ''));
  const tamano = Number(b?.tamano);
  if (!tipo) return NextResponse.json({ error: 'Solo se permiten archivos PDF, JPG o PNG' }, { status: 400 });
  if (!(tamano > 0 && tamano <= TAMANO_MAX)) return NextResponse.json({ error: 'El archivo supera 30 MB' }, { status: 413 });

  const archivo = `${crypto.randomUUID()}.${tipo.ext}`;
  const origen = req.headers.get('origin') ?? new URL(req.url).origin;
  try {
    const uploadUrl = await store.iniciarSubidaDirecta(archivo, tipo.mime, tamano, origen);
    const datos: TokenSubida = {
      casoId: id, ips: auth.ips, control: Number(b?.control) || undefined, archivo,
      nombre: String(b?.nombre ?? 'historia'), mime: tipo.mime, tamano, por: auth.sesion.nombre,
    };
    return NextResponse.json({ modo: 'directo', uploadUrl, token: firmarToken(datos, 60 * 60) });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 });
  }
}
