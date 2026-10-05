'use client';

import { useEffect, useState } from 'react';

interface Respaldo { nombre: string; tamano: number; fecha: string }

/** "respaldo-2026-10-05-15h35.json.gz" → "05/10/2026 · 3:35 p. m." (hora Colombia). */
function fechaHora(nombre: string): string {
  const m = nombre.match(/(\d{4})-(\d{2})-(\d{2})(?:-(\d{2})h(\d{2}))?/);
  if (!m) return nombre;
  const fecha = `${m[3]}/${m[2]}/${m[1]}`;
  if (!m[4]) return fecha;
  const h = Number(m[4]);
  return `${fecha} · ${h % 12 || 12}:${m[5]} ${h < 12 ? 'a. m.' : 'p. m.'}`;
}

export function AdminRespaldos({ destino, cifrado }: { destino: string; cifrado: boolean }) {
  const [lista, setLista] = useState<Respaldo[] | null>(null);
  const [estado, setEstado] = useState<{ ok: boolean; t: string } | null>(null);
  const [creando, setCreando] = useState(false);

  async function cargar() {
    const res = await fetch('/api/admin/respaldos', { cache: 'no-store' });
    setLista(res.ok ? await res.json() : []);
  }
  useEffect(() => { cargar(); }, []);

  async function crear() {
    setCreando(true);
    setEstado(null);
    try {
      const res = await fetch('/api/admin/respaldos', { method: 'POST' });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error || 'No se pudo crear el respaldo');
      setEstado({
        ok: !!d.correo?.ok,
        t: `Respaldo ${d.nombre} creado (${(d.tamano / 1024).toFixed(1)} KB). ${d.correo?.ok ? `Enviado a ${destino}.` : `No se envió el correo: ${d.correo?.motivo}.`}`,
      });
      cargar();
    } catch (e) {
      setEstado({ ok: false, t: (e as Error).message });
    } finally {
      setCreando(false);
    }
  }

  return (
    <section className="tarjeta flex flex-col gap-3 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-semibold">Respaldos de seguridad</h2>
          <p className="text-sm text-slate-600">
            Todos los días a las 6:00 a. m. se respalda la información de la app (controles, historias registradas, mensajes, prestadores y usuarios)
            en Drive (04_RESPALDOS, 30 días) y se envía el aviso a <b>{destino}</b>.
            {cifrado ? ' El correo incluye una copia cifrada.' : ' Para recibir la copia adjunta cifrada configure BACKUP_PASSWORD en Vercel.'}
          </p>
        </div>
        <button className="boton" onClick={crear} disabled={creando}>{creando ? 'Creando…' : 'Crear respaldo ahora'}</button>
      </div>
      {estado && <p className={`text-sm ${estado.ok ? 'text-marca-700' : 'text-red-600'}`}>{estado.t}</p>}
      {lista === null ? (
        <p className="text-sm text-slate-500">Cargando respaldos…</p>
      ) : lista.length === 0 ? (
        <p className="text-sm text-slate-500">Aún no hay respaldos.</p>
      ) : (
        <ul className="divide-y divide-slate-100 text-sm">
          {lista.map(r => (
            <li key={r.nombre} className="flex items-center justify-between gap-3 py-1.5">
              <span className="w-56 font-medium text-marca-900">{fechaHora(r.nombre)}</span>
              <span className="flex-1 font-mono text-xs text-slate-600">{r.nombre}</span>
              <span className="text-xs text-slate-500">{(r.tamano / 1024).toFixed(1)} KB</span>
              <a className="text-marca-700 hover:underline" href={`/api/admin/respaldos?descargar=${encodeURIComponent(r.nombre)}`}>Descargar</a>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
