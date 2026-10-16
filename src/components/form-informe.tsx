'use client';

import { useState } from 'react';

interface Firmante { id: string; nombre: string; cargo: string; propia: boolean }

/** Formulario del informe PDF: por IPS, por departamento (con municipios opcionales) o consolidado de la red. */
export function FormInforme({
  ips, territorios, firmantes,
}: {
  ips: { nombre: string; casos: number }[];
  /** Departamento → municipios con su número de niños. */
  territorios: Record<string, { municipio: string; casos: number }[]>;
  firmantes: Firmante[];
}) {
  const [tipo, setTipo] = useState<'territorio' | 'ips' | 'red'>('territorio');
  const deptos = Object.keys(territorios).sort();
  const [depto, setDepto] = useState(deptos[0] ?? '');
  const [munis, setMunis] = useState<string[]>([]);
  const lista = territorios[depto] ?? [];
  const casosDepto = lista.reduce((s, m) => s + m.casos, 0);
  const casosSel = munis.length ? lista.filter(m => munis.includes(m.municipio)).reduce((s, m) => s + m.casos, 0) : casosDepto;
  const alternar = (m: string) => setMunis(a => (a.includes(m) ? a.filter(x => x !== m) : [...a, m]));

  const campo = 'rounded-lg border border-slate-300 px-3 py-2';
  return (
    <form action="/api/informes/pdf" method="get" target="_blank" className="tarjeta flex flex-col gap-5 p-5">
      <fieldset className="flex flex-col gap-2 text-sm">
        <legend className="mb-1 font-medium">Tipo de informe</legend>
        <div className="grid gap-2 sm:grid-cols-3">
          {([
            ['territorio', 'Por departamento', 'Uno o varios municipios'],
            ['ips', 'Por IPS', 'Con listado nominal de gestión'],
            ['red', 'Consolidado de la red', 'Todas las IPS y departamentos'],
          ] as const).map(([k, t, d]) => (
            <label key={k} className={`flex cursor-pointer flex-col rounded-lg border p-3 ${tipo === k ? 'border-marca-600 bg-marca-50 ring-1 ring-marca-600' : 'border-slate-200 hover:bg-slate-50'}`}>
              <span className="flex items-center gap-2 font-semibold">
                <input type="radio" name="tipo" value={k} checked={tipo === k} onChange={() => setTipo(k)} /> {t}
              </span>
              <span className="pl-5 text-xs text-slate-500">{d}</span>
            </label>
          ))}
        </div>
      </fieldset>

      {tipo === 'territorio' && (
        <div className="flex flex-col gap-3 rounded-lg bg-slate-50 p-4 text-sm">
          <label className="flex flex-col gap-1">
            <span className="font-medium">Departamento</span>
            <select name="depto" value={depto} onChange={e => { setDepto(e.target.value); setMunis([]); }} className={campo}>
              {deptos.map(d => <option key={d} value={d}>{d} ({territorios[d].reduce((s, m) => s + m.casos, 0)} niños)</option>)}
            </select>
          </label>
          <div>
            <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
              <span className="font-medium">Municipios <span className="font-normal text-slate-500">(sin marcar = todo el departamento)</span></span>
              <span className="flex gap-3 text-xs">
                <button type="button" onClick={() => setMunis(lista.map(m => m.municipio))} className="text-marca-700 hover:underline">Marcar todos</button>
                <button type="button" onClick={() => setMunis([])} className="text-marca-700 hover:underline">Ninguno</button>
              </span>
            </div>
            <div className="grid max-h-56 gap-1 overflow-y-auto rounded-lg border border-slate-200 bg-white p-2 sm:grid-cols-2 lg:grid-cols-3">
              {lista.map(m => (
                <label key={m.municipio} className="flex items-center gap-2 rounded px-2 py-1 hover:bg-marca-50">
                  <input type="checkbox" name="municipio" value={m.municipio} checked={munis.includes(m.municipio)} onChange={() => alternar(m.municipio)} />
                  <span>{m.municipio} <span className="text-slate-400">({m.casos})</span></span>
                </label>
              ))}
            </div>
            <p className="mt-1 text-xs text-slate-600">
              Incluirá <b>{casosSel}</b> niños · {munis.length ? `${munis.length} municipio(s) seleccionado(s)` : `todos los municipios de ${depto}`}
            </p>
          </div>
          <label className="flex items-center gap-2">
            <input type="checkbox" name="nominal" value="si" />
            Incluir el listado nominal de niños que requieren gestión (con IPS y pendientes)
          </label>
        </div>
      )}

      {tipo === 'ips' && (
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium">IPS</span>
          <select name="ips" required className={campo}>
            {ips.map(i => <option key={i.nombre} value={i.nombre}>{i.nombre} ({i.casos} niños)</option>)}
          </select>
          <span className="text-xs text-slate-500">Incluye el listado nominal de niños que requieren gestión.</span>
        </label>
      )}

      {tipo === 'red' && <p className="text-sm text-slate-600">Consolidado de todas las IPS, con distribución por departamento y pueblo indígena × departamento.</p>}

      <fieldset className="flex flex-col gap-2 text-sm">
        <legend className="mb-1 font-medium">Firmas al final del informe (máximo 3)</legend>
        {firmantes.length === 0 && <p className="text-slate-500">No hay firmas disponibles. El informe saldrá con la línea de firma en blanco.</p>}
        {firmantes.map(f => (
          <label key={f.id} className="flex items-center gap-2">
            <input type="checkbox" name="firmante" value={f.id} defaultChecked={f.propia} />
            <span><b>{f.nombre}</b> · {f.cargo}{f.propia ? ' (tú)' : ''}</span>
          </label>
        ))}
      </fieldset>
      <button className="boton w-fit">Generar PDF</button>
      <p className="text-xs text-slate-500">
        Cada informe generado queda registrado en la auditoría (usuario, fecha, alcance y firmas). Contiene datos de menores: compártalo solo por canales institucionales.
      </p>
    </form>
  );
}
