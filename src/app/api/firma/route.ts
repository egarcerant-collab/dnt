import { imagenFirma } from '@/lib/firmas';
import { getSesion } from '@/lib/sesion';
import { listarUsuarios } from '@/lib/usuarios';

/** Vista previa de la firma propia (solo su dueño). */
export async function GET() {
  const sesion = await getSesion();
  if (!sesion || sesion.rol === 'prestador') return new Response('No autorizado', { status: 403 });
  const u = (await listarUsuarios()).find(x => x.id === sesion.id);
  const bytes = u?.firma ? await imagenFirma(u.firma.archivo) : null;
  if (!bytes) return new Response('Sin firma', { status: 404 });
  return new Response(new Uint8Array(bytes), {
    headers: { 'Content-Type': u!.firma!.archivo.endsWith('.png') ? 'image/png' : 'image/jpeg', 'Cache-Control': 'private, no-store' },
  });
}
