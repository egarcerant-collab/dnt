import { NextResponse } from 'next/server';
import { crearRespaldo } from '@/lib/respaldo';
import { esRespaldo, getStore } from '@/lib/dnt/store';
import { getSesion } from '@/lib/sesion';

export const maxDuration = 60;

async function soloAdmin() {
  const s = await getSesion();
  return s?.rol === 'admin' ? s : null;
}

/** Lista los respaldos, o descarga uno con ?descargar=respaldo-AAAA-MM-DD.json.gz (solo administrador). */
export async function GET(req: Request) {
  if (!(await soloAdmin())) return NextResponse.json({ error: 'No autorizado' }, { status: 403 });
  const nombre = new URL(req.url).searchParams.get('descargar');
  if (!nombre) return NextResponse.json(await getStore().listarRespaldos());
  if (!esRespaldo(nombre)) return NextResponse.json({ error: 'Nombre inválido' }, { status: 400 });
  const buf = await getStore().leerArchivo(nombre);
  if (!buf) return NextResponse.json({ error: 'Respaldo no encontrado' }, { status: 404 });
  return new NextResponse(new Uint8Array(buf), {
    headers: {
      'Content-Type': 'application/gzip',
      'Content-Disposition': `attachment; filename="${nombre}"`,
      'Cache-Control': 'no-store',
    },
  });
}

/** Crea un respaldo inmediato y lo envía por correo. */
export async function POST() {
  const s = await soloAdmin();
  if (!s) return NextResponse.json({ error: 'No autorizado' }, { status: 403 });
  try {
    return NextResponse.json(await crearRespaldo('manual', s.usuario));
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
