/**
 * Sube una historia clínica desde el navegador.
 * - Con Google Drive: el archivo va directo a Drive (sin el límite de 4,5 MB de Vercel) y luego se confirma.
 * - Sin Drive (desarrollo local): se envía al servidor.
 */
export const MB = 1024 * 1024;
export const TAMANO_MAX_HC = 30 * MB;
export const ACEPTA_HC = 'application/pdf,image/jpeg,image/png';

async function json(res: Response) {
  const d = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(d.error || `Error ${res.status}`);
  return d;
}

function putConProgreso(url: string, archivo: File, onProgreso?: (pct: number) => void): Promise<{ id: string }> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', url);
    xhr.setRequestHeader('Content-Type', archivo.type || 'application/octet-stream');
    xhr.upload.onprogress = e => e.lengthComputable && onProgreso?.(Math.round((e.loaded / e.total) * 100));
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          resolve(JSON.parse(xhr.responseText));
        } catch {
          reject(new Error('Respuesta inválida de Google Drive'));
        }
      } else reject(new Error(`Google Drive rechazó el archivo (${xhr.status})`));
    };
    xhr.onerror = () => reject(new Error('Se perdió la conexión al subir el archivo'));
    xhr.send(archivo);
  });
}

export async function subirHistoria(casoId: string, archivo: File, control?: number, onProgreso?: (pct: number) => void) {
  if (archivo.size > TAMANO_MAX_HC) throw new Error('El archivo supera 30 MB');
  const base = `/api/casos/${encodeURIComponent(casoId)}/historia`;
  const inicio = await json(
    await fetch(`${base}/iniciar`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nombre: archivo.name, mime: archivo.type, tamano: archivo.size, control }),
    }),
  );

  if (inicio.modo === 'servidor') {
    const fd = new FormData();
    fd.append('archivo', archivo);
    if (control) fd.append('control', String(control));
    await json(await fetch(base, { method: 'POST', body: fd }));
    onProgreso?.(100);
    return;
  }

  const subido = await putConProgreso(inicio.uploadUrl, archivo, onProgreso);
  await json(
    await fetch(`${base}/confirmar`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: inicio.token, fileId: subido.id }),
    }),
  );
}
