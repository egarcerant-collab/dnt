import { listarHistorias } from '@/lib/dnt/historias';
import { getStore } from '@/lib/dnt/store';
import { esEpsi, getSesion } from '@/lib/sesion';

/** Descarga protegida: EPSI/admin cualquier historia; el prestador solo las de su IPS. */
export async function GET(_req: Request, { params }: { params: Promise<{ hid: string }> }) {
  const sesion = await getSesion();
  if (!sesion || sesion.debeCambiarClave) return new Response('No autorizado', { status: 403 });

  const { hid } = await params;
  const h = (await listarHistorias()).find(x => x.id === hid);
  if (!h) return new Response('No encontrado', { status: 404 });
  if (!esEpsi(sesion.rol) && h.ips !== sesion.ips) return new Response('No autorizado', { status: 403 });

  const contenido = await getStore().leerArchivo(h.archivo);
  if (!contenido) return new Response('Archivo no disponible', { status: 404 });

  return new Response(new Uint8Array(contenido), {
    headers: {
      'Content-Type': h.mime,
      'Content-Disposition': `inline; filename*=UTF-8''${encodeURIComponent(h.nombreOriginal)}`,
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
