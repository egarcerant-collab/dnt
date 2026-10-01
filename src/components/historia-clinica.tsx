'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

export interface HistoriaVista { id: string; nombreOriginal: string; tamano: number; subidoPor: string; fecha: string }

const MB = 1024 * 1024;

export function HistoriaClinica({ casoId, historias, puedeSubir }: { casoId: string; historias: HistoriaVista[]; puedeSubir: boolean }) {
  const router = useRouter();
  const [estado, setEstado] = useState<{ ok: boolean; t: string } | null>(null);
  const [subiendo, setSubiendo] = useState(false);

  async function subir(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const archivo = (form.elements.namedItem('archivo') as HTMLInputElement).files?.[0];
    if (!archivo) return;
    if (archivo.size > 10 * MB) return setEstado({ ok: false, t: 'El archivo supera 10 MB' });
    setSubiendo(true);
    setEstado(null);
    try {
      const fd = new FormData();
      fd.append('archivo', archivo);
      const res = await fetch(`/api/casos/${encodeURIComponent(casoId)}/historia`, { method: 'POST', body: fd });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'No se pudo subir');
      setEstado({ ok: true, t: 'Historia clínica cargada.' });
      form.reset();
      router.refresh();
    } catch (err) {
      setEstado({ ok: false, t: (err as Error).message });
    } finally {
      setSubiendo(false);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      {historias.length ? (
        <ul className="divide-y divide-slate-100 text-sm">
          {historias.map(h => (
            <li key={h.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
              <a href={`/api/historias/${h.id}`} target="_blank" rel="noopener" className="font-medium text-marca-700 hover:underline">{h.nombreOriginal}</a>
              <span className="text-xs text-slate-500">
                {(h.tamano / MB).toFixed(2)} MB · {h.subidoPor} · {new Date(h.fecha).toLocaleDateString('es-CO', { timeZone: 'America/Bogota' })}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-slate-500">No hay historias clínicas cargadas.</p>
      )}
      {puedeSubir && (
        <form onSubmit={subir} className="flex flex-wrap items-center gap-3 border-t border-slate-100 pt-3">
          <input name="archivo" type="file" required accept="application/pdf,image/jpeg,image/png" className="text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-marca-50 file:px-3 file:py-2 file:text-marca-700" />
          <button className="boton" disabled={subiendo}>{subiendo ? 'Subiendo…' : 'Subir historia clínica'}</button>
          <span className="text-xs text-slate-500">PDF, JPG o PNG · máx. 10 MB</span>
          {estado && <span className={`text-sm ${estado.ok ? 'text-marca-700' : 'text-red-600'}`}>{estado.t}</span>}
        </form>
      )}
    </div>
  );
}
