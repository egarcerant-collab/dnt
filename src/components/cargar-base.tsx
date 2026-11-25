'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

export function CargarBase({ origen, casos, almacenamiento, semana }: { origen: string; casos: number; almacenamiento: string; semana: { semana: number; anio: number; definida: boolean } }) {
  const router = useRouter();
  const [estado, setEstado] = useState<{ ok: boolean; t: string } | null>(null);
  const [subiendo, setSubiendo] = useState(false);
  const [eSemana, setESemana] = useState<{ ok: boolean; t: string } | null>(null);

  async function guardarSemana(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const res = await fetch('/api/admin/semana', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ semana: f.get('semana'), anio: f.get('anio') }) });
    const data = await res.json().catch(() => ({}));
    setESemana(res.ok ? { ok: true, t: 'Semana epidemiológica guardada.' } : { ok: false, t: data.error || 'No se pudo guardar' });
    if (res.ok) router.refresh();
  }

  async function subir(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const archivo = (form.elements.namedItem('archivo') as HTMLInputElement).files?.[0];
    if (!archivo) return;
    setSubiendo(true);
    setEstado(null);
    try {
      const fd = new FormData();
      fd.append('archivo', archivo);
      const res = await fetch('/api/admin/base', { method: 'POST', body: fd });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'No se pudo cargar');
      setEstado({ ok: true, t: 'Base cargada. Los indicadores ya usan la nueva información.' });
      form.reset();
      router.refresh();
    } catch (err) {
      setEstado({ ok: false, t: (err as Error).message });
    } finally {
      setSubiendo(false);
    }
  }

  const textoOrigen =
    origen === 'archivo-local' ? 'archivo local del servidor (DNT_EXCEL_PATH)' : origen === 'almacenamiento' ? `almacenamiento (${almacenamiento === 'drive' ? 'Google Drive' : 'local'})` : 'ninguna';

  return (
    <section className="tarjeta flex flex-col gap-3 p-4">
      <div>
        <h2 className="font-semibold">Base de seguimiento DNT</h2>
        <p className="text-sm text-slate-600">
          Base actual: <b>{textoOrigen}</b> · {casos} casos.
          {origen === 'archivo-local' && ' Mientras exista el archivo local, tiene prioridad sobre la base cargada aquí.'}
        </p>
      </div>
      <form onSubmit={subir} className="flex flex-wrap items-center gap-3">
        <input name="archivo" type="file" required accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          className="text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-marca-50 file:px-3 file:py-2 file:text-marca-700" />
        <button className="boton" disabled={subiendo}>{subiendo ? 'Cargando…' : 'Cargar base Excel'}</button>
        <span className="text-xs text-slate-500">Debe contener la hoja &quot;BD seg ambulatorio DNTA&quot; · máx. 25 MB</span>
      </form>
      {estado && <p className={`text-sm ${estado.ok ? 'text-marca-700' : 'text-red-600'}`}>{estado.t}</p>}
      <form onSubmit={guardarSemana} className="flex flex-wrap items-end gap-3 border-t border-slate-100 pt-3 text-sm">
        <label className="flex flex-col gap-1">
          <span className="etiqueta">Semana epidemiológica de la base</span>
          <input name="semana" type="number" min={1} max={53} required defaultValue={semana.semana} className="input w-28" />
        </label>
        <label className="flex flex-col gap-1">
          <span className="etiqueta">Año</span>
          <input name="anio" type="number" min={2020} max={2100} required defaultValue={semana.anio} className="input w-28" />
        </label>
        <button className="boton-sec">Guardar semana</button>
        <span className="text-xs text-slate-500">{semana.definida ? 'Se muestra en el encabezado y en Seguimiento.' : 'Sin definir: se muestra la semana epidemiológica en curso.'}</span>
      </form>
      {eSemana && <p className={`text-sm ${eSemana.ok ? 'text-marca-700' : 'text-red-600'}`}>{eSemana.t}</p>}
    </section>
  );
}
