'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { ACEPTA_HC, MB, TAMANO_MAX_HC, subirHistoria } from './subir-historia';

export interface HistoriaVista { id: string; nombreOriginal: string; tamano: number; subidoPor: string; fecha: string; control?: number }
export interface ControlVista { numero: number; fecha: string | null }

const fecha = (iso: string | null) => (iso ? iso.split('-').reverse().join('/') : 'sin fecha');

/**
 * Historias clínicas del niño agrupadas por control. Cada control debe tener la suya:
 * se marcan en rojo los controles que aún no la tienen.
 */
export function HistoriaClinica({ casoId, historias, controles, puedeSubir, puedeEliminar = false }: {
  casoId: string;
  historias: HistoriaVista[];
  controles: ControlVista[];
  puedeSubir: boolean;
  puedeEliminar?: boolean;
}) {
  const router = useRouter();
  const [estado, setEstado] = useState<{ ok: boolean; t: string } | null>(null);
  const [progreso, setProgreso] = useState<number | null>(null);
  const sinHc = controles.filter(k => !historias.some(h => h.control === k.numero));

  /** Solo administrador: se anula con motivo; el archivo se conserva en Drive (Res. 1995/1999). */
  async function eliminar(h: HistoriaVista) {
    const motivo = window.prompt(
      `¿Eliminar "${h.nombreOriginal}"?\n\nDejará de verse en la app, pero el archivo se conserva en Drive por obligación legal.\nEscribe el motivo (ej.: archivo de otro paciente, duplicado):`,
    );
    if (motivo === null) return;
    const res = await fetch(`/api/historias/${h.id}`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ motivo }),
    });
    const data = await res.json().catch(() => ({}));
    setEstado(res.ok ? { ok: true, t: 'Historia clínica eliminada.' } : { ok: false, t: data.error || 'No se pudo eliminar' });
    if (res.ok) router.refresh();
  }

  async function subir(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const archivo = (form.elements.namedItem('archivo') as HTMLInputElement).files?.[0];
    const control = Number((form.elements.namedItem('control') as HTMLSelectElement).value) || undefined;
    if (!archivo) return;
    setEstado(null);
    setProgreso(0);
    try {
      await subirHistoria(casoId, archivo, control, setProgreso);
      setEstado({ ok: true, t: control ? `Historia clínica del control ${control} cargada.` : 'Historia clínica cargada.' });
      form.reset();
      router.refresh();
    } catch (err) {
      setEstado({ ok: false, t: (err as Error).message });
    } finally {
      setProgreso(null);
    }
  }

  const grupos = [
    ...controles.map(k => ({ titulo: `Control ${k.numero} · ${fecha(k.fecha)}`, control: k.numero as number | undefined, items: historias.filter(h => h.control === k.numero) })),
    { titulo: 'Sin control asociado', control: undefined, items: historias.filter(h => !h.control || !controles.some(k => k.numero === h.control)) },
  ].filter(g => g.control !== undefined || g.items.length);

  return (
    <div className="flex flex-col gap-3">
      {sinHc.length > 0 && (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">
          Falta la historia clínica de {sinHc.length === 1 ? 'el control' : 'los controles'} <b>{sinHc.map(k => k.numero).join(', ')}</b>.
        </p>
      )}
      {grupos.length === 0 && <p className="text-sm text-slate-500">No hay controles ni historias clínicas.</p>}
      <ul className="flex flex-col gap-2 text-sm">
        {grupos.map(g => (
          <li key={g.titulo} className="rounded-lg border border-slate-200 p-2">
            <p className="etiqueta mb-1">{g.titulo}</p>
            {g.items.length === 0 ? (
              <p className="text-xs font-semibold text-red-600">Sin historia clínica</p>
            ) : (
              g.items.map(h => (
                <div key={h.id} className="flex flex-wrap items-center justify-between gap-2 py-1">
                  <a href={`/api/historias/${h.id}`} target="_blank" rel="noopener" className="font-medium text-marca-700 hover:underline">📄 {h.nombreOriginal}</a>
                  <span className="flex items-center gap-3 text-xs text-slate-500">
                    {(h.tamano / MB).toFixed(2)} MB · {h.subidoPor} · {new Date(h.fecha).toLocaleDateString('es-CO', { timeZone: 'America/Bogota' })}
                    {puedeEliminar && (
                      <button type="button" onClick={() => eliminar(h)} className="rounded border border-red-200 px-2 py-0.5 font-medium text-red-700 hover:bg-red-50">
                        Eliminar
                      </button>
                    )}
                  </span>
                </div>
              ))
            )}
          </li>
        ))}
      </ul>
      {puedeSubir && (
        <form onSubmit={subir} className="flex flex-col gap-2 border-t border-slate-100 pt-3">
          <div className="flex flex-wrap items-center gap-2">
            <select name="control" defaultValue={sinHc[0]?.numero ?? controles.at(-1)?.numero ?? ''} className="input w-56">
              {controles.map(k => (
                <option key={k.numero} value={k.numero}>Control {k.numero} · {fecha(k.fecha)}{sinHc.some(s => s.numero === k.numero) ? ' (falta HC)' : ''}</option>
              ))}
              <option value="">Sin control asociado</option>
            </select>
            <input name="archivo" type="file" required accept={ACEPTA_HC} className="text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-marca-50 file:px-3 file:py-2 file:text-marca-700" />
            <button className="boton" disabled={progreso != null}>{progreso != null ? `Subiendo… ${progreso}%` : 'Subir historia clínica'}</button>
          </div>
          <span className="text-xs text-slate-500">PDF, JPG o PNG · máx. {TAMANO_MAX_HC / MB} MB</span>
          {estado && <span className={`text-sm ${estado.ok ? 'text-marca-700' : 'text-red-600'}`}>{estado.t}</span>}
        </form>
      )}
    </div>
  );
}
